package room

import (
	"fmt"

	"github.com/casino-mdg/game-engine/internal/config"
	"github.com/casino-mdg/game-engine/internal/game/belote"
	"github.com/casino-mdg/game-engine/internal/game/poker"
	"github.com/casino-mdg/game-engine/internal/game/rami"
	"testing"
	"time"
)

func TestActionsAreAuthoritativeAndMonotone(t *testing.T) {
	m := NewManager(&config.Config{GracePeriod: 30, Deterministic: true})
	table := m.CreateTable("poker")
	if _, err := m.JoinPlayer(table.ID, "p1", "Joueur", 1); err != nil {
		t.Fatal(err)
	}
	event, err := m.ApplyAction(table.ID, "p1", "check", 1, nil)
	if err != nil || event.Sequence != 2 {
		t.Fatalf("event=%+v err=%v", event, err)
	}
	if _, err := m.ApplyAction(table.ID, "p1", "check", 1, nil); err == nil {
		t.Fatal("stale action was accepted")
	}
	if _, err := m.ApplyAction(table.ID, "p1", "hack", 2, nil); err == nil {
		t.Fatal("invalid action was accepted")
	}
}

func TestActionReplayByEventIDIsIdempotent(t *testing.T) {
	m := NewManager(&config.Config{GracePeriod: 30, Deterministic: true})
	table := m.CreateTable("poker")
	if _, err := m.JoinPlayer(table.ID, "p1", "Joueur", 1); err != nil {
		t.Fatal(err)
	}
	first, replayed, err := m.ApplyActionIdempotent(table.ID, "p1", "check", 1, nil, "client-action-1")
	if err != nil || replayed || first.Sequence != 2 {
		t.Fatalf("first=%+v replayed=%v err=%v", first, replayed, err)
	}
	second, replayed, err := m.ApplyActionIdempotent(table.ID, "p1", "check", 1, nil, "client-action-1")
	if err != nil || !replayed || second.ID != first.ID || second.Sequence != first.Sequence {
		t.Fatalf("second=%+v replayed=%v err=%v", second, replayed, err)
	}
	if table.Sequence != 2 || len(table.Events) != 2 {
		t.Fatalf("sequence=%d events=%d", table.Sequence, len(table.Events))
	}
}

func TestEventIDCannotBeReusedForAnotherAction(t *testing.T) {
	m := NewManager(&config.Config{GracePeriod: 30, Deterministic: true})
	table := m.CreateTable("poker")
	_, _ = m.JoinPlayer(table.ID, "p1", "Joueur", 1)
	_, _, err := m.ApplyActionIdempotent(table.ID, "p1", "check", 1, nil, "client-action-1")
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := m.ApplyActionIdempotent(table.ID, "p1", "fold", 1, nil, "client-action-1"); err == nil {
		t.Fatal("event_id was accepted for another action")
	}
}

