package websocket

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/casino-mdg/game-engine/internal/config"
	"github.com/casino-mdg/game-engine/internal/room"
)

func TestLiveActivityDeduplicatesConnectionsAndExcludesSpectators(t *testing.T) {
	cfg := &config.Config{ResultSecret: "secret"}
	manager := room.NewManager(cfg)
	table := manager.CreateTable("ludo")
	if _, err := manager.JoinPlayer(table.ID, "human", "Human", 0); err != nil {
		t.Fatal(err)
	}
	server := NewServer(cfg, manager)
	one := &Client{playerID: "human", tableID: table.ID}
	two := &Client{playerID: "human", tableID: table.ID}
	server.addClient(one)
	server.addClient(two)
	server.addClient(&Client{playerID: "bot", tableID: table.ID, isBot: true})
	server.addClient(&Client{playerID: "viewer", tableID: table.ID, spectator: true})
	read := func() []string {
		request := httptest.NewRequest("GET", "/internal/live-activity", nil)
		request.Header.Set("X-Game-Engine-Secret", "secret")
		response := httptest.NewRecorder()
		server.LiveActivity(response, request)
		if response.Code != 200 {
			t.Fatal(response.Code)
		}
		var data struct {
			Tables map[string]struct {
				Humans []string `json:"humans"`
			} `json:"tables"`
		}
		if err := json.Unmarshal(response.Body.Bytes(), &data); err != nil {
			t.Fatal(err)
		}
		return data.Tables[table.ID].Humans
	}
	if humans := read(); len(humans) != 1 || humans[0] != "human" {
		t.Fatal(humans)
	}
	server.removeClient(two)
	if len(read()) != 1 {
		t.Fatal("closing one tab removed another live tab")
	}
	// Explicitly leaving a seat must remove its activity even if another tab
	// has not yet closed its socket.
	if _, err := manager.JoinPlayer(table.ID, "other", "Other", 1); err != nil {
		t.Fatal(err)
	}
	manager.LeavePlayer(table.ID, "human")
	if len(read()) != 0 {
		t.Fatal("unseated socket still counted as playing")
	}
	server.removeClient(one)
	if len(read()) != 0 {
		t.Fatal("disconnected human still online")
	}
	denied := httptest.NewRecorder()
	server.LiveActivity(denied, httptest.NewRequest("GET", "/internal/live-activity", nil))
	if denied.Code != 403 {
		t.Fatal("internal identities exposed without authentication")
	}
}

func TestDisconnectIsScopedToTableAcrossMultipleGames(t *testing.T) {
	server := NewServer(&config.Config{}, room.NewManager(&config.Config{}))
	first := &Client{playerID: "human", tableID: "ludo"}
	second := &Client{playerID: "human", tableID: "poker"}
	server.addClient(first)
	server.addClient(second)
	if len(server.tableClientSlice("ludo", false)) != 1 {
		t.Fatal("joining another game detached first table")
	}
	if !server.removeClient(first) {
		t.Fatal("closing last socket on first table failed to disconnect")
	}
	if server.clients["human"] != second {
		t.Fatal("disconnect removed a different table socket")
	}
	if !server.removeClient(second) {
		t.Fatal("last table did not disconnect")
	}
}
