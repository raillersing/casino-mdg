package websocket

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// The engine uses the same isolated server-to-server credential as its
// financial checkpoint endpoint. Browser tokens cannot invoke this API.
var playerSessionHTTPClient = sharedHTTPClient

func (s *Server) validHumanSession(ctx context.Context, playerID string, version int64) bool {
	// Unit-test-only configurations may not have a Django backend. Real
	// deployments must configure BACKEND_INTERNAL_URL and RESULT_SECRET.
	if s.config.BackendInternalURL == "" {
		return true
	}
	if playerID == "" || version < 0 || s.config.ResultSecret == "" {
		return false
	}

	endpoint := fmt.Sprintf("%s/api/v1/games/internal/sessions/%s/",
		strings.TrimRight(s.config.BackendInternalURL, "/"), url.PathEscape(playerID))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return false
	}
	req.Header.Set("X-Game-Engine-Secret", s.config.ResultSecret)
	resp, err := playerSessionHTTPClient.Do(req)
	if err != nil {
		return false
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return false
	}
	var status struct {
		Active       *bool  `json:"active"`
		TokenVersion *int64 `json:"token_version"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&status); err != nil {
		return false
	}
	return status.Active != nil && *status.Active && status.TokenVersion != nil && *status.TokenVersion == version
}

// Re-check an established socket. A password reset/admin suspension changing
// token_version or is_active terminates even sessions that already joined.
// Never manipulate table balances here: the existing DisconnectPlayer path
// preserves game state, and funded sessions need operational settlement review.
func (s *Server) watchHumanSession(client *Client, version int64, done <-chan struct{}) {
	interval := s.config.SessionValidationInterval
	if interval <= 0 {
		interval = 15 * time.Second
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-done:
			return
		case <-ticker.C:
			if !s.validHumanSession(context.Background(), client.playerID, version) {
				log.Printf("websocket account session rejected for player %s; disconnecting", client.playerID)
				_ = client.conn.Close()
				return
			}
		}
	}
}
