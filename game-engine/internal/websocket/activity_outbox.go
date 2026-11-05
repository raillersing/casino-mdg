package websocket

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"
)

var activityOutboxMu sync.Mutex
var activityDispatchMu sync.Mutex

type activityEvent struct {
	TableID    string `json:"table_id"`
	UserID     string `json:"user_id"`
	OccurredAt string `json:"occurred_at"`
}

func activityOutboxDir() string {
	if path := os.Getenv("ACTIVITY_OUTBOX_DIR"); path != "" {
		return path
	}
	return "activity-outbox"
}

// Persist before dispatch so backend downtime and process restarts do not lose events.
func (s *Server) recordHumanActivity(tableID, playerID string) {
	activityOutboxMu.Lock()
	defer activityOutboxMu.Unlock()
	dir := activityOutboxDir()
	if err := os.MkdirAll(dir, 0700); err != nil {
		log.Printf("activity outbox unavailable: %v", err)
		return
	}
	body, err := json.Marshal(activityEvent{tableID, playerID, time.Now().UTC().Format(time.RFC3339Nano)})
	if err != nil {
		return
	}
	file, err := os.CreateTemp(dir, "pending-*.tmp")
	if err != nil {
		log.Printf("activity persistence failed: %v", err)
		return
	}
	name := file.Name()
	defer os.Remove(name)
	if _, err = file.Write(body); err == nil {
		err = file.Sync()
	}
	closeErr := file.Close()
	if err != nil || closeErr != nil {
		log.Printf("activity persistence failed: %v %v", err, closeErr)
		return
	}
	if err = os.Rename(name, name+".json"); err != nil {
		log.Printf("activity persistence failed: %v", err)
		return
	}
	if directory, err := os.Open(dir); err == nil {
		_ = directory.Sync()
		_ = directory.Close()
	}
}

func (s *Server) dispatchHumanActivity() {
	activityDispatchMu.Lock()
	defer activityDispatchMu.Unlock()
	files, _ := filepath.Glob(filepath.Join(activityOutboxDir(), "*.json"))
	client := &http.Client{Timeout: 3 * time.Second}
	for _, name := range files {
		body, err := os.ReadFile(name)
		if err != nil {
			continue
		}
		req, err := http.NewRequest(http.MethodPost, fmt.Sprintf("%s/api/v1/games/internal/human-activity/", s.config.BackendInternalURL), bytes.NewReader(body))
		if err != nil {
			return
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Game-Engine-Secret", s.config.ResultSecret)
		response, err := client.Do(req)
		if err != nil {
			return
		}
		response.Body.Close()
		if response.StatusCode >= 200 && response.StatusCode < 300 {
			_ = os.Remove(name)
		} else if response.StatusCode == http.StatusBadRequest || response.StatusCode == http.StatusNotFound {
			// Retain rejected records for inspection without blocking unrelated games.
			_ = os.Rename(name, name+".rejected")
			log.Printf("activity delivery rejected status=%d", response.StatusCode)
		} else {
			log.Printf("activity delivery pending status=%d", response.StatusCode)
			return
		}
	}
}
