package poker

import (
	"fmt"
	"sort"
	"time"

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
	ID       string `json:"id"`
	Stack    int64  `json:"stack"`
	Bet      int64  `json:"bet"`
	TotalBet int64  `json:"total_bet"`
	Cards    []Card `json:"cards"`
	Folded   bool   `json:"folded"`
	AllIn    bool   `json:"all_in"`
}
type Hand struct {
	Players         []*Player `json:"players"`
	Community       []Card    `json:"community"`
	Pot             int64     `json:"pot"`
	Current         int       `json:"current"`
	Phase           string    `json:"phase"`
	Deck            []Card    `json:"deck"`
	RoundActions    int       `json:"round_actions"`
	Button          int       `json:"button"`
	SmallBlind      int64     `json:"small_blind"`
	BigBlind        int64     `json:"big_blind"`
	Started         bool      `json:"started"`
	LastRaise       int64     `json:"last_raise"`
	FinishReason    string    `json:"finish_reason,omitempty"`
	SessionFinished bool      `json:"session_finished,omitempty"`
	ActionDeadline  time.Time `json:"action_deadline,omitempty"`
}

type Pot struct {
	Amount   int64    `json:"amount"`
	Eligible []string `json:"eligible"`
}

func CalculatePots(players []*Player) []Pot {
	levels := make([]int64, 0)
	for _, player := range players {
		contribution := player.TotalBet
		if contribution == 0 {
			contribution = player.Bet
		}
		if contribution > 0 {
			levels = append(levels, contribution)
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
			contribution := player.TotalBet
			if contribution == 0 {
				contribution = player.Bet
			}
			if contribution >= level {
				contributors++
			}
			if contribution >= level && !player.Folded {
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
	return &Hand{Players: players, Deck: deck, Current: 0, Button: 0, Phase: "preflop"}, nil
}

func (h *Hand) StartHand(smallBlind, bigBlind int64) error {
	if len(h.Players) < 2 || smallBlind <= 0 || bigBlind <= smallBlind {
		return fmt.Errorf("invalid blinds")
	}
	h.SmallBlind, h.BigBlind = smallBlind, bigBlind
	h.LastRaise = bigBlind
	h.ActionDeadline = time.Time{}
	h.Started = true
	small, big := h.blindSeats()
	if err := h.PostBlind(small, smallBlind); err != nil {
		return err
	}
	if err := h.PostBlind(big, bigBlind); err != nil {
		return err
	}
	// Preflop action starts immediately left of the big blind. In heads-up
	// play this is the button/small blind; postflop advancePhase starts left
	// of the button as required by Hold'em rules.
	h.Current = h.nextActive((big + 1) % len(h.Players))
	return nil
}

func (h *Hand) SetActionDeadline(deadline time.Time) { h.ActionDeadline = deadline }

func (h *Hand) blindSeats() (small, big int) {
	if len(h.Players) == 2 {
		return h.Button, (h.Button + 1) % len(h.Players)
	}
	return (h.Button + 1) % len(h.Players), (h.Button + 2) % len(h.Players)
}

// BlindSeatsForPresentation exposes the already-calculated blind positions to
// the websocket presentation layer without duplicating seat rules there.
func (h *Hand) BlindSeatsForPresentation() (small, big int) {
	return h.blindSeats()
}

func NewShuffledHand(players []*Player) (*Hand, error) {
	return NewHand(players, func(deck []Card) { rng.Shuffle(len(deck), func(i, j int) { deck[i], deck[j] = deck[j], deck[i] }) })
}

func (h *Hand) PostBlind(index int, amount int64) error {
	if index < 0 || index >= len(h.Players) || amount <= 0 {
		return fmt.Errorf("invalid blind")
	}
	return h.commit(index, amount, true)
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
		// A short stack is allowed to call all-in for the chips it has left.
		if err := h.commit(index, toCall, true); err != nil {
			return err
		}
	case Bet, Raise:
		if amount <= 0 {
			return fmt.Errorf("bet amount must be positive")
		}
		if amount > p.Stack {
			return fmt.Errorf("insufficient stack")
		}
		minimum := h.minimumRaiseAmount(toCall)
		if amount < minimum && amount != p.Stack {
			return fmt.Errorf("raise is below the minimum")
		}
		previousHighest := h.highestBet()
		if err := h.commit(index, amount, false); err != nil {
			return err
		}
		newHighest := h.highestBet()
		if newHighest > previousHighest {
			h.LastRaise = newHighest - previousHighest
		}
	case AllIn:
		if err := h.commit(index, p.Stack, false); err != nil {
			return err
		}
	default:
		return fmt.Errorf("invalid action")
	}
	h.RoundActions++
	h.nextTurn()
	return nil
}

func (h *Hand) commit(index int, amount int64, allowPartial bool) error {
	p := h.Players[index]
	if amount <= 0 {
		return fmt.Errorf("insufficient stack")
	}
	if amount > p.Stack {
		if !allowPartial {
			return fmt.Errorf("insufficient stack")
		}
		amount = p.Stack
	}
	p.Stack -= amount
	p.Bet += amount
	p.TotalBet += amount
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

// HighestBet exposes the amount that is still actionable this street. Bets
// from folded or all-in players remain in TotalBet and pots, but cannot force
// another live player to contribute more.
func (h *Hand) HighestBet() int64 { return h.highestBet() }

func (h *Hand) minimumRaiseAmount(toCall int64) int64 {
	if toCall == 0 {
		if h.BigBlind > 0 {
			return h.BigBlind
		}
		return 1
	}
	lastRaise := h.LastRaise
	if lastRaise <= 0 {
		lastRaise = h.BigBlind
	}
	return toCall + lastRaise
}

// MinimumRaiseTo exposes the legal amount of additional chips for a player to
// put in when opening or raising. It is used by presentation layers to render
// the same limits enforced by the engine.
func (h *Hand) MinimumRaiseTo(index int) int64 {
	if index < 0 || index >= len(h.Players) {
		return 0
	}
	return h.minimumRaiseAmount(h.highestBet() - h.Players[index].Bet)
}

func (h *Hand) nextTurn() {
	active := 0
	actionable := 0
	for _, player := range h.Players {
		if !player.Folded {
			active++
			if !player.AllIn {
				actionable++
			}
		}
	}
	if active <= 1 {
		h.Phase = "showdown"
		h.FinishReason = "uncontested"
		return
	}
	// A single actionable player may still need to call an unmatched all-in.
	// Only when nobody can act can the remaining board be dealt automatically.
	if actionable == 0 {
		h.runoutToShowdown()
		return
	}
	if actionable == 1 && h.betsEqual() {
		h.runoutToShowdown()
		return
	}
	if h.RoundActions >= actionable && h.betsEqual() {
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
	if h.nextActive(h.Current+1) < 0 {
		h.runoutToShowdown()
	}
}

func (h *Hand) betsEqual() bool {
	highest := h.highestBet()
	for _, player := range h.Players {
		if player.Folded || player.AllIn {
			continue
		}
		if player.Bet != highest {
			return false
		}
	}
	return true
}

func (h *Hand) advancePhase() {
	h.RoundActions = 0
	h.resetStreetBets()
	start := 0
	if h.Started {
		start = (h.Button + 1) % len(h.Players)
	}
	h.Current = h.nextActive(start)
	if h.Current < 0 {
		h.runoutToShowdown()
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
		h.FinishReason = "showdown"
	}
}

func (h *Hand) runoutToShowdown() {
	for h.Phase != "showdown" {
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
		default:
			h.Phase = "showdown"
		}
	}
	h.FinishReason = "showdown"
}

func (h *Hand) nextActive(start int) int {
	for step := 0; step < len(h.Players); step++ {
		index := (start + step) % len(h.Players)
		if !h.Players[index].Folded && !h.Players[index].AllIn {
			return index
		}
	}
	return -1
}

func (h *Hand) resetStreetBets() {
	for _, player := range h.Players {
		player.Bet = 0
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
	var best HandValue
	hasBest := false
	winners := make([]*Player, 0)
	for _, player := range h.Players {
		if player.Folded {
			continue
		}
		rank, _ := BestHandValue(append(append([]Card{}, player.Cards...), h.Community...))
		comparison := compareHandValue(rank, best)
		if !hasBest || comparison > 0 {
			best, winners, hasBest = rank, []*Player{player}, true
		} else if comparison == 0 {
			winners = append(winners, player)
		}
	}
	return winners, len(winners) > 0
}

func (h *Hand) WinnersForPot(pot Pot) []*Player {
	var best HandValue
	hasBest := false
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
		rank, _ := BestHandValue(append(append([]Card{}, player.Cards...), h.Community...))
		comparison := compareHandValue(rank, best)
		if !hasBest || comparison > 0 {
			best, winners, hasBest = rank, []*Player{player}, true
		} else if comparison == 0 {
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
	value, _ := BestHandValue(cards)
	return value.Category
}

// HandValue contains the category and all tie-break cards in descending
// comparison order. It is deliberately represented separately from the old
// category-only BestRank API so existing callers remain source-compatible.
type HandValue struct {
	Category int
	Tiebreak []int
}

func compareHandValue(left, right HandValue) int {
	if left.Category != right.Category {
		if left.Category > right.Category {
			return 1
		}
		return -1
	}
	for index := 0; index < len(left.Tiebreak) || index < len(right.Tiebreak); index++ {
		var l, r int
		if index < len(left.Tiebreak) {
			l = left.Tiebreak[index]
		}
		if index < len(right.Tiebreak) {
			r = right.Tiebreak[index]
		}
		if l != r {
			if l > r {
				return 1
			}
			return -1
		}
	}
	return 0
}

// BestHandValue evaluates the best five-card hand and returns the exact cards
// used. Texas Hold'em comparisons must include kickers, not only categories.
func BestHandValue(cards []Card) (HandValue, []Card) {
	if len(cards) < 5 {
		return HandValue{}, nil
	}
	var best HandValue
	var bestCards []Card
	for a := 0; a < len(cards)-4; a++ {
		for b := a + 1; b < len(cards)-3; b++ {
			for c := b + 1; c < len(cards)-2; c++ {
				for d := c + 1; d < len(cards)-1; d++ {
					for e := d + 1; e < len(cards); e++ {
						candidateCards := []Card{cards[a], cards[b], cards[c], cards[d], cards[e]}
						candidate := rankFiveValue(candidateCards)
						if bestCards == nil || compareHandValue(candidate, best) > 0 {
							best, bestCards = candidate, candidateCards
						}
					}
				}
			}
		}
	}
	return best, bestCards
}

// HandRankName returns the human-readable category represented by the
// comparable category score used by the evaluator.
func HandRankName(cards []Card) string {
	switch BestRank(cards) {
	case 8:
		return "Quinte flush"
	case 7:
		return "Carré"
	case 6:
		return "Full"
	case 5:
		return "Couleur"
	case 4:
		return "Quinte"
	case 3:
		return "Brelan"
	case 2:
		return "Double paire"
	case 1:
		return "Paire"
	default:
		return "Carte haute"
	}
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

// RankFive returns the category score for a five-card hand. Use
// BestHandValue when comparing complete Hold'em hands because kickers matter.
func RankFive(cards []Card) int {
	return rankFiveValue(cards).Category
}

func rankFiveValue(cards []Card) HandValue {
	if len(cards) != 5 {
		return HandValue{}
	}
	counts := map[int]int{}
	suits := map[int]int{}
	for _, c := range cards {
		counts[c.Rank]++
		suits[c.Suit]++
	}
	flush := len(suits) == 1
	ranks := sortedRanks(counts)
	straight, straightHigh := straightHighCard(ranks)
	if straight && flush {
		return HandValue{Category: 8, Tiebreak: []int{straightHigh}}
	}
	groups := make(map[int][]int)
	for rank, count := range counts {
		groups[count] = append(groups[count], rank)
	}
	for _, group := range groups {
		sort.Sort(sort.Reverse(sort.IntSlice(group)))
	}
	if quads := groups[4]; len(quads) > 0 {
		kicker := highestExcluding(ranks, quads[0])
		return HandValue{Category: 7, Tiebreak: []int{quads[0], kicker}}
	}
	if trips := groups[3]; len(trips) > 0 {
		pairs := append([]int(nil), groups[2]...)
		if len(trips) > 1 {
			pairs = append(pairs, trips[1])
		}
		if len(pairs) > 0 {
			sort.Sort(sort.Reverse(sort.IntSlice(pairs)))
			return HandValue{Category: 6, Tiebreak: []int{trips[0], pairs[0]}}
		}
	}
	if flush {
		return HandValue{Category: 5, Tiebreak: descendingRanks(ranks)}
	}
	if straight {
		return HandValue{Category: 4, Tiebreak: []int{straightHigh}}
	}
	if trips := groups[3]; len(trips) > 0 {
		kickers := descendingRanksExcluding(ranks, trips[0])
		return HandValue{Category: 3, Tiebreak: append([]int{trips[0]}, kickers...)}
	}
	if pairs := groups[2]; len(pairs) >= 2 {
		sort.Sort(sort.Reverse(sort.IntSlice(pairs)))
		kicker := highestExcluding(ranks, pairs[0], pairs[1])
		return HandValue{Category: 2, Tiebreak: []int{pairs[0], pairs[1], kicker}}
	}
	if pairs := groups[2]; len(pairs) == 1 {
		kickers := descendingRanksExcluding(ranks, pairs[0])
		return HandValue{Category: 1, Tiebreak: append([]int{pairs[0]}, kickers...)}
	}
	return HandValue{Category: 0, Tiebreak: descendingRanks(ranks)}
}

func sortedRanks(counts map[int]int) []int {
	ranks := make([]int, 0, len(counts))
	for rank := range counts {
		ranks = append(ranks, rank)
	}
	sort.Ints(ranks)
	return ranks
}

func straightHighCard(ranks []int) (bool, int) {
	if len(ranks) != 5 {
		return false, 0
	}
	if ranks[4]-ranks[0] == 4 {
		return true, ranks[4]
	}
	if ranks[0] == 2 && ranks[1] == 3 && ranks[2] == 4 && ranks[3] == 5 && ranks[4] == 14 {
		return true, 5
	}
	return false, 0
}

func descendingRanks(ranks []int) []int {
	result := append([]int(nil), ranks...)
	sort.Sort(sort.Reverse(sort.IntSlice(result)))
	return result
}

func descendingRanksExcluding(ranks []int, excluded ...int) []int {
	blocked := map[int]bool{}
	for _, rank := range excluded {
		blocked[rank] = true
	}
	result := make([]int, 0, len(ranks))
	for _, rank := range ranks {
		if !blocked[rank] {
			result = append(result, rank)
		}
	}
	return descendingRanks(result)
}

func highestExcluding(ranks []int, excluded ...int) int {
	values := descendingRanksExcluding(ranks, excluded...)
	if len(values) == 0 {
		return 0
	}
	return values[0]
}
