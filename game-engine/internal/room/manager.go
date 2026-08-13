package room

import (
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"sync"
	"time"

	"github.com/casino-mdg/game-engine/internal/config"
	"github.com/casino-mdg/game-engine/internal/game/belote"
	"github.com/casino-mdg/game-engine/internal/game/poker"
	"github.com/casino-mdg/game-engine/internal/game/rami"
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
	ID       string    `json:"id"`
	Name     string    `json:"name"`
	Stack    int64     `json:"stack"`
	Seat     int       `json:"seat"`
	IsActive bool      `json:"is_active"`
	IsBot    bool      `json:"is_bot"`
	JoinedAt time.Time `json:"joined_at"`
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

// BotTurn is the smallest command needed by the websocket orchestrator to
// advance a bot-controlled table. Sequence is returned under the same lock as
// the decision so the action remains optimistic-concurrency safe.
type BotTurn struct {
	PlayerID string
	Action   string
	Payload  interface{}
	Sequence uint64
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

// LeavePlayer removes a player who explicitly left. Unlike a transport
// disconnect, an explicit leave does not preserve a grace-period seat.
func (m *Manager) LeavePlayer(tableID, playerID string) bool {
	table, ok := m.GetTable(tableID)
	if !ok {
		return false
	}
	table.mu.Lock()
	defer table.mu.Unlock()
	if _, exists := table.Players[playerID]; !exists {
		return false
	}
	delete(table.Players, playerID)
	table.UpdatedAt = time.Now()
	if len(table.Players) == 0 {
		table.IsActive = false
	}
	return true
}

func (m *Manager) JoinPlayer(tableID, playerID, name string, seat int) (Event, error) {
	return m.joinPlayer(tableID, playerID, name, seat, false, true)
}

// JoinBotPlayer is reserved for the authenticated internal bot connection.
// Keeping it separate from JoinPlayer prevents a public client from opting
// into bot identity through the regular JWT/WebSocket path.
func (m *Manager) JoinBotPlayer(tableID, playerID, name string, seat int) (Event, error) {
	return m.joinPlayer(tableID, playerID, name, seat, true, false)
}

func (m *Manager) joinPlayer(tableID, playerID, name string, seat int, isBot, initialize bool) (Event, error) {
	table, ok := m.GetTable(tableID)
	if !ok {
		return Event{}, fmt.Errorf("table not found")
	}
	table.mu.Lock()
	defer table.mu.Unlock()
	if !table.IsActive {
		return Event{}, fmt.Errorf("table is closed")
	}
	if existing, ok := table.Players[playerID]; ok {
		existing.IsActive = true
		existing.JoinedAt = time.Now()
		return Event{TableID: tableID, PlayerID: playerID, Action: "reconnected", Sequence: table.Sequence}, nil
	}
	table.Players[playerID] = &Player{ID: playerID, Name: name, Seat: seat, Stack: 10000, IsActive: true, IsBot: isBot, JoinedAt: time.Now()}
	if initialize && table.GameType == "poker" && len(table.Players) >= 2 && table.State == nil {
		if err := initializePokerHand(table); err != nil {
			return Event{}, err
		}
	}
	if initialize && table.GameType == "belote" && len(table.Players) >= 4 && table.State == nil {
		if err := initializeBeloteRound(table); err != nil {
			return Event{}, err
		}
	}
	if initialize && table.GameType == "rami" && len(table.Players) >= 2 && table.State == nil {
		if err := initializeRamiGame(table); err != nil {
			return Event{}, err
		}
	}
	return appendEvent(table, playerID, "joined", map[string]interface{}{"seat": seat}), nil
}

func (m *Manager) ApplyAction(tableID, playerID, action string, expectedSequence uint64, payload interface{}) (Event, error) {
	event, _, err := m.ApplyActionIdempotent(tableID, playerID, action, expectedSequence, payload, "")
	return event, err
}

// NextBotTurn selects a deterministic legal action only when the current seat
// belongs to a bot. It deliberately contains no random policy: repeatable
// demo sessions are easier to test, explain and replay.
func (m *Manager) NextBotTurn(tableID string) (BotTurn, bool) {
	table, ok := m.GetTable(tableID)
	if !ok {
		return BotTurn{}, false
	}
	table.mu.RLock()
	defer table.mu.RUnlock()
	switch game := table.State.(type) {
	case *poker.Hand:
		if game.Phase == "showdown" || game.Current < 0 || game.Current >= len(game.Players) {
			return BotTurn{}, false
		}
		gamePlayer := game.Players[game.Current]
		seat, exists := table.Players[gamePlayer.ID]
		if !exists || !seat.IsBot {
			return BotTurn{}, false
		}
		highest := int64(0)
		for _, player := range game.Players {
			if player.Bet > highest {
				highest = player.Bet
			}
		}
		toCall := highest - gamePlayer.Bet
		if toCall == 0 {
			return BotTurn{PlayerID: gamePlayer.ID, Action: "check", Sequence: table.Sequence}, true
		}
		if toCall <= gamePlayer.Stack {
			return BotTurn{PlayerID: gamePlayer.ID, Action: "call", Payload: map[string]interface{}{}, Sequence: table.Sequence}, true
		}
		return BotTurn{PlayerID: gamePlayer.ID, Action: "fold", Sequence: table.Sequence}, true
	case *belote.Round:
		if game.Finished() || game.Current < 0 || game.Current >= len(game.Players) {
			return BotTurn{}, false
		}
		gamePlayer := game.Players[game.Current]
		seat, exists := table.Players[gamePlayer.ID]
		if !exists || !seat.IsBot || len(gamePlayer.Hand) == 0 {
			return BotTurn{}, false
		}
		card := gamePlayer.Hand[0]
		for _, candidate := range gamePlayer.Hand {
			if game.LeadSuit < 0 || candidate.Suit == game.LeadSuit || !hasBeloteSuit(gamePlayer.Hand, game.LeadSuit) {
				card = candidate
				break
			}
		}
		return BotTurn{PlayerID: gamePlayer.ID, Action: "play_card", Payload: map[string]interface{}{"card": map[string]interface{}{"suit": card.Suit, "rank": card.Rank}}, Sequence: table.Sequence}, true
	case *rami.Game:
		if game.Finished || game.Current < 0 || game.Current >= len(game.Players) {
			return BotTurn{}, false
		}
		gamePlayer := game.Players[game.Current]
		seat, exists := table.Players[gamePlayer.ID]
		if !exists || !seat.IsBot {
			return BotTurn{}, false
		}
		if len(gamePlayer.Hand) <= 7 {
			return BotTurn{PlayerID: gamePlayer.ID, Action: "draw", Payload: map[string]interface{}{}, Sequence: table.Sequence}, true
		}
		card := gamePlayer.Hand[len(gamePlayer.Hand)-1]
		return BotTurn{PlayerID: gamePlayer.ID, Action: "discard", Payload: map[string]interface{}{"card": map[string]interface{}{"suit": card.Suit, "rank": card.Rank}}, Sequence: table.Sequence}, true
	default:
		return BotTurn{}, false
	}
}

// StartTable initializes the game only after the human owner has joined. Bot
// seats may be attached beforehand without allowing a complete bot-only hand
// to start behind the user's back.
func (m *Manager) StartTable(tableID string) error {
	table, ok := m.GetTable(tableID)
	if !ok {
		return fmt.Errorf("table not found")
	}
	table.mu.Lock()
	defer table.mu.Unlock()
	if table.State != nil {
		return nil
	}
	if table.GameType == "poker" && len(table.Players) >= 2 {
		return initializePokerHand(table)
	}
	if table.GameType == "belote" && len(table.Players) >= 4 {
		return initializeBeloteRound(table)
	}
	if table.GameType == "rami" && len(table.Players) >= 2 {
		return initializeRamiGame(table)
	}
	return nil
}

func hasBeloteSuit(hand []belote.Card, suit int) bool {
	for _, card := range hand {
		if card.Suit == suit {
			return true
		}
	}
	return false
}

// ApplyActionIdempotent applies an action once. A client may resend the same
// event_id after a reconnect; in that case the original event is returned and
// the game state/sequence are left untouched.
func (m *Manager) ApplyActionIdempotent(tableID, playerID, action string, expectedSequence uint64, payload interface{}, eventID string) (Event, bool, error) {
	table, ok := m.GetTable(tableID)
	if !ok {
		return Event{}, false, fmt.Errorf("table not found")
	}
	table.mu.Lock()
	defer table.mu.Unlock()
	if _, ok := table.Players[playerID]; !ok {
		return Event{}, false, fmt.Errorf("player is not seated")
	}
	if eventID != "" {
		for _, event := range table.Events {
			if event.ID == eventID {
				if event.PlayerID != playerID || event.Action != action {
					return Event{}, false, fmt.Errorf("event_id already belongs to another action")
				}
				return event, true, nil
			}
		}
	}
	if expectedSequence != table.Sequence {
		return Event{}, false, fmt.Errorf("stale sequence: expected %d", table.Sequence)
	}
	if !validActionForGame(table.GameType, action) {
		return Event{}, false, fmt.Errorf("invalid action")
	}
	if table.GameType == "poker" && table.State != nil {
		if err := applyPokerAction(table, playerID, action, payload); err != nil {
			return Event{}, false, err
		}
	}
	if table.GameType == "belote" && table.State != nil {
		if err := applyBeloteAction(table, playerID, action, payload); err != nil {
			return Event{}, false, err
		}
	}
	if table.GameType == "rami" && table.State != nil {
		if err := applyRamiAction(table, playerID, action, payload); err != nil {
			return Event{}, false, err
		}
	}
	event := appendEvent(table, playerID, action, payload)
	if eventID != "" {
		event.ID = eventID
		table.Events[len(table.Events)-1].ID = eventID
	}
	return event, false, nil
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
			table.UpdatedAt = time.Now()
			if len(table.Players) == 0 {
				table.IsActive = false
			}
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

func (m *Manager) FinishedPokerPayouts(tableID string) (map[string]int64, bool) {
	table, ok := m.GetTable(tableID)
	if !ok {
		return nil, false
	}
	table.mu.RLock()
	defer table.mu.RUnlock()
	hand, ok := table.State.(*poker.Hand)
	if !ok || hand.Phase != "showdown" {
		return nil, false
	}
	return hand.Payouts(), true
}

func (m *Manager) FinishedBeloteResults(tableID string) (winners, losers []string, points int64, finished bool) {
	table, ok := m.GetTable(tableID)
	if !ok {
		return nil, nil, 0, false
	}
	table.mu.RLock()
	defer table.mu.RUnlock()
	round, ok := table.State.(*belote.Round)
	if !ok {
		return nil, nil, 0, false
	}
	team, finished := round.WinningTeam()
	if !finished {
		return nil, nil, 0, false
	}
	points = int64(round.TeamPoints[team])
	for _, player := range round.Players {
		if player.Team == team {
			winners = append(winners, player.ID)
		} else {
			losers = append(losers, player.ID)
		}
	}
	return winners, losers, points, true
}

func (m *Manager) FinishedRamiResults(tableID string) (winnerID string, losers []string, amount int64, finished bool) {
	table, ok := m.GetTable(tableID)
	if !ok {
		return "", nil, 0, false
	}
	table.mu.RLock()
	defer table.mu.RUnlock()
	game, ok := table.State.(*rami.Game)
	if !ok {
		return "", nil, 0, false
	}
	winner, finished := game.Winner()
	if !finished {
		return "", nil, 0, false
	}
	winnerID = winner.ID
	for _, player := range game.Players {
		if player.ID != winnerID {
			losers = append(losers, player.ID)
			amount += int64(player.Score)
		}
	}
	return winnerID, losers, amount, true
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
	if snapshot.GameType == "belote" && len(snapshot.State) > 0 {
		var round belote.Round
		if err := json.Unmarshal(snapshot.State, &round); err == nil {
			table.State = &round
		}
	}
	if snapshot.GameType == "rami" && len(snapshot.State) > 0 {
		var game rami.Game
		if err := json.Unmarshal(snapshot.State, &game); err == nil {
			table.State = &game
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

func initializeBeloteRound(table *Table) error {
	seats := make([]*Player, 0, len(table.Players))
	for _, player := range table.Players {
		seats = append(seats, player)
	}
	sort.Slice(seats, func(i, j int) bool { return seats[i].Seat < seats[j].Seat })
	ids := make([]string, 0, len(seats))
	for _, player := range seats {
		ids = append(ids, player.ID)
	}
	var round *belote.Round
	var err error
	if table.Deterministic {
		round, err = belote.NewRound(ids, func([]belote.Card) {})
	} else {
		round, err = belote.NewShuffledRound(ids)
	}
	if err != nil {
		return err
	}
	table.State = round
	return nil
}

func initializeRamiGame(table *Table) error {
	seats := make([]*Player, 0, len(table.Players))
	for _, player := range table.Players {
		seats = append(seats, player)
	}
	sort.Slice(seats, func(i, j int) bool { return seats[i].Seat < seats[j].Seat })
	ids := make([]string, 0, len(seats))
	for _, player := range seats {
		ids = append(ids, player.ID)
	}
	if table.Deterministic {
		game, err := rami.NewGame(ids, func([]rami.Card) {})
		if err != nil {
			return err
		}
		table.State = game
		return nil
	}
	game, err := rami.NewShuffledGame(ids)
	if err != nil {
		return err
	}
	table.State = game
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

func applyBeloteAction(table *Table, playerID, action string, payload interface{}) error {
	round, ok := table.State.(*belote.Round)
	if !ok {
		return fmt.Errorf("invalid belote state")
	}
	index := -1
	for i, player := range round.Players {
		if player.ID == playerID {
			index = i
			break
		}
	}
	if index < 0 {
		return fmt.Errorf("player is not in belote round")
	}
	values, _ := payload.(map[string]interface{})
	switch action {
	case "play_card":
		cardValues, _ := values["card"].(map[string]interface{})
		suit, _ := cardValues["suit"].(float64)
		rank, _ := cardValues["rank"].(float64)
		if round.Current != index {
			return fmt.Errorf("not this player's turn")
		}
		_, err := round.PlayCard(index, belote.Card{Suit: int(suit), Rank: int(rank)})
		return err
	case "announce":
		trump, _ := values["trump"].(float64)
		return round.Announce(index, int(trump))
	case "pass":
		if round.Current != index {
			return fmt.Errorf("not this player's turn")
		}
		return round.Pass()
	default:
		return fmt.Errorf("invalid belote action")
	}
}

func applyRamiAction(table *Table, playerID, action string, payload interface{}) error {
	game, ok := table.State.(*rami.Game)
	if !ok {
		return fmt.Errorf("invalid rami state")
	}
	index := -1
	for i, player := range game.Players {
		if player.ID == playerID {
			index = i
			break
		}
	}
	if index < 0 || game.Current != index {
		return fmt.Errorf("not this player's turn")
	}
	values, _ := payload.(map[string]interface{})
	readCard := func(value map[string]interface{}) rami.Card {
		suit, _ := value["suit"].(float64)
		rank, _ := value["rank"].(float64)
		return rami.Card{Suit: int(suit), Rank: int(rank)}
	}
	switch action {
	case "draw":
		_, err := game.Draw()
		return err
	case "discard":
		card, _ := values["card"].(map[string]interface{})
		return game.DiscardCard(readCard(card))
	case "meld":
		raw, _ := values["cards"].([]interface{})
		cards := make([]rami.Card, 0, len(raw))
		for _, item := range raw {
			if card, ok := item.(map[string]interface{}); ok {
				cards = append(cards, readCard(card))
			}
		}
		return game.MeldCards(cards)
	default:
		return fmt.Errorf("invalid rami action")
	}
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
