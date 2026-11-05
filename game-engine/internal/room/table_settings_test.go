package room

import (
	"encoding/json"
	"fmt"
	"github.com/casino-mdg/game-engine/internal/config"
	"github.com/casino-mdg/game-engine/internal/game/belote"
	"testing"
	"time"
)

func TestTurnDurationAdmissionAndRestore(t *testing.T) {
	m := NewManager(&config.Config{})
	table := m.CreateTable("ludo")
	if err := m.ConfigureTurnDuration(table.ID, 30); err != nil {
		t.Fatal(err)
	}
	if m.TurnDuration(table.ID) != 30*time.Second {
		t.Fatal("duration not applied")
	}
	if err := m.ConfigureTurnDuration(table.ID, 15); err == nil {
		t.Fatal("conflicting admission accepted")
	}
	snapshot, err := m.Snapshot(table.ID)
	if err != nil {
		t.Fatal(err)
	}
	restored := NewManager(&config.Config{})
	if _, err := restored.RestoreSnapshot(snapshot); err != nil {
		t.Fatal(err)
	}
	if restored.TurnDuration(table.ID) != 30*time.Second {
		t.Fatal("duration lost on restore")
	}
	if err := m.ConfigureTurnDuration(table.ID, 121); err == nil {
		t.Fatal("invalid duration accepted")
	}
}

func TestSignedSettingsCapacityAndPersistence(t *testing.T) {
	m := NewManager(&config.Config{})
	table := m.CreateTable("poker")
	settings := TableSettings{Version: 1, MaxPlayers: 6, TurnDuration: 30, PokerSmallBlind: 100}
	if err := m.ConfigureTable(table.ID, settings); err != nil {
		t.Fatal(err)
	}
	if _, err := m.JoinPlayer(table.ID, "one", "One", 0); err != nil {
		t.Fatal(err)
	}
	if err := m.StartTable(table.ID); err == nil {
		t.Fatal("started before target capacity")
	}
	snapshot, err := m.Snapshot(table.ID)
	if err != nil {
		t.Fatal(err)
	}
	restored := NewManager(&config.Config{})
	room, err := restored.RestoreSnapshot(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if room.Settings == nil || *room.Settings != settings || room.PokerSmallBlind != 100 {
		t.Fatal("settings lost")
	}
	settings.MaxPlayers = 2
	if err := restored.ConfigureTable(table.ID, settings); err == nil {
		t.Fatal("configuration drift accepted")
	}
}

func TestConfiguredGamesRestoreWaitingAndStartedState(t *testing.T) {
	for _, game := range []string{"poker", "belote", "rami", "ludo", "domino"} {
		t.Run(game, func(t *testing.T) {
			m := NewManager(&config.Config{Deterministic: true})
			table := m.CreateTable(game)
			settings := TableSettings{Version: 1, MaxPlayers: 4, TurnDuration: 30}
			if game == "belote" {
				settings.MaxPlayers = 4
				settings.BeloteTarget = 501
			}
			if game == "poker" {
				settings.MaxPlayers = 6
				settings.PokerSmallBlind = 25
			}
			if err := m.ConfigureTable(table.ID, settings); err != nil {
				t.Fatal(err)
			}
			if _, err := m.JoinPlayer(table.ID, "one", "One", 0); err != nil {
				t.Fatal(err)
			}
			snapshot, err := m.Snapshot(table.ID)
			if err != nil {
				t.Fatal(err)
			}
			restored := NewManager(&config.Config{Deterministic: true})
			waiting, err := restored.RestoreSnapshot(snapshot)
			if err != nil {
				t.Fatal(err)
			}
			if waiting.State != nil {
				t.Fatal("waiting table restored as started")
			}
			for i := 1; i < settings.MaxPlayers; i++ {
				id := fmt.Sprintf("p%d", i)
				if _, err := restored.JoinPlayer(table.ID, id, id, i); err != nil {
					t.Fatal(err)
				}
				if i < settings.MaxPlayers-1 && waiting.State != nil {
					t.Fatal("started before selected capacity")
				}
			}
			if err := restored.StartTable(table.ID); err != nil {
				t.Fatal(err)
			}
			if waiting.State == nil {
				t.Fatal("game never initialized")
			}
			snapshot, err = restored.Snapshot(table.ID)
			if err != nil {
				t.Fatal(err)
			}
			again := NewManager(&config.Config{})
			started, err := again.RestoreSnapshot(snapshot)
			if err != nil {
				t.Fatal(err)
			}
			if started.State == nil {
				t.Fatal("started state lost on restore")
			}
			before, _ := json.Marshal(waiting.State)
			after, _ := json.Marshal(started.State)
			if string(before) != string(after) {
				t.Fatal("restored game differs")
			}
			if started.TurnDuration != 30 || *started.Settings != settings {
				t.Fatal("configuration lost")
			}
		})
	}
}

func TestBeloteMatchRemainsResumableBetweenRounds(t *testing.T) {
	table := &Table{IsActive: true, BeloteTargetScore: 1001, BeloteTeamScores: [2]int{400, 200}, State: &belote.Round{Phase: "finished", TeamPoints: [2]int{162, 0}}}
	if !SessionStarted(table) {
		t.Fatal("unfinished match hidden between rounds")
	}
	table.State.(*belote.Round).TeamPoints[0] = 601
	if SessionStarted(table) {
		t.Fatal("completed match counted as active")
	}
}
