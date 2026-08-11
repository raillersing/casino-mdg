package websocket

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/casino-mdg/game-engine/internal/config"
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
	if err := conn.WriteJSON(Message{Type: MsgAction, TableID: table.ID, Action: "check", Sequence: 1}); err != nil {
		t.Fatal(err)
	}
	var action Message
	if err := conn.ReadJSON(&action); err != nil {
		t.Fatal(err)
	}
	if action.Type != MsgAction || action.Sequence != 2 {
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

func TestAuthenticatedWebSocketProvisionsRoomFromJoinPayload(t *testing.T) {
	cfg := &config.Config{JWTSecret: "test-secret", RedisURL: "redis://localhost:6379/0", GracePeriod: time.Second}
	server := NewServer(cfg, room.NewManager(cfg))
	httpServer := httptest.NewServer(serverHandler(server))
	defer httpServer.Close()
	url := "ws" + httpServer.URL[len("http"):] + "/ws?token=" + testToken("player-2", cfg.JWTSecret)
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

func serverHandler(server *Server) http.Handler { return http.HandlerFunc(server.HandleConnection) }
