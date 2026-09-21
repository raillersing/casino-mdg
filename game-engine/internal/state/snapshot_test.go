package state

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"
)

func TestSnapshotManagerLeaseAcquisitionAndFencingToken(t *testing.T) {
	sm := NewSnapshotManagerWithNode("", "node-1")
	ctx := context.Background()
	tableID := "table-fence-01"

	// Node 1 acquires lease
	gen1, err := sm.AcquireTableLease(ctx, tableID, "node-1", time.Second)
	if err != nil {
		t.Fatalf("expected node-1 to acquire lease, got: %v", err)
	}
	if gen1 != 1 {
		t.Fatalf("expected generation 1, got %d", gen1)
	}

	// Node 2 attempts to acquire lease while node-1 holds it
	_, err = sm.AcquireTableLease(ctx, tableID, "node-2", time.Second)
	if err == nil {
		t.Fatal("expected node-2 to be rejected while node-1 holds lease")
	}

	// Node 1 renews lease
	if err := sm.RenewTableLease(ctx, tableID, "node-1", time.Second); err != nil {
		t.Fatalf("expected node-1 lease renewal to succeed, got: %v", err)
	}

	// Node 2 cannot renew node-1's lease
	if err := sm.RenewTableLease(ctx, tableID, "node-2", time.Second); err == nil {
		t.Fatal("expected node-2 renewal to fail")
	}

	// Node 1 releases lease
	if err := sm.ReleaseTableLease(ctx, tableID, "node-1"); err != nil {
		t.Fatalf("expected release to succeed, got: %v", err)
	}

	// Node 2 can now acquire lease, generation increments to 2
	gen2, err := sm.AcquireTableLease(ctx, tableID, "node-2", time.Second)
	if err != nil {
		t.Fatalf("expected node-2 to acquire lease after release, got: %v", err)
	}
	if gen2 != 2 {
		t.Fatalf("expected generation 2, got %d", gen2)
	}
}

func TestVersionedSnapshotFencingAndRejection(t *testing.T) {
	sm := NewSnapshotManagerWithNode("", "node-1")
	tableID := "table-snap-fence-01"

	// Gen 1, Seq 5
	err := sm.SaveVersionedSnapshot(tableID, 5, 1, map[string]interface{}{"step": 1})
	if err != nil {
		t.Fatalf("save gen 1 seq 5 failed: %v", err)
	}

	// Gen 1, Seq 6 (monotonic advance)
	err = sm.SaveVersionedSnapshot(tableID, 6, 1, map[string]interface{}{"step": 2})
	if err != nil {
		t.Fatalf("save gen 1 seq 6 failed: %v", err)
	}

	// Gen 1, Seq 4 (stale sequence from out-of-order goroutine)
	err = sm.SaveVersionedSnapshot(tableID, 4, 1, map[string]interface{}{"step": "stale"})
	if err == nil || err.Error() != "stale sequence: rejected" {
		t.Fatalf("expected stale sequence error, got: %v", err)
	}

	// Gen 2, Seq 1 (failover to new owner node with higher generation)
	err = sm.SaveVersionedSnapshot(tableID, 1, 2, map[string]interface{}{"step": "new_epoch"})
	if err != nil {
		t.Fatalf("save gen 2 seq 1 failed: %v", err)
	}

	// Gen 1, Seq 10 (zombie previous owner attempts to overwrite after recovery)
	err = sm.SaveVersionedSnapshot(tableID, 10, 1, map[string]interface{}{"step": "zombie"})
	if err == nil || err.Error() != "stale generation: fenced" {
		t.Fatalf("expected stale generation: fenced error, got: %v", err)
	}

	// Verify restored state is from Gen 2
	var restored map[string]interface{}
	if err := sm.GetSnapshotInto(tableID, &restored); err != nil {
		t.Fatalf("restore failed: %v", err)
	}
	if restored["step"] != "new_epoch" {
		t.Fatalf("expected step=new_epoch, got: %v", restored["step"])
	}
}

