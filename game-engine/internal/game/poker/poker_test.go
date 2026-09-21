package poker

import (
	"fmt"
	"testing"
)

func TestHandUsesInjectedDeterministicDeck(t *testing.T) {
	players := []*Player{{ID: "a", Stack: 1000}, {ID: "b", Stack: 1000}}
	hand, err := NewHand(players, func(deck []Card) {})
	if err != nil || len(hand.Deck) != 48 {
		t.Fatalf("hand=%+v err=%v", hand, err)
	}
	if err := hand.PostBlind(1, 50); err != nil {
		t.Fatal(err)
	}
	if err := hand.Apply(0, Call, 50); err != nil {
		t.Fatal(err)
	}
	if hand.Pot != 100 || players[0].Stack != 950 {
		t.Fatalf("pot=%d stack=%d", hand.Pot, players[0].Stack)
	}
}

func TestServerRejectsInvalidTurnAndActions(t *testing.T) {
	hand, _ := NewHand([]*Player{{ID: "a", Stack: 100}, {ID: "b", Stack: 100}}, func(deck []Card) {})
	if err := hand.Apply(1, Check, 0); err == nil {
		t.Fatal("out-of-turn action accepted")
	}
	if err := hand.Apply(0, Check, 0); err != nil {
		t.Fatal(err)
	}
	if err := hand.Apply(1, Bet, 0); err == nil {
		t.Fatal("invalid bet accepted")
	}
}

func TestRankFiveCategories(t *testing.T) {
	if RankFive([]Card{{14, 0}, {13, 0}, {12, 0}, {11, 0}, {10, 0}}) != 8 {
		t.Fatal("royal flush was not ranked")
	}
	if RankFive([]Card{{2, 0}, {2, 1}, {7, 2}, {9, 3}, {12, 0}}) != 1 {
		t.Fatal("pair was not ranked")
	}
}

func TestHandAdvancesThroughCommunityPhases(t *testing.T) {
	hand, err := NewHand([]*Player{{ID: "a", Stack: 1000}, {ID: "b", Stack: 1000}}, func(deck []Card) {})
	if err != nil {
		t.Fatal(err)
	}
	for _, action := range []struct {
		index int
		kind  Action
	}{{0, Check}, {1, Check}, {0, Check}, {1, Check}, {0, Check}, {1, Check}, {0, Check}, {1, Check}} {
		if err := hand.Apply(action.index, action.kind, 0); err != nil {
			t.Fatal(err)
		}
	}
	if hand.Phase != "showdown" || len(hand.Community) != 5 {
		t.Fatalf("phase=%s community=%d", hand.Phase, len(hand.Community))
	}
}

func TestHandDealsPrivateCardsAndFindsBestRank(t *testing.T) {
	hand, err := NewHand([]*Player{{ID: "a", Stack: 1000}, {ID: "b", Stack: 1000}}, func(deck []Card) {})
	if err != nil || len(hand.Players[0].Cards) != 2 || len(hand.Players[1].Cards) != 2 {
		t.Fatalf("hand=%+v err=%v", hand, err)
	}
	rank := BestRank([]Card{{14, 0}, {14, 1}, {2, 0}, {2, 1}, {2, 2}, {9, 3}, {7, 1}})
	if rank != 6 {
		t.Fatalf("expected full house rank, got %d", rank)
	}
}

func TestShowdownReturnsTiedWinners(t *testing.T) {
	hand, _ := NewHand([]*Player{{ID: "a", Stack: 1000}, {ID: "b", Stack: 1000}}, func([]Card) {})
	hand.Phase = "showdown"
	hand.Community = []Card{{14, 0}, {13, 0}, {12, 0}, {11, 0}, {10, 0}}
	hand.Players[0].Cards = []Card{{2, 1}, {3, 1}}
	hand.Players[1].Cards = []Card{{4, 1}, {5, 1}}
	winners, ok := hand.Winners()
	if !ok || len(winners) != 2 {
		t.Fatalf("winners=%v ok=%v", winners, ok)
	}
}

