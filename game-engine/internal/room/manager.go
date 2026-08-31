package room

import (
	"encoding/json"
	"fmt"
	"math/rand"
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
	ActionDeadline time.Time
	// Poker-specific persistent table state
	PokerLevel       int
	PokerHandsPlayed int
	PokerSmallBlind  int64
	PokerBigBlind    int64
	BotTilt          map[string]int // hands remaining in tilt per bot ID
	BotRecentStrength map[string]int // last showdown strength for tilt calculation
	// Belote multi-round state
	BeloteTeamScores  [2]int
	BeloteTargetScore int
	mu               sync.RWMutex
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
	ID               string             `json:"id"`
	GameType         string             `json:"game_type"`
	Sequence         uint64             `json:"sequence"`
	Players          map[string]*Player `json:"players"`
	Events           []Event            `json:"events"`
	UpdatedAt        time.Time          `json:"updated_at"`
	State            json.RawMessage    `json:"state,omitempty"`
	ActionDeadline   time.Time          `json:"action_deadline"`
	PokerLevel       int                `json:"poker_level"`
	PokerHandsPlayed int                `json:"poker_hands_played"`
	PokerSmallBlind  int64              `json:"poker_small_blind"`
	PokerBigBlind    int64              `json:"poker_big_blind"`
}

type Player struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	Stack      int64     `json:"stack"`
	Seat       int       `json:"seat"`
	IsActive   bool      `json:"is_active"`
	IsBot      bool      `json:"is_bot"`
	BotProfile string    `json:"bot_profile,omitempty"`
	JoinedAt   time.Time `json:"joined_at"`
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
	Profile  string
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
		ID:                id,
		GameType:          gameType,
		Players:           make(map[string]*Player),
		CreatedAt:         time.Now(),
		UpdatedAt:         time.Now(),
		IsActive:          true,
		GracePeriod:       m.config.GracePeriod,
		Deterministic:     m.config.Deterministic,
		Blinds:            m.config.Blinds,
		BotTilt:           make(map[string]int),
		BotRecentStrength: make(map[string]int),
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

func (m *Manager) TableSequence(tableID string) uint64 {
	table, ok := m.GetTable(tableID)
	if !ok {
		return 0
	}
	table.mu.RLock()
	defer table.mu.RUnlock()
	return table.Sequence
}

func (m *Manager) BeloteFinished(tableID string) (bool, bool) {
	table, ok := m.GetTable(tableID)
	if !ok {
		return false, false
	}
	table.mu.RLock()
	defer table.mu.RUnlock()
	if round, isBelote := table.State.(*belote.Round); isBelote {
		return round.Finished(), true
	}
	return false, false
}

func (m *Manager) RamiFinished(tableID string) (bool, bool) {
	table, ok := m.GetTable(tableID)
	if !ok {
		return false, false
	}
	table.mu.RLock()
	defer table.mu.RUnlock()
	if game, isRami := table.State.(*rami.Game); isRami {
		return game.Finished, true
	}
	return false, false
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
	return m.JoinBotPlayerWithProfile(tableID, playerID, name, seat, "balanced")
}

func (m *Manager) JoinBotPlayerWithProfile(tableID, playerID, name string, seat int, profile string) (Event, error) {
	return m.joinPlayerWithProfile(tableID, playerID, name, seat, true, false, profile)
}

func (m *Manager) joinPlayer(tableID, playerID, name string, seat int, isBot, initialize bool) (Event, error) {
	return m.joinPlayerWithProfile(tableID, playerID, name, seat, isBot, initialize, "")
}

func (m *Manager) joinPlayerWithProfile(tableID, playerID, name string, seat int, isBot, initialize bool, botProfile string) (Event, error) {
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
	table.Players[playerID] = &Player{ID: playerID, Name: name, Seat: seat, Stack: 10000, IsActive: true, IsBot: isBot, BotProfile: botProfile, JoinedAt: time.Now()}
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
// belongs to a bot. Profiles change the policy while keeping decisions
// deterministic, so a session remains reproducible in tests and replays.
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
		profile := seat.BotProfile
		if profile == "" {
			profile = "balanced"
		}
		highest := int64(0)
		for _, player := range game.Players {
			if player.Bet > highest {
				highest = player.Bet
			}
		}
			return decidePokerBotTurn(game, gamePlayer, table, profile, table.Sequence), true
	case *belote.Round:
		if game.Finished() || game.Phase == "all_passed" || game.Current < 0 || game.Current >= len(game.Players) {
			return BotTurn{}, false
		}
		gamePlayer := game.Players[game.Current]
		seat, exists := table.Players[gamePlayer.ID]
		if !exists || !seat.IsBot || len(gamePlayer.Hand) == 0 {
			return BotTurn{}, false
		}
		return decideBeloteBotTurn(game, gamePlayer, table.Sequence), true
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
		return decideRamiBotTurn(gamePlayer, table.Sequence), true
	default:
		return BotTurn{}, false
	}
}

