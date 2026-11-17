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
	_, _ = m.JoinPlayer(table.ID, "p2", "Other", 2)
	if _, err := m.JoinPlayer(table.ID, "p1", "Joueur", 1); err != nil {
		t.Fatal(err)
	}
	event, err := m.ApplyAction(table.ID, "p1", "check", 2, nil)
	if err != nil || event.Sequence != 3 {
		t.Fatalf("event=%+v err=%v", event, err)
	}
	if _, err := m.ApplyAction(table.ID, "p1", "check", 2, nil); err == nil {
		t.Fatal("stale action was accepted")
	}
	if _, err := m.ApplyAction(table.ID, "p1", "hack", 3, nil); err == nil {
		t.Fatal("invalid action was accepted")
	}
}

func TestActionReplayByEventIDIsIdempotent(t *testing.T) {
	m := NewManager(&config.Config{GracePeriod: 30, Deterministic: true})
	table := m.CreateTable("poker")
	_, _ = m.JoinPlayer(table.ID, "p2", "Other", 2)
	if _, err := m.JoinPlayer(table.ID, "p1", "Joueur", 1); err != nil {
		t.Fatal(err)
	}
	first, replayed, err := m.ApplyActionIdempotent(table.ID, "p1", "check", 2, nil, "client-action-1")
	if err != nil || replayed || first.Sequence != 3 {
		t.Fatalf("first=%+v replayed=%v err=%v", first, replayed, err)
	}
	second, replayed, err := m.ApplyActionIdempotent(table.ID, "p1", "check", 2, nil, "client-action-1")
	if err != nil || !replayed || second.ID != first.ID || second.Sequence != first.Sequence {
		t.Fatalf("second=%+v replayed=%v err=%v", second, replayed, err)
	}
	if table.Sequence != 3 || len(table.Events) != 3 {
		t.Fatalf("sequence=%d events=%d", table.Sequence, len(table.Events))
	}
}

