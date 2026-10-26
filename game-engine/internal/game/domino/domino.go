package domino

import (
	"fmt"
	"math/rand"
	"time"
)

type Tile struct {
	Left  int `json:"left"`
	Right int `json:"right"`
}

type PlayedTile struct {
	Left  int `json:"left"`
	Right int `json:"right"`
}

type Player struct {
	ID    string `json:"id"`
	Hand  []Tile `json:"hand"`
	Score int    `json:"score"`
}

type Game struct {
	Players  []*Player    `json:"players"`
	Board    []PlayedTile `json:"board"`
	LeftEnd  int          `json:"left_end"`
	RightEnd int          `json:"right_end"`
	Boneyard []Tile       `json:"boneyard"` // Talon
	Current  int          `json:"current"`
	Finished bool         `json:"finished"`
	Winner   string       `json:"winner"`
	Blocked  bool         `json:"blocked"`
	ConsecutivePasses int `json:"consecutive_passes"`
}

func makeDominoSet() []Tile {
	tiles := make([]Tile, 0, 28)
	for i := 0; i <= 6; i++ {
		for j := i; j <= 6; j++ {
			tiles = append(tiles, Tile{Left: i, Right: j})
		}
	}
	return tiles
}

func shuffleTiles(tiles []Tile) {
	rand.Shuffle(len(tiles), func(i, j int) {
		tiles[i], tiles[j] = tiles[j], tiles[i]
	})
}

func NewGame(ids []string) (*Game, error) {
	if len(ids) < 2 || len(ids) > 4 {
		return nil, fmt.Errorf("domino requires 2 to 4 players")
	}

	set := makeDominoSet()
	shuffleTiles(set)

	handSize := 7
	if len(ids) == 3 || len(ids) == 4 {
		handSize = 6
	}

	players := make([]*Player, len(ids))
	dealt := 0
	for i, id := range ids {
		hand := make([]Tile, handSize)
		copy(hand, set[dealt:dealt+handSize])
		dealt += handSize
		players[i] = &Player{
			ID:   id,
			Hand: hand,
		}
	}

	boneyard := make([]Tile, len(set)-dealt)
	copy(boneyard, set[dealt:])

	return &Game{
		Players:  players,
		Board:    make([]PlayedTile, 0),
		LeftEnd:  -1,
		RightEnd: -1,
		Boneyard: boneyard,
		Current:  0,
		Finished: false,
	}, nil
}

func (g *Game) CanPlayAny(player *Player) bool {
	if len(g.Board) == 0 {
		return len(player.Hand) > 0
	}
	for _, t := range player.Hand {
		if t.Left == g.LeftEnd || t.Right == g.LeftEnd || t.Left == g.RightEnd || t.Right == g.RightEnd {
			return true
		}
	}
	return false
}

func (g *Game) PlayTile(playerID string, tile Tile, side string) error {
	if g.Finished {
		return fmt.Errorf("game is finished")
	}
	curr := g.Players[g.Current]
	if curr.ID != playerID {
		return fmt.Errorf("not your turn")
	}

	tileIndex := -1
	for i, t := range curr.Hand {
		if (t.Left == tile.Left && t.Right == tile.Right) || (t.Left == tile.Right && t.Right == tile.Left) {
			tileIndex = i
			tile = t
			break
		}
	}
	if tileIndex == -1 {
		return fmt.Errorf("tile not in hand")
	}

	if len(g.Board) == 0 {
		// First tile played
		g.Board = append(g.Board, PlayedTile{Left: tile.Left, Right: tile.Right})
		g.LeftEnd = tile.Left
		g.RightEnd = tile.Right
	} else {
		if side != "left" && side != "right" {
			// Auto detect side if possible
			if tile.Left == g.LeftEnd || tile.Right == g.LeftEnd {
				side = "left"
			} else if tile.Left == g.RightEnd || tile.Right == g.RightEnd {
				side = "right"
			} else {
				return fmt.Errorf("tile does not match either end of the board")
			}
		}

		if side == "left" {
			if tile.Right == g.LeftEnd {
				g.Board = append([]PlayedTile{{Left: tile.Left, Right: tile.Right}}, g.Board...)
				g.LeftEnd = tile.Left
			} else if tile.Left == g.LeftEnd {
				g.Board = append([]PlayedTile{{Left: tile.Right, Right: tile.Left}}, g.Board...)
				g.LeftEnd = tile.Right
			} else {
				return fmt.Errorf("tile cannot connect to left end")
			}
		} else {
			if tile.Left == g.RightEnd {
				g.Board = append(g.Board, PlayedTile{Left: tile.Left, Right: tile.Right})
				g.RightEnd = tile.Right
			} else if tile.Right == g.RightEnd {
				g.Board = append(g.Board, PlayedTile{Left: tile.Right, Right: tile.Left})
				g.RightEnd = tile.Left
			} else {
				return fmt.Errorf("tile cannot connect to right end")
			}
		}
	}

	// Remove tile from player hand
	curr.Hand = append(curr.Hand[:tileIndex], curr.Hand[tileIndex+1:]...)
	g.ConsecutivePasses = 0

	// Check domino victory
	if len(curr.Hand) == 0 {
		g.Finished = true
		g.Winner = curr.ID
		return nil
	}

	g.nextTurn()
	return nil
}

