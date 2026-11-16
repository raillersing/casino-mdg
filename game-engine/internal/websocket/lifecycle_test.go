package websocket

import (
	"github.com/casino-mdg/game-engine/internal/config"
	"github.com/casino-mdg/game-engine/internal/game/domino"
	"github.com/casino-mdg/game-engine/internal/game/ludo"
	"github.com/casino-mdg/game-engine/internal/room"
	"github.com/gorilla/websocket"
	"net/http/httptest"
	"testing"
	"time"
)

func TestClosedRoomCannotBeRecreatedUsingOldAdmission(t *testing.T) {
	cfg := &config.Config{JWTSecret: "test-secret"}
	manager := room.NewManager(cfg)
	table := manager.CreateTable("ludo")
	_, _ = manager.JoinPlayer(table.ID, "a", "A", 0)
	server := NewServer(cfg, manager)
	if !manager.LeavePlayer(table.ID, "a") {
		t.Fatal("leave failed")
	}
	httpServer := httptest.NewServer(serverHandler(server))
	defer httpServer.Close()
	token := testAdmissionToken("a", table.ID, 0, "player", cfg.JWTSecret, time.Now().Add(time.Minute).Unix())
	conn, _, err := websocket.DefaultDialer.Dial("ws"+httpServer.URL[len("http"):]+"/ws?token="+token, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = conn.Close() }()
	_ = conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	if err = conn.WriteJSON(Message{Type: MsgJoin, TableID: table.ID}); err != nil {
		t.Fatal(err)
	}
	var response Message
	if err = conn.ReadJSON(&response); err != nil {
		t.Fatal(err)
	}
	if response.Type != MsgError || response.Payload != "table is closed" {
		t.Fatalf("closed table resurrected: %+v", response)
	}
}

