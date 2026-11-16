package ludo

import (
	"fmt"
	"math/rand"
)

// Track length for standard Ludo board is 52 common squares
const (
	TrackLength    = 52
	HomePathLength = 5 // 5 home path squares (0..4), 5th step reaches central Home
)

// Starting track square index for each of the 4 colors
var StartPositions = [4]int{0, 13, 26, 39}

type PawnState string

const (
	PawnBase     PawnState = "base"
	PawnTrack    PawnState = "track"
	PawnHomePath PawnState = "home_path"
	PawnHome     PawnState = "home"
)

type Pawn struct {
	ID       int       `json:"id"`       // 0 to 3
	State    PawnState `json:"state"`    // base, track, home_path, home
	Position int       `json:"position"` // 0-51 if track; 0-5 if home_path
}

type Player struct {
	ID    string  `json:"id"`
	Color int     `json:"color"` // 0: Red, 1: Green, 2: Yellow, 3: Blue
	Pawns [4]Pawn `json:"pawns"`
	Score int     `json:"score"` // Number of pawns that reached home
}

type Game struct {
	LastResult       int       `json:"last_result"`
	Players          []*Player `json:"players"`
	Current          int       `json:"current"` // Index in Players
	LastRoll         int       `json:"last_roll"`
	CanRoll          bool      `json:"can_roll"`
	CanMove          bool      `json:"can_move"`
	ValidMoves       []int     `json:"valid_moves"`
	ConsecutiveSixes int       `json:"consecutive_sixes"`
	Finished         bool      `json:"finished"`
	Winner           string    `json:"winner"`
}

func NewGame(ids []string) (*Game, error) {
	if len(ids) < 2 || len(ids) > 4 {
		return nil, fmt.Errorf("ludo requires 2 to 4 players")
	}
	players := make([]*Player, len(ids))
	for i, id := range ids {
		p := &Player{
			ID:    id,
			Color: i,
		}
		for pIdx := 0; pIdx < 4; pIdx++ {
			p.Pawns[pIdx] = Pawn{
				ID:       pIdx,
				State:    PawnBase,
				Position: -1,
			}
		}
		players[i] = p
	}
	g := &Game{
		Players:  players,
		Current:  0,
		CanRoll:  true,
		CanMove:  false,
		Finished: false,
	}
	return g, nil
}

func (g *Game) RollDice() (int, error) {
	if g.Finished {
		return 0, fmt.Errorf("game is finished")
	}
	if !g.CanRoll {
		return 0, fmt.Errorf("player cannot roll right now")
	}

	roll := rand.Intn(6) + 1
	g.LastRoll = roll
	g.LastResult = roll
	g.CanRoll = false

	if roll == 6 {
		g.ConsecutiveSixes++
	} else {
		g.ConsecutiveSixes = 0
	}

	// 3 consecutive sixes penalty: lose turn
	if g.ConsecutiveSixes >= 3 {
		g.ConsecutiveSixes = 0
		g.nextTurn()
		return roll, nil
	}

	currPlayer := g.Players[g.Current]
	valid := make([]int, 0)
	for _, p := range currPlayer.Pawns {
		if g.canMovePawn(&p, roll) {
			valid = append(valid, p.ID)
		}
	}

	if len(valid) == 0 {
		// No moves possible with this roll, pass turn automatically
		g.nextTurn()
	} else {
		g.CanMove = true
		g.ValidMoves = valid
	}

	return roll, nil
}

func (g *Game) canMovePawn(pawn *Pawn, roll int) bool {
	if pawn.State == PawnHome {
		return false
	}
	if pawn.State == PawnBase {
		return roll == 6
	}
	if pawn.State == PawnHomePath {
		return pawn.Position+roll <= HomePathLength
	}
	if pawn.State == PawnTrack {
		startPos := StartPositions[g.Players[g.Current].Color]
		curDist := (pawn.Position - startPos + TrackLength) % TrackLength
		newDist := curDist + roll
		if newDist >= 51 {
			homeSteps := newDist - 51
			return homeSteps <= HomePathLength
		}
		return true
	}
	return true
}

