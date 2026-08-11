package room

import (
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"sync"
	"time"

	"github.com/casino-mdg/game-engine/internal/config"
	"github.com/casino-mdg/game-engine/internal/game/poker"
	"github.com/google/uuid"
)

// Table represents a game table (Poker, Belote, Rami)
type Table struct {
	ID            string
	GameType      string
	Players       map[string]*Player
	State         interface{}
	CreatedAt     time.Time
	UpdatedAt     time.Time
	IsActive      bool
	GracePeriod   time.Duration
	Deterministic bool
	Blinds        bool
	Sequence      uint64
	Events        []Event
	mu            sync.RWMutex
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
	State     json.RawMessage    `json:"state,omitempty"`
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

type Stats struct {
	TablesActive  int
	PlayersActive int
	EventsTotal   uint64
}

func NewManager(cfg *config.Config) *Manager {
	return &Manager{
		config: cfg,
		tables: make(map[string]*Table),
	}
}

// CreateTable creates a new game table
func (m *Manager) CreateTable(gameType string) *Table {
	return m.CreateTableWithID(uuid.New().String(), gameType)
}

// CreateTableWithID provisions a room using the table identifier owned by the API.
func (m *Manager) CreateTableWithID(id, gameType string) *Table {
	m.mu.Lock()
	defer m.mu.Unlock()
	if existing, ok := m.tables[id]; ok {
		return existing
	}

	table := &Table{
		ID:            id,
		GameType:      gameType,
		Players:       make(map[string]*Player),
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
		IsActive:      true,
		GracePeriod:   m.config.GracePeriod,
		Deterministic: m.config.Deterministic,
		Blinds:        m.config.Blinds,
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

func (m *Manager) Stats() Stats {
	m.mu.RLock()
	defer m.mu.RUnlock()
	stats := Stats{}
	for _, table := range m.tables {
		if !table.IsActive {
			continue
		}
		stats.TablesActive++
		table.mu.RLock()
		stats.EventsTotal += uint64(len(table.Events))
		for _, player := range table.Players {
			if player.IsActive {
				stats.PlayersActive++
			}
		}
		table.mu.RUnlock()
	}
	return stats
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
	table.Players[playerID] = &Player{ID: playerID, Name: name, Seat: seat, Stack: 10000, IsActive: true, JoinedAt: time.Now()}
	if table.GameType == "poker" && len(table.Players) >= 2 && table.State == nil {
		if err := initializePokerHand(table); err != nil {
			return Event{}, err
		}
	}
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
	if table.GameType == "poker" && table.State != nil {
		if err := applyPokerAction(table, playerID, action, payload); err != nil {
			return Event{}, err
		}
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

func (m *Manager) FinishedPokerResult(tableID string) (winnerIDs []string, pot int64, finished bool) {
	table, ok := m.GetTable(tableID)
	if !ok {
		return nil, 0, false
	}
	table.mu.RLock()
	defer table.mu.RUnlock()
	hand, ok := table.State.(*poker.Hand)
	if !ok {
		return nil, 0, false
	}
	winners, finished := hand.Winners()
	if !finished {
		return nil, 0, false
	}
	for _, winner := range winners {
		winnerIDs = append(winnerIDs, winner.ID)
	}
	return winnerIDs, hand.Pot, true
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
	state, _ := json.Marshal(table.State)
	return TableSnapshot{ID: table.ID, GameType: table.GameType, Sequence: table.Sequence, Players: players, Events: events, UpdatedAt: table.UpdatedAt, State: state}, nil
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
	table := &Table{ID: snapshot.ID, GameType: snapshot.GameType, Players: players, CreatedAt: time.Now(), UpdatedAt: snapshot.UpdatedAt, IsActive: true, GracePeriod: m.config.GracePeriod, Deterministic: m.config.Deterministic, Blinds: m.config.Blinds, Sequence: snapshot.Sequence, Events: append([]Event(nil), snapshot.Events...)}
	if snapshot.GameType == "poker" && len(snapshot.State) > 0 {
		var hand poker.Hand
		if err := json.Unmarshal(snapshot.State, &hand); err == nil {
			table.State = &hand
		}
	}
	m.tables[table.ID] = table
	return table, nil
}

func initializePokerHand(table *Table) error {
	players := make([]*poker.Player, 0, len(table.Players))
	seats := make([]*Player, 0, len(table.Players))
	for _, player := range table.Players {
		seats = append(seats, player)
	}
	sort.Slice(seats, func(i, j int) bool { return seats[i].Seat < seats[j].Seat })
	for _, player := range seats {
		players = append(players, &poker.Player{ID: player.ID, Stack: player.Stack})
	}
	var hand *poker.Hand
	var err error
	if tableManagerDeterministic(table) {
		hand, err = poker.NewHand(players, func([]poker.Card) {})
	} else {
		hand, err = poker.NewShuffledHand(players)
	}
	if err != nil {
		return err
	}
	table.State = hand
	if table.Blinds {
		if err := hand.StartHand(50, 100); err != nil {
			return err
		}
	}
	return nil
}

func tableManagerDeterministic(table *Table) bool {
	return table.Deterministic
}

func applyPokerAction(table *Table, playerID, action string, payload interface{}) error {
	hand, ok := table.State.(*poker.Hand)
	if !ok {
		return fmt.Errorf("invalid poker state")
	}
	index := -1
	for i, player := range hand.Players {
		if player.ID == playerID {
			index = i
			break
		}
	}
	if index < 0 {
		return fmt.Errorf("player is not in poker hand")
	}
	amount := int64(0)
	if values, ok := payload.(map[string]interface{}); ok {
		switch value := values["amount"].(type) {
		case float64:
			amount = int64(value)
		case int:
			amount = int64(value)
		case string:
			amount, _ = strconv.ParseInt(value, 10, 64)
		}
	}
	return hand.Apply(index, poker.Action(action), amount)
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
