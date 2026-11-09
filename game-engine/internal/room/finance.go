package room

import (
	"fmt"
	"math"

	"github.com/casino-mdg/game-engine/internal/game/poker"
)

type FundingOperation struct {
	Status  string `json:"status,omitempty"`
	ID      string `json:"id"`
	Session string `json:"session"`
	UserID  string `json:"user_id"`
	Kind    string `json:"kind"`
	Amount  int64  `json:"amount"`
}
type FundedSeat struct {
	AfterHand bool   `json:"after_hand"`
	EntryHand int    `json:"entry_hand"`
	Session   string `json:"session"`
	Entry     string `json:"entry"`
}
type FinanceBalance struct {
	Stack   int64 `json:"stack"`
	Pending int64 `json:"pending"`
	Exited  bool  `json:"exited"`
}
type FinanceState struct {
	Seats      map[string]FundedSeat       `json:"seats"`
	Operations map[string]FundingOperation `json:"operations"`
	Cashouts   map[string]FinanceBalance   `json:"cashouts"`
}
type FinanceCheckpoint struct {
	Revision   uint64                    `json:"revision"`
	Operations []string                  `json:"operations"`
	Balances   map[string]FinanceBalance `json:"balances"`
	Closed     bool                      `json:"closed"`
}

// ApplyFunding accepts a backend-authorized command, never a browser amount.
func (m *Manager) ApplyFunding(tableID string, op FundingOperation) error {
	table, ok := m.GetTable(tableID)
	if !ok {
		return fmt.Errorf("table not found")
	}
	table.mu.Lock()
	defer table.mu.Unlock()
	if !table.IsActive || table.GameType != "poker" {
		return fmt.Errorf("funding unavailable")
	}
	player := table.Players[op.UserID]
	if player == nil {
		return fmt.Errorf("player not seated")
	}
	if table.Finance == nil {
		table.Finance = &FinanceState{Seats: map[string]FundedSeat{}, Operations: map[string]FundingOperation{}, Cashouts: map[string]FinanceBalance{}}
	}
	op.Status = ""
	f := table.Finance
	if previous, exists := f.Operations[op.ID]; exists {
		if previous != op {
			return fmt.Errorf("funding operation conflict")
		}
		return nil
	}
	if op.ID == "" || op.Session == "" || op.Amount <= 0 {
		return fmt.Errorf("invalid funding operation")
	}
	switch op.Kind {
	case "entry":
		if seat, exists := f.Seats[op.UserID]; exists && !f.Cashouts[seat.Session].Exited {
			return fmt.Errorf("funded seat already exists")
		}
		old := f.Seats[op.UserID]
		f.Seats[op.UserID] = FundedSeat{Session: op.Session, Entry: op.ID, AfterHand: f.Cashouts[old.Session].Exited, EntryHand: table.PokerHandsPlayed}
	case "top_up":
		seat, exists := f.Seats[op.UserID]
		if !exists || seat.Session != op.Session || player.Leaving || f.Cashouts[seat.Session].Exited {
			return fmt.Errorf("funding session mismatch")
		}
		if player.PendingTopUp > math.MaxInt64-op.Amount-player.Stack {
			return fmt.Errorf("funding overflow")
		}
		if table.State == nil {
			player.Stack += op.Amount
		} else {
			player.PendingTopUp += op.Amount
		}
	default:
		return fmt.Errorf("invalid funding command")
	}
	f.Operations[op.ID] = op
	appendEvent(table, op.UserID, "funding_applied", map[string]interface{}{"operation_id": op.ID})
	return nil
}

func financeBalance(table *Table, id string, player *Player) FinanceBalance {
	value := player.Stack
	if hand, ok := table.State.(*poker.Hand); ok && financeUsesHand(table, id) {
		for _, p := range hand.Players {
			if p.ID == id {
				value = p.Stack + p.TotalBet
				if hand.Phase == "showdown" {
					value = p.Stack + hand.Payouts()[id]
				}
				break
			}
		}
	}
	return FinanceBalance{Stack: value, Pending: player.PendingTopUp}
}

// FinalizeFinance only pays departures at a safe boundary. During a hand their
// committed chips stay in play; departed players are folded by the server clock.
func (m *Manager) FinalizeFinance(tableID string) {
	table, ok := m.GetTable(tableID)
	if !ok {
		return
	}
	table.mu.Lock()
	defer table.mu.Unlock()
	if table.Finance == nil {
		return
	}
	safe := table.State == nil
	if hand, ok := table.State.(*poker.Hand); ok {
		safe = hand.Phase == "showdown"
	}
	if !safe {
		return
	}
	for id, player := range table.Players {
		seat, funded := table.Finance.Seats[id]
		if funded && player.Leaving {
			value := financeBalance(table, id, player)
			value.Exited = true
			table.Finance.Cashouts[seat.Session] = value
			delete(table.Players, id)
			appendEvent(table, id, "funds_released", nil)
		}
	}
	if !hasHumanSeat(table) {
		table.IsActive = false
	}
}

func (m *Manager) FinanceCheckpoint(tableID string) (FinanceCheckpoint, bool) {
	table, ok := m.GetTable(tableID)
	if !ok {
		return FinanceCheckpoint{}, false
	}
	table.mu.RLock()
	defer table.mu.RUnlock()
	if table.Finance == nil {
		return FinanceCheckpoint{}, false
	}
	result := FinanceCheckpoint{Revision: table.Sequence, Operations: []string{}, Balances: map[string]FinanceBalance{}, Closed: !table.IsActive}
	for id := range table.Finance.Operations {
		result.Operations = append(result.Operations, id)
	}
	for session, value := range table.Finance.Cashouts {
		result.Balances[session] = value
	}
	for id, seat := range table.Finance.Seats {
		if player := table.Players[id]; player != nil && !result.Balances[seat.Session].Exited {
			result.Balances[seat.Session] = financeBalance(table, id, player)
		}
	}
	return result, true
}

func (m *Manager) IsFunded(tableID string) bool {
	table, ok := m.GetTable(tableID)
	if !ok {
		return false
	}
	table.mu.RLock()
	defer table.mu.RUnlock()
	return table.Finance != nil
}

func (m *Manager) CancelUnadmittedFunding(tableID string, entry FundingOperation, operations []FundingOperation) {
	table, ok := m.GetTable(tableID)
	if !ok {
		return
	}
	table.mu.Lock()
	defer table.mu.Unlock()
	if table.Finance == nil || table.Players[entry.UserID] != nil || table.Finance.Cashouts[entry.Session].Exited {
		return
	}
	var value int64
	for _, op := range operations {
		if op.Session == entry.Session && (op.Kind == "entry" || op.Kind == "top_up") {
			op.Status = ""
			table.Finance.Operations[op.ID] = op
			value += op.Amount
		}
	}
	table.Finance.Cashouts[entry.Session] = FinanceBalance{Stack: value, Exited: true}
	appendEvent(table, entry.UserID, "funding_cancelled", nil)
}

func financeUsesHand(table *Table, id string) bool {
	if table.Finance == nil {
		return true
	}
	seat := table.Finance.Seats[id]
	return !seat.AfterHand || table.PokerHandsPlayed != seat.EntryHand
}
