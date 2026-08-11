package poker

import (
	"fmt"
	"sort"

	"github.com/casino-mdg/game-engine/internal/rng"
)

type Card struct {
	Rank int `json:"rank"`
	Suit int `json:"suit"`
}
type Action string

const (
	Fold  Action = "fold"
	Check Action = "check"
	Call  Action = "call"
	Bet   Action = "bet"
	Raise Action = "raise"
	AllIn Action = "all_in"
)

type Player struct {
	ID     string `json:"id"`
	Stack  int64  `json:"stack"`
	Bet    int64  `json:"bet"`
	Cards  []Card `json:"cards"`
	Folded bool   `json:"folded"`
	AllIn  bool   `json:"all_in"`
}
type Hand struct {
	Players      []*Player `json:"players"`
	Community    []Card    `json:"community"`
	Pot          int64     `json:"pot"`
	Current      int       `json:"current"`
	Phase        string    `json:"phase"`
	Deck         []Card    `json:"-"`
	RoundActions int       `json:"round_actions"`
}

type Pot struct {
	Amount   int64    `json:"amount"`
	Eligible []string `json:"eligible"`
}

func CalculatePots(players []*Player) []Pot {
	levels := make([]int64, 0)
	for _, player := range players {
		if player.Bet > 0 {
			levels = append(levels, player.Bet)
		}
	}
	sort.Slice(levels, func(i, j int) bool { return levels[i] < levels[j] })
	unique := levels[:0]
	for _, level := range levels {
		if len(unique) == 0 || unique[len(unique)-1] != level {
			unique = append(unique, level)
		}
	}
	previous := int64(0)
	pots := make([]Pot, 0, len(unique))
	for _, level := range unique {
		contributors := 0
		eligible := make([]string, 0)
		for _, player := range players {
			if player.Bet >= level {
				contributors++
			}
			if player.Bet >= level && !player.Folded {
				eligible = append(eligible, player.ID)
			}
		}
		amount := (level - previous) * int64(contributors)
		if amount > 0 {
			pots = append(pots, Pot{Amount: amount, Eligible: eligible})
		}
		previous = level
	}
	return pots
}

func NewHand(players []*Player, shuffle func([]Card)) (*Hand, error) {
	if len(players) < 2 || len(players) > 9 {
		return nil, fmt.Errorf("poker requires 2 to 9 players")
	}
	deck := makeDeck()
	shuffle(deck)
	for _, player := range players {
		for card := 0; card < 2; card++ {
			player.Cards = append(player.Cards, deck[0])
			deck = deck[1:]
		}
	}
	return &Hand{Players: players, Deck: deck, Current: 0, Phase: "preflop"}, nil
}

func (h *Hand) StartHand(smallBlind, bigBlind int64) error {
	if len(h.Players) < 2 || smallBlind <= 0 || bigBlind <= smallBlind {
		return fmt.Errorf("invalid blinds")
	}
	if err := h.PostBlind(0, smallBlind); err != nil {
		return err
	}
	if err := h.PostBlind(1, bigBlind); err != nil {
		return err
	}
	h.Current = 0
	return nil
}

func NewShuffledHand(players []*Player) (*Hand, error) {
	return NewHand(players, func(deck []Card) { rng.Shuffle(len(deck), func(i, j int) { deck[i], deck[j] = deck[j], deck[i] }) })
}

func (h *Hand) PostBlind(index int, amount int64) error {
	if index < 0 || index >= len(h.Players) || amount <= 0 {
		return fmt.Errorf("invalid blind")
	}
	return h.commit(index, amount)
}

func (h *Hand) Apply(index int, action Action, amount int64) error {
	if index != h.Current || index < 0 || index >= len(h.Players) {
		return fmt.Errorf("not this player's turn")
	}
	p := h.Players[index]
	if p.Folded || p.AllIn {
		return fmt.Errorf("player cannot act")
	}
	toCall := h.highestBet() - p.Bet
	switch action {
	case Fold:
		p.Folded = true
	case Check:
		if toCall != 0 {
			return fmt.Errorf("cannot check while facing a bet")
		}
	case Call:
		if toCall <= 0 {
			return fmt.Errorf("nothing to call")
		}
		if err := h.commit(index, toCall); err != nil {
			return err
		}
	case Bet, Raise:
		if amount <= toCall {
			return fmt.Errorf("bet must exceed call amount")
		}
		if err := h.commit(index, amount); err != nil {
			return err
		}
	case AllIn:
		if err := h.commit(index, p.Stack); err != nil {
			return err
		}
	default:
		return fmt.Errorf("invalid action")
	}
	h.RoundActions++
	h.nextTurn()
	return nil
}

func (h *Hand) commit(index int, amount int64) error {
	p := h.Players[index]
	if amount <= 0 || amount > p.Stack {
		return fmt.Errorf("insufficient stack")
	}
	p.Stack -= amount
	p.Bet += amount
	h.Pot += amount
	if p.Stack == 0 {
		p.AllIn = true
	}
	return nil
}
func (h *Hand) highestBet() int64 {
	var result int64
	for _, p := range h.Players {
		if p.Bet > result {
			result = p.Bet
		}
	}
	return result
}
func (h *Hand) nextTurn() {
	active := 0
	for _, player := range h.Players {
		if !player.Folded {
			active++
		}
	}
	if active <= 1 {
		h.Phase = "showdown"
		return
	}
	if h.RoundActions >= active && h.betsEqual() {
		h.advancePhase()
		return
	}
	for step := 1; step <= len(h.Players); step++ {
		next := (h.Current + step) % len(h.Players)
		if !h.Players[next].Folded && !h.Players[next].AllIn {
			h.Current = next
			return
		}
	}
	h.Phase = "showdown"
}

