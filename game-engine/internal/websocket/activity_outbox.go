package websocket

import (
	"bytes"
	"crypto/sha256"
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
	Kind       string `json:"kind,omitempty"`
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
	s.persistActivity(activityEvent{TableID: tableID, UserID: playerID, OccurredAt: time.Now().UTC().Format(time.RFC3339Nano)})
}
func (s *Server) recordTableClosed(tableID string) {
	// A small persistent tombstone also rejects old admission tickets after a
	// process restart, before the backend has acknowledged the closure event.
	path := closedMarkerPath(tableID)
	if err := os.MkdirAll(filepath.Dir(path), 0700); err == nil {
		file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY, 0600)
		if err == nil {
			_ = file.Sync()
			_ = file.Close()
			if dir, err := os.Open(filepath.Dir(path)); err == nil {
				_ = dir.Sync()
				_ = dir.Close()
			}
		} else {
			log.Printf("closed marker persistence failed: %v", err)
		}
	} else {
		log.Printf("closed marker directory failed: %v", err)
	}

	s.persistActivity(activityEvent{TableID: tableID, Kind: "table_closed", OccurredAt: time.Now().UTC().Format(time.RFC3339Nano)})
}
func (s *Server) persistActivity(event activityEvent) {
	activityOutboxMu.Lock()
	defer activityOutboxMu.Unlock()
	dir := activityOutboxDir()
	if err := os.MkdirAll(dir, 0700); err != nil {
		log.Printf("activity outbox unavailable: %v", err)
		return
	}
	body, err := json.Marshal(event)
	if err != nil {
		return
	}
	file, err := os.CreateTemp(dir, "pending-*.tmp")
	if err != nil {
		log.Printf("activity persistence failed: %v", err)
		return
	}
	name := file.Name()
	defer func() { _ = os.Remove(name) }()
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
		_ = response.Body.Close()
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

func closedMarkerPath(tableID string) string {
	hash := sha256.Sum256([]byte(tableID))
	return filepath.Join(activityOutboxDir(), "closed", fmt.Sprintf("%x", hash))
}
func (s *Server) isTableClosed(tableID string) bool {
	if s.config.BackendInternalURL == "" || s.config.ResultSecret == "" {
		return false
	}
	_, err := os.Stat(closedMarkerPath(tableID))
	return err == nil || !os.IsNotExist(err)
}