func (g *Game) MovePawn(pawnID int) error {
	if g.Finished {
		return fmt.Errorf("game is finished")
	}
	if !g.CanMove {
		return fmt.Errorf("no move pending")
	}

	currPlayer := g.Players[g.Current]
	if pawnID < 0 || pawnID >= 4 {
		return fmt.Errorf("invalid pawn id")
	}

	isValid := false
	for _, id := range g.ValidMoves {
		if id == pawnID {
			isValid = true
			break
		}
	}
	if !isValid {
		return fmt.Errorf("pawn cannot be moved")
	}

	pawn := &currPlayer.Pawns[pawnID]
	roll := g.LastRoll

	switch pawn.State {
	case PawnBase:
		// Exit yard into start square
		pawn.State = PawnTrack
		pawn.Position = StartPositions[currPlayer.Color]
	case PawnTrack:
		startPos := StartPositions[currPlayer.Color]
		// Track distance relative to player's start position
		curDist := (pawn.Position - startPos + TrackLength) % TrackLength
		newDist := curDist + roll

		if newDist >= 51 {
			// Enters home path or reaches home
			homeSteps := newDist - 51
			if homeSteps == HomePathLength {
				pawn.State = PawnHome
				currPlayer.Score++
			} else if homeSteps < HomePathLength {
				pawn.State = PawnHomePath
				pawn.Position = homeSteps
			} else {
				// Overshoot, stays on track
				pawn.Position = (pawn.Position + roll) % TrackLength
			}
		} else {
			pawn.Position = (pawn.Position + roll) % TrackLength
			// Check capture of opponent's pawns
			g.captureOpponentsAt(pawn.Position, currPlayer.Color)
		}
	case PawnHomePath:
		newPos := pawn.Position + roll
		if newPos == HomePathLength {
			pawn.State = PawnHome
			currPlayer.Score++
		} else if newPos < HomePathLength {
			pawn.Position = newPos
		}
	}

	// Check victory condition
	if currPlayer.Score >= 4 {
		g.Finished = true
		g.Winner = currPlayer.ID
		g.CanMove = false
		g.CanRoll = false
		return nil
	}

	g.CanMove = false
	g.ValidMoves = nil

	// If player rolled a 6, they get another turn!
	if roll == 6 {
		g.CanRoll = true
	} else {
		g.nextTurn()
	}
	return nil
}

func (g *Game) captureOpponentsAt(pos int, playerColor int) {
	// Start squares are safe zones
	for _, start := range StartPositions {
		if pos == start {
			return
		}
	}
	for _, p := range g.Players {
		if p.Color == playerColor {
			continue
		}
		for i := range p.Pawns {
			if p.Pawns[i].State == PawnTrack && p.Pawns[i].Position == pos {
				// Captured! Send back to base
				p.Pawns[i].State = PawnBase
				p.Pawns[i].Position = -1
			}
		}
	}
}

func (g *Game) nextTurn() {
	g.Current = (g.Current + 1) % len(g.Players)
	g.CanRoll = true
	g.CanMove = false
	g.ValidMoves = nil
	g.LastRoll = 0
	g.ConsecutiveSixes = 0
}

func (g *Game) DecideBotAction(playerID string) (action string, pawnID int) {
	if g.Finished || len(g.Players) == 0 {
		return "", -1
	}
	curr := g.Players[g.Current]
	if curr.ID != playerID {
		return "", -1
	}
	if g.CanRoll {
		return "roll_dice", -1
	}
	if g.CanMove && len(g.ValidMoves) > 0 {
		// Priority 1: Move pawn out of base on 6
		if g.LastRoll == 6 {
			for _, id := range g.ValidMoves {
				if curr.Pawns[id].State == PawnBase {
					return "move_pawn", id
				}
			}
		}
		// Priority 2: Advance pawn that can capture an opponent or reach home
		for _, id := range g.ValidMoves {
			if curr.Pawns[id].State == PawnHomePath {
				return "move_pawn", id
			}
		}
		// Priority 3: Default to first valid move
		return "move_pawn", g.ValidMoves[0]
	}
	return "", -1
}
