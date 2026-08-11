package room

import (
	"github.com/casino-mdg/game-engine/internal/config"
	"testing"
)

func TestActionsAreAuthoritativeAndMonotone(t *testing.T) {
	m := NewManager(&config.Config{GracePeriod: 30})
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
