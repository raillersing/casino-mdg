package belote

import (
	"fmt"
	"sort"

	"github.com/casino-mdg/game-engine/internal/rng"
)

// Card represents a playing card. Ranks: 7=7, 8=8, 9=9, 10=10, 11=Jack, 12=Queen, 13=King, 14=Ace.
type Card struct {
	Suit int `json:"suit"`
	Rank int `json:"rank"`
}

// Player represents a belote player.
type Player struct {
	ID   string `json:"id"`
	Team int    `json:"team"`
	Hand []Card `json:"hand"`
}

// Round represents a single round (donne) of Belote Classique.
// Phase progression: bidding → playing → finished.
type Round struct {
	Players      []*Player `json:"players"`
	Trump        int       `json:"trump"`
	Current      int       `json:"current"`
	LeadSuit     int       `json:"lead_suit"`
	Trick        []Card    `json:"trick"`
	TrickPlayers []int     `json:"trick_players"`
	TeamPoints   [2]int    `json:"team_points"`
	Deck         []Card    `json:"deck"`

	// Bidding state
	Phase         string  `json:"phase"`          // "bidding", "playing", "finished", "all_passed"
	BiddingRound  int     `json:"bidding_round"`  // 1 or 2
	Bidder        int     `json:"bidder"`         // index of player who took, -1 = nobody
	ProposedTrump int     `json:"proposed_trump"` // trump suit proposed from the deal
	Passed        [4]bool `json:"passed"`         // who has passed during current bidding round

	// Belote / Rebelote tracking (manual announcements)
	BeloteAnnounced  [4]bool `json:"belote_announced"`  // player announced belote
	RebeloteDeclared [4]bool `json:"rebelote_declared"` // player declared rebelote

	// Multi-round cumulative scores (persists across hands)
	CumulativeScores [2]int `json:"cumulative_scores"`
}

func (r *Round) Finished() bool {
	return r.Phase == "finished"
}

func (r *Round) RoundFinished() bool {
	if len(r.Trick) > 0 {
		return false
	}
	for _, player := range r.Players {
		if len(player.Hand) > 0 {
			return false
		}
	}
	return true
}

func (r *Round) WinningTeam() (int, bool) {
	if !r.Finished() || r.TeamPoints[0] == r.TeamPoints[1] {
		return -1, false
	}
	if r.TeamPoints[0] > r.TeamPoints[1] {
		return 0, true
	}
	return 1, true
}

// NewRound creates a new belote round.
// Distribution: 3 cards each, then 1 card turned up (proposed trump), then 2+3 cards each.
// For simplicity in digital play, we deal 8 cards each and the last card dealt is the proposed trump.
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
	// Deal all 32 cards: 8 to each player
	for i := 0; i < 32; i++ {
		players[i%4].Hand = append(players[i%4].Hand, deck[i])
	}
	for _, player := range players {
		sort.Slice(player.Hand, func(i, j int) bool {
			return player.Hand[i].Suit < player.Hand[j].Suit || (player.Hand[i].Suit == player.Hand[j].Suit && player.Hand[i].Rank < player.Hand[j].Rank)
		})
	}
	// The proposed trump is the suit of the last card dealt (deck[31])
	proposedTrump := deck[31].Suit
	return &Round{
		Players:       players,
		Trump:         -1,
		Current:       0,
		LeadSuit:      -1,
		Deck:          deck,
		Phase:         "bidding",
		BiddingRound:  1,
		Bidder:        -1,
		ProposedTrump: proposedTrump,
		Passed:        [4]bool{false, false, false, false},
	}, nil
}

func NewShuffledRound(ids []string) (*Round, error) {
	return NewRound(ids, func(deck []Card) { rng.Shuffle(len(deck), func(i, j int) { deck[i], deck[j] = deck[j], deck[i] }) })
}

