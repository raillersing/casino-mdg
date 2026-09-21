package websocket

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/casino-mdg/game-engine/internal/config"
	"github.com/casino-mdg/game-engine/internal/game/belote"
	"github.com/casino-mdg/game-engine/internal/game/rami"
	"github.com/casino-mdg/game-engine/internal/room"
	"github.com/gorilla/websocket"
)

func testToken(subject, secret string) string {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	payload := base64.RawURLEncoding.EncodeToString([]byte(`{"sub":"` + subject + `"}`))
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(header + "." + payload))
	return header + "." + payload + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func testAdmissionToken(subject, tableID string, seatID int, role, secret string, exp int64) string {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	claimsJSON := fmt.Sprintf(`{"sub":"%s","table_id":"%s","seat_id":%d,"role":"%s","type":"admission","exp":%d}`,
		subject, tableID, seatID, role, exp)
	payload := base64.RawURLEncoding.EncodeToString([]byte(claimsJSON))
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(header + "." + payload))
	return header + "." + payload + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func TestAuthenticatedWebSocketJoinsAndPublishesSequencedAction(t *testing.T) {
	cfg := &config.Config{JWTSecret: "test-secret", ResultSecret: "result-secret", RedisURL: "redis://localhost:6379/0", GracePeriod: time.Second, Deterministic: true}
	manager := room.NewManager(cfg)
	table := manager.CreateTable("poker")
	server := NewServer(cfg, manager)
	httpServer := httptest.NewServer(serverHandler(server))
	defer httpServer.Close()
	url := "ws" + httpServer.URL[len("http"):] + "/ws?token=" + testToken("player-1", cfg.JWTSecret)
	conn, response, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("dial failed: %v", err)
	}
	if response.StatusCode != 101 {
		t.Fatalf("status=%d", response.StatusCode)
	}
	defer conn.Close()
	if err := conn.WriteJSON(Message{Type: MsgJoin, TableID: table.ID}); err != nil {
		t.Fatal(err)
	}
	var joined Message
	if err := conn.ReadJSON(&joined); err != nil {
		t.Fatal(err)
	}
	if joined.Type != MsgState {
		t.Fatalf("message=%+v", joined)
	}
	// Player-2 joins at seat 2 and starts the hand
	if _, err := manager.JoinPlayer(table.ID, "player-2", "Autre", 2); err != nil {
		t.Fatal(err)
	}
	if err := manager.StartTable(table.ID); err != nil {
		t.Fatal(err)
	}
	if err := conn.WriteJSON(Message{Type: MsgAction, TableID: table.ID, Action: "check", Sequence: 2}); err != nil {
		t.Fatal(err)
	}
	var action Message
	if err := conn.ReadJSON(&action); err != nil {
		t.Fatal(err)
	}
	if action.Type != MsgAction || action.Sequence != 3 {
		t.Fatalf("message=%+v", action)
	}
}