func TestEventIDCannotBeReusedForAnotherAction(t *testing.T) {
	m := NewManager(&config.Config{GracePeriod: 30, Deterministic: true})
	table := m.CreateTable("poker")
	_, _ = m.JoinPlayer(table.ID, "p2", "Other", 2)
	_, _ = m.JoinPlayer(table.ID, "p1", "Joueur", 1)
	_, _, err := m.ApplyActionIdempotent(table.ID, "p1", "check", 2, nil, "client-action-1")
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := m.ApplyActionIdempotent(table.ID, "p1", "fold", 2, nil, "client-action-1"); err == nil {
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
	round.Phase = "playing"
	round.Trump = 0
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
	_, _ = m.JoinPlayer(table.ID, "p2", "Joueur 2", 2)
	if _, err := m.ApplyAction(table.ID, "p1", "fold", 2, nil); err != nil {
		t.Fatal(err)
	}
	events, err := m.EventsSince(table.ID, 2)
	if err != nil || len(events) != 1 || events[0].Sequence != 3 {
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
	_, _ = m.JoinBotPlayerWithProfile(table.ID, "bot", "IA", 1, "fish")
	_, _ = m.JoinPlayer(table.ID, "human", "Joueur", 0)
	if err := m.StartTable(table.ID); err != nil {
		t.Fatal(err)
	}
	seq := table.Sequence
	// Human calls the big blind.
	if _, err := m.ApplyAction(table.ID, "human", "call", seq, map[string]interface{}{}); err != nil {
		t.Fatal(err)
	}
	seq++
	// Bot is big blind so toCall == 0; it checks.
	turn, ok := m.NextBotTurn(table.ID)
	if !ok {
		t.Fatal("expected bot turn")
	}
	if _, err := m.ApplyAction(table.ID, turn.PlayerID, turn.Action, seq, turn.Payload); err != nil {
		t.Fatalf("bot preflop action %q failed: %v", turn.Action, err)
	}
	seq++
	// Flop is dealt; postflop starts left of button, so bot acts first again.
	turn, ok = m.NextBotTurn(table.ID)
	if !ok {
		t.Fatal("expected bot turn on flop")
	}
	if _, err := m.ApplyAction(table.ID, turn.PlayerID, turn.Action, seq, turn.Payload); err != nil {
		t.Fatalf("bot flop action %q failed: %v", turn.Action, err)
	}
	seq++
	// Human folds.
	if _, err := m.ApplyAction(table.ID, "human", "fold", seq, nil); err != nil {
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

func TestPokerBotProfilesProduceValidActions(t *testing.T) {
	profiles := []string{"fish", "rock", "maniac", "shark", "donkey"}
	validActions := map[string]bool{"fold": true, "check": true, "call": true, "bet": true, "raise": true, "all_in": true}

	for _, profile := range profiles {
		t.Run(profile, func(t *testing.T) {
			m := NewManager(&config.Config{GracePeriod: 30, Deterministic: true, Blinds: true})
			table := m.CreateTable("poker")
			table.BotTilt = make(map[string]int)
			table.BotRecentStrength = make(map[string]int)

			// Set up a simple hand with two players.
			p1 := &poker.Player{ID: "bot", Stack: 1000, Bet: 0}
			p2 := &poker.Player{ID: "human", Stack: 1000, Bet: 100}
			hand, _ := poker.NewHand([]*poker.Player{p1, p2}, func(deck []poker.Card) {})
			hand.Phase = "preflop"
			table.State = hand

			// Run several times to cover random branches.
			for i := 0; i < 20; i++ {
				turn := decidePokerBotTurn(hand, p1, table, profile, 1)
				if turn.PlayerID != "bot" {
					t.Fatalf("expected PlayerID=bot, got %q", turn.PlayerID)
				}
				if !validActions[turn.Action] {
					t.Fatalf("profile %q produced invalid action %q", profile, turn.Action)
				}
				// Reset state for next iteration.
				p1.Folded = false
				p1.AllIn = false
				p1.Bet = 0
			}
		})
	}
}

func TestPokerBotRockFoldsWeakHandsPreflop(t *testing.T) {
	m := NewManager(&config.Config{GracePeriod: 30, Deterministic: true, Blinds: true})
	table := m.CreateTable("poker")
	table.BotTilt = make(map[string]int)
	table.BotRecentStrength = make(map[string]int)

	p1 := &poker.Player{ID: "bot", Stack: 1000, Bet: 0, Cards: []poker.Card{{Rank: 2, Suit: 0}, {Rank: 7, Suit: 1}}}
	p2 := &poker.Player{ID: "human", Stack: 1000, Bet: 200}
	hand, _ := poker.NewHand([]*poker.Player{p1, p2}, func(deck []poker.Card) {})
	hand.Phase = "preflop"
	table.State = hand

	folds := 0
	for i := 0; i < 50; i++ {
		turn := decidePokerBotTurn(hand, p1, table, "rock", 1)
		if turn.Action == "fold" {
			folds++
		}
		p1.Folded = false
		p1.AllIn = false
		p1.Bet = 0
	}
	if folds < 30 {
		t.Fatalf("rock folded only %d/50 with weak hand preflop, expected at least 30", folds)
	}
}

func TestPokerBotFishCallsWeakHands(t *testing.T) {
	m := NewManager(&config.Config{GracePeriod: 30, Deterministic: true, Blinds: true})
	table := m.CreateTable("poker")
	table.BotTilt = make(map[string]int)
	table.BotRecentStrength = make(map[string]int)

	p1 := &poker.Player{ID: "bot", Stack: 1000, Bet: 0, Cards: []poker.Card{{Rank: 2, Suit: 0}, {Rank: 7, Suit: 1}}}
	p2 := &poker.Player{ID: "human", Stack: 1000, Bet: 50}
	hand, _ := poker.NewHand([]*poker.Player{p1, p2}, func(deck []poker.Card) {})
	hand.Phase = "preflop"
	hand.Pot = 500 // large pot so pot odds are favourable
	table.State = hand

	calls := 0
	for i := 0; i < 50; i++ {
		turn := decidePokerBotTurn(hand, p1, table, "fish", 1)
		if turn.Action == "call" {
			calls++
		}
		p1.Folded = false
		p1.AllIn = false
		p1.Bet = 0
	}
	if calls < 20 {
		t.Fatalf("fish called only %d/50 with weak hand, expected at least 20", calls)
	}
}

func TestPokerBotManiacIsAggressive(t *testing.T) {
	m := NewManager(&config.Config{GracePeriod: 30, Deterministic: true, Blinds: true})
	table := m.CreateTable("poker")
	table.BotTilt = make(map[string]int)
	table.BotRecentStrength = make(map[string]int)

	p1 := &poker.Player{ID: "bot", Stack: 1000, Bet: 0, Cards: []poker.Card{{Rank: 2, Suit: 0}, {Rank: 7, Suit: 1}}}
	p2 := &poker.Player{ID: "human", Stack: 1000, Bet: 50}
	hand, _ := poker.NewHand([]*poker.Player{p1, p2}, func(deck []poker.Card) {})
	hand.Phase = "preflop"
	table.State = hand

	// A 50-trial Bernoulli sample flaked at 14/50 on CI despite the
	// maniac's 0.35 base bluff probability. Use a larger sample and
	// conservative lower bound to detect actual behavioral regressions.
	const trials = 500
	aggressive := 0
	for i := 0; i < trials; i++ {
		turn := decidePokerBotTurn(hand, p1, table, "maniac", 1)
		if turn.Action == "bet" || turn.Action == "raise" || turn.Action == "all_in" {
			aggressive++
		}
		p1.Folded = false
		p1.AllIn = false
		p1.Bet = 0
	}
	if aggressive < 100 {
		t.Fatalf("maniac was aggressive only %d/%d with weak hand, expected at least 20%%", aggressive, trials)
	}
}

func TestPokerBotStrongHandNeverFolds(t *testing.T) {
	profiles := []string{"fish", "rock", "maniac", "shark"}
	for _, profile := range profiles {
		t.Run(profile, func(t *testing.T) {
			m := NewManager(&config.Config{GracePeriod: 30, Deterministic: true, Blinds: true})
			table := m.CreateTable("poker")
			table.BotTilt = make(map[string]int)
			table.BotRecentStrength = make(map[string]int)

			// Flush on board + strong hole cards.
			p1 := &poker.Player{ID: "bot", Stack: 1000, Bet: 0, Cards: []poker.Card{{Rank: 14, Suit: 0}, {Rank: 13, Suit: 0}}}
			p2 := &poker.Player{ID: "human", Stack: 1000, Bet: 200}
			hand, _ := poker.NewHand([]*poker.Player{p1, p2}, func(deck []poker.Card) {})
			hand.Phase = "river"
			hand.Community = []poker.Card{{Rank: 9, Suit: 0}, {Rank: 11, Suit: 0}, {Rank: 12, Suit: 0}, {Rank: 2, Suit: 1}, {Rank: 3, Suit: 2}}
			table.State = hand

			for i := 0; i < 50; i++ {
				turn := decidePokerBotTurn(hand, p1, table, profile, 1)
				if turn.Action == "fold" {
					t.Fatalf("profile %q folded a monster hand", profile)
				}
				p1.Folded = false
				p1.AllIn = false
				p1.Bet = 0
			}
		})
	}
}

func TestPokerButtonClockwiseRotationAcrossEliminations(t *testing.T) {
	m := NewManager(&config.Config{GracePeriod: 30, Deterministic: true, Blinds: false})
	table := m.CreateTable("poker")
	// 5 players at sparse seats: 0, 2, 4, 6, 8 (initialize hand once all 5 have joined)
	_, _ = m.joinPlayer(table.ID, "p0", "P0", 0, false, false)
	_, _ = m.joinPlayer(table.ID, "p2", "P2", 2, false, false)
	_, _ = m.joinPlayer(table.ID, "p4", "P4", 4, false, false)
	_, _ = m.joinPlayer(table.ID, "p6", "P6", 6, false, false)
	_, _ = m.joinPlayer(table.ID, "p8", "P8", 8, false, true)

	hand, ok := table.State.(*poker.Hand)
	if !ok || len(hand.Players) != 5 {
		t.Fatalf("expected 5-player hand, got %T, players=%d", table.State, len(hand.Players))
	}
	// Initial button is index 0 (seat 0)
	hand.Button = 0
	hand.Phase = "showdown"

	// Player at seat 2 busts (stack = 0 in both hand and table)
	for _, p := range hand.Players {
		if p.ID == "p2" {
			p.Stack = 0
		}
	}
	table.Players["p2"].Stack = 0

	// Trigger new_hand
	_, _, err := m.ApplyActionIdempotent(table.ID, "p0", "new_hand", table.Sequence, nil, "nh-1")
	if err != nil {
		t.Fatalf("new_hand failed: %v", err)
	}

	nextHand := table.State.(*poker.Hand)
	// Remaining players are seats: 0, 4, 6, 8 (4 players)
	if len(nextHand.Players) != 4 {
		t.Fatalf("expected 4 players after elimination, got %d", len(nextHand.Players))
	}
	// Button should advance clockwise from seat 0 to seat 4 (which is index 1 in remaining [0, 4, 6, 8])
	if nextHand.Button != 1 || nextHand.Players[nextHand.Button].ID != "p4" {
		t.Fatalf("expected button at seat 4 (index 1), got button=%d (player %s)", nextHand.Button, nextHand.Players[nextHand.Button].ID)
	}

	// Now player at seat 4 busts and hand 2 finishes
	nextHand.Phase = "showdown"
	for _, p := range nextHand.Players {
		if p.ID == "p4" {
			p.Stack = 0
		}
	}
	table.Players["p4"].Stack = 0
	_, _, err = m.ApplyActionIdempotent(table.ID, "p0", "new_hand", table.Sequence, nil, "nh-2")
	if err != nil {
		t.Fatalf("new_hand 2 failed: %v", err)
	}

	thirdHand := table.State.(*poker.Hand)
	// Remaining: seats 0, 6, 8 (3 players)
	// Clockwise from seat 4 is seat 6 (index 1 in remaining [0, 6, 8])
	if thirdHand.Button != 1 || thirdHand.Players[thirdHand.Button].ID != "p6" {
		t.Fatalf("expected button at seat 6 (index 1), got button=%d (player %s)", thirdHand.Button, thirdHand.Players[thirdHand.Button].ID)
	}
}

func TestBeloteMultiRoundScoreCumulativeAndGameOver(t *testing.T) {
	m := NewManager(&config.Config{GracePeriod: 30 * time.Second, Deterministic: true})
	table := m.CreateTable("belote")
	table.BeloteTargetScore = 501
	for index := 0; index < 4; index++ {
		if _, err := m.JoinPlayer(table.ID, fmt.Sprintf("b%d", index), "Joueur", index); err != nil {
			t.Fatal(err)
		}
	}
	round := table.State.(*belote.Round)
	round.Phase = "finished"
	round.TeamPoints = [2]int{300, 100}

	// Round 1 new_hand
	_, _, err := m.ApplyActionIdempotent(table.ID, "b0", "new_hand", table.Sequence, nil, "nh-b1")
	if err != nil {
		t.Fatalf("round 1 new_hand failed: %v", err)
	}
	if table.BeloteTeamScores[0] != 300 || table.BeloteTeamScores[1] != 100 {
		t.Fatalf("expected cumulative scores [300, 100], got %v", table.BeloteTeamScores)
	}
	round2 := table.State.(*belote.Round)
	if round2.CumulativeScores[0] != 300 || round2.CumulativeScores[1] != 100 {
		t.Fatalf("expected round2 cumulative [300, 100], got %v", round2.CumulativeScores)
	}

	// Round 2 finishes with Team 0 scoring 250 points (total 550 >= 501)
	round2.Phase = "finished"
	round2.TeamPoints = [2]int{250, 50}

	_, _, err = m.ApplyActionIdempotent(table.ID, "b0", "new_hand", table.Sequence, nil, "nh-b2")
	if err == nil || err.Error() != "game_over" {
		t.Fatalf("expected game_over error, got: %v", err)
	}
	if table.BeloteTeamScores[0] != 550 || table.BeloteTeamScores[1] != 150 {
		t.Fatalf("expected cumulative scores [550, 150], got %v", table.BeloteTeamScores)
	}

	// Replay / reset match on subsequent new_hand
	_, _, err = m.ApplyActionIdempotent(table.ID, "b0", "new_hand", table.Sequence, nil, "nh-b3")
	if err != nil {
		t.Fatalf("expected match reset on subsequent new_hand, got: %v", err)
	}
	if table.BeloteTeamScores[0] != 0 || table.BeloteTeamScores[1] != 0 {
		t.Fatalf("expected reset scores [0, 0], got %v", table.BeloteTeamScores)
	}
}