func TestHumanTimeoutPreservesSelectedPawnPayload(t *testing.T) {
	cfg := &config.Config{}
	manager := room.NewManager(cfg)
	table := manager.CreateTable("ludo")
	for i, id := range []string{"a", "b"} {
		_, _ = manager.JoinPlayer(table.ID, id, id, i)
	}
	game, _ := ludo.NewGame([]string{"a", "b"})
	table.State = game
	game.CanRoll = false
	game.CanMove = true
	game.LastRoll = 1
	game.ValidMoves = []int{1, 2}
	game.Players[0].Pawns[1].State = ludo.PawnTrack
	game.Players[0].Pawns[1].Position = 5
	game.Players[0].Pawns[2].State = ludo.PawnTrack
	game.Players[0].Pawns[2].Position = 10
	table.ActionDeadline = time.Now().Add(-time.Second)
	server := NewServer(cfg, manager)
	server.startBotTurns(table.ID)
	defer manager.RemoveTable(table.ID)
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		table.RLock()
		position := game.Players[0].Pawns[1].Position
		table.RUnlock()
		if position == 6 {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("timeout dropped pawn_id and never advanced the game")
}

func TestForcedDominoActionsAreBroadcastAndFinishBlockedGame(t *testing.T) {
	cfg := &config.Config{JWTSecret: "test-secret", GracePeriod: time.Second}
	manager := room.NewManager(cfg)
	table := manager.CreateTable("domino")
	for i, id := range []string{"a", "b"} {
		_, _ = manager.JoinPlayer(table.ID, id, id, i)
	}
	table.State = &domino.Game{Players: []*domino.Player{{ID: "a", Hand: []domino.Tile{{Left: 3, Right: 5}, {Left: 1, Right: 1}}}, {ID: "b", Hand: []domino.Tile{{Left: 2, Right: 2}}}}, Board: []domino.PlayedTile{{Left: 3, Right: 4}}, LeftEnd: 3, RightEnd: 4}
	server := NewServer(cfg, manager)
	httpServer := httptest.NewServer(serverHandler(server))
	defer httpServer.Close()
	conn, _, err := websocket.DefaultDialer.Dial("ws"+httpServer.URL[len("http"):]+"/ws?token="+testAdmissionToken("a", table.ID, 0, "player", cfg.JWTSecret, time.Now().Add(time.Minute).Unix()), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = conn.Close() }()
	_ = conn.SetReadDeadline(time.Now().Add(4 * time.Second))
	if err = conn.WriteJSON(Message{Type: MsgJoin, TableID: table.ID}); err != nil {
		t.Fatal(err)
	}
	actions := []string{}
	for len(actions) < 3 {
		var message Message
		if err = conn.ReadJSON(&message); err != nil {
			t.Fatal(err)
		}
		if message.Type != MsgAction {
			continue
		}
		details, ok := message.Payload.(map[string]interface{})
		if !ok || details["automatic"] != true {
			t.Fatalf("missing automatic action annotation: %+v", message)
		}
		actions = append(actions, message.Action)
	}
	if actions[0] != "play_tile" || actions[1] != "pass" || actions[2] != "pass" {
		t.Fatal(actions)
	}
	table.RLock()
	finished := table.State.(*domino.Game).Finished
	table.RUnlock()
	if !finished {
		t.Fatal("forced chain stalled")
	}
}

func TestSocketCannotActOnAnotherJoinedTable(t *testing.T) {
	cfg := &config.Config{JWTSecret: "test-secret", Deterministic: true}
	manager := room.NewManager(cfg)
	first := manager.CreateTable("poker")
	second := manager.CreateTable("poker")
	for _, table := range []*room.Table{first, second} {
		for i, id := range []string{"a", "b"} {
			_, _ = manager.JoinPlayer(table.ID, id, id, i)
		}
	}
	defer manager.RemoveTable(first.ID)
	defer manager.RemoveTable(second.ID)
	server := NewServer(cfg, manager)
	httpServer := httptest.NewServer(serverHandler(server))
	defer httpServer.Close()
	token := testAdmissionToken("a", first.ID, 0, "player", cfg.JWTSecret, time.Now().Add(time.Minute).Unix())
	conn, _, err := websocket.DefaultDialer.Dial("ws"+httpServer.URL[len("http"):]+"/ws?token="+token, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = conn.Close() }()
	_ = conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	if err = conn.WriteJSON(Message{Type: MsgJoin, TableID: first.ID}); err != nil {
		t.Fatal(err)
	}
	var response Message
	if err = conn.ReadJSON(&response); err != nil {
		t.Fatal(err)
	}
	sequence := manager.TableSequence(second.ID)
	if err = conn.WriteJSON(Message{Type: MsgAction, TableID: second.ID, Action: "check", Sequence: sequence}); err != nil {
		t.Fatal(err)
	}
	if err = conn.ReadJSON(&response); err != nil {
		t.Fatal(err)
	}
	if response.Type != MsgError || manager.TableSequence(second.ID) != sequence {
		t.Fatal("ticket for another table accepted an action")
	}
}

func TestExistingPrivateRoomStillRequiresSeatAdmission(t *testing.T) {
	cfg := &config.Config{JWTSecret: "test-secret", GracePeriod: time.Second}
	manager := room.NewManager(cfg)
	table := manager.CreateTable("poker")
	server := NewServer(cfg, manager)
	httpServer := httptest.NewServer(serverHandler(server))
	defer httpServer.Close()
	conn, _, err := websocket.DefaultDialer.Dial("ws"+httpServer.URL[len("http"):]+"/ws?token="+testToken("intruder", cfg.JWTSecret), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = conn.Close() }()
	_ = conn.SetReadDeadline(time.Now().Add(time.Second))
	if err = conn.WriteJSON(Message{Type: MsgJoin, TableID: table.ID}); err != nil {
		t.Fatal(err)
	}
	var response Message
	if err = conn.ReadJSON(&response); err != nil {
		t.Fatal(err)
	}
	if response.Type != MsgError || len(table.CopyPlayers()) != 0 {
		t.Fatalf("admission bypass: %+v", response)
	}
}
