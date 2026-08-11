package poker

import "testing"

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