func TestWebSocketReconnectRestoresSequencePrivateStateAndResync(t *testing.T) {
	cfg := &config.Config{JWTSecret: "test-secret", ResultSecret: "result-secret", RedisURL: "redis://localhost:6379/0", GracePeriod: time.Second, Deterministic: true}
	manager := room.NewManager(cfg)
	table := manager.CreateTable("poker")
	server := NewServer(cfg, manager)
	httpServer := httptest.NewServer(serverHandler(server))
	defer httpServer.Close()
	url := "ws" + httpServer.URL[len("http"):]

	connect := func(player string) *websocket.Conn {
		conn, _, err := websocket.DefaultDialer.Dial(url+"/ws?token="+testToken(player, cfg.JWTSecret), nil)
		if err != nil {
			t.Fatalf("dial %s failed: %v", player, err)
		}
		if err := conn.WriteJSON(Message{Type: MsgJoin, TableID: table.ID}); err != nil {
			t.Fatalf("join %s failed: %v", player, err)
		}
		return conn
	}

	first := connect("player-1")
	defer first.Close()
	var firstState Message
	if err := first.ReadJSON(&firstState); err != nil {
		t.Fatal(err)
	}
	second := connect("player-2")
	defer second.Close()
	var secondState Message
	if err := second.ReadJSON(&secondState); err != nil {
		t.Fatal(err)
	}
	if firstState.Sequence != 1 || secondState.Sequence != 2 {
		t.Fatalf("join sequences=%d,%d", firstState.Sequence, secondState.Sequence)
	}
	if err := first.WriteJSON(Message{Type: MsgAction, TableID: table.ID, Action: "check", Sequence: 2}); err != nil {
		t.Fatal(err)
	}
	var action Message
	if err := first.ReadJSON(&action); err != nil {
		t.Fatal(err)
	}
	if action.Sequence != 3 {
		t.Fatalf("action sequence=%d", action.Sequence)
	}
	_ = first.Close()

	reconnected := connect("player-1")
	defer reconnected.Close()
	var restored Message
	if err := reconnected.ReadJSON(&restored); err != nil {
		t.Fatal(err)
	}
	if restored.Sequence != 3 {
		t.Fatalf("restored sequence=%d", restored.Sequence)
	}
	state, ok := restored.Payload.(map[string]interface{})
	if !ok {
		t.Fatalf("state payload=%T", restored.Payload)
	}
	gameState, ok := state["game_state"].(map[string]interface{})
	if !ok {
		t.Fatalf("game state=%T", state["game_state"])
	}
	players, ok := gameState["players"].([]interface{})
	if !ok || len(players) != 2 {
		t.Fatalf("players=%v", gameState["players"])
	}
	for _, raw := range players {
		player := raw.(map[string]interface{})
		cards, exists := player["cards"]
		if player["id"] == "player-1" && (!exists || cards == nil) {
			t.Fatalf("own private cards were not restored: %v", player)
		}
		if player["id"] == "player-2" && cards != nil {
			t.Fatalf("opponent private cards leaked: %v", player)
		}
	}
	if err := reconnected.WriteJSON(Message{Type: MsgSync, TableID: table.ID, Sequence: 2}); err != nil {
		t.Fatal(err)
	}
	var sync Message
	if err := reconnected.ReadJSON(&sync); err != nil {
		t.Fatal(err)
	}
	if sync.Type != MsgSync || sync.Sequence != 2 {
		t.Fatalf("sync=%+v", sync)
	}
	events, ok := sync.Payload.([]interface{})
	if !ok || len(events) != 1 {
		t.Fatalf("sync events=%v", sync.Payload)
	}
}

func TestFoldPublishesSignedLossResult(t *testing.T) {
	cfg := &config.Config{JWTSecret: "test-secret", ResultSecret: "result-secret", RedisURL: "redis://localhost:6379/0", GracePeriod: time.Second, Deterministic: true}
	manager := room.NewManager(cfg)
	table := manager.CreateTable("poker")
	if _, err := manager.JoinPlayer(table.ID, "player-fold", "Fold", 1); err != nil {
		t.Fatal(err)
	}
	if _, err := manager.JoinPlayer(table.ID, "player-other", "Other", 2); err != nil {
		t.Fatal(err)
	}
	server := NewServer(cfg, manager)
	httpServer := httptest.NewServer(serverHandler(server))
	defer httpServer.Close()
	url := "ws" + httpServer.URL[len("http"):] + "/ws?token=" + testToken("player-fold", cfg.JWTSecret)
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("dial failed: %v", err)
	}
	defer conn.Close()
	if err := conn.WriteJSON(Message{Type: MsgJoin, TableID: table.ID}); err != nil {
		t.Fatal(err)
	}
	var state Message
	if err := conn.ReadJSON(&state); err != nil {
		t.Fatal(err)
	}
	if err := conn.WriteJSON(Message{Type: MsgAction, TableID: table.ID, Action: "fold", Sequence: 2}); err != nil {
		t.Fatal(err)
	}
	var action, result Message
	if err := conn.ReadJSON(&action); err != nil {
		t.Fatal(err)
	}
	if err := conn.ReadJSON(&result); err != nil {
		t.Fatal(err)
	}
	if action.Action != "fold" || result.Action != "result" {
		t.Fatalf("action=%+v result=%+v", action, result)
	}
	payload, ok := result.Payload.(map[string]interface{})
	if !ok || payload["outcome"] != "loss" || payload["signature"] == "" {
		t.Fatalf("result payload=%v", result.Payload)
	}
}