// TimedOutAction returns the deterministic fallback for a human seat whose
// server deadline has expired. Checking is preferred when legal; otherwise
// the player folds. The caller still applies it through the authoritative
// action path.
func (m *Manager) TimedOutAction(tableID string) (BotTurn, bool) {
	table, ok := m.GetTable(tableID)
	if !ok {
		return BotTurn{}, false
	}
	table.mu.RLock()
	defer table.mu.RUnlock()
	if table.ActionDeadline.IsZero() || time.Now().Before(table.ActionDeadline) {
		return BotTurn{}, false
	}
	switch game := table.State.(type) {
	case *poker.Hand:
		if game.Phase == "showdown" || game.Current < 0 || game.Current >= len(game.Players) {
			return BotTurn{}, false
		}
		player := game.Players[game.Current]
		if player.Folded || player.AllIn {
			return BotTurn{}, false
		}
		if game.HighestBet() == player.Bet {
			return BotTurn{PlayerID: player.ID, Action: "check", Sequence: table.Sequence}, true
		}
		return BotTurn{PlayerID: player.ID, Action: "fold", Sequence: table.Sequence}, true
	case *belote.Round:
		if game.Finished() || game.Current < 0 || game.Current >= len(game.Players) {
			return BotTurn{}, false
		}
		player := game.Players[game.Current]
		seat, exists := table.Players[player.ID]
		if !exists || seat.IsBot || len(player.Hand) == 0 {
			return BotTurn{}, false
		}
		if game.Phase == "bidding" {
			// Auto-pass on timeout during bidding
			return BotTurn{PlayerID: player.ID, Action: "pass", Sequence: table.Sequence}, true
		}
		// Playing phase — play first legal card
		card := player.Hand[0]
		for _, candidate := range player.Hand {
			if game.LeadSuit < 0 || candidate.Suit == game.LeadSuit || !hasBeloteSuit(player.Hand, game.LeadSuit) {
				card = candidate
				break
			}
		}
		return BotTurn{PlayerID: player.ID, Action: "play_card", Payload: map[string]interface{}{"card": map[string]interface{}{"suit": card.Suit, "rank": card.Rank}}, Sequence: table.Sequence}, true
	case *rami.Game:
		if game.Finished || game.Current < 0 || game.Current >= len(game.Players) {
			return BotTurn{}, false
		}
		player := game.Players[game.Current]
		seat, exists := table.Players[player.ID]
		if !exists || seat.IsBot {
			return BotTurn{}, false
		}
		if len(player.Hand) <= 7 {
			return BotTurn{PlayerID: player.ID, Action: "draw", Payload: map[string]interface{}{}, Sequence: table.Sequence}, true
		}
		card := player.Hand[0]
		return BotTurn{PlayerID: player.ID, Action: "discard", Payload: map[string]interface{}{"card": map[string]interface{}{"suit": card.Suit, "rank": card.Rank}}, Sequence: table.Sequence}, true
	default:
		return BotTurn{}, false
	}
}

func pokerBotPreflopStrength(player *poker.Player) int {
	if len(player.Cards) < 2 {
		return 0
	}
	first, second := player.Cards[0].Rank, player.Cards[1].Rank
	if first == second {
		if first >= 12 {
			return 5
		}
		return 3
	}
	if first >= 13 && second >= 13 {
		return 4
	}
	if first >= 12 || second >= 12 {
		return 2
	}
	return 0
}

func pokerBotRealStrength(player *poker.Player, community []poker.Card) int {
	if len(player.Cards) < 2 {
		return 0
	}
	if len(community) < 3 {
		return pokerBotPreflopStrength(player) * 10
	}
	all := append(append([]poker.Card{}, player.Cards...), community...)
	hv, _ := poker.BestHandValue(all)
	return hv.Category*10 + len(hv.Tiebreak)
}

// normalizeBotProfile maps legacy session profiles to rich personalities.
// "balanced" is expanded into a random mix so the table feels alive.
func normalizeBotProfile(profile string) string {
	switch profile {
	case "tutorial":
		return "fish"
	case "expert":
		return "shark"
	case "fish", "rock", "maniac", "shark", "donkey":
		return profile
	default:
		// balanced or anything else → random personality for variety
		personalities := []string{"fish", "rock", "maniac", "shark", "donkey"}
		return personalities[rand.Intn(len(personalities))]
	}
}

func botPositionIndex(game *poker.Hand, playerID string) int {
	for i, p := range game.Players {
		if p.ID == playerID {
			return i
		}
	}
	return 0
}

func botPositionCategory(game *poker.Hand, playerID string) string {
	idx := botPositionIndex(game, playerID)
	n := len(game.Players)
	if n <= 2 {
		if idx == game.Button {
			return "late"
		}
		return "early"
	}
	// Distance from button (0 = button, 1 = cutoff, etc.)
	dist := (idx - game.Button + n) % n
	if dist == 0 {
		return "late"
	}
	if dist <= 2 {
		return "mid"
	}
	return "early"
}

func botIsOnTilt(table *Table, playerID string) bool {
	table.mu.RLock()
	defer table.mu.RUnlock()
	return table.BotTilt[playerID] > 0
}

func botTiltFactor(table *Table, playerID string) float64 {
	table.mu.RLock()
	defer table.mu.RUnlock()
	if table.BotTilt[playerID] > 0 {
		return 0.75
	}
	return 1.0
}

