package poker

import "testing"

func TestHandUsesInjectedDeterministicDeck(t *testing.T) {
	players := []*Player{{ID: "a", Stack: 1000}, {ID: "b", Stack: 1000}}
	hand, err := NewHand(players, func(deck []Card) {})
	if err != nil || len(hand.Deck) != 52 {
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