func TestWebSocketRejectsMissingToken(t *testing.T) {
	cfg := &config.Config{JWTSecret: "test-secret", RedisURL: "redis://localhost:6379/0"}
	server := NewServer(cfg, room.NewManager(cfg))
	httpServer := httptest.NewServer(serverHandler(server))
	defer httpServer.Close()
	_, response, err := websocket.DefaultDialer.Dial("ws"+httpServer.URL[len("http"):]+"/ws", nil)
	if err == nil {
		t.Fatal("unauthenticated websocket was accepted")
	}
	if response == nil || response.StatusCode != 401 {
		t.Fatalf("response=%v", response)
	}
}

func TestInternalBotTokenJoinsAsBotAndCannotBeForgedByPayload(t *testing.T) {
	cfg := &config.Config{JWTSecret: "test-secret", BotServiceSecret: "bot-secret", RedisURL: "redis://localhost:6379/0", GracePeriod: time.Second}
	manager := room.NewManager(cfg)
	table := manager.CreateTable("poker")
	server := NewServer(cfg, manager)
	httpServer := httptest.NewServer(serverHandler(server))
	defer httpServer.Close()
	claims := botTokenClaims{BotID: "bot-1", TableID: table.ID, Name: "IA Démo", Expires: time.Now().Add(time.Minute).Unix()}
	token := signBotToken(claims, cfg.BotServiceSecret)
	url := "ws" + httpServer.URL[len("http"):]
	conn, _, err := websocket.DefaultDialer.Dial(url+"/ws?bot_token="+token+"&table_id="+table.ID, nil)
	if err != nil {
		t.Fatalf("bot dial failed: %v", err)
	}
	defer conn.Close()
	if err := conn.WriteJSON(Message{Type: MsgJoin, TableID: table.ID, PlayerID: "bot-1", Payload: map[string]interface{}{"role": "spectator"}}); err != nil {
		t.Fatal(err)
	}
	var state Message
	if err := conn.ReadJSON(&state); err != nil {
		t.Fatal(err)
	}
	if state.Type != MsgState {
		t.Fatalf("message=%+v", state)
	}
	player, ok := table.Players["bot-1"]
	if !ok || !player.IsBot || player.Name != "IA Démo" {
		t.Fatalf("bot player=%+v", player)
	}
	payload := state.Payload.(map[string]interface{})
	players := payload["players"].(map[string]interface{})
	serialized := players["bot-1"].(map[string]interface{})
	if serialized["is_bot"] != true {
		t.Fatalf("bot marker missing from state: %v", serialized)
	}
}

func TestInternalBotTokenRejectsWrongTableAndExpiredToken(t *testing.T) {
	cfg := &config.Config{JWTSecret: "test-secret", BotServiceSecret: "bot-secret", RedisURL: "redis://localhost:6379/0"}
	server := NewServer(cfg, room.NewManager(cfg))
	httpServer := httptest.NewServer(serverHandler(server))
	defer httpServer.Close()
	claims := botTokenClaims{BotID: "bot-1", TableID: "table-a", Name: "IA Démo", Expires: time.Now().Add(-time.Minute).Unix()}
	token := signBotToken(claims, cfg.BotServiceSecret)
	_, response, err := websocket.DefaultDialer.Dial("ws"+httpServer.URL[len("http"):]+"/ws?bot_token="+token+"&table_id=table-a", nil)
	if err == nil {
		t.Fatal("expired bot token was accepted")
	}
	if response == nil || response.StatusCode != 401 {
		t.Fatalf("response=%v", response)
	}
}