func botShouldBluff(profile, position, phase string, board []poker.Card, table *Table) bool {
	// Base bluff probability by profile
	baseProb := 0.0
	switch profile {
	case "maniac":
		baseProb = 0.35
	case "shark":
		baseProb = 0.20
	case "fish":
		baseProb = 0.05
	case "donkey":
		baseProb = 0.25
	case "rock":
		baseProb = 0.02
	}
	// Late position favours bluffs
	if position == "late" {
		baseProb += 0.10
	} else if position == "early" {
		baseProb -= 0.05
	}
	// Dry board favours bluffs (few draws)
	if len(board) >= 3 {
		suited := 0
		for _, c := range board {
			if c.Suit == board[0].Suit {
				suited++
			}
		}
		if suited < 3 {
			baseProb += 0.05
		}
	}
	// Tilt increases bluffing
	if botIsOnTilt(table, "") {
		// We need the actual playerID here; handled in caller
	}
	return rand.Float64() < baseProb
}

func botShouldSlowPlay(profile string, strength int, phase string) bool {
	if strength < 80 {
		return false
	}
	prob := 0.0
	switch profile {
	case "rock":
		prob = 0.30
	case "shark":
		prob = 0.20
	case "maniac":
		prob = 0.02
	case "fish", "donkey":
		prob = 0.05
	}
	return rand.Float64() < prob
}

// botBetSize returns an amount scaled by profile and pot ratio.
func botBetSize(profile string, game *poker.Hand, base int64, strength int) int64 {
	if base <= 0 {
		return base
	}
	pot := game.Pot
	if pot <= 0 {
		pot = game.BigBlind * 2
	}
	switch profile {
	case "maniac":
		if strength >= 60 {
			return minInt64(base+pot, game.BigBlind*5)
		}
		return minInt64(base+pot/2, game.BigBlind*4)
	case "shark":
		if strength >= 70 {
			return minInt64(base+pot, game.BigBlind*4)
		}
		return minInt64(base+pot/2, game.BigBlind*3)
	case "rock":
		if strength >= 80 {
			return minInt64(base+pot, game.BigBlind*4)
		}
		return minInt64(base+pot/2, game.BigBlind*2)
	case "fish":
		return minInt64(base+pot/3, game.BigBlind*2)
	case "donkey":
		if rand.Float64() < 0.5 {
			return minInt64(base+pot, game.BigBlind*6)
		}
		return minInt64(base+pot/3, game.BigBlind*2)
	}
	return base
}

func minInt64(a, b int64) int64 {
	if a < b {
		return a
	}
	return b
}

func maxInt64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