// Take records that the current player takes the proposed trump (round 1).
// Phase switches to "playing" and the bidder becomes the first player.
func (r *Round) Take(player int) error {
	if r.Phase != "bidding" {
		return fmt.Errorf("not in bidding phase")
	}
	if player != r.Current {
		return fmt.Errorf("not this player's turn")
	}
	r.Bidder = player
	r.Trump = r.ProposedTrump
	r.Phase = "playing"
	r.Current = player // bidder starts the first trick
	return nil
}

// Pass records that the current player passes.
// If everyone passed in round 1, move to round 2.
// If everyone passed in round 2, set phase to "all_passed".
func (r *Round) Pass(player int) error {
	if r.Phase != "bidding" {
		return fmt.Errorf("not in bidding phase")
	}
	if player != r.Current {
		return fmt.Errorf("not this player's turn")
	}
	r.Passed[player] = true
	r.Current = (r.Current + 1) % 4
	// Check if all players passed in this round
	allPassed := true
	for _, p := range r.Passed {
		if !p {
			allPassed = false
			break
		}
	}
	if allPassed {
		if r.BiddingRound == 1 {
			// Move to second bidding round
			r.BiddingRound = 2
			r.Passed = [4]bool{false, false, false, false}
			r.Current = 0
		} else {
			// Everyone passed both rounds
			r.Phase = "all_passed"
		}
	}
	return nil
}

// ChooseTrump allows the current player to choose any suit as trump (round 2 only).
func (r *Round) ChooseTrump(player int, suit int) error {
	if r.Phase != "bidding" {
		return fmt.Errorf("not in bidding phase")
	}
	if r.BiddingRound != 2 {
		return fmt.Errorf("can only choose trump in second bidding round")
	}
	if player != r.Current {
		return fmt.Errorf("not this player's turn")
	}
	if suit < 0 || suit > 3 {
		return fmt.Errorf("invalid suit")
	}
	if suit == r.ProposedTrump {
		return fmt.Errorf("cannot choose the same suit as the proposed trump in second round")
	}
	r.Bidder = player
	r.Trump = suit
	r.Phase = "playing"
	r.Current = player // bidder starts the first trick
	return nil
}

// AnnounceBelote allows a player to announce they have Belote (King + Queen of trump).
func (r *Round) AnnounceBelote(player int) error {
	if r.Phase != "playing" {
		return fmt.Errorf("can only announce during play")
	}
	if r.Trump < 0 {
		return fmt.Errorf("no trump set")
	}
	if r.BeloteAnnounced[player] {
		return fmt.Errorf("belote already announced")
	}
	hasKing, hasQueen := false, false
	for _, card := range r.Players[player].Hand {
		if card.Suit == r.Trump {
			if card.Rank == 13 {
				hasKing = true
			}
			if card.Rank == 12 {
				hasQueen = true
			}
		}
	}
	if !hasKing || !hasQueen {
		return fmt.Errorf("player does not have belote")
	}
	r.BeloteAnnounced[player] = true
	r.TeamPoints[r.Players[player].Team] += 20
	return nil
}