func TestAuthenticatedWebSocketProvisionsRoomFromJoinPayload(t *testing.T) {
	cfg := &config.Config{JWTSecret: "test-secret", RedisURL: "redis://localhost:6379/0", GracePeriod: time.Second}
	server := NewServer(cfg, room.NewManager(cfg))
	httpServer := httptest.NewServer(serverHandler(server))
	defer httpServer.Close()
	url := "ws" + httpServer.URL[len("http"):] + "/ws?token=" + testAdmissionToken("player-2", "table-code-01", 0, "player", cfg.JWTSecret, time.Now().Unix()+300)
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("dial failed: %v", err)
	}
	defer conn.Close()
	if err := conn.WriteJSON(Message{Type: MsgJoin, TableID: "table-code-01", Payload: map[string]string{"game_type": "belote"}}); err != nil {
		t.Fatal(err)
	}
	var state Message
	if err := conn.ReadJSON(&state); err != nil {
		t.Fatal(err)
	}
	if state.Type != MsgState {
		t.Fatalf("message=%+v", state)
	}
	payload, ok := state.Payload.(map[string]interface{})
	if !ok || payload["game_type"] != "belote" {
		t.Fatalf("payload=%v", state.Payload)
	}
}

func TestOldConnectionCloseDoesNotRemoveReplacement(t *testing.T) {
	cfg := &config.Config{JWTSecret: "test-secret", RedisURL: "redis://localhost:6379/0"}
	server := NewServer(cfg, room.NewManager(cfg))
	oldClient := &Client{playerID: "player-1"}
	newClient := &Client{playerID: "player-1"}
	server.addClient(oldClient)
	server.addClient(newClient)
	server.removeClient(oldClient)
	server.mu.RLock()
	current := server.clients["player-1"]
	server.mu.RUnlock()
	if current != newClient {
		t.Fatalf("replacement client was removed: current=%p want=%p", current, newClient)
	}
	if server.removeClient(oldClient) {
		t.Fatal("stale connection was reported as current")
	}
}

func TestSpectatorReceivesStateButCannotAct(t *testing.T) {
	cfg := &config.Config{JWTSecret: "test-secret", RedisURL: "redis://localhost:6379/0", GracePeriod: time.Second, Deterministic: true}
	manager := room.NewManager(cfg)
	table := manager.CreateTableWithID("spectator-table", "poker")
	_, _ = manager.JoinPlayer(table.ID, "player-1", "Player", 1)
	server := NewServer(cfg, manager)
	httpServer := httptest.NewServer(serverHandler(server))
	defer httpServer.Close()
	url := "ws" + httpServer.URL[len("http"):] + "/ws?token=" + testToken("spectator-1", cfg.JWTSecret)
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("dial failed: %v", err)
	}
	defer conn.Close()
	if err := conn.WriteJSON(Message{Type: MsgJoin, TableID: table.ID, Payload: map[string]interface{}{"role": "spectator"}}); err != nil {
		t.Fatal(err)
	}
	var state Message
	if err := conn.ReadJSON(&state); err != nil {
		t.Fatal(err)
	}
	payload, ok := state.Payload.(map[string]interface{})
	if !ok || payload["spectator"] != true {
		t.Fatalf("payload=%v", state.Payload)
	}
	if err := conn.WriteJSON(Message{Type: MsgAction, TableID: table.ID, Action: "check", Sequence: state.Sequence}); err != nil {
		t.Fatal(err)
	}
	var rejected Message
	if err := conn.ReadJSON(&rejected); err != nil {
		t.Fatal(err)
	}
	if rejected.Type != MsgError {
		t.Fatalf("message=%+v", rejected)
	}
	if _, ok := table.Players["spectator-1"]; ok {
		t.Fatal("spectator was added as a player")
	}
}