func TestLiveRedisDistributedLeaseAndFencing(t *testing.T) {
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://redis:6379/0"
	}

	node1 := NewSnapshotManagerWithNode(redisURL, "node-live-1")
	node2 := NewSnapshotManagerWithNode(redisURL, "node-live-2")

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	// Verify connectivity to Redis
	if node1.redisClient == nil || node1.redisClient.Ping(ctx).Err() != nil {
		t.Skip("Live Redis not reachable, skipping live Redis integration test")
		return
	}

	tableLive := fmt.Sprintf("table-live-test-%d", time.Now().UnixNano())

	// Step 1: Node 1 acquires lease
	gen1, err := node1.AcquireTableLease(ctx, tableLive, "node-live-1", 10*time.Second)
	if err != nil {
		t.Fatalf("node-1 lease acquisition failed: %v", err)
	}
	if gen1 == 0 {
		t.Fatalf("expected positive generation token, got %d", gen1)
	}

	// Step 2: Node 2 attempts to acquire lease while owned by Node 1 -> MUST FAIL
	_, err = node2.AcquireTableLease(ctx, tableLive, "node-live-2", 10*time.Second)
	if err == nil {
		t.Fatal("expected node-2 lease acquisition to be rejected while node-1 holds lease")
	}

	// Step 3: Node 1 saves versioned snapshot at Generation gen1, Sequence 1
	err = node1.SaveVersionedSnapshot(tableLive, 1, gen1, map[string]interface{}{
		"game":  "poker",
		"pot":   1500,
		"round": 1,
	})
	if err != nil {
		t.Fatalf("node-1 SaveVersionedSnapshot failed: %v", err)
	}

	// Step 4: Stale sequence rejection
	err = node1.SaveVersionedSnapshot(tableLive, 0, gen1, map[string]interface{}{"corrupt": true})
	if err == nil || err.Error() != "stale sequence: rejected" {
		t.Fatalf("expected stale sequence rejection, got: %v", err)
	}

	// Step 5: Node 1 releases lease
	if err := node1.ReleaseTableLease(ctx, tableLive, "node-live-1"); err != nil {
		t.Fatalf("node-1 ReleaseTableLease failed: %v", err)
	}

	// Step 6: Node 2 acquires lease after release -> Generation MUST increment
	gen2, err := node2.AcquireTableLease(ctx, tableLive, "node-live-2", 10*time.Second)
	if err != nil {
		t.Fatalf("node-2 AcquireTableLease failed: %v", err)
	}
	if gen2 <= gen1 {
		t.Fatalf("expected gen2 (%d) > gen1 (%d)", gen2, gen1)
	}

	// Step 7: Zombie write from Node 1 (using old gen1) MUST BE FENCED
	err = node1.SaveVersionedSnapshot(tableLive, 99, gen1, map[string]interface{}{"zombie": true})
	if err == nil || err.Error() != "stale generation: fenced" {
		t.Fatalf("expected zombie write to be fenced, got: %v", err)
	}

	// Step 8: Node 2 restores snapshot saved by Node 1
	var restored map[string]interface{}
	if err := node2.GetSnapshotInto(tableLive, &restored); err != nil {
		t.Fatalf("node-2 GetSnapshotInto failed: %v", err)
	}
	if restored["pot"] != float64(1500) && restored["pot"] != 1500 {
		t.Fatalf("expected pot=1500, got: %v", restored["pot"])
	}

	// Step 9: Node 2 successfully advances state with gen2
	err = node2.SaveVersionedSnapshot(tableLive, 2, gen2, map[string]interface{}{
		"game":  "poker",
		"pot":   3000,
		"round": 2,
	})
	if err != nil {
		t.Fatalf("node-2 advance state failed: %v", err)
	}

	// Step 10: Node 2 cleans up lease
	_ = node2.ReleaseTableLease(ctx, tableLive, "node-live-2")
}

