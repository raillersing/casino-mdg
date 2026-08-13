package websocket

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/casino-mdg/game-engine/internal/config"
	"github.com/casino-mdg/game-engine/internal/game/belote"
	"github.com/casino-mdg/game-engine/internal/game/poker"
	"github.com/casino-mdg/game-engine/internal/game/rami"
	"github.com/casino-mdg/game-engine/internal/room"
	"github.com/casino-mdg/game-engine/internal/state"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
	ReadBufferSize:   1024,
	WriteBufferSize:  1024,
	HandshakeTimeout: 10 * time.Second,
}

// Message types for WebSocket protocol
type MessageType string

const (
	MsgJoin      MessageType = "join"
	MsgLeave     MessageType = "leave"
	MsgAction    MessageType = "action"
	MsgState     MessageType = "state"
	MsgPing      MessageType = "ping"
	MsgPong      MessageType = "pong"
	MsgError     MessageType = "error"
	MsgSync      MessageType = "sync"
	MsgHeartbeat MessageType = "heartbeat"
)

type Message struct {
	Type      MessageType `json:"type"`
	TableID   string      `json:"table_id,omitempty"`
	PlayerID  string      `json:"player_id,omitempty"`
	Action    string      `json:"action,omitempty"`
	Payload   interface{} `json:"payload,omitempty"`
	Timestamp time.Time   `json:"timestamp"`
	EventID   string      `json:"event_id,omitempty"`
	Sequence  uint64      `json:"sequence,omitempty"`
}

type Server struct {
	config      *config.Config
	roomManager *room.Manager
	clients     map[string]*Client
	snapshots   *state.SnapshotManager
	mu          sync.RWMutex
	botRuns     map[string]bool
}

func (s *Server) ClientCount() int { s.mu.RLock(); defer s.mu.RUnlock(); return len(s.clients) }