func TestShowdownUsesKickersWhenCategoryMatches(t *testing.T) {
	hand, _ := NewHand([]*Player{{ID: "a", Stack: 1000}, {ID: "b", Stack: 1000}}, func([]Card) {})
	hand.Phase = "showdown"
	hand.Community = []Card{{14, 0}, {7, 1}, {4, 2}, {3, 0}, {2, 1}}
	hand.Players[0].Cards = []Card{{14, 1}, {13, 2}}
	hand.Players[1].Cards = []Card{{14, 2}, {12, 3}}
	winners, ok := hand.Winners()
	if !ok || len(winners) != 1 || winners[0].ID != "a" {
		t.Fatalf("winners=%v ok=%v", winners, ok)
	}
}

func TestAllInRunoutDealsRemainingCommunityCards(t *testing.T) {
	hand, err := NewHand([]*Player{{ID: "a", Stack: 100}, {ID: "b", Stack: 100}}, func([]Card) {})
	if err != nil {
		t.Fatal(err)
	}
	if err := hand.StartHand(10, 20); err != nil {
		t.Fatal(err)
	}
	if err := hand.Apply(0, AllIn, 0); err != nil {
		t.Fatal(err)
	}
	if err := hand.Apply(1, Call, 0); err != nil {
		t.Fatal(err)
	}
	if hand.Phase != "showdown" || len(hand.Community) != 5 || hand.FinishReason != "showdown" {
		t.Fatalf("phase=%s community=%d reason=%s", hand.Phase, len(hand.Community), hand.FinishReason)
	}
}

func TestShortCallIsAllowedAndRunsOut(t *testing.T) {
	hand, err := NewHand([]*Player{{ID: "a", Stack: 50}, {ID: "b", Stack: 100}}, func([]Card) {})
	if err != nil {
		t.Fatal(err)
	}
	if err := hand.Apply(0, Check, 0); err != nil {
		t.Fatal(err)
	}
	if err := hand.Apply(1, Bet, 80); err != nil {
		t.Fatal(err)
	}
	if err := hand.Apply(0, Call, 0); err != nil {
		t.Fatal(err)
	}
	if !hand.Players[0].AllIn || hand.Players[0].TotalBet != 50 || len(hand.Community) != 5 {
		t.Fatalf("player=%+v community=%d phase=%s", hand.Players[0], len(hand.Community), hand.Phase)
	}
}

func TestCalculatePotsSeparatesAllInLevelsAndFoldedPlayers(t *testing.T) {
	pots := CalculatePots([]*Player{{ID: "a", Bet: 100}, {ID: "b", Bet: 200}, {ID: "c", Bet: 300, Folded: true}})
	if len(pots) != 3 {
		t.Fatalf("pots=%v", pots)
	}
	if pots[0].Amount != 300 || len(pots[0].Eligible) != 2 {
		t.Fatalf("main pot=%v", pots[0])
	}
	if pots[1].Amount != 200 || len(pots[1].Eligible) != 1 || pots[1].Eligible[0] != "b" {
		t.Fatalf("side pot=%v", pots[1])
	}
	if pots[2].Amount != 100 || len(pots[2].Eligible) != 0 {
		t.Fatalf("folded side pot=%v", pots[2])
	}
}

func TestPayoutsUseOnlyEligiblePlayersForEachPot(t *testing.T) {
	hand, _ := NewHand([]*Player{{ID: "a", Stack: 0, Bet: 100}, {ID: "b", Stack: 0, Bet: 200}, {ID: "c", Stack: 0, Bet: 300, Folded: true}}, func([]Card) {})
	hand.Phase = "showdown"
	hand.Community = []Card{{14, 0}, {13, 0}, {12, 0}, {11, 0}, {10, 0}}
	hand.Players[0].Cards = []Card{{2, 1}, {3, 1}}
	hand.Players[1].Cards = []Card{{4, 1}, {5, 1}}
	payouts := hand.Payouts()
	if payouts["a"] != 150 || payouts["b"] != 350 || len(payouts) != 2 {
		t.Fatalf("payouts=%v", payouts)
	}
}

