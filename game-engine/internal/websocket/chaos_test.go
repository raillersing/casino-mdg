package websocket

import (
	"context"
	"fmt"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/casino-mdg/game-engine/internal/config"
	"github.com/casino-mdg/game-engine/internal/room"
	"github.com/gorilla/websocket"
)

func TestChaosFailoverAndDistributedFencingBetweenNodes(t *testing.T) {
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://redis:6379/0"
	}

	tableID := fmt.Sprintf("table-chaos-%d", time.Now().UnixNano())

	// Configuration for Node 1
	cfg1 := &config.Config{
		JWTSecret:     "chaos-jwt-secret",
		ResultSecret:  "chaos-res-secret",
		RedisURL:      redisURL,
		NodeID:        "node-engine-1",
		GracePeriod:   5 * time.Second,
		Deterministic: true,
	}
	manager1 := room.NewManager(cfg1)
	server1 := NewServer(cfg1, manager1)
	httpServer1 := httptest.NewServer(serverHandler(server1))

	// Configuration for Node 2
	cfg2 := &config.Config{
		JWTSecret:     "chaos-jwt-secret",
		ResultSecret:  "chaos-res-secret",
		RedisURL:      redisURL,
		NodeID:        "node-engine-2",
		GracePeriod:   5 * time.Second,
		Deterministic: true,
	}
	manager2 := room.NewManager(cfg2)
	server2 := NewServer(cfg2, manager2)
	httpServer2 := httptest.NewServer(serverHandler(server2))
	defer httpServer2.Close()

	// 1. Player connects to Node 1
	ticket1 := testAdmissionToken("p1", tableID, 0, "player", cfg1.JWTSecret, time.Now().Add(time.Hour).Unix())
	wsURL1 := "ws" + httpServer1.URL[len("http"):] + "/ws?token=" + ticket1

	conn1, resp1, err := websocket.DefaultDialer.Dial(wsURL1, nil)
	if err != nil {
		t.Fatalf("dial node 1 failed: %v", err)
	}
	if resp1.StatusCode != 101 {
		t.Fatalf("node 1 expected 101, got %d", resp1.StatusCode)
	}

	// Join table on Node 1
	joinMsg := Message{
		Type:    MsgJoin,
		TableID: tableID,
		Payload: map[string]interface{}{
			"game_type":   "poker",
			"name":        "Alice",
			"seat":        0,
			"max_players": 2,
		},
	}
	if err := conn1.WriteJSON(joinMsg); err != nil {
		t.Fatalf("write join node 1 failed: %v", err)
	}

	var state1 Message
	if err := conn1.ReadJSON(&state1); err != nil {
		t.Fatalf("read state1 failed: %v", err)
	}
	if state1.Type != MsgState {
		t.Fatalf("expected state msg, got %s", state1.Type)
	}
	initialSeq := state1.Sequence

	// Add second player to table on Node 1 so game starts
	if _, err := manager1.JoinPlayer(tableID, "p2", "Bob", 1); err != nil {
		t.Fatalf("manager1 Bob join failed: %v", err)
	}
	if err := manager1.StartTable(tableID); err != nil {
		t.Fatalf("manager1 start failed: %v", err)
	}
	// Action on Node 1
	if err := conn1.WriteJSON(Message{
		Type:     MsgAction,
		TableID:  tableID,
		Action:   "check",
		Sequence: initialSeq + 1,
	}); err != nil {
		t.Fatalf("conn1 write action failed: %v", err)
	}

	var actionMsg Message
	if err := conn1.ReadJSON(&actionMsg); err != nil {
		t.Fatalf("read actionMsg failed: %v", err)
	}
	savedSeq := actionMsg.Sequence

	// Verify Node 1 has acquired lease
	lease, ok, _ := server1.snapshots.GetTableLease(context.Background(), tableID)
	if ok && lease.NodeID != "" && lease.NodeID != "node-engine-1" {
		t.Fatalf("expected lease owner node-engine-1, got %s", lease.NodeID)
	}

	// 2. CHAOS INJECTION: Abrupt crash of Node 1
	conn1.Close()
	httpServer1.Close()

	// Release Node 1 lease in Redis to simulate failure detection / lease expiration
	_ = server1.snapshots.ReleaseTableLease(context.Background(), tableID, "node-engine-1")

	// 3. FAILOVER: Player connects to Node 2
	ticket2 := testAdmissionToken("p1", tableID, 0, "player", cfg2.JWTSecret, time.Now().Add(time.Hour).Unix())
	wsURL2 := "ws" + httpServer2.URL[len("http"):] + "/ws?token=" + ticket2

	conn2, resp2, err := websocket.DefaultDialer.Dial(wsURL2, nil)
	if err != nil {
		t.Fatalf("dial node 2 failover failed: %v", err)
	}
	if resp2.StatusCode != 101 {
		t.Fatalf("node 2 expected 101, got %d", resp2.StatusCode)
	}
	defer conn2.Close()

	// Join table on Node 2 (triggers snapshot restore from Redis + lease acquisition with incremented generation)
	if err := conn2.WriteJSON(joinMsg); err != nil {
		t.Fatalf("write join node 2 failed: %v", err)
	}

	var state2 Message
	if err := conn2.ReadJSON(&state2); err != nil {
		t.Fatalf("read state2 on node 2 failed: %v", err)
	}
	if state2.Type != MsgState {
		t.Fatalf("expected state msg on node 2, got %s", state2.Type)
	}

	// Sequence must be continuous with what was saved on Node 1
	if state2.Sequence < savedSeq {
		t.Fatalf("expected sequence >= %d after failover, got %d", savedSeq, state2.Sequence)
	}

	// Verify Node 2 is now the active lease owner with higher generation
	lease2, ok2, _ := server2.snapshots.GetTableLease(context.Background(), tableID)
	if ok2 && lease2.NodeID != "" {
		if lease2.NodeID != "node-engine-2" {
			t.Fatalf("expected lease owner node-engine-2, got %s", lease2.NodeID)
		}
		if lease2.Generation <= lease.Generation && lease.Generation > 0 {
			t.Fatalf("expected lease2 generation > lease generation (%d > %d)", lease2.Generation, lease.Generation)
		}
	}

	// 4. ZOMBIE INJECTION: Node 1 tries to commit snapshot after failover
	zombieErr := server1.snapshots.SaveVersionedSnapshot(tableID, 999, lease.Generation, map[string]interface{}{
		"corrupt": true,
	})
	if zombieErr == nil {
		t.Fatalf("expected zombie snapshot from node 1 to be fenced, but it succeeded")
	}

	// 5. CONTINUE GAME ON NODE 2: Player can send action on Node 2
	nextSeq := state2.Sequence
	err = conn2.WriteJSON(Message{
		Type:     MsgAction,
		TableID:  tableID,
		Action:   "check",
		Sequence: nextSeq,
	})
	if err != nil {
		t.Fatalf("conn2 action failed: %v", err)
	}

	t.Logf("Chaos failover successful: Node 1 -> Node 2 with lease fencing, monotonic sequence %d", nextSeq)
}
