package websocket

import (
	"encoding/json"
	"github.com/casino-mdg/game-engine/internal/config"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync/atomic"
	"testing"
)

func TestActivityOutboxSurvivesFailureAndRestart(t *testing.T) {
	t.Setenv("ACTIVITY_OUTBOX_DIR", t.TempDir())
	var status atomic.Int32
	status.Store(http.StatusServiceUnavailable)
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Game-Engine-Secret") != "secret" {
			t.Error("missing authentication")
		}
		w.WriteHeader(int(status.Load()))
	}))
	defer backend.Close()
	server := &Server{config: &config.Config{BackendInternalURL: backend.URL, ResultSecret: "secret"}}
	server.recordHumanActivity("table", "human")
	server.dispatchHumanActivity()
	pending, _ := filepath.Glob(filepath.Join(activityOutboxDir(), "*.json"))
	if len(pending) != 1 {
		t.Fatal("lost event after failure")
	}
	status.Store(http.StatusOK)
	restarted := &Server{config: server.config}
	restarted.dispatchHumanActivity()
	pending, _ = filepath.Glob(filepath.Join(activityOutboxDir(), "*.json"))
	if len(pending) != 0 {
		t.Fatal("acknowledged event retained")
	}
}

func TestRejectedActivityDoesNotBlockOtherGames(t *testing.T) {
	t.Setenv("ACTIVITY_OUTBOX_DIR", t.TempDir())
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var event activityEvent
		if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
			t.Error(err)
		}
		if event.TableID == "gone" {
			w.WriteHeader(http.StatusNotFound)
		} else {
			w.WriteHeader(http.StatusOK)
		}
	}))
	defer backend.Close()
	server := &Server{config: &config.Config{BackendInternalURL: backend.URL, ResultSecret: "secret"}}
	server.recordHumanActivity("gone", "human")
	server.recordHumanActivity("existing", "human")
	server.dispatchHumanActivity()
	pending, _ := filepath.Glob(filepath.Join(activityOutboxDir(), "*.json"))
	rejected, _ := filepath.Glob(filepath.Join(activityOutboxDir(), "*.rejected"))
	if len(pending) != 0 || len(rejected) != 1 {
		t.Fatalf("pending=%d rejected=%d", len(pending), len(rejected))
	}
}

func TestClosureSurvivesEngineRestartBeforeBackendAcknowledgement(t *testing.T) {
	t.Setenv("ACTIVITY_OUTBOX_DIR", t.TempDir())
	cfg := &config.Config{BackendInternalURL: "http://127.0.0.1:1", ResultSecret: "secret"}
	first := &Server{config: cfg}
	first.recordTableClosed("a/../../closed-game")
	restarted := &Server{config: cfg}
	if !restarted.isTableClosed("a/../../closed-game") {
		t.Fatal("closed table can be recreated after restart")
	}
	if restarted.isTableClosed("different-table") {
		t.Fatal("another game was incorrectly closed")
	}
	pending, _ := filepath.Glob(filepath.Join(activityOutboxDir(), "*.json"))
	if len(pending) != 1 {
		t.Fatal("backend closure not queued durably")
	}
}