func decidePokerBotTurn(game *poker.Hand, player *poker.Player, table *Table, profile string, sequence uint64) BotTurn {
	highest := int64(0)
	for _, p := range game.Players {
		if p.Bet > highest {
			highest = p.Bet
		}
	}
	toCall := highest - player.Bet
	strength := pokerBotRealStrength(player, game.Community)
	potOdds := float64(0)
	if toCall > 0 {
		potOdds = float64(toCall) / float64(game.Pot+toCall)
	}

	profile = normalizeBotProfile(profile)
	position := botPositionCategory(game, player.ID)
	tilt := botTiltFactor(table, player.ID)
	phase := game.Phase
	if phase == "" {
		phase = "preflop"
	}

	// Donkey : 30 % des décisions sont aléatoires
	if profile == "donkey" && rand.Float64() < 0.30 {
		choices := []string{"check", "call", "fold"}
		if toCall == 0 {
			choices = append(choices, "bet")
		} else {
			choices = append(choices, "raise", "all_in")
		}
		action := choices[rand.Intn(len(choices))]
		if action == "bet" {
			amount := game.BigBlind
			if amount > player.Stack {
				amount = player.Stack
			}
			return BotTurn{PlayerID: player.ID, Action: "bet", Payload: map[string]interface{}{"amount": amount}, Sequence: sequence, Profile: profile}
		}
		if action == "raise" {
			raise := toCall + game.LastRaise
			if raise > player.Stack {
				raise = player.Stack
			}
			return BotTurn{PlayerID: player.ID, Action: "raise", Payload: map[string]interface{}{"amount": raise}, Sequence: sequence, Profile: profile}
		}
		if action == "all_in" {
			return BotTurn{PlayerID: player.ID, Action: "all_in", Sequence: sequence, Profile: profile}
		}
		return BotTurn{PlayerID: player.ID, Action: action, Sequence: sequence, Profile: profile}
	}

	// ---------- FISH (loose-passif) ----------
	if profile == "fish" {
		if toCall == 0 {
			if strength >= 70 && player.Stack >= game.BigBlind && game.BigBlind > 0 {
				amount := botBetSize("fish", game, game.BigBlind, strength)
				if amount > player.Stack {
					amount = player.Stack
				}
				return BotTurn{PlayerID: player.ID, Action: "bet", Payload: map[string]interface{}{"amount": amount}, Sequence: sequence, Profile: profile}
			}
			return BotTurn{PlayerID: player.ID, Action: "check", Sequence: sequence, Profile: profile}
		}
		// Facing a bet : appelle très large
		if toCall >= player.Stack && player.Stack > 0 {
			if strength >= 10 {
				return BotTurn{PlayerID: player.ID, Action: "all_in", Sequence: sequence, Profile: profile}
			}
			return BotTurn{PlayerID: player.ID, Action: "fold", Sequence: sequence, Profile: profile}
		}
		if strength >= 5 || (strength >= 0 && potOdds <= 0.40) {
			if toCall <= player.Stack {
				return BotTurn{PlayerID: player.ID, Action: "call", Payload: map[string]interface{}{}, Sequence: sequence, Profile: profile}
			}
		}
		return BotTurn{PlayerID: player.ID, Action: "fold", Sequence: sequence, Profile: profile}
	}

	// ---------- ROCK (tight-aggressif) ----------
	if profile == "rock" {
		if toCall == 0 {
			if strength >= 80 && player.Stack >= game.BigBlind {
				if botShouldSlowPlay("rock", strength, phase) {
					return BotTurn{PlayerID: player.ID, Action: "check", Sequence: sequence, Profile: profile}
				}
				amount := botBetSize("rock", game, game.BigBlind, strength)
				if amount > player.Stack {
					amount = player.Stack
				}
				return BotTurn{PlayerID: player.ID, Action: "bet", Payload: map[string]interface{}{"amount": amount}, Sequence: sequence, Profile: profile}
			}
			if strength >= 30 {
				amount := game.BigBlind
				if amount > player.Stack {
					amount = player.Stack
				}
				return BotTurn{PlayerID: player.ID, Action: "bet", Payload: map[string]interface{}{"amount": amount}, Sequence: sequence, Profile: profile}
			}
			return BotTurn{PlayerID: player.ID, Action: "check", Sequence: sequence, Profile: profile}
		}
		// Facing a bet
		if toCall >= player.Stack && player.Stack > 0 {
			if strength >= 60 {
				return BotTurn{PlayerID: player.ID, Action: "all_in", Sequence: sequence, Profile: profile}
			}
			return BotTurn{PlayerID: player.ID, Action: "fold", Sequence: sequence, Profile: profile}
		}
		if strength >= 60 && player.Stack >= toCall+game.LastRaise {
			raise := botBetSize("rock", game, toCall+game.LastRaise, strength)
			if raise > player.Stack {
				raise = player.Stack
			}
			return BotTurn{PlayerID: player.ID, Action: "raise", Payload: map[string]interface{}{"amount": raise}, Sequence: sequence, Profile: profile}
		}
		if strength >= int(35*tilt) || (strength >= 25 && potOdds <= 0.15) {
			if toCall <= player.Stack {
				return BotTurn{PlayerID: player.ID, Action: "call", Payload: map[string]interface{}{}, Sequence: sequence, Profile: profile}
			}
		}
		return BotTurn{PlayerID: player.ID, Action: "fold", Sequence: sequence, Profile: profile}
	}

	// ---------- MANIAC (loose-agressif) ----------
	if profile == "maniac" {
		bluffing := botShouldBluff("maniac", position, phase, game.Community, table)
		if toCall == 0 {
			if strength >= 10 || bluffing {
				amount := botBetSize("maniac", game, game.BigBlind, strength)
				if amount > player.Stack {
					amount = player.Stack
				}
				return BotTurn{PlayerID: player.ID, Action: "bet", Payload: map[string]interface{}{"amount": amount}, Sequence: sequence, Profile: profile}
			}
			return BotTurn{PlayerID: player.ID, Action: "check", Sequence: sequence, Profile: profile}
		}
		// Facing a bet
		if toCall >= player.Stack && player.Stack > 0 {
			if strength >= 15 || bluffing {
				return BotTurn{PlayerID: player.ID, Action: "all_in", Sequence: sequence, Profile: profile}
			}
			return BotTurn{PlayerID: player.ID, Action: "fold", Sequence: sequence, Profile: profile}
		}
		if strength >= int(20*tilt) || bluffing {
			if player.Stack >= toCall+game.LastRaise {
				raise := botBetSize("maniac", game, toCall+game.LastRaise, strength)
				if raise > player.Stack {
					raise = player.Stack
				}
				return BotTurn{PlayerID: player.ID, Action: "raise", Payload: map[string]interface{}{"amount": raise}, Sequence: sequence, Profile: profile}
			}
		}
		if strength >= 5 || potOdds <= 0.50 {
			if toCall <= player.Stack {
				return BotTurn{PlayerID: player.ID, Action: "call", Payload: map[string]interface{}{}, Sequence: sequence, Profile: profile}
			}
		}
		return BotTurn{PlayerID: player.ID, Action: "fold", Sequence: sequence, Profile: profile}
	}

	// ---------- SHARK (mixte / tricky) ----------
	// Par défaut tous les profils legacy atterrissent ici
	bluffing := botShouldBluff("shark", position, phase, game.Community, table)
	if toCall == 0 {
		// Vol de blinds en late position
		if position == "late" && strength >= 15 && len(game.Community) == 0 && player.Stack >= game.BigBlind*2 {
			amount := game.BigBlind * 2
			if amount > player.Stack {
				amount = player.Stack
			}
			return BotTurn{PlayerID: player.ID, Action: "bet", Payload: map[string]interface{}{"amount": amount}, Sequence: sequence, Profile: profile}
		}
		if strength >= int(50*tilt) && player.Stack >= game.BigBlind {
			if botShouldSlowPlay("shark", strength, phase) {
				return BotTurn{PlayerID: player.ID, Action: "check", Sequence: sequence, Profile: profile}
			}
			amount := botBetSize("shark", game, game.BigBlind, strength)
			if amount > player.Stack {
				amount = player.Stack
			}
			return BotTurn{PlayerID: player.ID, Action: "bet", Payload: map[string]interface{}{"amount": amount}, Sequence: sequence, Profile: profile}
		}
		return BotTurn{PlayerID: player.ID, Action: "check", Sequence: sequence, Profile: profile}
	}
	// Facing a bet
	if toCall >= player.Stack && player.Stack > 0 {
		if strength >= 25 {
			return BotTurn{PlayerID: player.ID, Action: "all_in", Sequence: sequence, Profile: profile}
		}
		return BotTurn{PlayerID: player.ID, Action: "fold", Sequence: sequence, Profile: profile}
	}
	if strength >= int(60*tilt) || bluffing {
		if player.Stack >= toCall+game.LastRaise {
			raise := botBetSize("shark", game, toCall+game.LastRaise, strength)
			if raise > player.Stack {
				raise = player.Stack
			}
			return BotTurn{PlayerID: player.ID, Action: "raise", Payload: map[string]interface{}{"amount": raise}, Sequence: sequence, Profile: profile}
		}
	}
	if strength >= int(15*tilt) || (strength >= 5 && potOdds <= 0.25) {
		if toCall <= player.Stack {
			return BotTurn{PlayerID: player.ID, Action: "call", Payload: map[string]interface{}{}, Sequence: sequence, Profile: profile}
		}
	}
	return BotTurn{PlayerID: player.ID, Action: "fold", Sequence: sequence, Profile: profile}
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
	if table.GameType == "poker" {
		if len(table.Players) >= 2 {
			return initializePokerHand(table)
		}
		return fmt.Errorf("poker requires at least 2 players, got %d", len(table.Players))
	}
	if table.GameType == "belote" {
		if len(table.Players) >= 4 {
			return initializeBeloteRound(table)
		}
		return fmt.Errorf("belote requires exactly 4 players, got %d", len(table.Players))
	}
	if table.GameType == "rami" {
		if len(table.Players) >= 2 {
			return initializeRamiGame(table)
		}
		return fmt.Errorf("rami requires at least 2 players, got %d", len(table.Players))
	}
	return nil
}

