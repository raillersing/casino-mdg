package room

import (
	"fmt"
	"github.com/casino-mdg/game-engine/internal/game/belote"
	"github.com/casino-mdg/game-engine/internal/game/domino"
	"github.com/casino-mdg/game-engine/internal/game/ludo"
	"github.com/casino-mdg/game-engine/internal/game/poker"
	"github.com/casino-mdg/game-engine/internal/game/rami"
	"time"
)

type TableSettings struct {
	Version         int   `json:"version"`
	MaxPlayers      int   `json:"max_players"`
	TurnDuration    int   `json:"turn_duration"`
	BeloteTarget    int   `json:"belote_target"`
	PokerSmallBlind int64 `json:"poker_small_blind"`
}

func (m *Manager) ConfigureTable(tableID string, settings TableSettings) error {
	table, ok := m.GetTable(tableID)
	if !ok {
		return fmt.Errorf("table not found")
	}
	table.mu.Lock()
	defer table.mu.Unlock()
	if settings.Version != 1 || settings.MaxPlayers < 2 || settings.MaxPlayers > 9 || settings.TurnDuration < 5 || settings.TurnDuration > 120 {
		return fmt.Errorf("invalid table configuration")
	}
	if table.GameType == "belote" && (settings.MaxPlayers != 4 || (settings.BeloteTarget != 501 && settings.BeloteTarget != 1001 && settings.BeloteTarget != 1501)) {
		return fmt.Errorf("invalid belote configuration")
	}
	if table.GameType != "poker" && settings.MaxPlayers > 4 {
		return fmt.Errorf("invalid capacity")
	}
	if table.GameType == "poker" && settings.PokerSmallBlind != 25 && settings.PokerSmallBlind != 50 && settings.PokerSmallBlind != 100 && settings.PokerSmallBlind != 200 {
		return fmt.Errorf("invalid blinds")
	}
	if table.Settings != nil {
		if *table.Settings != settings {
			return fmt.Errorf("table settings conflict")
		}
		return nil
	}
	if table.State != nil {
		return fmt.Errorf("legacy table cannot change rules while running")
	}
	table.Settings = &settings
	table.TurnDuration = settings.TurnDuration
	if table.GameType == "belote" {
		table.BeloteTargetScore = settings.BeloteTarget
	}
	if table.GameType == "poker" {
		table.Blinds = true
		table.PokerSmallBlind = settings.PokerSmallBlind
		table.PokerBigBlind = settings.PokerSmallBlind * 2
	}
	return nil
}

type ActiveRoom struct {
	ReservedHumans []string `json:"reserved_humans"`
	Waiting        bool     `json:"waiting"`
	ID             string   `json:"id"`
	Game           string   `json:"game"`
	Started        bool     `json:"started"`
}

func (m *Manager) ActiveRooms() []ActiveRoom {
	m.mu.RLock()
	defer m.mu.RUnlock()
	result := []ActiveRoom{}
	for _, table := range m.tables {
		table.mu.RLock()
		if table.IsActive {
			started := SessionStarted(table)
			reserved := []string{}
			for _, player := range table.Players {
				if !player.IsBot {
					reserved = append(reserved, player.ID)
				}
			}
			result = append(result, ActiveRoom{reserved, table.State == nil, table.ID, table.GameType, started})
		}
		table.mu.RUnlock()
	}
	return result
}

func (m *Manager) StartHumanDeadline(tableID string) {
	table, ok := m.GetTable(tableID)
	if !ok {
		return
	}
	table.mu.Lock()
	defer table.mu.Unlock()
	if SessionStarted(table) && table.ActionDeadline.IsZero() {
		table.ActionDeadline = time.Now().Add(time.Duration(tableTurnDuration(table)) * time.Second)
		if hand, ok := table.State.(*poker.Hand); ok {
			hand.SetActionDeadline(table.ActionDeadline)
		}
	}
}

// SessionStarted reads a table while its caller holds the table read lock.
// A belote round ending below the match target does not end the match.
func SessionStarted(table *Table) bool {
	if !table.IsActive || table.State == nil {
		return false
	}
	switch game := table.State.(type) {
	case *poker.Hand:
		return !game.SessionFinished
	case *belote.Round:
		target := table.BeloteTargetScore
		if target == 0 {
			target = 501
		}
		scores := table.BeloteTeamScores
		if game.Phase == "finished" {
			scores[0] += game.TeamPoints[0]
			scores[1] += game.TeamPoints[1]
		}
		return game.Phase != "settled_reported" && scores[0] < target && scores[1] < target
	case *rami.Game:
		return !game.Finished
	case *ludo.Game:
		return !game.Finished
	case *domino.Game:
		return !game.Finished
	}
	return false
}

func (m *Manager) IsSessionStarted(tableID string) bool {
	table, ok := m.GetTable(tableID)
	if !ok {
		return false
	}
	table.RLock()
	defer table.RUnlock()
	return SessionStarted(table)
}
