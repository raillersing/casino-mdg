package websocket

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/casino-mdg/game-engine/internal/config"
	"github.com/gorilla/websocket"
)

func TestEngineSessionGuardRejectsRevokedOrUnavailableAccounts(t *testing.T) {
	var active atomic.Bool
	var version atomic.Int64
	active.Store(true)
	var failBackend atomic.Bool
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || !strings.HasSuffix(r.URL.Path, "/api/v1/games/internal/sessions/player-guard/") {
			http.Error(w, "wrong internal path", http.StatusNotFound)
			return
		}
		if r.Header.Get("X-Game-Engine-Secret") != "server-only" {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		if failBackend.Load() {
			http.Error(w, "unavailable", http.StatusServiceUnavailable)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"active": active.Load(), "token_version": version.Load(),
		})
	}))
	defer backend.Close()

	cfg := &config.Config{JWTSecret: "jwt-for-tests", ResultSecret: "server-only",
		BackendInternalURL: backend.URL, SessionValidationInterval: 20 * time.Millisecond}
	engine := &Server{config: cfg}
	socket := httptest.NewServer(serverHandler(engine))
	defer socket.Close()
	endpoint := "ws" + socket.URL[len("http"):] + "?token=" + testToken("player-guard", cfg.JWTSecret)

	c, _, err := websocket.DefaultDialer.Dial(endpoint, nil)
	if err != nil {
		t.Fatalf("active user was denied: %v", err)
	}
	_ = c.Close()

	active.Store(false)
	expectRejectedSessionDial(t, endpoint)
	active.Store(true)
	version.Store(1)
	expectRejectedSessionDial(t, endpoint)
	failBackend.Store(true)
	expectRejectedSessionDial(t, endpoint)
}

func TestEngineSessionGuardClosesEstablishedSocketAfterRevocation(t *testing.T) {
	var currentVersion atomic.Int64
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Game-Engine-Secret") != "engine-secret" {
			http.Error(w, "unauthorized", http.StatusForbidden)
			return
		}
		_, _ = fmt.Fprintf(w, `{"active":true,"token_version":%d}`, currentVersion.Load())
	}))
	defer backend.Close()

	cfg := &config.Config{JWTSecret: "jwt-for-tests", ResultSecret: "engine-secret",
		BackendInternalURL: backend.URL, SessionValidationInterval: 20 * time.Millisecond}
	engine := &Server{config: cfg}
	socket := httptest.NewServer(serverHandler(engine))
	defer socket.Close()
	endpoint := "ws" + socket.URL[len("http"):] + "?token=" + testToken("player-guard", cfg.JWTSecret)

	c, _, err := websocket.DefaultDialer.Dial(endpoint, nil)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer func() { _ = c.Close() }()
	currentVersion.Store(1)
	_ = c.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, _, err = c.ReadMessage()
	if err == nil {
		t.Fatal("revoked connection remained open")
	}
	if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
		t.Fatalf("revocation was not observed before deadline: %v", err)
	}
	expectRejectedSessionDial(t, endpoint)
}

func TestEngineSessionGuardRejectsMissingInternalSecret(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"active":true,"token_version":0}`))
	}))
	defer backend.Close()
	cfg := &config.Config{JWTSecret: "jwt-for-tests", BackendInternalURL: backend.URL}
	socket := httptest.NewServer(serverHandler(&Server{config: cfg}))
	defer socket.Close()
	expectRejectedSessionDial(t, "ws"+socket.URL[len("http"):]+
		"?token="+testToken("player-guard", cfg.JWTSecret))
}

func expectRejectedSessionDial(t *testing.T, endpoint string) {
	t.Helper()
	c, response, err := websocket.DefaultDialer.Dial(endpoint, nil)
	if c != nil {
		_ = c.Close()
	}
	if err == nil || response == nil || response.StatusCode != http.StatusUnauthorized {
		t.Fatalf("revoked/missing session not rejected: err=%v status=%v", err, response)
	}
}
