package websocket

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/casino-mdg/game-engine/internal/room"
)

type financeRecord struct {
	Snapshot   room.TableSnapshot     `json:"snapshot"`
	Checkpoint room.FinanceCheckpoint `json:"checkpoint"`
}

func (s *Server) financeURL(id string) string {
	return fmt.Sprintf("%s/api/v1/games/internal/tables/%s/finance/", s.config.BackendInternalURL, id)
}
func (s *Server) fundingOperations(id string) ([]room.FundingOperation, error) {
	if s.config.BackendInternalURL == "" || s.config.ResultSecret == "" {
		return nil, fmt.Errorf("funding backend unavailable")
	}
	req, err := http.NewRequest(http.MethodGet, s.financeURL(id), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Game-Engine-Secret", s.config.ResultSecret)
	resp, err := (&http.Client{Timeout: 3 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("funding backend status %d", resp.StatusCode)
	}
	var data struct {
		Operations []room.FundingOperation `json:"operations"`
	}
	err = json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&data)
	return data.Operations, err
}
func financePath(id string) string {
	return filepath.Join(activityOutboxDir(), "finance", fmt.Sprintf("%x.json", []byte(id)))
}
func storeFinance(record financeRecord) error {
	path := financePath(record.Snapshot.ID)
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	body, err := json.Marshal(record)
	if err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(path), "checkpoint-*.tmp")
	if err != nil {
		return err
	}
	name := file.Name()
	defer func() { _ = os.Remove(name) }()
	if _, err = file.Write(body); err == nil {
		err = file.Sync()
	}
	closeErr := file.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	if err = os.Rename(name, path); err != nil {
		return err
	}
	directory, err := os.Open(filepath.Dir(path))
	if err != nil {
		return err
	}
	syncErr := directory.Sync()
	closeErr := directory.Close()
	if syncErr != nil {
		return syncErr
	}
	return closeErr
}
func readFinance(path string) (financeRecord, error) {
	var record financeRecord
	body, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		body, err = os.ReadFile(filepath.Join(filepath.Dir(path), "closed", filepath.Base(path)))
	}
	if err != nil {
		return record, err
	}
	err = json.Unmarshal(body, &record)
	return record, err
}
func (s *Server) deliverFinance(record financeRecord) error {
	if revision, ok := s.financeAcks.Load(record.Snapshot.ID); ok && revision.(uint64) == record.Checkpoint.Revision {
		return nil
	}
	body, err := json.Marshal(record.Checkpoint)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, s.financeURL(record.Snapshot.ID), bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Game-Engine-Secret", s.config.ResultSecret)
	resp, err := (&http.Client{Timeout: 3 * time.Second}).Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("financial checkpoint pending: %d", resp.StatusCode)
	}
	s.financeAcks.Store(record.Snapshot.ID, record.Checkpoint.Revision)
	return nil
}

// Disk checkpoint precedes acknowledgement and subsequent play. It includes the
// private deck and consumed operation IDs, so a crash cannot replay a top-up.
func (s *Server) commitFinance(id string) error {
	s.roomManager.FinalizeFinance(id)
	checkpoint, ok := s.roomManager.FinanceCheckpoint(id)
	if !ok {
		return nil
	}
	sort.Strings(checkpoint.Operations)
	snapshot, err := s.roomManager.Snapshot(id)
	if err != nil {
		return err
	}
	record := financeRecord{snapshot, checkpoint}
	if err = storeFinance(record); err != nil {
		return fmt.Errorf("financial persistence unavailable: %w", err)
	}
	err = s.deliverFinance(record)
	if err == nil && checkpoint.Closed {
		_ = archiveSettledFinance(financePath(id))
		s.broadcastToTable(id, &Message{Type: MsgError, TableID: id, Payload: "table is closed"})
	}
	return err
}
func (s *Server) syncFunding(id string) error {
	if err := s.commitFinance(id); err != nil {
		return err
	}
	operations, err := s.fundingOperations(id)
	if err != nil {
		return err
	}
	for _, op := range operations {
		if op.Kind == "top_up" {
			_ = s.roomManager.ApplyFunding(id, op)
		}
		if op.Kind == "leave" {
			for _, entry := range operations {
				if entry.Kind == "entry" && entry.Session == op.Session {
					s.roomManager.CancelUnadmittedFunding(id, entry, operations)
				}
			}
			if table, ok := s.roomManager.GetTable(id); ok {
				if p := table.CopyPlayers()[op.UserID]; p != nil && !p.Leaving {
					s.roomManager.LeavePlayer(id, op.UserID)
				}
			}
		}
	}
	return s.commitFinance(id)
}
func (s *Server) restoreFinance() {
	files, _ := filepath.Glob(filepath.Join(activityOutboxDir(), "finance", "*.json"))
	for _, path := range files {
		record, err := readFinance(path)
		if err != nil {
			continue
		}
		if !record.Snapshot.Closed {
			if table, err := s.roomManager.RestoreSnapshot(record.Snapshot); err == nil {
				for id := range table.CopyPlayers() {
					s.roomManager.DisconnectPlayer(table.ID, id)
				}
				s.startBotTurns(table.ID)
			}
		}
	}
}

func (s *Server) financeGuard(id string) *sync.Mutex {
	lock, _ := s.financeLocks.LoadOrStore(id, &sync.Mutex{})
	return lock.(*sync.Mutex)
}
func (s *Server) syncStoredFinance(path string) {
	record, err := readFinance(path)
	if err != nil {
		return
	}
	guard := s.financeGuard(record.Snapshot.ID)
	guard.Lock()
	defer guard.Unlock()
	// Re-read under the table guard: an action may have written a newer checkpoint.
	record, err = readFinance(path)
	if err != nil {
		return
	}
	id := record.Snapshot.ID

	if record.Snapshot.Closed {
		if s.deliverFinance(record) == nil {
			_ = archiveSettledFinance(path)
			s.roomManager.RemoveTable(id)
		}
		return
	}

	if _, exists := s.roomManager.GetTable(id); exists {
		if s.syncFunding(id) == nil {
			s.broadcastState(id)
		}
	} else {
		_ = s.deliverFinance(record)
	}
}
func (s *Server) financeLoop() {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for range ticker.C {
		files, _ := filepath.Glob(filepath.Join(activityOutboxDir(), "finance", "*.json"))
		var group sync.WaitGroup
		slots := make(chan struct{}, 8)
		for _, path := range files {
			slots <- struct{}{}
			group.Add(1)
			go func(path string) { defer group.Done(); defer func() { <-slots }(); s.syncStoredFinance(path) }(path)
		}
		group.Wait()
	}
}

// Settled tombstones remain readable for admission checks, but are no longer
// scanned or posted on every polling tick.
func archiveSettledFinance(path string) error {
	directory := filepath.Join(filepath.Dir(path), "closed")
	if err := os.MkdirAll(directory, 0700); err != nil {
		return err
	}
	if err := os.Rename(path, filepath.Join(directory, filepath.Base(path))); err != nil {
		return err
	}
	handle, err := os.Open(directory)
	if err != nil {
		return err
	}
	syncErr := handle.Sync()
	closeErr := handle.Close()
	if syncErr != nil {
		return syncErr
	}
	return closeErr
}
