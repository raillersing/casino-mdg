package room

import (
	"github.com/casino-mdg/game-engine/internal/config"
	"github.com/casino-mdg/game-engine/internal/game/domino"
	"github.com/casino-mdg/game-engine/internal/game/ludo"
	"github.com/casino-mdg/game-engine/internal/game/poker"
	"testing"
	"time"
)

func TestLudoForcedMovePreservesChoices(t *testing.T) {
	m := NewManager(&config.Config{})
	table := m.CreateTable("ludo")
	for _, id := range []string{"a", "b"} {
		if _, err := m.JoinPlayer(table.ID, id, id, 0); err != nil {
			t.Fatal(err)
		}
	}
	g, _ := ludo.NewGame([]string{"a", "b"})
	table.State = g
	g.CanRoll = false
	g.CanMove = true
	g.LastRoll = 6
	g.ValidMoves = []int{0, 1, 2, 3}
	forced, ok := m.NextForcedAction(table.ID)
	if !ok || forced.Action != "move_pawn" {
		t.Fatal("equivalent base pawns require unnecessary choice")
	}
	if _, _, err := m.ApplyActionIdempotent(table.ID, forced.PlayerID, forced.Action, forced.Sequence, forced.Payload, "forced"); err != nil {
		t.Fatal(err)
	}
	if g.Players[0].Pawns[0].State != ludo.PawnTrack {
		t.Fatal("forced pawn never moved")
	}
	g.Current = 0
	g.CanMove = true
	g.ValidMoves = []int{0, 1}
	g.Players[0].Pawns[0].Position = 4
	if _, ok := m.NextForcedAction(table.ID); ok {
		t.Fatal("different pawn positions must remain a choice")
	}
	g.CanMove = false
	g.CanRoll = true
	if _, ok := m.NextForcedAction(table.ID); ok {
		t.Fatal("human die roll was automated")
	}
}
func TestDominoForcedDrawPassAndChoice(t *testing.T) {
	m := NewManager(&config.Config{})
	table := m.CreateTable("domino")
	for _, id := range []string{"a", "b"} {
		_, _ = m.JoinPlayer(table.ID, id, id, 0)
	}
	g := &domino.Game{Players: []*domino.Player{{ID: "a", Hand: []domino.Tile{{Left: 1, Right: 1}}}, {ID: "b", Hand: []domino.Tile{{Left: 2, Right: 2}}}}, Board: []domino.PlayedTile{{Left: 3, Right: 4}}, LeftEnd: 3, RightEnd: 4, Boneyard: []domino.Tile{{Left: 3, Right: 5}}}
	table.State = g
	forced, ok := m.NextForcedAction(table.ID)
	if !ok || forced.Action != "draw_tile" {
		t.Fatal("mandatory draw not offered")
	}
	if _, _, err := m.ApplyActionIdempotent(table.ID, forced.PlayerID, forced.Action, forced.Sequence, forced.Payload, ""); err != nil {
		t.Fatal(err)
	}
	forced, ok = m.NextForcedAction(table.ID)
	if !ok || forced.Action != "play_tile" {
		t.Fatal("unique drawn domino not played")
	}
	g.Players[0].Hand = []domino.Tile{{Left: 3, Right: 4}}
	if _, ok := m.NextForcedAction(table.ID); ok {
		t.Fatal("left/right choice was made for the player")
	}
	g.Players[0].Hand = []domino.Tile{{Left: 1, Right: 1}}
	forced, ok = m.NextForcedAction(table.ID)
	if !ok || forced.Action != "pass" {
		t.Fatal("mandatory pass not offered")
	}
	for i := 0; i < 2; i++ {
		forced, ok = m.NextForcedAction(table.ID)
		if !ok {
			t.Fatal("blocked game stalled")
		}
		if _, _, err := m.ApplyActionIdempotent(table.ID, forced.PlayerID, forced.Action, forced.Sequence, forced.Payload, ""); err != nil {
			t.Fatal(err)
		}
	}
	if !g.Finished || !g.Blocked {
		t.Fatal("blocked game never finished")
	}
}
func TestClosedTableSnapshotCannotResurrect(t *testing.T) {
	m := NewManager(&config.Config{})
	table := m.CreateTable("ludo")
	_, _ = m.JoinPlayer(table.ID, "a", "A", 0)
	var closed TableSnapshot
	m.SetTableClosedHandler(func(id string) {
		var err error
		closed, err = m.Snapshot(id)
		if err != nil {
			t.Error(err)
		}
	})
	if !m.LeavePlayer(table.ID, "a") {
		t.Fatal("leave failed")
	}
	if !closed.Closed {
		t.Fatal("closed status absent from snapshot")
	}
	if _, err := NewManager(&config.Config{}).RestoreSnapshot(closed); err == nil {
		t.Fatal("closed table resurrected")
	}
}

