package room

import (
	"fmt"

	"github.com/casino-mdg/game-engine/internal/config"
	"github.com/casino-mdg/game-engine/internal/game/belote"
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
