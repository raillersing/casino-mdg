package room

import (
	"testing"
	"time"

	"github.com/casino-mdg/game-engine/internal/config"
)

func TestStatsExposeActivePlayersAndEvents(t *testing.T) {
	manager := NewManager(&config.Config{GracePeriod: time.Second})
	table := manager.CreateTable("poker")
	_, _ = manager.JoinPlayer(table.ID, "player", "Player", 0)
	stats := manager.Stats()
	if stats.TablesActive != 1 || stats.PlayersActive != 1 || stats.EventsTotal != 1 {
		t.Fatalf("stats=%+v", stats)
	}
}
