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

type TableSnapshot struct {
	ID        string             `json:"id"`
	GameType  string             `json:"game_type"`
	Sequence  uint64             `json:"sequence"`
	Players   map[string]*Player `json:"players"`
	Events    []Event            `json:"events"`
	UpdatedAt time.Time          `json:"updated_at"`
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
	if !validActionForGame(table.GameType, action) {
		return Event{}, fmt.Errorf("invalid action")
	}
	return appendEvent(table, playerID, action, payload), nil
}

func (m *Manager) DisconnectPlayer(tableID, playerID string) {
	table, ok := m.GetTable(tableID)
	if !ok {
		return
	}
	table.mu.Lock()
	player, ok := table.Players[playerID]
	if !ok {
		table.mu.Unlock()
		return
	}
	player.IsActive = false
	deadline := time.Now().Add(table.GracePeriod)
	table.mu.Unlock()
	go func() {
		time.Sleep(time.Until(deadline))
		table.mu.Lock()
		defer table.mu.Unlock()
		if current, exists := table.Players[playerID]; exists && !current.IsActive && time.Now().After(deadline) {
			delete(table.Players, playerID)
		}
	}()
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

func (m *Manager) Snapshot(tableID string) (TableSnapshot, error) {
	table, ok := m.GetTable(tableID)
	if !ok {
		return TableSnapshot{}, fmt.Errorf("table not found")
	}
	table.mu.RLock()
	defer table.mu.RUnlock()
	players := make(map[string]*Player, len(table.Players))
	for id, player := range table.Players {
		copy := *player
		players[id] = &copy
	}
	events := append([]Event(nil), table.Events...)
	return TableSnapshot{ID: table.ID, GameType: table.GameType, Sequence: table.Sequence, Players: players, Events: events, UpdatedAt: table.UpdatedAt}, nil
}

func (m *Manager) RestoreSnapshot(snapshot TableSnapshot) (*Table, error) {
	if snapshot.ID == "" || snapshot.GameType == "" {
		return nil, fmt.Errorf("invalid table snapshot")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if existing, ok := m.tables[snapshot.ID]; ok {
		return existing, nil
	}
	players := make(map[string]*Player, len(snapshot.Players))
	for id, player := range snapshot.Players {
		copy := *player
		players[id] = &copy
	}
	table := &Table{ID: snapshot.ID, GameType: snapshot.GameType, Players: players, CreatedAt: time.Now(), UpdatedAt: snapshot.UpdatedAt, IsActive: true, GracePeriod: m.config.GracePeriod, Sequence: snapshot.Sequence, Events: append([]Event(nil), snapshot.Events...)}
	m.tables[table.ID] = table
	return table, nil
}

func appendEvent(table *Table, playerID, action string, payload interface{}) Event {
	table.Sequence++
	event := Event{ID: uuid.New().String(), TableID: table.ID, PlayerID: playerID, Action: action, Payload: payload, Sequence: table.Sequence, Timestamp: time.Now()}
	table.Events = append(table.Events, event)
	table.UpdatedAt = event.Timestamp
	return event
}

func validActionForGame(gameType, action string) bool {
	if gameType == "belote" {
		switch action {
		case "play_card", "announce", "pass":
			return true
		}
		return false
	}
	if gameType == "rami" {
		switch action {
		case "draw", "discard", "meld":
			return true
		}
		return false
	}
	return validAction(action)
}

func validAction(action string) bool {
	switch action {
	case "fold", "check", "call", "bet", "raise", "all_in":
		return true
	}
	return false
}