func TestRunningRoundCannotBeResetByNewHand(t *testing.T) {
	m := NewManager(&config.Config{})
	table := m.CreateTable("ludo")
	for i, id := range []string{"a", "b"} {
		_, _ = m.JoinPlayer(table.ID, id, id, i)
	}
	if err := m.StartTable(table.ID); err != nil {
		t.Fatal(err)
	}
	seq := m.TableSequence(table.ID)
	if _, _, err := m.ApplyActionIdempotent(table.ID, "a", "new_hand", seq, nil, ""); err == nil {
		t.Fatal("unfinished game reset by player")
	}
	if m.TableSequence(table.ID) != seq {
		t.Fatal("rejected reset changed sequence")
	}
}
func TestLastHumanLeavingClosesPokerBotRoom(t *testing.T) {
	m := NewManager(&config.Config{})
	table := m.CreateTable("poker")
	_, _ = m.JoinPlayer(table.ID, "a", "A", 0)
	_, _ = m.JoinBotPlayer(table.ID, "bot", "Bot", 1)
	if !m.LeavePlayer(table.ID, "a") {
		t.Fatal("leave failed")
	}
	if _, ok := m.GetTable(table.ID); ok {
		t.Fatal("bots keep an abandoned room alive")
	}
}

func TestDepartedPokerPlayerCanOnlyBeAdvancedByServerTimeout(t *testing.T) {
	m := NewManager(&config.Config{Deterministic: true})
	table := m.CreateTable("poker")
	for i, id := range []string{"a", "b"} {
		_, _ = m.JoinPlayer(table.ID, id, id, i)
	}
	hand := table.State.(*poker.Hand)
	departed := hand.Players[hand.Current].ID
	m.LeavePlayer(table.ID, departed)
	table.ActionDeadline = time.Now().Add(-time.Second)
	timeout, ok := m.TimedOutAction(table.ID)
	if !ok {
		t.Fatal("missing timeout")
	}
	if _, _, err := m.ApplyActionIdempotent(table.ID, departed, timeout.Action, timeout.Sequence, nil, ""); err == nil {
		t.Fatal("departed client can still act")
	}
	if _, _, err := m.ApplyServerTimeout(table.ID, departed, timeout.Action, timeout.Sequence, timeout.Payload); err != nil {
		t.Fatal(err)
	}
	if m.TableSequence(table.ID) != timeout.Sequence+1 {
		t.Fatal("poker hand remains stuck")
	}
}

func TestWaitingRoomCannotAcceptGameplayActions(t *testing.T) {
	m := NewManager(&config.Config{})
	table := m.CreateTable("ludo")
	if err := m.ConfigureTable(table.ID, TableSettings{Version: 1, MaxPlayers: 4, TurnDuration: 30}); err != nil {
		t.Fatal(err)
	}
	_, _ = m.JoinPlayer(table.ID, "a", "A", 0)
	sequence := m.TableSequence(table.ID)
	if _, _, err := m.ApplyActionIdempotent(table.ID, "a", "roll_dice", sequence, nil, ""); err == nil {
		t.Fatal("waiting player generated a gameplay event")
	}
	if m.TableSequence(table.ID) != sequence {
		t.Fatal("waiting action changed game state")
	}
}