func TestPokerFullRing9PlayersDealingAndPositions(t *testing.T) {
	players := make([]*Player, 9)
	for i := 0; i < 9; i++ {
		players[i] = &Player{ID: fmt.Sprintf("p%d", i), Stack: 1000}
	}
	hand, err := NewHand(players, func(deck []Card) {})
	if err != nil {
		t.Fatalf("failed to create 9-player hand: %v", err)
	}
	// Verify all 9 players received 2 private cards each
	for i, p := range hand.Players {
		if len(p.Cards) != 2 {
			t.Fatalf("player %d has %d cards, expected 2", i, len(p.Cards))
		}
	}
	// Start hand with SB=10, BB=20
	if err := hand.StartHand(10, 20); err != nil {
		t.Fatalf("failed to start hand: %v", err)
	}
	// For button = 0: SB should be 1, BB should be 2
	sb, bb := hand.BlindSeatsForPresentation()
	if sb != 1 || bb != 2 {
		t.Fatalf("expected sb=1, bb=2, got sb=%d, bb=%d", sb, bb)
	}
	// Preflop starts left of BB: seat 3 (UTG)
	if hand.Current != 3 {
		t.Fatalf("expected UTG seat 3 to act first preflop, got %d", hand.Current)
	}
	// Players 3..8, 0, 1 call 20
	for seat := 3; seat < 9; seat++ {
		if hand.Current != seat {
			t.Fatalf("expected seat %d, got %d", seat, hand.Current)
		}
		if err := hand.Apply(seat, Call, 0); err != nil {
			t.Fatalf("seat %d call failed: %v", seat, err)
		}
	}
	// Button (seat 0) calls 20
	if hand.Current != 0 {
		t.Fatalf("expected button seat 0, got %d", hand.Current)
	}
	if err := hand.Apply(0, Call, 0); err != nil {
		t.Fatalf("button call failed: %v", err)
	}
	// SB (seat 1) completes the blind
	if hand.Current != 1 {
		t.Fatalf("expected sb seat 1, got %d", hand.Current)
	}
	if err := hand.Apply(1, Call, 0); err != nil {
		t.Fatalf("sb call failed: %v", err)
	}
	// BB (seat 2) checks option
	if hand.Current != 2 {
		t.Fatalf("expected bb seat 2, got %d", hand.Current)
	}
	if err := hand.Apply(2, Check, 0); err != nil {
		t.Fatalf("bb check failed: %v", err)
	}
	// Verify transition to flop
	if hand.Phase != "flop" || len(hand.Community) != 3 {
		t.Fatalf("expected flop with 3 cards, got phase=%s cards=%d", hand.Phase, len(hand.Community))
	}
	// Postflop action starts left of button (seat 1, SB)
	if hand.Current != 1 {
		t.Fatalf("expected postflop action to start at seat 1 (SB), got %d", hand.Current)
	}
}

func TestPokerMultipleSidePots9PlayersAllIn(t *testing.T) {
	// 9 players all-in with increasing stacks:
	// p0: 10, p1: 20, p2: 30, p3: 40, p4: 50, p5: 60, p6: 70, p7: 80, p8: 90
	players := make([]*Player, 9)
	for i := 0; i < 9; i++ {
		bet := int64((i + 1) * 10)
		players[i] = &Player{
			ID:       fmt.Sprintf("p%d", i),
			Stack:    0,
			Bet:      bet,
			TotalBet: bet,
			AllIn:    true,
		}
	}
	pots := CalculatePots(players)
	if len(pots) != 9 {
		t.Fatalf("expected 9 side pots, got %d", len(pots))
	}
	// Pot 0: main pot (10 * 9 = 90 chips, eligible: p0..p8)
	if pots[0].Amount != 90 || len(pots[0].Eligible) != 9 {
		t.Fatalf("pot 0: amount=%d (expected 90), eligible=%d (expected 9)", pots[0].Amount, len(pots[0].Eligible))
	}
	// Pot 8: highest side pot (10 * 1 = 10 chips, eligible: p8 only)
	if pots[8].Amount != 10 || len(pots[8].Eligible) != 1 || pots[8].Eligible[0] != "p8" {
		t.Fatalf("pot 8: amount=%d (expected 10), eligible=%v (expected [p8])", pots[8].Amount, pots[8].Eligible)
	}
	// Total across all pots must equal 10+20+30+40+50+60+70+80+90 = 450
	totalPots := int64(0)
	for _, p := range pots {
		totalPots += p.Amount
	}
	if totalPots != 450 {
		t.Fatalf("expected total pots 450, got %d", totalPots)
	}
}
