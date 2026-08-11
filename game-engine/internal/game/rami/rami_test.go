package rami

import "testing"

func TestGameDealsSevenCardsAndAdvancesAfterDiscard(t *testing.T) {
	game, err := NewGame([]string{"a", "b", "c"}, func(deck []Card) {})
	if err != nil {
		t.Fatal(err)
	}
	for _, player := range game.Players {
		if len(player.Hand) != 7 {
			t.Fatalf("hand size=%d", len(player.Hand))
		}
	}
	if _, err := game.Draw(); err != nil {
		t.Fatal(err)
	}
	if err := game.DiscardCard(game.Players[0].Hand[0]); err != nil {
		t.Fatal(err)
	}
	if game.Current != 1 || len(game.Players[0].Hand) != 7 {
		t.Fatalf("current=%d hand=%d", game.Current, len(game.Players[0].Hand))
	}
}

func TestValidMelds(t *testing.T) {
	if !ValidMeld([]Card{{0, 3}, {0, 4}, {0, 5}}) {
		t.Fatal("sequence rejected")
	}
	if !ValidMeld([]Card{{0, 8}, {1, 8}, {2, 8}}) {
		t.Fatal("set rejected")
	}
	if ValidMeld([]Card{{0, 3}, {1, 4}, {0, 5}}) {
		t.Fatal("mixed sequence accepted")
	}
}