func TestWebSocketRejectsArbitraryRoomProvisionWithoutAdmissionTicket(t *testing.T) {
	cfg := &config.Config{JWTSecret: "test-secret", RedisURL: "redis://localhost:6379/0", GracePeriod: time.Second}
	server := NewServer(cfg, room.NewManager(cfg))
	httpServer := httptest.NewServer(serverHandler(server))
	defer httpServer.Close()

	// Token without admission table_id trying to create an arbitrary table
	url := "ws" + httpServer.URL[len("http"):] + "/ws?token=" + testToken("player-3", cfg.JWTSecret)
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("dial failed: %v", err)
	}
	defer conn.Close()

	if err := conn.WriteJSON(Message{Type: MsgJoin, TableID: "arbitrary-table-999", Payload: map[string]string{"game_type": "poker"}}); err != nil {
		t.Fatal(err)
	}
	var msg Message
	if err := conn.ReadJSON(&msg); err != nil {
		t.Fatal(err)
	}
	if msg.Type != MsgError || msg.Payload != "unauthorized table creation requires admission ticket" {
		t.Fatalf("expected unauthorized table creation error, got: %+v", msg)
	}
}

func TestWebSocketRejectsExpiredAdmissionToken(t *testing.T) {
	cfg := &config.Config{JWTSecret: "test-secret", ResultSecret: "result-secret", RedisURL: "redis://localhost:6379/0", GracePeriod: time.Second, Deterministic: true}
	manager := room.NewManager(cfg)
	server := NewServer(cfg, manager)
	httpServer := httptest.NewServer(serverHandler(server))
	defer httpServer.Close()

	expiredToken := testAdmissionToken("player-1", "table-1", 0, "player", cfg.JWTSecret, time.Now().Unix()-100)
	url := "ws" + httpServer.URL[len("http"):] + "/ws?token=" + expiredToken
	_, response, err := websocket.DefaultDialer.Dial(url, nil)
	if err == nil {
		t.Fatal("expected dial error with expired token, got nil")
	}
	if response != nil && response.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected status 401 Unauthorized, got %d", response.StatusCode)
	}
}

func TestWebSocketAdmissionTokenBindsToSpecificTable(t *testing.T) {
	cfg := &config.Config{JWTSecret: "test-secret", ResultSecret: "result-secret", RedisURL: "redis://localhost:6379/0", GracePeriod: time.Second, Deterministic: true}
	manager := room.NewManager(cfg)
	tableA := manager.CreateTable("poker")
	tableB := manager.CreateTable("poker")
	server := NewServer(cfg, manager)
	httpServer := httptest.NewServer(serverHandler(server))
	defer httpServer.Close()

	tokenForA := testAdmissionToken("player-1", tableA.ID, 0, "player", cfg.JWTSecret, time.Now().Unix()+300)
	url := "ws" + httpServer.URL[len("http"):] + "/ws?token=" + tokenForA
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("dial failed: %v", err)
	}
	defer conn.Close()

	// Try to join table B with ticket for table A
	if err := conn.WriteJSON(Message{Type: MsgJoin, TableID: tableB.ID}); err != nil {
		t.Fatal(err)
	}
	var msg Message
	if err := conn.ReadJSON(&msg); err != nil {
		t.Fatal(err)
	}
	if msg.Type != MsgError || msg.Payload != "admission ticket is bound to another table" {
		t.Fatalf("expected admission mismatch error, got: %+v", msg)
	}
}