// AttachBots is used by the backend service after creating a DEMO_AI
// session. It is intentionally not exposed through the public WebSocket path.
func (s *Server) AttachBots(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("X-Game-Engine-Bot-Secret") == "" || !hmac.Equal([]byte(r.Header.Get("X-Game-Engine-Bot-Secret")), []byte(s.config.BotServiceSecret)) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var request struct {
		TableID  string `json:"table_id"`
		GameType string `json:"game_type"`
		Bots     []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"bots"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil || request.TableID == "" || !validGameType(request.GameType) || len(request.Bots) == 0 {
		http.Error(w, "invalid bot session", http.StatusBadRequest)
		return
	}
	table, exists := s.roomManager.GetTable(request.TableID)
	if !exists {
		table = s.roomManager.CreateTableWithID(request.TableID, request.GameType)
	}
	if table.GameType != request.GameType {
		http.Error(w, "game type mismatch", http.StatusConflict)
		return
	}
	for _, bot := range request.Bots {
		if bot.ID == "" || bot.Name == "" {
			http.Error(w, "invalid bot", http.StatusBadRequest)
			return
		}
		if _, err := s.roomManager.JoinBotPlayer(request.TableID, bot.ID, bot.Name, len(table.Players)+1); err != nil {
			http.Error(w, fmt.Sprintf("attach bot: %v", err), http.StatusConflict)
			return
		}
	}
	// Bot turns start after the human joins and the hand is initialized. Starting
	// here would race with the human join and could leave the table frozen on a
	// bot's first turn.
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"status":"attached"}`))
}

type Client struct {
	conn       *websocket.Conn
	playerID   string
	tableID    string
	spectator  bool
	isBot      bool
	name       string
	botTableID string
	send       chan []byte
	lastPong   time.Time
}

func NewServer(cfg *config.Config, rm *room.Manager) *Server {
	return &Server{
		config:      cfg,
		roomManager: rm,
		clients:     make(map[string]*Client),
		botRuns:     make(map[string]bool),
		snapshots:   state.NewSnapshotManager(cfg.RedisURL),
	}
}

func (s *Server) HandleConnection(w http.ResponseWriter, r *http.Request) {
	playerID, isBot, name, botTableID, ok := authenticateConnection(r, s.config)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	client := &Client{
		conn:       conn,
		send:       make(chan []byte, 256),
		lastPong:   time.Now(),
		playerID:   playerID,
		isBot:      isBot,
		name:       name,
		botTableID: botTableID,
	}
	go s.writePump(client)
	s.readPump(client)
}

func (s *Server) readPump(client *Client) {
	defer func() {
		wasCurrent := s.removeClient(client)
		if wasCurrent && client.tableID != "" && !client.spectator {
			s.roomManager.DisconnectPlayer(client.tableID, client.playerID)
		}
		client.conn.Close()
	}()

	if err := client.conn.SetReadDeadline(time.Now().Add(60 * time.Second)); err != nil {
		return
	}
	client.conn.SetPongHandler(func(string) error {
		if err := client.conn.SetReadDeadline(time.Now().Add(60 * time.Second)); err != nil {
			return err
		}
		client.lastPong = time.Now()
		return nil
	})

	for {
		var msg Message
		err := client.conn.ReadJSON(&msg)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		msg.Timestamp = time.Now()
		s.handleMessage(client, &msg)
	}
}

func (s *Server) writePump(client *Client) {
	ticker := time.NewTicker(15 * time.Second)
	defer func() {
		ticker.Stop()
		client.conn.Close()
	}()

	for {
		select {
		case message, ok := <-client.send:
			if !ok {
				_ = client.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := client.conn.SetWriteDeadline(time.Now().Add(10 * time.Second)); err != nil {
				return
			}
			if err := client.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}

		case <-ticker.C:
			if err := client.conn.SetWriteDeadline(time.Now().Add(10 * time.Second)); err != nil {
				return
			}
			if err := client.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (s *Server) handleMessage(client *Client, msg *Message) {
	switch msg.Type {
	case MsgJoin:
		s.handleJoin(client, msg)
	case MsgLeave:
		s.handleLeave(client, msg)
	case MsgAction:
		s.handleAction(client, msg)
	case MsgPing:
		s.sendMessage(client, &Message{Type: MsgPong, Timestamp: time.Now()})
	case MsgHeartbeat:
		s.sendMessage(client, &Message{Type: MsgHeartbeat, TableID: client.tableID, Sequence: msg.Sequence, Timestamp: time.Now()})
	case MsgSync:
		s.handleSync(client, msg)
	default:
		s.sendMessage(client, &Message{Type: MsgError, Payload: "unknown message type", Timestamp: time.Now()})
	}
}

func (s *Server) handleJoin(client *Client, msg *Message) {
	if client.isBot && msg.TableID != client.botTableID {
		s.sendMessage(client, &Message{Type: MsgError, Payload: "bot token is bound to another table", Timestamp: time.Now()})
		return
	}
	table, ok := s.roomManager.GetTable(msg.TableID)
	if !ok {
		var snapshot room.TableSnapshot
		if err := s.snapshots.GetSnapshotInto(msg.TableID, &snapshot); err != nil {
			gameType := gameTypeFromPayload(msg.Payload)
			if !validGameType(gameType) {
				s.sendMessage(client, &Message{Type: MsgError, Payload: "invalid game type", Timestamp: time.Now()})
				return
			}
			table = s.roomManager.CreateTableWithID(msg.TableID, gameType)
		} else {
			restored, restoreErr := s.roomManager.RestoreSnapshot(snapshot)
			if restoreErr != nil {
				s.sendMessage(client, &Message{Type: MsgError, Payload: "invalid table snapshot", Timestamp: time.Now()})
				return
			}
			table = restored
		}
	}

	client.tableID = msg.TableID
	if !table.IsActive {
		s.sendMessage(client, &Message{Type: MsgError, TableID: msg.TableID, Payload: "table is closed", Timestamp: time.Now()})
		client.tableID = ""
		return
	}
	if msg.PlayerID != "" && msg.PlayerID != client.playerID {
		s.sendMessage(client, &Message{Type: MsgError, Payload: "player identity mismatch", Timestamp: time.Now()})
		return
	}
	s.addClient(client)
	client.spectator = !client.isBot && roleFromPayload(msg.Payload) == "spectator"
	if !client.spectator {
		name := client.name
		if name == "" {
			name = client.playerID
		}
		var err error
		if client.isBot {
			_, err = s.roomManager.JoinBotPlayer(msg.TableID, client.playerID, name, len(table.Players)+1)
		} else {
			// Bot sessions attach their AI seats first, but the human must own
			// seat 0 so the initial hand starts with an immediately playable turn.
			seat := len(table.Players) + 1
			if len(table.Players) > 0 && allPlayersAreBots(table.Players) {
				seat = 0
			}
			_, err = s.roomManager.JoinPlayer(msg.TableID, client.playerID, name, seat)
		}
		if err != nil {
			s.sendMessage(client, &Message{Type: MsgError, TableID: msg.TableID, Payload: err.Error(), Timestamp: time.Now()})
			client.tableID = ""
			return
		}
		if !client.isBot {
			if err := s.roomManager.StartTable(msg.TableID); err != nil {
				s.sendMessage(client, &Message{Type: MsgError, TableID: msg.TableID, Payload: err.Error(), Timestamp: time.Now()})
				return
			}
		}
	}

	state := map[string]interface{}{
		"table_id":   table.ID,
		"game_type":  table.GameType,
		"players":    table.Players,
		"game_state": publicGameState(table.State, client.playerID),
		"spectator":  client.spectator,
	}
	s.sendMessage(client, &Message{Type: MsgState, Payload: state, Sequence: table.Sequence, Timestamp: time.Now()})
	s.sendPokerLifecycle(client, table.ID)
	s.sendPokerDeal(client, table.ID)
	s.persistSnapshot(msg.TableID)
	s.startBotTurns(msg.TableID)
}

func allPlayersAreBots(players map[string]*room.Player) bool {
	if len(players) == 0 {
		return false
	}
	for _, player := range players {
		if !player.IsBot {
			return false
		}
	}
	return true
}

func (s *Server) startBotTurns(tableID string) {
	s.mu.Lock()
	if s.botRuns[tableID] {
		s.mu.Unlock()
		return
	}
	s.botRuns[tableID] = true
	s.mu.Unlock()
	go func() {
		defer func() {
			s.mu.Lock()
			delete(s.botRuns, tableID)
			s.mu.Unlock()
		}()
		for steps := 0; steps < 512; steps++ {
			turn, ok := s.roomManager.NextBotTurn(tableID)
			if !ok {
				return
			}
			delay := s.config.BotActionDelay
			if s.config.BotProfile == "fast" {
				delay /= 2
			}
			if s.config.BotProfile == "expert" {
				delay += 350 * time.Millisecond
			}
			if delay > 0 {
				s.broadcastToTable(tableID, &Message{Type: MsgAction, TableID: tableID, PlayerID: turn.PlayerID, Action: "thinking", Payload: map[string]interface{}{"action": turn.Action}, Sequence: turn.Sequence, Timestamp: time.Now()})
				time.Sleep(delay)
			}
			client := &Client{playerID: turn.PlayerID, tableID: tableID}
			s.handleAction(client, &Message{Type: MsgAction, TableID: tableID, PlayerID: turn.PlayerID, Action: turn.Action, Payload: turn.Payload, Sequence: turn.Sequence})
			time.Sleep(25 * time.Millisecond)
		}
	}()
}

func publicGameState(state interface{}, playerID string) interface{} {
	switch game := state.(type) {
	case *poker.Hand:
		players := make([]map[string]interface{}, 0, len(game.Players))
		winners := make([]string, 0)
		revealedCards := make(map[string][]poker.Card)
		handRanks := make(map[string]string)
		payouts := map[string]int64{}
		if game.Phase == "showdown" {
			if resolved, ok := game.Winners(); ok {
				for _, player := range resolved {
					winners = append(winners, player.ID)
				}
			}
			for _, player := range game.Players {
				if !player.Folded {
					revealedCards[player.ID] = player.Cards
					handRanks[player.ID] = poker.HandRankName(append(append([]poker.Card{}, player.Cards...), game.Community...))
				}
			}
			payouts = game.Payouts()
		}
		for _, player := range game.Players {
			cards := interface{}(nil)
			if player.ID == playerID || game.Phase == "showdown" && !player.Folded {
				cards = player.Cards
			}
			players = append(players, map[string]interface{}{"id": player.ID, "stack": player.Stack, "bet": player.Bet, "cards": cards, "folded": player.Folded, "all_in": player.AllIn})
		}
		return map[string]interface{}{"players": players, "community": game.Community, "pot": game.Pot, "current": game.Current, "phase": game.Phase, "winners": winners, "revealed_cards": revealedCards, "hand_ranks": handRanks, "payouts": payouts}
	case *belote.Round:
		players := make([]map[string]interface{}, 0, len(game.Players))
		for _, player := range game.Players {
			hand := interface{}(nil)
			if player.ID == playerID {
				hand = player.Hand
			}
			players = append(players, map[string]interface{}{"id": player.ID, "team": player.Team, "hand": hand})
		}
		return map[string]interface{}{"players": players, "trump": game.Trump, "current": game.Current, "lead_suit": game.LeadSuit, "trick": game.Trick, "team_points": game.TeamPoints}
	case *rami.Game:
		players := make([]map[string]interface{}, 0, len(game.Players))
		for _, player := range game.Players {
			hand := interface{}(nil)
			if player.ID == playerID {
				hand = player.Hand
			}
			players = append(players, map[string]interface{}{"id": player.ID, "hand": hand, "score": player.Score})
		}
		return map[string]interface{}{"players": players, "discard": game.Discard, "current": game.Current, "finished": game.Finished}
	default:
		return nil
	}
}

func gameTypeFromPayload(payload interface{}) string {
	values, ok := payload.(map[string]interface{})
	if !ok {
		return ""
	}
	gameType, _ := values["game_type"].(string)
	return gameType
}

func roleFromPayload(payload interface{}) string {
	values, ok := payload.(map[string]interface{})
	if !ok {
		return "player"
	}
	role, _ := values["role"].(string)
	return role
}

func validGameType(gameType string) bool {
	return gameType == "poker" || gameType == "belote" || gameType == "rami"
}

func (s *Server) handleLeave(client *Client, msg *Message) {
	if client.tableID != "" && !client.spectator {
		s.roomManager.LeavePlayer(client.tableID, client.playerID)
	}
	client.tableID = ""
	s.removeClient(client)
	s.sendMessage(client, &Message{Type: MsgLeave, Payload: map[string]interface{}{"left": true}, Timestamp: time.Now()})
}

func (s *Server) handleAction(client *Client, msg *Message) {
	if client.spectator {
		s.sendMessage(client, &Message{Type: MsgError, TableID: client.tableID, Payload: "spectator is read-only", Timestamp: time.Now()})
		return
	}
	previousPhase := s.roomManager.PokerPhase(msg.TableID)
	event, replayed, err := s.roomManager.ApplyActionIdempotent(msg.TableID, client.playerID, msg.Action, msg.Sequence, msg.Payload, msg.EventID)
	if err != nil {
		s.sendMessage(client, &Message{Type: MsgError, Payload: err.Error(), Timestamp: time.Now()})
		return
	}
	actionMessage := &Message{Type: MsgAction, TableID: msg.TableID, PlayerID: client.playerID, Action: event.Action, Payload: actionDetails(s.roomManager, msg.TableID, client.playerID, event.Action, msg.Payload), EventID: event.ID, Sequence: event.Sequence, Timestamp: event.Timestamp}
	if replayed {
		// A retry still receives an acknowledgement, but must not make every
		// player render the same action twice.
		s.sendMessage(client, actionMessage)
	} else {
		s.broadcastToTable(msg.TableID, actionMessage)
	}
	if !replayed && tableGameType(s.roomManager, msg.TableID) == "poker" {
		payouts, finished := s.roomManager.FinishedPokerPayouts(msg.TableID)
		if finished {
			table, _ := s.roomManager.GetTable(msg.TableID)
			for playerID := range table.Players {
				share := payouts[playerID]
				outcome := "loss"
				if share > 0 {
					outcome = "win"
				}
				s.broadcastToTable(msg.TableID, &Message{Type: MsgAction, TableID: msg.TableID, PlayerID: playerID, Action: "result", Payload: map[string]interface{}{"outcome": outcome, "amount": share, "signature": signResult(s.config.ResultSecret, msg.TableID, "poker", outcome, int(share))}, Sequence: event.Sequence, Timestamp: time.Now()})
			}
			if showdownPayouts, revealed, pot, ok := s.roomManager.PokerShowdown(msg.TableID); ok {
				winners := make([]string, 0, len(showdownPayouts))
				handRanks := make(map[string]string)
				if table, exists := s.roomManager.GetTable(msg.TableID); exists {
					if hand, isPoker := table.State.(*poker.Hand); isPoker {
						for _, player := range hand.Players {
							if cards, shown := revealed[player.ID]; shown {
								handRanks[player.ID] = poker.HandRankName(append(append([]poker.Card{}, cards...), hand.Community...))
							}
						}
					}
				}
				for playerID, share := range showdownPayouts {
					if share > 0 {
						winners = append(winners, playerID)
					}
				}
				s.broadcastToTable(msg.TableID, &Message{
					Type: MsgAction, TableID: msg.TableID, Action: "showdown",
					Payload:  map[string]interface{}{"winners": winners, "pot": pot, "revealed_cards": revealed, "hand_ranks": handRanks, "payouts": showdownPayouts},
					Sequence: event.Sequence, Timestamp: time.Now(),
				})
			}
		}
	}
	if !replayed && tableGameType(s.roomManager, msg.TableID) == "poker" {
		currentPhase := s.roomManager.PokerPhase(msg.TableID)
		if previousPhase != "" && currentPhase != "" && previousPhase != currentPhase {
			s.broadcastToTable(msg.TableID, &Message{
				Type: MsgAction, TableID: msg.TableID, PlayerID: client.playerID,
				Action: "street_changed", Payload: streetDetails(s.roomManager, msg.TableID, previousPhase, currentPhase),
				Sequence: event.Sequence, Timestamp: time.Now(),
			})
		}
	}
	if !replayed && msg.Action == "play_card" {
		winners, losers, points, finished := s.roomManager.FinishedBeloteResults(msg.TableID)
		if finished {
			for _, playerID := range winners {
				s.broadcastToTable(msg.TableID, &Message{Type: MsgAction, TableID: msg.TableID, PlayerID: playerID, Action: "result", Payload: map[string]interface{}{"outcome": "win", "amount": points, "signature": signResult(s.config.ResultSecret, msg.TableID, "belote", "win", int(points))}, Sequence: event.Sequence, Timestamp: time.Now()})
			}
			for _, playerID := range losers {
				s.broadcastToTable(msg.TableID, &Message{Type: MsgAction, TableID: msg.TableID, PlayerID: playerID, Action: "result", Payload: map[string]interface{}{"outcome": "loss", "amount": 0, "signature": signResult(s.config.ResultSecret, msg.TableID, "belote", "loss", 0)}, Sequence: event.Sequence, Timestamp: time.Now()})
			}
		}
	}
	if !replayed && msg.Action == "discard" {
		winnerID, losers, amount, finished := s.roomManager.FinishedRamiResults(msg.TableID)
		if finished {
			s.broadcastToTable(msg.TableID, &Message{Type: MsgAction, TableID: msg.TableID, PlayerID: winnerID, Action: "result", Payload: map[string]interface{}{"outcome": "win", "amount": amount, "signature": signResult(s.config.ResultSecret, msg.TableID, "rami", "win", int(amount))}, Sequence: event.Sequence, Timestamp: time.Now()})
			for _, playerID := range losers {
				s.broadcastToTable(msg.TableID, &Message{Type: MsgAction, TableID: msg.TableID, PlayerID: playerID, Action: "result", Payload: map[string]interface{}{"outcome": "loss", "amount": 0, "signature": signResult(s.config.ResultSecret, msg.TableID, "rami", "loss", 0)}, Sequence: event.Sequence, Timestamp: time.Now()})
			}
		}
	}
	if !replayed {
		s.broadcastState(msg.TableID)
		if msg.Action == "new_hand" {
			s.broadcastPokerLifecycle(msg.TableID)
			s.broadcastPokerDeal(msg.TableID)
		}
		// A human action can hand the turn to an AI seat. Restarting the
		// orchestrator here makes the demo table continue until it is the
		// human's turn again (or the hand reaches showdown).
		s.startBotTurns(msg.TableID)
	}
	s.persistSnapshot(msg.TableID)
}

func pokerPresentationMessage(tableID, playerID, action string, payload interface{}, sequence uint64) *Message {
	return &Message{Type: MsgAction, TableID: tableID, PlayerID: playerID, Action: action, Payload: payload, Sequence: sequence, Timestamp: time.Now()}
}

func (s *Server) sendPokerLifecycle(client *Client, tableID string) {
	table, ok := s.roomManager.GetTable(tableID)
	if !ok {
		return
	}
	hand, ok := table.State.(*poker.Hand)
	if !ok {
		return
	}
	s.sendMessage(client, pokerPresentationMessage(tableID, "", "hand_started", map[string]interface{}{"phase": hand.Phase, "button": hand.Button, "small_blind": hand.SmallBlind, "big_blind": hand.BigBlind}, table.Sequence))
	s.sendMessage(client, pokerPresentationMessage(tableID, hand.Players[hand.Button].ID, "dealer_button_moved", map[string]interface{}{"button": hand.Button}, table.Sequence))
	if hand.Started {
		small, big := hand.BlindSeatsForPresentation()
		s.sendMessage(client, pokerPresentationMessage(tableID, hand.Players[small].ID, "blind_posted", map[string]interface{}{"blind": "small", "amount": hand.SmallBlind}, table.Sequence))
		s.sendMessage(client, pokerPresentationMessage(tableID, hand.Players[big].ID, "blind_posted", map[string]interface{}{"blind": "big", "amount": hand.BigBlind}, table.Sequence))
	}
}

func (s *Server) broadcastPokerLifecycle(tableID string) {
	s.mu.RLock()
	clients := make([]*Client, 0, len(s.clients))
	for _, client := range s.clients {
		if client.tableID == tableID {
			clients = append(clients, client)
		}
	}
	s.mu.RUnlock()
	for _, client := range clients {
		s.sendPokerLifecycle(client, tableID)
	}
}

// sendPokerDeal emits private, presentation-oriented deal events after the
// authoritative state snapshot. The card is sent only to its owner; clients
// use these events to animate a real two-card deal without exposing hidden
// hands or letting the animation become game state.
func (s *Server) sendPokerDeal(client *Client, tableID string) {
	table, ok := s.roomManager.GetTable(tableID)
	if !ok {
		return
	}
	tableState := table.State
	hand, ok := tableState.(*poker.Hand)
	if !ok || len(hand.Players) == 0 {
		return
	}
	for _, player := range hand.Players {
		if player.ID != client.playerID {
			continue
		}
		for index, card := range player.Cards {
			s.sendMessage(client, &Message{Type: MsgAction, TableID: tableID, PlayerID: player.ID, Action: "private_card_dealt", Payload: map[string]interface{}{"index": index, "card": card, "phase": hand.Phase}, Sequence: table.Sequence, Timestamp: time.Now()})
		}
		return
	}
}

func (s *Server) broadcastPokerDeal(tableID string) {
	s.mu.RLock()
	clients := make([]*Client, 0, len(s.clients))
	for _, client := range s.clients {
		if client.tableID == tableID && !client.spectator {
			clients = append(clients, client)
		}
	}
	s.mu.RUnlock()
	for _, client := range clients {
		s.sendPokerDeal(client, tableID)
	}
}

func actionDetails(manager *room.Manager, tableID, playerID, action string, payload interface{}) map[string]interface{} {
	details := map[string]interface{}{"action": action}
	if values, ok := payload.(map[string]interface{}); ok {
		if amount, exists := values["amount"]; exists {
			details["amount"] = amount
		}
	}
	if table, ok := manager.GetTable(tableID); ok {
		switch game := table.State.(type) {
		case *poker.Hand:
			details["phase"] = game.Phase
			details["pot_after"] = game.Pot
			for _, player := range game.Players {
				if player.ID == playerID {
					details["bet_after"] = player.Bet
					details["stack_after"] = player.Stack
					break
				}
			}
		}
	}
	return details
}

func streetDetails(manager *room.Manager, tableID, previous, current string) map[string]interface{} {
	details := map[string]interface{}{"from": previous, "phase": current}
	if table, ok := manager.GetTable(tableID); ok {
		if hand, ok := table.State.(*poker.Hand); ok {
			details["community"] = hand.Community
			details["pot_after"] = hand.Pot
		}
	}
	return details
}

// broadcastState sends a fresh, player-scoped snapshot after every accepted
// action. Private hands stay private while board, turn and stack changes are
// immediately visible to every connected client.
func (s *Server) broadcastState(tableID string) {
	table, ok := s.roomManager.GetTable(tableID)
	if !ok {
		return
	}
	tableSnapshot := map[string]interface{}{
		"table_id": table.ID, "game_type": table.GameType,
		"players": table.Players,
	}
	sequence := table.Sequence
	state := table.State
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, client := range s.clients {
		if client.tableID != tableID {
			continue
		}
		payload := map[string]interface{}{
			"table_id": tableSnapshot["table_id"], "game_type": tableSnapshot["game_type"],
			"players": tableSnapshot["players"], "game_state": publicGameState(state, client.playerID),
			"spectator": client.spectator,
		}
		data, err := json.Marshal(&Message{Type: MsgState, Payload: payload, Sequence: sequence, Timestamp: time.Now()})
		if err == nil {
			select {
			case client.send <- data:
			default:
			}
		}
	}
}

func tableGameType(manager *room.Manager, tableID string) string {
	if table, ok := manager.GetTable(tableID); ok {
		return table.GameType
	}
	return "poker"
}

func signResult(secret, gameID, gameType, outcome string, amount int) string {
	payload, _ := json.Marshal(map[string]interface{}{"amount": amount, "game_id": gameID, "game_type": gameType, "metadata": map[string]interface{}{}, "outcome": outcome})
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(payload)
	return hex.EncodeToString(mac.Sum(nil))
}

func (s *Server) persistSnapshot(tableID string) {
	snapshot, err := s.roomManager.Snapshot(tableID)
	if err != nil {
		return
	}
	go func() {
		if err := s.snapshots.SaveSnapshot(tableID, snapshot); err != nil {
			log.Printf("snapshot save failed table=%s: %v", tableID, err)
		}
	}()
}

func (s *Server) handleSync(client *Client, msg *Message) {
	events, err := s.roomManager.EventsSince(client.tableID, msg.Sequence)
	if err != nil {
		s.sendMessage(client, &Message{Type: MsgError, Payload: err.Error(), Timestamp: time.Now()})
		return
	}
	s.sendMessage(client, &Message{Type: MsgSync, TableID: client.tableID, Payload: events, Sequence: msg.Sequence, Timestamp: time.Now()})
}

func (s *Server) addClient(client *Client) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.clients[client.playerID] = client
}

func (s *Server) removeClient(client *Client) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	// A reconnect replaces the previous socket for the same player. The old
	// socket may close after the new one is registered and must not remove it.
	if current, ok := s.clients[client.playerID]; ok && current == client {
		delete(s.clients, client.playerID)
		return true
	}
	return false
}

func (s *Server) sendMessage(client *Client, message *Message) {
	data, err := json.Marshal(message)
	if err != nil {
		return
	}
	select {
	case client.send <- data:
	default:
		log.Printf("websocket send queue full player=%s table=%s", client.playerID, client.tableID)
	}
}

func (s *Server) broadcastToTable(tableID string, msg *Message) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, _ := json.Marshal(msg)
	for _, client := range s.clients {
		if client.tableID == tableID {
			select {
			case client.send <- data:
			default:
			}
		}
	}
}

func authenticate(token, secret string) (string, bool) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return "", false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(parts[0] + "." + parts[1]))
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil || !hmac.Equal(mac.Sum(nil), signature) {
		return "", false
	}
	var claims struct {
		Sub string `json:"sub"`
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || json.Unmarshal(payload, &claims) != nil || claims.Sub == "" {
		return "", false
	}
	return claims.Sub, true
}

type botTokenClaims struct {
	BotID   string `json:"bot_id"`
	TableID string `json:"table_id"`
	Name    string `json:"name"`
	Expires int64  `json:"exp"`
}

// authenticateConnection accepts normal user JWTs or a short-lived internal
// bot token. The bot token is bound to a single table and never accepted from
// the regular `token` query parameter.
func authenticateConnection(r *http.Request, cfg *config.Config) (string, bool, string, string, bool) {
	if botToken := r.URL.Query().Get("bot_token"); botToken != "" {
		claims, ok := authenticateBot(botToken, r.URL.Query().Get("table_id"), cfg.BotServiceSecret)
		if !ok {
			return "", false, "", "", false
		}
		return claims.BotID, true, claims.Name, claims.TableID, true
	}
	playerID, ok := authenticate(r.URL.Query().Get("token"), cfg.JWTSecret)
	return playerID, false, "", "", ok
}

func authenticateBot(token, tableID, secret string) (botTokenClaims, bool) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 || secret == "" {
		return botTokenClaims{}, false
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return botTokenClaims{}, false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(parts[0]))
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || !hmac.Equal(mac.Sum(nil), signature) {
		return botTokenClaims{}, false
	}
	var claims botTokenClaims
	if json.Unmarshal(payload, &claims) != nil || claims.BotID == "" || claims.TableID == "" || claims.Name == "" || claims.Expires <= time.Now().Unix() || claims.TableID != tableID {
		return botTokenClaims{}, false
	}
	return claims, true
}

func signBotToken(claims botTokenClaims, secret string) string {
	payload, _ := json.Marshal(claims)
	encoded := base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(encoded))
	return encoded + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
