package room

import (
	"fmt"
	"sync"
	"time"

	"github.com/casino-mdg/game-engine/internal/config"
	"github.com/google/uuid"
)

// Table represents a game table (Poker, Belote, Rami)
type Table struct {
	ID          string
	GameType    string
	Players     map[string]*Player
	State       interface{}
	CreatedAt   time.Time
	UpdatedAt   time.Time
	IsActive    bool
	GracePeriod time.Duration
	Sequence    uint64
	Events      []Event
	mu          sync.RWMutex
}

type Event struct {
	ID        string      `json:"event_id"`
	TableID   string      `json:"table_id"`
	PlayerID  string      `json:"player_id"`
	Action    string      `json:"action"`
	Payload   interface{} `json:"payload,omitempty"`
	Sequence  uint64      `json:"sequence"`
	Timestamp time.Time   `json:"timestamp"`
}

type Player struct {
	ID       string
	Name     string
	Stack    int64
	Seat     int
	IsActive bool
	JoinedAt time.Time
}

type Manager struct {
	config *config.Config
	tables map[string]*Table
	mu     sync.RWMutex
}

func NewManager(cfg *config.Config) *Manager {
	return &Manager{
		config: cfg,
		tables: make(map[string]*Table),
	}
}

// CreateTable creates a new game table
func (m *Manager) CreateTable(gameType string) *Table {
	m.mu.Lock()
	defer m.mu.Unlock()

	table := &Table{
		ID:          uuid.New().String(),
		GameType:    gameType,
		Players:     make(map[string]*Player),
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
		IsActive:    true,
		GracePeriod: m.config.GracePeriod,
	}

	m.tables[table.ID] = table
	return table
}

// GetTable retrieves a table by ID
func (m *Manager) GetTable(id string) (*Table, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	t, ok := m.tables[id]
	return t, ok
}

// ListTables returns all active tables
func (m *Manager) ListTables() map[string]*Table {
	m.mu.RLock()
	defer m.mu.RUnlock()

	active := make(map[string]*Table)
	for id, t := range m.tables {
		if t.IsActive {
			active[id] = t
		}
	}
	return active
}

// RemoveTable removes a table (after grace period)
func (m *Manager) RemoveTable(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.tables, id)
}

func (m *Manager) JoinPlayer(tableID, playerID, name string, seat int) (Event, error) {
	table, ok := m.GetTable(tableID)
	if !ok {
		return Event{}, fmt.Errorf("table not found")
	}
	table.mu.Lock()
	defer table.mu.Unlock()
	if existing, ok := table.Players[playerID]; ok {
		existing.IsActive = true
		existing.JoinedAt = time.Now()
		return Event{TableID: tableID, PlayerID: playerID, Action: "reconnected", Sequence: table.Sequence}, nil
	}
	table.Players[playerID] = &Player{ID: playerID, Name: name, Seat: seat, IsActive: true, JoinedAt: time.Now()}
	return appendEvent(table, playerID, "joined", map[string]interface{}{"seat": seat}), nil
}

func (m *Manager) ApplyAction(tableID, playerID, action string, expectedSequence uint64, payload interface{}) (Event, error) {
	table, ok := m.GetTable(tableID)
	if !ok {
		return Event{}, fmt.Errorf("table not found")
	}
	table.mu.Lock()
	defer table.mu.Unlock()
	if _, ok := table.Players[playerID]; !ok {
		return Event{}, fmt.Errorf("player is not seated")
	}
	if expectedSequence != table.Sequence {
		return Event{}, fmt.Errorf("stale sequence: expected %d", table.Sequence)
	}
	if !validAction(action) {
		return Event{}, fmt.Errorf("invalid action")
	}
	return appendEvent(table, playerID, action, payload), nil
}

func (m *Manager) EventsSince(tableID string, after uint64) ([]Event, error) {
	table, ok := m.GetTable(tableID)
	if !ok {
		return nil, fmt.Errorf("table not found")
	}
	table.mu.RLock()
	defer table.mu.RUnlock()
	result := make([]Event, 0)
	for _, event := range table.Events {
		if event.Sequence > after {
			result = append(result, event)
		}
	}
	return result, nil
}

func appendEvent(table *Table, playerID, action string, payload interface{}) Event {
	table.Sequence++
	event := Event{ID: uuid.New().String(), TableID: table.ID, PlayerID: playerID, Action: action, Payload: payload, Sequence: table.Sequence, Timestamp: time.Now()}
	table.Events = append(table.Events, event)
	table.UpdatedAt = event.Timestamp
	return event
}

func validAction(action string) bool {
	switch action {
	case "fold", "check", "call", "bet", "raise", "all_in":
		return true
	}
	return false
}
