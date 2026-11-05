package room

import (
	"github.com/casino-mdg/game-engine/internal/game/domino"
	"github.com/casino-mdg/game-engine/internal/game/ludo"
)

// NextForcedAction never chooses between strategically different legal moves.
// The normal action path still checks the sequence, records and broadcasts it.
func (m *Manager) NextForcedAction(tableID string) (BotTurn, bool) {
	table, ok := m.GetTable(tableID)
	if !ok {
		return BotTurn{}, false
	}
	table.RLock()
	defer table.RUnlock()
	if !table.IsActive {
		return BotTurn{}, false
	}
	var id, action string
	payload := map[string]interface{}{"automatic": true}
	switch game := table.State.(type) {
	case *ludo.Game:
		if game.Finished || !game.CanMove || len(game.ValidMoves) == 0 {
			return BotTurn{}, false
		}
		player := game.Players[game.Current]
		pawn := player.Pawns[game.ValidMoves[0]]
		for _, index := range game.ValidMoves[1:] {
			other := player.Pawns[index]
			if other.State != pawn.State || other.Position != pawn.Position {
				return BotTurn{}, false
			}
		}
		id = player.ID
		action = "move_pawn"
		payload["pawn_id"] = pawn.ID
	case *domino.Game:
		if game.Finished || len(game.Players) == 0 {
			return BotTurn{}, false
		}
		player := game.Players[game.Current]
		id = player.ID
		if !game.CanPlayAny(player) {
			if len(game.Boneyard) > 0 {
				action = "draw_tile"
			} else {
				action = "pass"
			}
		} else {
			choices := 0
			for _, tile := range player.Hand {
				left := len(game.Board) == 0 || tile.Left == game.LeftEnd || tile.Right == game.LeftEnd
				right := len(game.Board) == 0 || tile.Left == game.RightEnd || tile.Right == game.RightEnd
				if !left && !right {
					continue
				}
				choices++
				if choices > 1 || (left && right && len(game.Board) > 0 && game.LeftEnd != game.RightEnd) {
					return BotTurn{}, false
				}
				side := "right"
				if left {
					side = "left"
				}
				payload["tile"] = map[string]interface{}{"left": tile.Left, "right": tile.Right}
				payload["side"] = side
			}
			if choices != 1 {
				return BotTurn{}, false
			}
			action = "play_tile"
		}
	default:
		return BotTurn{}, false
	}
	if player := table.Players[id]; player == nil || !player.IsActive {
		return BotTurn{}, false
	}
	return BotTurn{PlayerID: id, Action: action, Payload: payload, Sequence: table.Sequence}, true
}
