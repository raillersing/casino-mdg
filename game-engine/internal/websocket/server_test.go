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
	cfg := &config.Config{JWTSecret: "test-secret", RedisURL: "redis://localhost:6379/0", GracePeriod: time.Second}
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

func serverHandler(server *Server) http.Handler { return http.HandlerFunc(server.HandleConnection) }