func TestRamiKnockSettlementAndHMAC(t *testing.T) {
	cfg := &config.Config{JWTSecret: "test-secret", ResultSecret: "result-secret", RedisURL: "redis://localhost:6379/0", GracePeriod: time.Second, Deterministic: true}
	manager := room.NewManager(cfg)
	table := manager.CreateTable("rami")
	if _, err := manager.JoinPlayer(table.ID, "r0", "Joueur 0", 0); err != nil {
		t.Fatal(err)
	}
	if _, err := manager.JoinPlayer(table.ID, "r1", "Joueur 1", 1); err != nil {
		t.Fatal(err)
	}
	server := NewServer(cfg, manager)
	httpServer := httptest.NewServer(serverHandler(server))
	defer httpServer.Close()
	url := "ws" + httpServer.URL[len("http"):]

	connect := func(player string) *websocket.Conn {
		conn, _, err := websocket.DefaultDialer.Dial(url+"/ws?token="+testToken(player, cfg.JWTSecret), nil)
		if err != nil {
			t.Fatalf("dial %s failed: %v", player, err)
		}
		if err := conn.WriteJSON(Message{Type: MsgJoin, TableID: table.ID}); err != nil {
			t.Fatalf("join %s failed: %v", player, err)
		}
		var msg Message
		if err := conn.ReadJSON(&msg); err != nil {
			t.Fatalf("read %s failed: %v", player, err)
		}
		return conn
	}

	c0 := connect("r0")
	defer c0.Close()
	c1 := connect("r1")
	defer c1.Close()

	game := table.State.(*rami.Game)
	// Give r0 a hand with deadwood = 3 <= 10
	game.Players[0].Hand = []rami.Card{{Suit: 0, Rank: 1}, {Suit: 0, Rank: 2}}
	game.Players[1].Hand = []rami.Card{{Suit: 1, Rank: 10}, {Suit: 2, Rank: 10}}
	game.Current = 0
	game.Finished = false

	seq := manager.TableSequence(table.ID)
	if err := c0.WriteJSON(Message{Type: MsgAction, TableID: table.ID, Action: "knock", Sequence: seq}); err != nil {
		t.Fatal(err)
	}

	var r0Result *Message
	for i := 0; i < 5; i++ {
		var m Message
		if err := c0.ReadJSON(&m); err != nil {
			t.Fatal(err)
		}
		if m.Action == "result" && m.PlayerID == "r0" {
			r0Result = &m
			break
		}
	}
	if r0Result == nil {
		t.Fatal("expected result message for r0 upon knock")
	}
	payload, ok := r0Result.Payload.(map[string]interface{})
	if !ok {
		t.Fatalf("payload type=%T", r0Result.Payload)
	}
	if payload["outcome"] != "win" {
		t.Fatalf("expected win outcome, got %v", payload["outcome"])
	}
	if payload["signature"] == nil || payload["signature"] == "" {
		t.Fatal("expected non-empty HMAC signature for r0 result")
	}

	var r1Result *Message
	for i := 0; i < 5; i++ {
		var m Message
		if err := c1.ReadJSON(&m); err != nil {
			t.Fatal(err)
		}
		if m.Action == "result" && m.PlayerID == "r1" {
			r1Result = &m
			break
		}
	}
	if r1Result == nil {
		t.Fatal("expected result message for r1 upon knock")
	}
	payload1, ok := r1Result.Payload.(map[string]interface{})
	if !ok {
		t.Fatalf("payload1 type=%T", r1Result.Payload)
	}
	if payload1["outcome"] != "loss" {
		t.Fatalf("expected loss outcome for r1, got %v", payload1["outcome"])
	}
	if payload1["signature"] == nil || payload1["signature"] == "" {
		t.Fatal("expected non-empty HMAC signature for r1 result")
	}
}