func (m *Manager) SetPokerDeadline(tableID string, deadline time.Time) bool {
	table, ok := m.GetTable(tableID)
	if !ok {
		return false
	}
	table.mu.Lock()
	defer table.mu.Unlock()
	hand, ok := table.State.(*poker.Hand)
	if !ok || hand.Phase == "showdown" || hand.Current < 0 {
		return false
	}
	hand.SetActionDeadline(deadline)
	table.ActionDeadline = deadline
	return true
}

func hasBeloteSuit(hand []belote.Card, suit int) bool {
	for _, card := range hand {
		if card.Suit == suit {
			return true
		}
	}
	return false
}

func decideBeloteBotTurn(game *belote.Round, player *belote.Player, sequence uint64) BotTurn {
	// Bidding phase: decide whether to take or pass
	if game.Phase == "bidding" {
		if game.BiddingRound == 1 {
			trumpCount := 0
			trumpStrength := 0
			for _, card := range player.Hand {
				if card.Suit == game.ProposedTrump {
					trumpCount++
					trumpStrength += beloteCardStrength(card, game.ProposedTrump)
				}
			}
			// Take if we have 3+ trump cards or 2+ with decent strength
			shouldTake := trumpCount >= 3 || (trumpCount >= 2 && trumpStrength >= 35)
			if shouldTake {
				return BotTurn{PlayerID: player.ID, Action: "take", Sequence: sequence}
			}
			return BotTurn{PlayerID: player.ID, Action: "pass", Sequence: sequence}
		}
		// Second bidding round: choose any suit (except proposed) or pass
		bestSuit := -1
		bestStrength := 0
		for suit := 0; suit < 4; suit++ {
			if suit == game.ProposedTrump {
				continue
			}
			count := 0
			strength := 0
			for _, card := range player.Hand {
				if card.Suit == suit {
					count++
					strength += beloteCardStrength(card, suit)
				}
			}
			if count >= 3 && strength > bestStrength {
				bestSuit = suit
				bestStrength = strength
			}
		}
		if bestSuit >= 0 {
			return BotTurn{PlayerID: player.ID, Action: "choose_trump", Payload: map[string]interface{}{"suit": bestSuit}, Sequence: sequence}
		}
		return BotTurn{PlayerID: player.ID, Action: "pass", Sequence: sequence}
	}

	// Playing phase — respect belote obligations
	// First, check if we should announce belote
	if game.HasBelote(playerIndexInRound(game, player.ID)) {
		return BotTurn{PlayerID: player.ID, Action: "announce_belote", Sequence: sequence}
	}

	legal := make([]belote.Card, 0, len(player.Hand))
	for _, card := range player.Hand {
		if game.LeadSuit < 0 || card.Suit == game.LeadSuit || !hasBeloteSuit(player.Hand, game.LeadSuit) {
			// Additional check: if we cannot follow and have trump, we must play trump (cut)
			if game.LeadSuit >= 0 && card.Suit != game.LeadSuit && !hasBeloteSuit(player.Hand, game.LeadSuit) {
				if game.Trump >= 0 && hasBeloteSuit(player.Hand, game.Trump) && card.Suit != game.Trump {
					continue // must cut with trump
				}
			}
			legal = append(legal, card)
		}
	}
	if len(legal) == 0 {
		legal = append(legal, player.Hand...)
	}
	// Sort by strength ascending
	sort.Slice(legal, func(i, j int) bool {
		return beloteCardStrength(legal[i], game.Trump) < beloteCardStrength(legal[j], game.Trump)
	})
	chosen := legal[0]
	if game.LeadSuit >= 0 && len(game.Trick) > 0 {
		// Find current winning card in the trick
		winning := game.Trick[0]
		for i := 1; i < len(game.Trick); i++ {
			if beloteBeatsCard(game.Trick[i], winning, game.LeadSuit, game.Trump) {
				winning = game.Trick[i]
			}
		}
		// Try to win the trick if possible, otherwise play lowest
		canWin := false
		for _, card := range legal {
			if beloteBeatsCard(card, winning, game.LeadSuit, game.Trump) {
				canWin = true
				chosen = card
				break
			}
		}
		if !canWin {
			chosen = legal[0]
		}
	}
	return BotTurn{PlayerID: player.ID, Action: "play_card", Payload: map[string]interface{}{"card": map[string]interface{}{"suit": chosen.Suit, "rank": chosen.Rank}}, Sequence: sequence}
}

