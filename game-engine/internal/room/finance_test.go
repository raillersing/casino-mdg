package room

import (
	"github.com/casino-mdg/game-engine/internal/config"
	"github.com/casino-mdg/game-engine/internal/game/poker"
	"testing"
	"time"
)

func TestFundedPokerConservesFundsAndDefersDeparture(t *testing.T) {
	m := NewManager(&config.Config{GracePeriod: time.Second, Deterministic: true})
	table := m.CreateTable("poker")
	if err := m.ConfigureTable(table.ID, TableSettings{Version: 1, MaxPlayers: 2, TurnDuration: 30, PokerSmallBlind: 50}); err != nil {
		t.Fatal(err)
	}
	for i, id := range []string{"a", "b"} {
		if _, err := m.JoinPlayerWithBuyIn(table.ID, id, id, i, 50000); err != nil {
			t.Fatal(err)
		}
		if err := m.ApplyFunding(table.ID, FundingOperation{ID: "entry-" + id, Session: "seat-" + id, UserID: id, Kind: "entry", Amount: 50000}); err != nil {
			t.Fatal(err)
		}
	}
	op := FundingOperation{ID: "top-a", Session: "seat-a", UserID: "a", Kind: "top_up", Amount: 10000}
	if err := m.ApplyFunding(table.ID, op); err != nil {
		t.Fatal(err)
	}
	seq := m.TableSequence(table.ID)
	if err := m.ApplyFunding(table.ID, op); err != nil {
		t.Fatal(err)
	}
	if m.TableSequence(table.ID) != seq || table.CopyPlayers()["a"].PendingTopUp != 10000 {
		t.Fatal("operation replay changed funding")
	}
	hand := table.State.(*poker.Hand)
	departing := hand.Players[hand.Current].ID
	m.LeavePlayer(table.ID, departing)
	cp, _ := m.FinanceCheckpoint(table.ID)
	if cp.Balances["seat-"+departing].Exited {
		t.Fatal("refunded during a live hand")
	}
	turn, ok := m.TimedOutAction(table.ID)
	if !ok || turn.Action != "fold" {
		t.Fatal("departed player blocks the hand")
	}
	if _, _, err := m.ApplyServerTimeout(table.ID, turn.PlayerID, turn.Action, turn.Sequence, turn.Payload); err != nil {
		t.Fatal(err)
	}
	m.FinalizeFinance(table.ID)
	cp, _ = m.FinanceCheckpoint(table.ID)
	var total int64
	for _, b := range cp.Balances {
		total += b.Stack + b.Pending
	}
	if total != 110000 || !cp.Balances["seat-"+departing].Exited {
		t.Fatalf("checkpoint=%+v total=%d", cp, total)
	}
	snapshot, err := m.Snapshot(table.ID)
	if err != nil {
		t.Fatal(err)
	}
	restored := NewManager(&config.Config{GracePeriod: time.Second})
	if _, err := restored.RestoreSnapshot(snapshot); err != nil {
		t.Fatal(err)
	}
	cp2, _ := restored.FinanceCheckpoint(table.ID)
	if len(cp2.Operations) != 3 || !cp2.Balances["seat-"+departing].Exited {
		t.Fatal("funding history lost on restart")
	}
}
