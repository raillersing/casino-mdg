package belote

import "testing"

func TestRoundDealsEightCardsAndAssignsTeams(t *testing.T) {
	round, err := NewRound([]string{"a", "b", "c", "d"}, func(deck []Card) {})
	if err != nil {
		t.Fatal(err)
	}
	for i, player := range round.Players {
		if len(player.Hand) != 8 || player.Team != i%2 {
			t.Fatalf("player %d: %+v", i, player)
		}
	}
}

func TestPlayersMustFollowSuit(t *testing.T) {
	round, _ := NewRound([]string{"a", "b", "c", "d"}, func(deck []Card) {})
	round.Phase = "playing"
	round.Trump = 0
	round.Players[0].Hand = []Card{{Suit: 0, Rank: 7}}
	round.Players[1].Hand = []Card{{Suit: 0, Rank: 8}, {Suit: 1, Rank: 14}}
	if _, err := round.PlayCard(0, Card{Suit: 0, Rank: 7}); err != nil {
		t.Fatal(err)
	}
	if _, err := round.PlayCard(1, Card{Suit: 1, Rank: 14}); err == nil {
		t.Fatal("off-suit card accepted")
	}
}

func TestTrumpJackBeatsNonTrumpAce(t *testing.T) {
	round, _ := NewRound([]string{"a", "b", "c", "d"}, func(deck []Card) {})
	round.Phase = "playing"
	round.Trump = 1
	round.Players[0].Hand = []Card{{Suit: 0, Rank: 10}}
	round.Players[1].Hand = []Card{{Suit: 0, Rank: 14}}
	round.Players[2].Hand = []Card{{Suit: 1, Rank: 11}}
	round.Players[3].Hand = []Card{{Suit: 0, Rank: 7}}
	for i, card := range []Card{{0, 10}, {0, 14}, {1, 11}, {0, 7}} {
		winner, err := round.PlayCard(i, card)
		if err != nil {
			t.Fatal(err)
		}
		if i == 3 && winner != 2 {
			t.Fatalf("winner=%d", winner)
		}
	}
}

func TestRoundDetectsFinishedTeam(t *testing.T) {
	round, _ := NewRound([]string{"a", "b", "c", "d"}, func([]Card) {})
	round.Phase = "finished"
	for _, player := range round.Players {
		player.Hand = nil
	}
	round.TeamPoints = [2]int{61, 59}
	team, ok := round.WinningTeam()
	if !ok || team != 0 || !round.Finished() {
		t.Fatalf("team=%d ok=%v", team, ok)
	}
}