func playerIndexInRound(game *belote.Round, playerID string) int {
	for i, p := range game.Players {
		if p.ID == playerID {
			return i
		}
	}
	return -1
}

func beloteCardStrength(card belote.Card, trump int) int {
	if card.Suit == trump {
		switch card.Rank {
		case 11:
			return 20
		case 9:
			return 19
		case 14:
			return 18
		case 10:
			return 17
		case 13:
			return 16
		case 12:
			return 15
		case 8:
			return 14
		case 7:
			return 13
		}
	}
	switch card.Rank {
	case 14:
		return 12
	case 10:
		return 11
	case 13:
		return 10
	case 12:
		return 9
	case 11:
		return 8
	case 9:
		return 7
	case 8:
		return 6
	case 7:
		return 5
	}
	return 0
}

func beloteBeatsCard(candidate, current belote.Card, leadSuit, trump int) bool {
	if candidate.Suit == trump && current.Suit != trump {
		return true
	}
	if candidate.Suit != current.Suit {
		return candidate.Suit == leadSuit && current.Suit != trump
	}
	return beloteCardStrength(candidate, trump) > beloteCardStrength(current, trump)
}

func decideRamiBotTurn(player *rami.Player, sequence uint64) BotTurn {
	// If deadwood is low enough, knock
	deadwood := 0
	for _, card := range player.Hand {
		deadwood += card.Rank
	}
	if deadwood <= 10 {
		return BotTurn{PlayerID: player.ID, Action: "knock", Sequence: sequence}
	}
	// Discard the card that is least likely to form a meld
	if len(player.Hand) == 0 {
		return BotTurn{PlayerID: player.ID, Action: "discard", Payload: map[string]interface{}{"card": map[string]interface{}{"suit": 0, "rank": 1}}, Sequence: sequence}
	}
	// Score each card: lower score = less useful
	bestIdx := 0
	bestScore := 999
	for i, card := range player.Hand {
		score := 0
		// Count how many cards of same rank or adjacent ranks in same suit
		for _, other := range player.Hand {
			if other == card {
				continue
			}
			if other.Rank == card.Rank {
				score += 5
			}
			if other.Suit == card.Suit && (other.Rank == card.Rank-1 || other.Rank == card.Rank+1) {
				score += 3
			}
		}
		// Prefer discarding high cards (they count more against you if someone else wins)
		score -= card.Rank
		if score < bestScore {
			bestScore = score
			bestIdx = i
		}
	}
	card := player.Hand[bestIdx]
	return BotTurn{PlayerID: player.ID, Action: "discard", Payload: map[string]interface{}{"card": map[string]interface{}{"suit": card.Suit, "rank": card.Rank}}, Sequence: sequence}
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
	if _, ok := table.Players[playerID]; !ok && !(action == "new_hand" && playerID == "") {
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
	if action == "new_hand" {
		if table.GameType == "poker" {
			if err := startNextPokerHand(table); err != nil {
				return Event{}, false, err
			}
		} else if table.GameType == "belote" {
			// Cumulate previous round scores before resetting
			if round, ok := table.State.(*belote.Round); ok {
				table.BeloteTeamScores[0] += round.TeamPoints[0]
				table.BeloteTeamScores[1] += round.TeamPoints[1]
			}
			if table.BeloteTargetScore == 0 {
				table.BeloteTargetScore = 501
			}
			if table.BeloteTeamScores[0] >= table.BeloteTargetScore || table.BeloteTeamScores[1] >= table.BeloteTargetScore {
				return Event{}, false, fmt.Errorf("game_over")
			}
			if err := initializeBeloteRound(table); err != nil {
				return Event{}, false, err
			}
		} else if table.GameType == "rami" {
			if err := initializeRamiGame(table); err != nil {
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
	if table.GameType == "poker" && table.State != nil {
		if err := applyPokerAction(table, playerID, action, payload); err != nil {
			return Event{}, false, err
		}
		syncPokerSeats(table)
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
	// Set action deadline for human players in belote/rami (poker handles this separately)
	if table.GameType == "belote" || table.GameType == "rami" {
		table.ActionDeadline = time.Time{}
		if nextPlayer := nextHumanPlayer(table); nextPlayer != "" {
			table.ActionDeadline = time.Now().Add(18 * time.Second)
		}
	}
	return event, false, nil
}

func nextHumanPlayer(table *Table) string {
	switch game := table.State.(type) {
	case *belote.Round:
		if game.Finished() || game.Current < 0 || game.Current >= len(game.Players) {
			return ""
		}
		player := game.Players[game.Current]
		if seat, exists := table.Players[player.ID]; exists && !seat.IsBot {
			return player.ID
		}
	case *rami.Game:
		if game.Finished || game.Current < 0 || game.Current >= len(game.Players) {
			return ""
		}
		player := game.Players[game.Current]
		if seat, exists := table.Players[player.ID]; exists && !seat.IsBot {
			return player.ID
		}
	}
	return ""
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

// RecordBotShowdownResult updates tilt state after a showdown.
// Bots that lose with a strong hand (>= 60 strength) go on tilt for 1–3 hands.
func (m *Manager) RecordBotShowdownResult(tableID string) {
	table, ok := m.GetTable(tableID)
	if !ok {
		return
	}
	table.mu.Lock()
	defer table.mu.Unlock()
	hand, isPoker := table.State.(*poker.Hand)
	if !isPoker {
		return
	}
	winners, _ := hand.Winners()
	winnerSet := make(map[string]bool)
	for _, w := range winners {
		winnerSet[w.ID] = true
	}
	for _, player := range hand.Players {
		if player.Folded {
			continue
		}
		if table.Players[player.ID] == nil || !table.Players[player.ID].IsBot {
			continue
		}
		strength := pokerBotRealStrength(player, hand.Community)
		table.BotRecentStrength[player.ID] = strength
		// Tilt = lost with strong hand
		if !winnerSet[player.ID] && strength >= 60 {
			table.BotTilt[player.ID] = 1 + rand.Intn(3) // 1–3 hands
		}
	}
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

// PokerPhase returns the current public street for a table. It is used by the
// websocket layer to publish an explicit transition after an accepted action.
func (m *Manager) PokerPhase(tableID string) string {
	table, ok := m.GetTable(tableID)
	if !ok {
		return ""
	}
	table.mu.RLock()
	defer table.mu.RUnlock()
	hand, ok := table.State.(*poker.Hand)
	if !ok {
		return ""
	}
	return hand.Phase
}

// PokerShowdown returns the public outcome of a finished hand without
// exposing folded players' private cards.
func (m *Manager) PokerShowdown(tableID string) (payouts map[string]int64, revealed map[string][]poker.Card, pot int64, finishReason string, finished bool) {
	table, ok := m.GetTable(tableID)
	if !ok {
		return nil, nil, 0, "", false
	}
	table.mu.RLock()
	defer table.mu.RUnlock()
	hand, ok := table.State.(*poker.Hand)
	if !ok || hand.Phase != "showdown" {
		return nil, nil, 0, "", false
	}
	revealed = make(map[string][]poker.Card)
	if hand.FinishReason != "uncontested" {
		for _, player := range hand.Players {
			if !player.Folded {
				revealed[player.ID] = player.Cards
			}
		}
	}
	return hand.Payouts(), revealed, hand.Pot, hand.FinishReason, true
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
	return TableSnapshot{
		ID: table.ID, GameType: table.GameType, Sequence: table.Sequence,
		Players: players, Events: events, UpdatedAt: table.UpdatedAt, State: state,
		ActionDeadline: table.ActionDeadline,
		PokerLevel: table.PokerLevel, PokerHandsPlayed: table.PokerHandsPlayed,
		PokerSmallBlind: table.PokerSmallBlind, PokerBigBlind: table.PokerBigBlind,
	}, nil
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
	table := &Table{
		ID: snapshot.ID, GameType: snapshot.GameType, Players: players,
		CreatedAt: time.Now(), UpdatedAt: snapshot.UpdatedAt, IsActive: true,
		GracePeriod: m.config.GracePeriod, Deterministic: m.config.Deterministic,
		Blinds: m.config.Blinds, Sequence: snapshot.Sequence,
		Events: append([]Event(nil), snapshot.Events...),
		ActionDeadline: snapshot.ActionDeadline,
		PokerLevel: snapshot.PokerLevel, PokerHandsPlayed: snapshot.PokerHandsPlayed,
		PokerSmallBlind: snapshot.PokerSmallBlind, PokerBigBlind: snapshot.PokerBigBlind,
	}
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
		sb := table.PokerSmallBlind
		bb := table.PokerBigBlind
		if sb == 0 || bb == 0 {
			sb, bb = 50, 100
			table.PokerSmallBlind, table.PokerBigBlind = sb, bb
		}
		if err := hand.StartHand(sb, bb); err != nil {
			return err
		}
	}
	return nil
}

func startNextPokerHand(table *Table) error {
	hand, ok := table.State.(*poker.Hand)
	if !ok || hand.Phase != "showdown" {
		return fmt.Errorf("poker hand is not finished")
	}
	if len(table.Players) < 2 {
		return fmt.Errorf("poker requires at least two seated players")
	}

	payouts := hand.Payouts()
	stacks := make(map[string]int64, len(hand.Players))
	for _, player := range hand.Players {
		stacks[player.ID] = player.Stack + payouts[player.ID]
	}
	seats := make([]*Player, 0, len(table.Players))
	for _, player := range table.Players {
		if stack, exists := stacks[player.ID]; exists {
			player.Stack = stack
		}
		if player.Stack <= 0 {
			player.IsActive = false
			continue
		}
		seats = append(seats, player)
	}
	// Decrement tilt counters for bots
	for id := range table.BotTilt {
		if table.BotTilt[id] > 0 {
			table.BotTilt[id]--
		}
	}
	if len(seats) < 2 {
		hand.SessionFinished = true
		table.IsActive = false
		return nil
	}
	sort.Slice(seats, func(i, j int) bool { return seats[i].Seat < seats[j].Seat })
	players := make([]*poker.Player, 0, len(seats))
	for _, player := range seats {
		players = append(players, &poker.Player{ID: player.ID, Stack: player.Stack})
	}
	var next *poker.Hand
	var err error
	if table.Deterministic {
		next, err = poker.NewHand(players, func([]poker.Card) {})
	} else {
		next, err = poker.NewShuffledHand(players)
	}
	if err != nil {
		return err
	}
	next.Button = (hand.Button + 1) % len(players)

	// Advance level every 8 hands
	table.PokerHandsPlayed++
	if table.PokerHandsPlayed%8 == 0 {
		table.PokerLevel++
		if table.PokerLevel >= len(blindLevels) {
			table.PokerLevel = len(blindLevels) - 1
		}
		table.PokerSmallBlind = blindLevels[table.PokerLevel][0]
		table.PokerBigBlind = blindLevels[table.PokerLevel][1]
	}

	if table.Blinds {
		sb := table.PokerSmallBlind
		bb := table.PokerBigBlind
		if sb == 0 || bb == 0 {
			sb, bb = 50, 100
		}
		if err := next.StartHand(sb, bb); err != nil {
			return err
		}
	}
	table.State = next
	return nil
}

// blindLevels defines tournament-style blind progression.
// Each entry is [smallBlind, bigBlind].
var blindLevels = [][2]int64{
	{50, 100},
	{100, 200},
	{200, 400},
	{500, 1000},
	{1000, 2000},
	{2000, 4000},
	{5000, 10000},
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
	round.CumulativeScores = table.BeloteTeamScores
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
		case int64:
			amount = value
		case string:
			amount, _ = strconv.ParseInt(value, 10, 64)
		}
	}
	return hand.Apply(index, poker.Action(action), amount)
}

func syncPokerSeats(table *Table) {
	hand, ok := table.State.(*poker.Hand)
	if !ok {
		return
	}
	for _, player := range hand.Players {
		if seat, exists := table.Players[player.ID]; exists {
			seat.Stack = player.Stack
		}
	}
}

func extractInt(v interface{}) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	case int64:
		return int(n)
	case int32:
		return int(n)
	}
	return 0
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
		if round.Current != index {
			return fmt.Errorf("not this player's turn")
		}
		cardValues, _ := values["card"].(map[string]interface{})
		suit := extractInt(cardValues["suit"])
		rank := extractInt(cardValues["rank"])
		_, err := round.PlayCard(index, belote.Card{Suit: suit, Rank: rank})
		return err
	case "take":
		if round.Current != index {
			return fmt.Errorf("not this player's turn")
		}
		return round.Take(index)
	case "pass":
		if round.Current != index {
			return fmt.Errorf("not this player's turn")
		}
		return round.Pass(index)
	case "choose_trump":
		if round.Current != index {
			return fmt.Errorf("not this player's turn")
		}
		suit := extractInt(values["suit"])
		return round.ChooseTrump(index, suit)
	case "announce_belote":
		return round.AnnounceBelote(index)
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
		return rami.Card{Suit: extractInt(value["suit"]), Rank: extractInt(value["rank"])}
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
	case "knock":
		return game.Knock()
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
		case "play_card", "pass", "take", "choose_trump", "announce_belote", "new_hand":
			return true
		}
		return false
	}
	if gameType == "rami" {
		switch action {
		case "draw", "discard", "meld", "knock", "new_hand":
			return true
		}
		return false
	}
	if gameType == "poker" && action == "new_hand" {
		return true
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
