package websocket

import (
	"crypto/hmac"
	"encoding/json"
	"net/http"
)

func (s *Server) LiveActivity(w http.ResponseWriter, r *http.Request) {
	received := r.Header.Get("X-Game-Engine-Secret")
	if received == "" || s.config.ResultSecret == "" || !hmac.Equal([]byte(received), []byte(s.config.ResultSecret)) {
		http.Error(w, "unauthorized", 403)
		return
	}
	type activeTable struct {
		ID      string   `json:"id"`
		Game    string   `json:"game"`
		Started bool     `json:"started"`
		Humans  []string `json:"humans"`
	}
	tables := map[string]*activeTable{}
	for _, room := range s.roomManager.ActiveRooms() {
		tables[room.ID] = &activeTable{room.ID, room.Game, room.Started, []string{}}
	}
	s.mu.RLock()
	for client := range s.connections {
		if client.isBot || client.spectator || client.tableID == "" {
			continue
		}
		entry := tables[client.tableID]
		if entry == nil {
			continue
		}
		table, exists := s.roomManager.GetTable(client.tableID)
		if !exists {
			continue
		}
		table.RLock()
		player, seated := table.Players[client.playerID]
		activePlayer := seated && player.IsActive
		table.RUnlock()
		if !activePlayer {
			continue
		}
		found := false
		for _, id := range entry.Humans {
			if id == client.playerID {
				found = true
			}
		}
		if !found {
			entry.Humans = append(entry.Humans, client.playerID)
		}
	}
	s.mu.RUnlock()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"tables": tables})
}