func TestPokerStateValidatesCurrentPlayerAction(t *testing.T) {
	m := NewManager(&config.Config{GracePeriod: 30, Deterministic: true})
	table := m.CreateTable("poker")
	_, _ = m.JoinPlayer(table.ID, "p1", "Joueur 1", 1)
	_, _ = m.JoinPlayer(table.ID, "p2", "Joueur 2", 2)
	if _, err := m.ApplyAction(table.ID, "p2", "check", 2, nil); err == nil {
		t.Fatal("out-of-turn poker action was accepted")
	}
	if _, err := m.ApplyAction(table.ID, "p1", "check", 2, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := m.ApplyAction(table.ID, "p2", "check", 3, nil); err != nil {
		t.Fatal(err)
	}
}

func TestPokerFoldFinishesHeadsUpAndExposesWinner(t *testing.T) {
	m := NewManager(&config.Config{GracePeriod: 30, Deterministic: true})
	table := m.CreateTable("poker")
	_, _ = m.JoinPlayer(table.ID, "p1", "Joueur 1", 1)
	_, _ = m.JoinPlayer(table.ID, "p2", "Joueur 2", 2)
	_, err := m.ApplyAction(table.ID, "p1", "fold", 2, nil)
	if err != nil {
		t.Fatal(err)
	}
	winner, _, finished := m.FinishedPokerResult(table.ID)
	if !finished || len(winner) != 1 || winner[0] != "p2" {
		t.Fatalf("winner=%q finished=%v", winner, finished)
	}
}

func TestPokerNewHandRotatesButtonAndCarriesPayouts(t *testing.T) {
	m := NewManager(&config.Config{GracePeriod: 30, Deterministic: true, Blinds: true})
	table := m.CreateTable("poker")
	_, _ = m.JoinPlayer(table.ID, "p1", "Joueur 1", 1)
	_, _ = m.JoinPlayer(table.ID, "p2", "Joueur 2", 2)
	if _, err := m.ApplyAction(table.ID, "p2", "fold", 2, nil); err != nil {
		t.Fatal(err)
	}
	event, replayed, err := m.ApplyActionIdempotent(table.ID, "p1", "new_hand", 3, nil, "new-hand-1")
	if err != nil || replayed || event.Sequence != 4 {
		t.Fatalf("event=%+v replayed=%v err=%v", event, replayed, err)
	}
	hand, ok := table.State.(*poker.Hand)
	if !ok || hand.Phase != "preflop" || hand.Button != 1 {
		t.Fatalf("state=%T phase=%q button=%d", table.State, hand.Phase, hand.Button)
	}
	if table.Players["p1"].Stack != 10050 {
		t.Fatalf("p1 stack=%d, expected payout-adjusted stack", table.Players["p1"].Stack)
	}
	_, replayed, err = m.ApplyActionIdempotent(table.ID, "p1", "new_hand", 3, nil, "new-hand-1")
	if err != nil || !replayed || table.Sequence != 4 {
		t.Fatalf("replay=%v err=%v sequence=%d", replayed, err, table.Sequence)
	}
}

func TestBeloteRoundIsCreatedAtFourPlayers(t *testing.T) {
	m := NewManager(&config.Config{GracePeriod: 30, Deterministic: true})
	table := m.CreateTable("belote")
	for index := 0; index < 4; index++ {
		if _, err := m.JoinPlayer(table.ID, fmt.Sprintf("p%d", index), "Joueur", index); err != nil {
			t.Fatal(err)
		}
	}
	if _, ok := table.State.(*belote.Round); !ok {
		t.Fatalf("state=%T", table.State)
	}
}

func TestRamiGameIsCreatedAtTwoPlayers(t *testing.T) {
	m := NewManager(&config.Config{GracePeriod: 30, Deterministic: true})
	table := m.CreateTable("rami")
	for index := 0; index < 2; index++ {
		if _, err := m.JoinPlayer(table.ID, fmt.Sprintf("r%d", index), "Joueur", index); err != nil {
			t.Fatal(err)
		}
	}
	if _, ok := table.State.(*rami.Game); !ok {
		t.Fatalf("state=%T", table.State)
	}
}

func TestBeloteRoomAcceptsAValidCardPlay(t *testing.T) {
	m := NewManager(&config.Config{GracePeriod: 30, Deterministic: true})
	table := m.CreateTable("belote")
	for index := 0; index < 4; index++ {
		if _, err := m.JoinPlayer(table.ID, fmt.Sprintf("b%d", index), "Joueur", index); err != nil {
			t.Fatal(err)
		}
	}
	round := table.State.(*belote.Round)
	card := round.Players[0].Hand[0]
	event, err := m.ApplyAction(table.ID, "b0", "play_card", 4, map[string]interface{}{"card": map[string]interface{}{"suit": float64(card.Suit), "rank": float64(card.Rank)}})
	if err != nil || event.Sequence != 5 {
		t.Fatalf("event=%+v err=%v", event, err)
	}
}

func TestRamiRoomAcceptsDrawAndDiscardSequence(t *testing.T) {
	m := NewManager(&config.Config{GracePeriod: 30, Deterministic: true})
	table := m.CreateTable("rami")
	for index := 0; index < 2; index++ {
		if _, err := m.JoinPlayer(table.ID, fmt.Sprintf("r%d", index), "Joueur", index); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := m.ApplyAction(table.ID, "r0", "draw", 2, nil); err != nil {
		t.Fatal(err)
	}
	game := table.State.(*rami.Game)
	card := game.Players[0].Hand[0]
	if _, err := m.ApplyAction(table.ID, "r0", "discard", 3, map[string]interface{}{"card": map[string]interface{}{"suit": float64(card.Suit), "rank": float64(card.Rank)}}); err != nil {
		t.Fatal(err)
	}
	if game.Current != 1 {
		t.Fatalf("current=%d", game.Current)
	}
}

func TestDisconnectedPlayerCanReconnectDuringGracePeriod(t *testing.T) {
	m := NewManager(&config.Config{GracePeriod: 30 * time.Millisecond})
	table := m.CreateTable("poker")
	if _, err := m.JoinPlayer(table.ID, "p1", "Joueur", 1); err != nil {
		t.Fatal(err)
	}
	m.DisconnectPlayer(table.ID, "p1")
	if _, err := m.JoinPlayer(table.ID, "p1", "Joueur", 1); err != nil {
		t.Fatal(err)
	}
	time.Sleep(50 * time.Millisecond)
	if _, ok := table.Players["p1"]; !ok {
		t.Fatal("reconnected player was removed")
	}
}

func TestExplicitLeaveRemovesPlayerAndClosesEmptyTable(t *testing.T) {
	m := NewManager(&config.Config{GracePeriod: time.Second})
	table := m.CreateTable("poker")
	_, _ = m.JoinPlayer(table.ID, "p1", "Joueur", 1)
	if !m.LeavePlayer(table.ID, "p1") {
		t.Fatal("leave was not applied")
	}
	if table.IsActive || len(table.Players) != 0 {
		t.Fatalf("table active=%v players=%d", table.IsActive, len(table.Players))
	}
	if m.LeavePlayer(table.ID, "p1") {
		t.Fatal("second leave should be idempotently ignored")
	}
}

func TestGracePeriodExpiryClosesTableWhenLastPlayerIsGone(t *testing.T) {
	m := NewManager(&config.Config{GracePeriod: 15 * time.Millisecond})
	table := m.CreateTable("poker")
	_, _ = m.JoinPlayer(table.ID, "p1", "Joueur", 1)
	m.DisconnectPlayer(table.ID, "p1")
	time.Sleep(35 * time.Millisecond)
	table.mu.RLock()
	defer table.mu.RUnlock()
	if table.IsActive {
		t.Fatal("empty table remained active after grace period")
	}
}

func TestSnapshotRestoresSequenceAndEvents(t *testing.T) {
	m := NewManager(&config.Config{GracePeriod: time.Second})
	table := m.CreateTable("poker")
	_, _ = m.JoinPlayer(table.ID, "p1", "Joueur", 1)
	snapshot, err := m.Snapshot(table.ID)
	if err != nil {
		t.Fatal(err)
	}
	restoredManager := NewManager(&config.Config{GracePeriod: time.Second})
	restored, err := restoredManager.RestoreSnapshot(snapshot)
	if err != nil || restored.Sequence != 1 || len(restored.Events) != 1 {
		t.Fatalf("restored=%+v err=%v", restored, err)
	}
}

func TestSnapshotRestoresPokerPrivateDeckForContinuation(t *testing.T) {
	m := NewManager(&config.Config{GracePeriod: time.Second, Deterministic: true})
	table := m.CreateTable("poker")
	_, _ = m.JoinPlayer(table.ID, "p1", "Joueur 1", 1)
	_, _ = m.JoinPlayer(table.ID, "p2", "Joueur 2", 2)
	snapshot, err := m.Snapshot(table.ID)
	if err != nil {
		t.Fatal(err)
	}
	restoredManager := NewManager(&config.Config{GracePeriod: time.Second, Deterministic: true})
	restored, err := restoredManager.RestoreSnapshot(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	hand, ok := restored.State.(*poker.Hand)
	if !ok || len(hand.Deck) != 48 {
		t.Fatalf("state=%T deck=%d", restored.State, len(hand.Deck))
	}
}

func TestEventsSinceSupportsResync(t *testing.T) {
	m := NewManager(&config.Config{GracePeriod: 30})
	table := m.CreateTable("poker")
	_, _ = m.JoinPlayer(table.ID, "p1", "Joueur", 1)
	_, _ = m.ApplyAction(table.ID, "p1", "fold", 1, nil)
	events, err := m.EventsSince(table.ID, 1)
	if err != nil || len(events) != 1 || events[0].Sequence != 2 {
		t.Fatalf("events=%+v err=%v", events, err)
	}
}
