package belote

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
	ID   string `json:"id"`
	Team int    `json:"team"`
	Hand []Card `json:"hand"`
}

type Round struct {
	Players      []*Player `json:"players"`
	Trump        int       `json:"trump"`
	Current      int       `json:"current"`
	LeadSuit     int       `json:"lead_suit"`
	Trick        []Card    `json:"trick"`
	TrickPlayers []int     `json:"trick_players"`
	TeamPoints   [2]int    `json:"team_points"`
	Deck         []Card    `json:"-"`
}

func NewRound(ids []string, shuffle func([]Card)) (*Round, error) {
	if len(ids) != 4 {
		return nil, fmt.Errorf("belote requires exactly 4 players")
	}
	players := make([]*Player, 4)
	for i, id := range ids {
		players[i] = &Player{ID: id, Team: i % 2}
	}
	deck := makeDeck()
	shuffle(deck)
	for i := 0; i < 32; i++ {
		players[i%4].Hand = append(players[i%4].Hand, deck[i])
	}
	for _, player := range players {
		sort.Slice(player.Hand, func(i, j int) bool {
			return player.Hand[i].Suit < player.Hand[j].Suit || (player.Hand[i].Suit == player.Hand[j].Suit && player.Hand[i].Rank < player.Hand[j].Rank)
		})
	}
	return &Round{Players: players, Trump: deck[0].Suit, Current: 0, LeadSuit: -1, Deck: deck}, nil
}

func NewShuffledRound(ids []string) (*Round, error) {
	return NewRound(ids, func(deck []Card) { rng.Shuffle(len(deck), func(i, j int) { deck[i], deck[j] = deck[j], deck[i] }) })
}

func (r *Round) PlayCard(player int, card Card) (int, error) {
	if player != r.Current || player < 0 || player >= len(r.Players) {
		return -1, fmt.Errorf("not this player's turn")
	}
	hand := r.Players[player].Hand
	cardIndex := -1
	for i, candidate := range hand {
		if candidate == card {
			cardIndex = i
			break
		}
	}
	if cardIndex < 0 {
		return -1, fmt.Errorf("card is not in player's hand")
	}
	if r.LeadSuit >= 0 && card.Suit != r.LeadSuit && hasSuit(hand, r.LeadSuit) {
		return -1, fmt.Errorf("player must follow suit")
	}
	r.Players[player].Hand = append(hand[:cardIndex], hand[cardIndex+1:]...)
	if len(r.Trick) == 0 {
		r.LeadSuit = card.Suit
	}
	r.Trick = append(r.Trick, card)
	r.TrickPlayers = append(r.TrickPlayers, player)
	if len(r.Trick) < 4 {
		r.Current = (r.Current + 1) % 4
		return -1, nil
	}
	winner := r.trickWinner()
	points := 0
	for _, played := range r.Trick {
		points += cardPoints(played, r.Trump == played.Suit)
	}
	r.TeamPoints[r.Players[winner].Team] += points
	r.Trick = nil
	r.TrickPlayers = nil
	r.LeadSuit = -1
	r.Current = winner
	return winner, nil
}

func (r *Round) Pass() error {
	if r.LeadSuit >= 0 {
		return fmt.Errorf("cannot pass during a trick")
	}
	r.Current = (r.Current + 1) % 4
	return nil
}

func (r *Round) Announce(player, trump int) error {
	if player != r.Current || trump < 0 || trump > 3 {
		return fmt.Errorf("invalid trump announcement")
	}
	r.Trump = trump
	r.Current = (r.Current + 1) % 4
	return nil
}

func (r *Round) trickWinner() int {
	winner := 0
	winning := r.Trick[0]
	for i := 1; i < len(r.Trick); i++ {
		candidate := r.Trick[i]
		if beats(candidate, winning, r.LeadSuit, r.Trump) {
			winner = i
			winning = candidate
		}
	}
	return r.TrickPlayers[winner]
}

func beats(candidate, current Card, leadSuit, trump int) bool {
	if candidate.Suit == trump && current.Suit != trump {
		return true
	}
	if candidate.Suit != current.Suit {
		return candidate.Suit == leadSuit && current.Suit != trump
	}
	return cardStrength(candidate, candidate.Suit == trump) > cardStrength(current, current.Suit == trump)
}

func hasSuit(hand []Card, suit int) bool {
	for _, card := range hand {
		if card.Suit == suit {
			return true
		}
	}
	return false
}
func cardStrength(card Card, trump bool) int {
	if trump {
		switch card.Rank {
		case 11:
			return 8
		case 9:
			return 7
		case 14:
			return 6
		case 10:
			return 5
		case 13:
			return 4
		case 12:
			return 3
		case 8:
			return 2
		case 7:
			return 1
		}
	}
	switch card.Rank {
	case 14:
		return 8
	case 10:
		return 7
	case 13:
		return 6
	case 12:
		return 5
	case 11:
		return 4
	case 9:
		return 3
	case 8:
		return 2
	case 7:
		return 1
	}
	return 0
}
func cardPoints(card Card, trump bool) int {
	if trump {
		switch card.Rank {
		case 11:
			return 20
		case 9:
			return 14
		}
	}
	switch card.Rank {
	case 14:
		return 11
	case 10:
		return 10
	case 13:
		return 4
	case 12:
		return 3
	case 11:
		return 2
	}
	return 0
}
func makeDeck() []Card {
	deck := make([]Card, 0, 32)
	for suit := 0; suit < 4; suit++ {
		for rank := 7; rank <= 14; rank++ {
			deck = append(deck, Card{Suit: suit, Rank: rank})
		}
	}
	return deck
}