func TestBeloteGameOverBroadcastToAllPlayers(t *testing.T) {
	cfg := &config.Config{JWTSecret: "test-secret", ResultSecret: "result-secret", RedisURL: "redis://localhost:6379/0", GracePeriod: time.Second, Deterministic: true}
	manager := room.NewManager(cfg)
	table := manager.CreateTable("belote")
	table.BeloteTargetScore = 501
	for i := 0; i < 4; i++ {
		if _, err := manager.JoinPlayer(table.ID, fmt.Sprintf("b%d", i), fmt.Sprintf("Belote%d", i), i); err != nil {
			t.Fatal(err)
		}
	}
	server := NewServer(cfg, manager)
	httpServer := httptest.NewServer(serverHandler(server))
	defer httpServer.Close()
	url := "ws" + httpServer.URL[len("http"):]

	connect := func(player string) *websocket.Conn {
		conn, _, err := websocket.DefaultDialer.Dial(url+"/ws?token="+testToken(player, cfg.JWTSecret), nil)
		if err != nil {
			t.Fatalf("dial %s failed: %v", player, err)
		}
		if err := conn.WriteJSON(Message{Type: MsgJoin, TableID: table.ID}); err != nil {
			t.Fatalf("join %s failed: %v", player, err)
		}
		var msg Message
		if err := conn.ReadJSON(&msg); err != nil {
			t.Fatalf("read %s failed: %v", player, err)
		}
		return conn
	}

	c0 := connect("b0")
	defer c0.Close()
	c1 := connect("b1")
	defer c1.Close()

	round := table.State.(*belote.Round)
	round.Phase = "finished"
	round.TeamPoints = [2]int{550, 100}

	seq := manager.TableSequence(table.ID)
	if err := c0.WriteJSON(Message{Type: MsgAction, TableID: table.ID, Action: "new_hand", Sequence: seq}); err != nil {
		t.Fatal(err)
	}

	checkGameOver := func(c *websocket.Conn, name string) {
		gotGameOver := false
		for i := 0; i < 5; i++ {
			var m Message
			if err := c.ReadJSON(&m); err != nil {
				t.Fatalf("read %s failed: %v", name, err)
			}
			if m.Type == MsgError && m.Payload == "game_over" {
				gotGameOver = true
				break
			}
		}
		if !gotGameOver {
			t.Fatalf("expected game_over error broadcast on %s", name)
		}
	}

	checkGameOver(c0, "c0")
	checkGameOver(c1, "c1")
}

func serverHandler(server *Server) http.Handler { return http.HandlerFunc(server.HandleConnection) }

func TestAuthenticateSupportsFloatAndIntegerExpTimestamps(t *testing.T) {
	secret := "test-secret"

	// 1. Token with float exp (e.g. from Python datetime.now().timestamp() + 900)
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	payloadFloat := base64.RawURLEncoding.EncodeToString([]byte(fmt.Sprintf(`{"sub":"user-float-1","exp":%f,"iat":%f}`, float64(time.Now().Unix()+3600)+0.873957, float64(time.Now().Unix())+0.123456)))
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(header + "." + payloadFloat))
	tokenFloat := header + "." + payloadFloat + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	claims, ok := authenticate(tokenFloat, secret)
	if !ok {
		t.Fatal("expected float exp JWT to authenticate successfully, got false")
	}
	if claims.Sub != "user-float-1" {
		t.Fatalf("expected sub user-float-1, got %s", claims.Sub)
	}
	if claims.Expires <= time.Now().Unix() {
		t.Fatalf("expected future expiration, got %d", claims.Expires)
	}

	// 2. Token with standard integer exp
	payloadInt := base64.RawURLEncoding.EncodeToString([]byte(fmt.Sprintf(`{"sub":"user-int-1","exp":%d,"iat":%d}`, time.Now().Unix()+3600, time.Now().Unix())))
	mac2 := hmac.New(sha256.New, []byte(secret))
	mac2.Write([]byte(header + "." + payloadInt))
	tokenInt := header + "." + payloadInt + "." + base64.RawURLEncoding.EncodeToString(mac2.Sum(nil))

	claims2, ok2 := authenticate(tokenInt, secret)
	if !ok2 {
		t.Fatal("expected int exp JWT to authenticate successfully, got false")
	}
	if claims2.Sub != "user-int-1" {
		t.Fatalf("expected sub user-int-1, got %s", claims2.Sub)
	}
}

