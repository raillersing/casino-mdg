package ludo

import (
	"testing"
)

func TestNewGame(t *testing.T) {
	g, err := NewGame([]string{"p1", "p2", "p3", "p4"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(g.Players) != 4 {
		t.Fatalf("expected 4 players, got %d", len(g.Players))
	}
	for i, p := range g.Players {
		if p.Color != i {
			t.Errorf("expected color %d, got %d", i, p.Color)
		}
		for j, pawn := range p.Pawns {
			if pawn.State != PawnBase || pawn.Position != -1 {
				t.Errorf("expected pawn %d to be in base with -1, got state %s pos %d", j, pawn.State, pawn.Position)
			}
		}
	}
}

func TestRollSixAndExitBase(t *testing.T) {
	g, err := NewGame([]string{"p1", "p2"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Force roll 6
	g.CanRoll = false
	g.CanMove = true
	g.LastRoll = 6
	g.ValidMoves = []int{0, 1, 2, 3}

	// Move pawn 0
	err = g.MovePawn(0)
	if err != nil {
		t.Fatalf("MovePawn failed: %v", err)
	}

	pawn := g.Players[0].Pawns[0]
	if pawn.State != PawnTrack {
		t.Fatalf("expected pawn to be on track, got %s", pawn.State)
	}
	if pawn.Position != StartPositions[0] {
		t.Fatalf("expected pawn at start pos %d, got %d", StartPositions[0], pawn.Position)
	}
	// After rolling 6, player gets another roll!
	if !g.CanRoll {
		t.Errorf("expected player to get another turn after rolling 6")
	}
	if g.Current != 0 {
		t.Errorf("expected current player to still be 0 after rolling 6, got %d", g.Current)
	}
}

func TestTrackMovementAndCapture(t *testing.T) {
	g, err := NewGame([]string{"p1", "p2"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Place p1 pawn at track position 10
	g.Players[0].Pawns[0].State = PawnTrack
	g.Players[0].Pawns[0].Position = 10

	// Place p2 pawn at track position 14 (not a safe zone)
	g.Players[1].Pawns[0].State = PawnTrack
	g.Players[1].Pawns[0].Position = 14

	// p1 rolls 4
	g.Current = 0
	g.CanRoll = false
	g.CanMove = true
	g.LastRoll = 4
	g.ValidMoves = []int{0}

	err = g.MovePawn(0)
	if err != nil {
		t.Fatalf("MovePawn failed: %v", err)
	}

	// p1 pawn should now be at position 14
	if g.Players[0].Pawns[0].Position != 14 {
		t.Errorf("expected p1 pawn at 14, got %d", g.Players[0].Pawns[0].Position)
	}
	// p2 pawn should have been captured and returned to base!
	if g.Players[1].Pawns[0].State != PawnBase || g.Players[1].Pawns[0].Position != -1 {
		t.Errorf("expected p2 pawn to be captured back to base, got %s at %d", g.Players[1].Pawns[0].State, g.Players[1].Pawns[0].Position)
	}
}

func TestHomePathAndVictory(t *testing.T) {
	g, err := NewGame([]string{"p1", "p2"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Player 0 (Red, start pos 0): track index 50 is 1 step before home path
	g.Players[0].Pawns[0].State = PawnTrack
	g.Players[0].Pawns[0].Position = 50

	// Roll 1: moves into home path square 0
	g.Current = 0
	g.CanRoll = false
	g.CanMove = true
	g.LastRoll = 1
	g.ValidMoves = []int{0}

	err = g.MovePawn(0)
	if err != nil {
		t.Fatalf("MovePawn failed: %v", err)
	}
	if g.Players[0].Pawns[0].State != PawnHomePath || g.Players[0].Pawns[0].Position != 0 {
		t.Errorf("expected pawn in HomePath at 0, got %s at %d", g.Players[0].Pawns[0].State, g.Players[0].Pawns[0].Position)
	}

	// Now pawn at home path position 0: rolling 5 reaches Home (HomePathLength = 5)
	g.Current = 0
	g.CanRoll = false
	g.CanMove = true
	g.LastRoll = 5
	g.ValidMoves = []int{0}

	err = g.MovePawn(0)
	if err != nil {
		t.Fatalf("MovePawn failed: %v", err)
	}
	if g.Players[0].Pawns[0].State != PawnHome {
		t.Errorf("expected pawn in Home, got %s", g.Players[0].Pawns[0].State)
	}
	if g.Players[0].Score != 1 {
		t.Errorf("expected player score to be 1, got %d", g.Players[0].Score)
	}
}
