package rami

import (
	"fmt"
	"sort"

	"github.com/casino-mdg/game-engine/internal/rng"
)

type Card struct {
	Suit int `json:"suit"`
	Rank int `json:"rank"`
}
type Player struct {
	ID    string `json:"id"`
	Hand  []Card `json:"hand"`
	Score int    `json:"score"`
}
type Game struct {
	Players  []*Player `json:"players"`
	DrawPile []Card    `json:"-"`
	Discard  []Card    `json:"discard"`
	Current  int       `json:"current"`
	Finished bool      `json:"finished"`
}

func NewGame(ids []string, shuffle func([]Card)) (*Game, error) {
	if len(ids) < 2 || len(ids) > 4 {
		return nil, fmt.Errorf("rami requires 2 to 4 players")
	}
	players := make([]*Player, len(ids))
	for i, id := range ids {
		players[i] = &Player{ID: id}
	}
	deck := makeDeck()
	shuffle(deck)
	handSize := 7
	for i := 0; i < len(players)*handSize; i++ {
		players[i%len(players)].Hand = append(players[i%len(players)].Hand, deck[i])
	}
	for _, player := range players {
		sortHand(player.Hand)
	}
	return &Game{Players: players, DrawPile: deck[len(players)*handSize:], Current: 0}, nil
}

func NewShuffledGame(ids []string) (*Game, error) {
	return NewGame(ids, func(deck []Card) { rng.Shuffle(len(deck), func(i, j int) { deck[i], deck[j] = deck[j], deck[i] }) })
}

func (g *Game) Draw() (Card, error) {
	if g.Finished || len(g.DrawPile) == 0 {
		return Card{}, fmt.Errorf("draw pile is empty")
	}
	card := g.DrawPile[0]
	g.DrawPile = g.DrawPile[1:]
	g.Players[g.Current].Hand = append(g.Players[g.Current].Hand, card)
	return card, nil
}
func (g *Game) DiscardCard(card Card) error {
	if g.Finished {
		return fmt.Errorf("game is finished")
	}
	player := g.Players[g.Current]
	for i, candidate := range player.Hand {
		if candidate == card {
			player.Hand = append(player.Hand[:i], player.Hand[i+1:]...)
			g.Discard = append(g.Discard, card)
			if len(player.Hand) == 0 {
				g.Finished = true
			}
			if !g.Finished {
				g.Current = (g.Current + 1) % len(g.Players)
			}
			return nil
		}
	}
	return fmt.Errorf("card is not in player's hand")
}

func ValidMeld(cards []Card) bool {
	if len(cards) < 3 {
		return false
	}
	if sameRank(cards) {
		return distinctSuits(cards)
	}
	for _, card := range cards[1:] {
		if card.Suit != cards[0].Suit {
			return false
		}
	}
	ranks := make([]int, len(cards))
	for i, card := range cards {
		ranks[i] = card.Rank
	}
	sort.Ints(ranks)
	for i := 1; i < len(ranks); i++ {
		if ranks[i] != ranks[i-1]+1 {
			return false
		}
	}
	return true
}

func sameRank(cards []Card) bool {
	for _, card := range cards[1:] {
		if card.Rank != cards[0].Rank {
			return false
		}
	}
	return true
}
func distinctSuits(cards []Card) bool {
	seen := map[int]bool{}
	for _, card := range cards {
		if seen[card.Suit] {
			return false
		}
		seen[card.Suit] = true
	}
	return true
}
func sortHand(hand []Card) {
	sort.Slice(hand, func(i, j int) bool {
		return hand[i].Suit < hand[j].Suit || (hand[i].Suit == hand[j].Suit && hand[i].Rank < hand[j].Rank)
	})
}
func makeDeck() []Card {
	deck := make([]Card, 0, 52)
	for suit := 0; suit < 4; suit++ {
		for rank := 1; rank <= 13; rank++ {
			deck = append(deck, Card{Suit: suit, Rank: rank})
		}
	}
	return deck
}