func (g *Game) DrawTile(playerID string) (Tile, error) {
	if g.Finished {
		return Tile{}, fmt.Errorf("game is finished")
	}
	curr := g.Players[g.Current]
	if curr.ID != playerID {
		return Tile{}, fmt.Errorf("not your turn")
	}
	if len(g.Boneyard) == 0 {
		return Tile{}, fmt.Errorf("boneyard is empty")
	}
	if g.CanPlayAny(curr) {
		return Tile{}, fmt.Errorf("cannot draw when you have a playable tile")
	}

	tile := g.Boneyard[len(g.Boneyard)-1]
	g.Boneyard = g.Boneyard[:len(g.Boneyard)-1]
	curr.Hand = append(curr.Hand, tile)
	g.ConsecutivePasses = 0
	return tile, nil
}

func (g *Game) Pass(playerID string) error {
	if g.Finished {
		return fmt.Errorf("game is finished")
	}
	curr := g.Players[g.Current]
	if curr.ID != playerID {
		return fmt.Errorf("not your turn")
	}
	if len(g.Boneyard) > 0 {
		return fmt.Errorf("cannot pass while boneyard has tiles to draw")
	}
	if g.CanPlayAny(curr) {
		return fmt.Errorf("cannot pass when you have a playable tile")
	}

	g.ConsecutivePasses++
	if g.ConsecutivePasses >= len(g.Players) {
		// All players passed: Blocked game! (Gasy / Fermé)
		g.Finished = true
		g.Blocked = true
		g.resolveBlockedWinner()
		return nil
	}

	g.nextTurn()
	return nil
}

func (g *Game) resolveBlockedWinner() {
	minPips := 999
	winnerID := ""
	for _, p := range g.Players {
		pips := 0
		for _, t := range p.Hand {
			pips += t.Left + t.Right
		}
		if pips < minPips {
			minPips = pips
			winnerID = p.ID
		}
	}
	g.Winner = winnerID
}

func (g *Game) nextTurn() {
	g.Current = (g.Current + 1) % len(g.Players)
}

func (g *Game) DecideBotAction(playerID string) (action string, tile Tile, side string) {
	if g.Finished || len(g.Players) == 0 {
		return "", Tile{}, ""
	}
	curr := g.Players[g.Current]
	if curr.ID != playerID {
		return "", Tile{}, ""
	}

	if len(g.Board) == 0 {
		// Play highest double or first tile
		if len(curr.Hand) > 0 {
			bestTile := curr.Hand[0]
			for _, t := range curr.Hand {
				if t.Left == t.Right && (t.Left+t.Right > bestTile.Left+bestTile.Right) {
					bestTile = t
				}
			}
			return "play_tile", bestTile, "right"
		}
		return "", Tile{}, ""
	}

	for _, t := range curr.Hand {
		if t.Left == g.LeftEnd || t.Right == g.LeftEnd {
			return "play_tile", t, "left"
		}
		if t.Left == g.RightEnd || t.Right == g.RightEnd {
			return "play_tile", t, "right"
		}
	}

	if len(g.Boneyard) > 0 {
		return "draw_tile", Tile{}, ""
	}

	return "pass", Tile{}, ""
}

func init() {
	rand.Seed(time.Now().UnixNano())
}
