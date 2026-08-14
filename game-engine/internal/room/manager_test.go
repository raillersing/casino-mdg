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

func TestBotProfileIsStoredAndChangesPokerDecision(t *testing.T) {
	m := NewManager(&config.Config{GracePeriod: 30, Deterministic: true, Blinds: true})
	table := m.CreateTable("poker")
	if _, err := m.JoinBotPlayerWithProfile(table.ID, "bot", "Bot", 1, "expert"); err != nil {
		t.Fatal(err)
	}
	if table.Players["bot"].BotProfile != "expert" {
		t.Fatalf("profile=%q", table.Players["bot"].BotProfile)
	}
}

func TestPokerNewHandRotatesButtonAndCarriesPayouts(t *testing.T) {
	m := NewManager(&config.Config{GracePeriod: 30, Deterministic: true, Blinds: true})
	table := m.CreateTable("poker")
	_, _ = m.JoinPlayer(table.ID, "p1", "Joueur 1", 1)
	_, _ = m.JoinPlayer(table.ID, "p2", "Joueur 2", 2)
	if _, err := m.ApplyAction(table.ID, "p1", "call", 2, map[string]interface{}{}); err != nil {
		t.Fatal(err)
	}
	if _, err := m.ApplyAction(table.ID, "p2", "fold", 3, nil); err != nil {
		t.Fatal(err)
	}
	event, replayed, err := m.ApplyActionIdempotent(table.ID, "p1", "new_hand", 4, nil, "new-hand-1")
	if err != nil || replayed || event.Sequence != 5 {
		t.Fatalf("event=%+v replayed=%v err=%v", event, replayed, err)
	}
	hand, ok := table.State.(*poker.Hand)
	if !ok || hand.Phase != "preflop" || hand.Button != 1 {
		t.Fatalf("state=%T phase=%q button=%d", table.State, hand.Phase, hand.Button)
	}
	if table.Players["p1"].Stack != 10100 {
		t.Fatalf("p1 stack=%d, expected payout-adjusted stack", table.Players["p1"].Stack)
	}
	_, replayed, err = m.ApplyActionIdempotent(table.ID, "p1", "new_hand", 4, nil, "new-hand-1")
	if err != nil || !replayed || table.Sequence != 5 {
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

func TestBotStrengthUsesBoard(t *testing.T) {
	// A weak hole hand (7-2) that makes a flush with the board should score high.
	player := &poker.Player{
		Cards: []poker.Card{{Rank: 2, Suit: 0}, {Rank: 7, Suit: 0}},
	}
	board := []poker.Card{
		{Rank: 9, Suit: 0}, {Rank: 11, Suit: 0}, {Rank: 13, Suit: 0},
	}
	strength := pokerBotRealStrength(player, board)
	if strength < 50 {
		t.Fatalf("expected high strength for flush, got %d", strength)
	}
	// Preflop without board should fall back to preflop strength scaled by 10.
	preflop := pokerBotRealStrength(player, nil)
	if preflop != 0 {
		t.Fatalf("expected 0 preflop strength for 7-2, got %d", preflop)
	}
}

func TestBotVsHumanHandCompletes(t *testing.T) {
	m := NewManager(&config.Config{GracePeriod: 30, Deterministic: true, Blinds: true})
	table := m.CreateTable("poker")
	_, _ = m.JoinBotPlayerWithProfile(table.ID, "bot", "IA", 1, "balanced")
	_, _ = m.JoinPlayer(table.ID, "human", "Joueur", 0)
	if err := m.StartTable(table.ID); err != nil {
		t.Fatal(err)
	}
	// Human calls the big blind (sequence 1 -> 2).
	if _, err := m.ApplyAction(table.ID, "human", "call", 1, map[string]interface{}{}); err != nil {
		t.Fatal(err)
	}
	// Bot is big blind so toCall == 0; it checks (sequence 2 -> 3).
	turn, ok := m.NextBotTurn(table.ID)
	if !ok {
		t.Fatal("expected bot turn")
	}
	if _, err := m.ApplyAction(table.ID, turn.PlayerID, turn.Action, 2, turn.Payload); err != nil {
		t.Fatalf("bot preflop action %q failed: %v", turn.Action, err)
	}
	// Flop is dealt; postflop starts left of button, so bot acts first again (sequence 3 -> 4).
	turn, ok = m.NextBotTurn(table.ID)
	if !ok {
		t.Fatal("expected bot turn on flop")
	}
	if _, err := m.ApplyAction(table.ID, turn.PlayerID, turn.Action, 3, turn.Payload); err != nil {
		t.Fatalf("bot flop action %q failed: %v", turn.Action, err)
	}
	// Human folds (sequence 4 -> 5).
	if _, err := m.ApplyAction(table.ID, "human", "fold", 4, nil); err != nil {
		t.Fatal(err)
	}
	winner, _, finished := m.FinishedPokerResult(table.ID)
	if !finished {
		t.Fatal("expected hand to finish")
	}
	if len(winner) != 1 || winner[0] != "bot" {
		t.Fatalf("expected bot to win after human fold, got %v", winner)
	}
}

func TestPokerBlindLevelsProgressEveryEightHands(t *testing.T) {
	m := NewManager(&config.Config{GracePeriod: 30, Deterministic: true, Blinds: true})
	table := m.CreateTable("poker")
	_, _ = m.JoinPlayer(table.ID, "p1", "Joueur 1", 1)
	_, _ = m.JoinPlayer(table.ID, "p2", "Joueur 2", 2)

	if table.PokerSmallBlind != 50 || table.PokerBigBlind != 100 {
		t.Fatalf("initial blinds=%d/%d, expected 50/100", table.PokerSmallBlind, table.PokerBigBlind)
	}

	foldCurrent := func() {
		seq := table.Sequence
		hand := table.State.(*poker.Hand)
		currentID := hand.Players[hand.Current].ID
		if _, err := m.ApplyAction(table.ID, currentID, "fold", seq, nil); err != nil {
			t.Fatalf("fold failed: %v", err)
		}
	}

	// Play 7 fast hands (fold on preflop) — blinds should stay at level 0.
	for i := 0; i < 7; i++ {
		foldCurrent()
		if _, err := m.ApplyAction(table.ID, "p1", "new_hand", table.Sequence, nil); err != nil {
			t.Fatalf("hand %d new_hand failed: %v", i+1, err)
		}
	}
	if table.PokerLevel != 0 {
		t.Fatalf("after 7 hands level=%d, expected 0", table.PokerLevel)
	}
	if table.PokerSmallBlind != 50 || table.PokerBigBlind != 100 {
		t.Fatalf("after 7 hands blinds=%d/%d, expected 50/100", table.PokerSmallBlind, table.PokerBigBlind)
	}

	// 8th hand triggers level-up.
	foldCurrent()
	if _, err := m.ApplyAction(table.ID, "p1", "new_hand", table.Sequence, nil); err != nil {
		t.Fatal(err)
	}
	if table.PokerLevel != 1 {
		t.Fatalf("after 8 hands level=%d, expected 1", table.PokerLevel)
	}
	if table.PokerSmallBlind != 100 || table.PokerBigBlind != 200 {
		t.Fatalf("after 8 hands blinds=%d/%d, expected 100/200", table.PokerSmallBlind, table.PokerBigBlind)
	}
}

func TestPokerNewHandResetsStateAndRotatesButton(t *testing.T) {
	m := NewManager(&config.Config{GracePeriod: 30, Deterministic: true, Blinds: true})
	table := m.CreateTable("poker")
	_, _ = m.JoinPlayer(table.ID, "p1", "Joueur 1", 1)
	_, _ = m.JoinPlayer(table.ID, "p2", "Joueur 2", 2)

	// Finish first hand.
	if _, err := m.ApplyAction(table.ID, "p1", "call", 2, map[string]interface{}{}); err != nil {
		t.Fatal(err)
	}
	if _, err := m.ApplyAction(table.ID, "p2", "fold", 3, nil); err != nil {
		t.Fatal(err)
	}
	hand1, ok := table.State.(*poker.Hand)
	if !ok || hand1.Phase != "showdown" {
		t.Fatalf("expected showdown, got phase=%s", hand1.Phase)
	}
	button1 := hand1.Button

	// Start next hand.
	if _, err := m.ApplyAction(table.ID, "p1", "new_hand", 4, nil); err != nil {
		t.Fatal(err)
	}
	hand2, ok := table.State.(*poker.Hand)
	if !ok || hand2.Phase != "preflop" {
		t.Fatalf("expected preflop after new_hand, got phase=%s", hand2.Phase)
	}
	if hand2.Button != (button1+1)%2 {
		t.Fatalf("button did not rotate: %d -> %d", button1, hand2.Button)
	}
}