// PlayCard plays a card from the player's hand.
// Returns the winner of the trick if the trick is complete, -1 otherwise.
func (r *Round) PlayCard(player int, card Card) (int, error) {
	if r.Phase != "playing" {
		return -1, fmt.Errorf("not in playing phase")
	}
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

	// --- OBLIGATIONS DE JEU (Belote Classique) ---
	if r.LeadSuit >= 0 && card.Suit != r.LeadSuit {
		// Player must follow suit if they can
		if hasSuit(hand, r.LeadSuit) {
			return -1, fmt.Errorf("player must follow suit")
		}
		// Player cannot follow — must cut if they have trump
		if r.Trump >= 0 && hasSuit(hand, r.Trump) && card.Suit != r.Trump {
			return -1, fmt.Errorf("player must cut with trump")
		}
	}
	// If playing trump, must overcut (monter à l'atout) if possible
	if r.Trump >= 0 && card.Suit == r.Trump && r.LeadSuit == r.Trump {
		trumpPlayedInTrick := false
		highestTrumpInTrick := Card{}
		for _, trickCard := range r.Trick {
			if trickCard.Suit == r.Trump {
				trumpPlayedInTrick = true
				if cardStrength(trickCard, true) > cardStrength(highestTrumpInTrick, true) {
					highestTrumpInTrick = trickCard
				}
			}
		}
		if trumpPlayedInTrick && cardStrength(card, true) < cardStrength(highestTrumpInTrick, true) {
			// Check if player has a higher trump
			for _, c := range hand {
				if c != card && c.Suit == r.Trump && cardStrength(c, true) > cardStrength(highestTrumpInTrick, true) {
					return -1, fmt.Errorf("player must overcut with a higher trump")
				}
			}
		}
	}
	// If trump is led and player has trump, they must play trump
	if r.Trump >= 0 && r.LeadSuit == r.Trump && card.Suit != r.Trump {
		if hasSuit(hand, r.Trump) {
			return -1, fmt.Errorf("player must play trump when trump is led")
		}
	}

	// Check for Rebelote (second of King/Queen of trump played)
	if r.Trump >= 0 && card.Suit == r.Trump && r.BeloteAnnounced[player] && !r.RebeloteDeclared[player] {
		if card.Rank == 13 || card.Rank == 12 {
			// Check if this is the second royal of trump being played
			hasOtherRoyal := false
			for _, c := range hand {
				if c != card && c.Suit == r.Trump && (c.Rank == 13 || c.Rank == 12) {
					hasOtherRoyal = true
					break
				}
			}
			if !hasOtherRoyal {
				// This is the second royal being played = Rebelote
				r.RebeloteDeclared[player] = true
				r.TeamPoints[r.Players[player].Team] += 20
			}
		}
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
	// "10 de der" bonus for the last trick
	isLastTrick := true
	for _, p := range r.Players {
		if len(p.Hand) > 0 {
			isLastTrick = false
			break
		}
	}
	if isLastTrick {
		points += 10
	}
	r.TeamPoints[r.Players[winner].Team] += points
	r.Trick = nil
	r.TrickPlayers = nil
	r.LeadSuit = -1
	r.Current = winner
	// Check if round is finished
	if r.RoundFinished() {
		r.Phase = "finished"
		r.addEndOfRoundBonuses()
	}
	return winner, nil
}

// addEndOfRoundBonuses applies the "chute" rule and capot bonus.
func (r *Round) addEndOfRoundBonuses() {
	if r.Bidder < 0 {
		return
	}
	bidderTeam := r.Players[r.Bidder].Team
	opposingTeam := 1 - bidderTeam

	// In Belote Classique, the bidder must make strictly more points than the opponent.
	// Total = 162 points. Threshold = 82 (must make >= 82 to succeed).
	if r.TeamPoints[bidderTeam] < 82 {
		// Chute : bidder's team loses, opponent gets 162 points
		r.TeamPoints[bidderTeam] = 0
		r.TeamPoints[opposingTeam] = 162
	} else if r.TeamPoints[bidderTeam] == 81 && r.TeamPoints[opposingTeam] == 81 {
		// Litige (81-81, should be rare) : points go to next round
		// For simplicity, treat as bidder failure
		r.TeamPoints[bidderTeam] = 0
		r.TeamPoints[opposingTeam] = 162
	}

	// Apply capot bonus if one team won all tricks (all 8 tricks = 162 points)
	// In standard rules, capot is only valid in coinche. In classic belote,
	// winning all tricks means you got all 162 points, which is already the max.
}

// HasBelote checks if a player holds both King and Queen of trump.
func (r *Round) HasBelote(player int) bool {
	if r.Trump < 0 || player < 0 || player >= len(r.Players) {
		return false
	}
	hasKing, hasQueen := false, false
	for _, card := range r.Players[player].Hand {
		if card.Suit == r.Trump {
			if card.Rank == 13 {
				hasKing = true
			}
			if card.Rank == 12 {
				hasQueen = true
			}
		}
	}
	return hasKing && hasQueen
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
func hasCard(hand []Card, target Card) bool {
	for _, card := range hand {
		if card == target {
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