func (h *Hand) betsEqual() bool {
	var bet int64 = -1
	for _, player := range h.Players {
		if player.Folded {
			continue
		}
		if bet < 0 {
			bet = player.Bet
		} else if player.Bet != bet {
			return false
		}
	}
	return bet >= 0
}

func (h *Hand) advancePhase() {
	h.RoundActions = 0
	h.Current = 0
	for h.Current < len(h.Players) && (h.Players[h.Current].Folded || h.Players[h.Current].AllIn) {
		h.Current++
	}
	if h.Current >= len(h.Players) {
		h.Phase = "showdown"
		return
	}
	switch h.Phase {
	case "preflop":
		h.Phase = "flop"
		h.dealCommunity(3)
	case "flop":
		h.Phase = "turn"
		h.dealCommunity(1)
	case "turn":
		h.Phase = "river"
		h.dealCommunity(1)
	case "river":
		h.Phase = "showdown"
	}
}

func (h *Hand) dealCommunity(count int) {
	for i := 0; i < count && len(h.Deck) > 0; i++ {
		h.Community = append(h.Community, h.Deck[0])
		h.Deck = h.Deck[1:]
	}
}

func (h *Hand) Winner() (*Player, bool) {
	winners, ok := h.Winners()
	if !ok {
		return nil, false
	}
	return winners[0], true
}

func (h *Hand) Winners() ([]*Player, bool) {
	if h.Phase != "showdown" {
		return nil, false
	}
	best := -1
	winners := make([]*Player, 0)
	for _, player := range h.Players {
		if player.Folded {
			continue
		}
		rank := BestRank(append(append([]Card{}, player.Cards...), h.Community...))
		if rank > best {
			best, winners = rank, []*Player{player}
		} else if rank == best {
			winners = append(winners, player)
		}
	}
	return winners, len(winners) > 0
}

func (h *Hand) WinnersForPot(pot Pot) []*Player {
	best := -1
	winners := make([]*Player, 0)
	for _, player := range h.Players {
		eligible := false
		for _, id := range pot.Eligible {
			if id == player.ID {
				eligible = true
				break
			}
		}
		if !eligible {
			continue
		}
		rank := BestRank(append(append([]Card{}, player.Cards...), h.Community...))
		if rank > best {
			best, winners = rank, []*Player{player}
		} else if rank == best {
			winners = append(winners, player)
		}
	}
	return winners
}

func (h *Hand) Payouts() map[string]int64 {
	payouts := map[string]int64{}
	for _, pot := range CalculatePots(h.Players) {
		winners := h.WinnersForPot(pot)
		if len(winners) == 0 {
			continue
		}
		share := pot.Amount / int64(len(winners))
		remainder := pot.Amount % int64(len(winners))
		for index, winner := range winners {
			payouts[winner.ID] += share
			if int64(index) < remainder {
				payouts[winner.ID]++
			}
		}
	}
	return payouts
}

func BestRank(cards []Card) int {
	if len(cards) < 5 {
		return 0
	}
	best := 0
	for a := 0; a < len(cards)-4; a++ {
		for b := a + 1; b < len(cards)-3; b++ {
			for c := b + 1; c < len(cards)-2; c++ {
				for d := c + 1; d < len(cards)-1; d++ {
					for e := d + 1; e < len(cards); e++ {
						rank := RankFive([]Card{cards[a], cards[b], cards[c], cards[d], cards[e]})
						if rank > best {
							best = rank
						}
					}
				}
			}
		}
	}
	return best
}
func makeDeck() []Card {
	deck := make([]Card, 0, 52)
	for suit := 0; suit < 4; suit++ {
		for rank := 2; rank <= 14; rank++ {
			deck = append(deck, Card{Rank: rank, Suit: suit})
		}
	}
	return deck
}

// RankFive returns a comparable category score for a five-card hand.
func RankFive(cards []Card) int {
	if len(cards) != 5 {
		return 0
	}
	counts := map[int]int{}
	suits := map[int]int{}
	for _, c := range cards {
		counts[c.Rank]++
		suits[c.Suit]++
	}
	flush := len(suits) == 1
	ranks := make([]int, 0, len(counts))
	for rank := range counts {
		ranks = append(ranks, rank)
	}
	sort.Ints(ranks)
	straight := len(ranks) == 5 && ranks[4]-ranks[0] == 4
	if len(ranks) == 5 && ranks[4] == 14 && ranks[0] == 2 && ranks[1] == 3 && ranks[2] == 4 && ranks[3] == 5 {
		straight = true
	}
	if straight && flush {
		return 8
	}
	pairs, trips, quads := 0, 0, 0
	for _, count := range counts {
		if count == 4 {
			quads++
		}
		if count == 3 {
			trips++
		}
		if count == 2 {
			pairs++
		}
	}
	if quads > 0 {
		return 7
	}
	if trips > 0 && pairs > 0 {
		return 6
	}
	if flush {
		return 5
	}
	if straight {
		return 4
	}
	if trips > 0 {
		return 3
	}
	if pairs == 2 {
		return 2
	}
	if pairs == 1 {
		return 1
	}
	return 0
}
