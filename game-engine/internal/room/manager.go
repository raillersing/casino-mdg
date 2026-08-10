package room

import (
	"sync"
	"time"

	"github.com/casino-mdg/game-engine/internal/config"
	"github.com/google/uuid"
)

// Table represents a game table (Poker, Belote, Rami)
type Table struct {
	ID           string
	GameType     string
	Players      map[string]*Player
	State        interface{}
	CreatedAt    time.Time
	UpdatedAt    time.Time
	IsActive     bool
	GracePeriod  time.Duration
	mu           sync.RWMutex
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
	config  *config.Config
	tables  map[string]*Table
	mu      sync.RWMutex
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
