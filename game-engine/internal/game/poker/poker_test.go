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
