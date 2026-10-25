package state

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// SnapshotMeta represents versioning metadata for fencing and monotonic state progression.
type SnapshotMeta struct {
	TableID    string `json:"table_id"`
	Sequence   uint64 `json:"sequence"`
	Generation uint64 `json:"generation"`
	SavedAt    int64  `json:"saved_at"`
}

// TableLease represents distributed node ownership of a table.
type TableLease struct {
	TableID    string `json:"table_id"`
	NodeID     string `json:"node_id"`
	Generation uint64 `json:"generation"`
	AcquiredAt int64  `json:"acquired_at"`
	ExpiresAt  int64  `json:"expires_at"`
}

type SnapshotManager struct {
	redisClient *redis.Client
	ttl         time.Duration
	nodeID      string

	// In-memory thread-safe fallback for environments without live Redis
	memMu     sync.RWMutex
	memData   map[string][]byte
	memMeta   map[string]SnapshotMeta
	memLeases map[string]TableLease
	memGen    map[string]uint64
}

func NewSnapshotManager(redisURL string) *SnapshotManager {
	return NewSnapshotManagerWithNode(redisURL, "engine-node-1")
}

func NewSnapshotManagerWithNode(redisURL, nodeID string) *SnapshotManager {
	var client *redis.Client
	if redisURL != "" {
		if opts, err := redis.ParseURL(redisURL); err == nil {
			client = redis.NewClient(opts)
		}
	}
	return &SnapshotManager{
		redisClient: client,
		ttl:         15 * time.Minute,
		nodeID:      nodeID,
		memData:     make(map[string][]byte),
		memMeta:     make(map[string]SnapshotMeta),
		memLeases:   make(map[string]TableLease),
		memGen:      make(map[string]uint64),
	}
}

// Ping verifies connectivity to the underlying Redis instance.
func (sm *SnapshotManager) Ping(ctx context.Context) error {
	if sm.redisClient == nil {
		return fmt.Errorf("redis client not configured")
	}
	return sm.redisClient.Ping(ctx).Err()
}

// AcquireTableLease acquires an atomic distributed lease on a table using a fencing generation token.
// If acquired, returns the generation number.
// If already owned by another node and lease is unexpired, returns error.
func (sm *SnapshotManager) AcquireTableLease(ctx context.Context, tableID, nodeID string, ttl time.Duration) (uint64, error) {
	if ttl <= 0 {
		ttl = 30 * time.Second
	}
	now := time.Now().Unix()

	if sm.redisClient != nil {
		luaScript := `
			local currentOwner = redis.call('GET', KEYS[1])
			if currentOwner == false then
				local gen = redis.call('INCR', KEYS[2])
				redis.call('SETEX', KEYS[1], ARGV[2], ARGV[1])
				return {1, gen}
			elseif currentOwner == ARGV[1] then
				redis.call('EXPIRE', KEYS[1], ARGV[2])
				local gen = redis.call('GET', KEYS[2])
				if gen == false then gen = 1 end
				return {2, tonumber(gen)}
			else
				local gen = redis.call('GET', KEYS[2])
				if gen == false then gen = 1 end
				return {0, tonumber(gen), currentOwner}
			end
		`
		keys := []string{"table:owner:" + tableID, "table:generation:" + tableID}
		res, err := sm.redisClient.Eval(ctx, luaScript, keys, nodeID, int(ttl.Seconds())).Result()
		if err == nil {
			if arr, ok := res.([]interface{}); ok && len(arr) >= 2 {
				status := arr[0].(int64)
				gen := uint64(arr[1].(int64))
				if status == 1 || status == 2 {
					return gen, nil
				}
				owner := "unknown"
				if len(arr) >= 3 {
					if s, ok := arr[2].(string); ok {
						owner = s
					}
				}
				return 0, fmt.Errorf("table %s already leased to node %s", tableID, owner)
			}
		}
	}

	// In-memory fallback
	sm.memMu.Lock()
	defer sm.memMu.Unlock()
	lease, exists := sm.memLeases[tableID]
	if !exists || lease.ExpiresAt <= now {
		sm.memGen[tableID]++
		gen := sm.memGen[tableID]
		sm.memLeases[tableID] = TableLease{
			TableID:    tableID,
			NodeID:     nodeID,
			Generation: gen,
			AcquiredAt: now,
			ExpiresAt:  now + int64(ttl.Seconds()),
		}
		return gen, nil
	}
	if lease.NodeID == nodeID {
		lease.ExpiresAt = now + int64(ttl.Seconds())
		sm.memLeases[tableID] = lease
		return lease.Generation, nil
	}
	return 0, fmt.Errorf("table %s already leased to node %s", tableID, lease.NodeID)
}

// RenewTableLease extends the TTL of an active lease for the specified node.
func (sm *SnapshotManager) RenewTableLease(ctx context.Context, tableID, nodeID string, ttl time.Duration) error {
	if ttl <= 0 {
		ttl = 30 * time.Second
	}
	now := time.Now().Unix()

	if sm.redisClient != nil {
		luaScript := `
			local currentOwner = redis.call('GET', KEYS[1])
			if currentOwner == ARGV[1] then
				redis.call('EXPIRE', KEYS[1], ARGV[2])
				return 1
			end
			return 0
		`
		res, err := sm.redisClient.Eval(ctx, luaScript, []string{"table:owner:" + tableID}, nodeID, int(ttl.Seconds())).Result()
		if err == nil {
			if ok, _ := res.(int64); ok == 1 {
				return nil
			}
			return fmt.Errorf("cannot renew lease: not owner of table %s", tableID)
		}
	}

	sm.memMu.Lock()
	defer sm.memMu.Unlock()
	lease, exists := sm.memLeases[tableID]
	if !exists || lease.NodeID != nodeID || lease.ExpiresAt <= now {
		return fmt.Errorf("cannot renew lease: not owner of table %s", tableID)
	}
	lease.ExpiresAt = now + int64(ttl.Seconds())
	sm.memLeases[tableID] = lease
	return nil
}

// ReleaseTableLease explicitly relinquishes the lease on a table.
func (sm *SnapshotManager) ReleaseTableLease(ctx context.Context, tableID, nodeID string) error {
	if sm.redisClient != nil {
		luaScript := `
			local currentOwner = redis.call('GET', KEYS[1])
			if currentOwner == ARGV[1] then
				redis.call('DEL', KEYS[1])
				return 1
			end
			return 0
		`
		_, _ = sm.redisClient.Eval(ctx, luaScript, []string{"table:owner:" + tableID}, nodeID).Result()
	}

	sm.memMu.Lock()
	defer sm.memMu.Unlock()
	if lease, exists := sm.memLeases[tableID]; exists && lease.NodeID == nodeID {
		delete(sm.memLeases, tableID)
	}
	return nil
}

// GetTableLease returns the current owner lease information of a table.
func (sm *SnapshotManager) GetTableLease(ctx context.Context, tableID string) (TableLease, bool, error) {
	now := time.Now().Unix()
	if sm.redisClient != nil {
		owner, err := sm.redisClient.Get(ctx, "table:owner:"+tableID).Result()
		if err == nil && owner != "" {
			genStr, _ := sm.redisClient.Get(ctx, "table:generation:"+tableID).Result()
			var gen uint64 = 1
			if genStr != "" {
				_ = json.Unmarshal([]byte(genStr), &gen)
			}
			ttl, _ := sm.redisClient.TTL(ctx, "table:owner:"+tableID).Result()
			return TableLease{
				TableID:    tableID,
				NodeID:     owner,
				Generation: gen,
				ExpiresAt:  now + int64(ttl.Seconds()),
			}, true, nil
		}
	}

	sm.memMu.RLock()
	defer sm.memMu.RUnlock()
	lease, exists := sm.memLeases[tableID]
	if exists && lease.ExpiresAt > now {
		return lease, true, nil
	}
	return TableLease{}, false, nil
}

// SaveVersionedSnapshot saves a state snapshot with monotonic sequence and generation fencing.
// Rejects stale snapshots to avoid overwriting newer state from a split-brain or delayed goroutine.
func (sm *SnapshotManager) SaveVersionedSnapshot(tableID string, sequence, generation uint64, state interface{}) error {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	data, err := json.Marshal(state)
	if err != nil {
		return err
	}

	meta := SnapshotMeta{
		TableID:    tableID,
		Sequence:   sequence,
		Generation: generation,
		SavedAt:    time.Now().Unix(),
	}
	metaBytes, _ := json.Marshal(meta)

	if sm.redisClient != nil {
		luaScript := `
			local newGen = tonumber(ARGV[4])
			local newSeq = tonumber(ARGV[3])

			local tableGen = redis.call('GET', KEYS[3])
			if tableGen ~= false then
				local curTableGen = tonumber(tableGen) or 0
				if newGen < curTableGen then
					return {0, "stale generation: fenced"}
				end
			end

			local existingMeta = redis.call('GET', KEYS[2])
			if existingMeta ~= false then
				local m = cjson.decode(existingMeta)
				local curGen = tonumber(m.generation) or 0
				local curSeq = tonumber(m.sequence) or 0
				if newGen < curGen then
					return {0, "stale generation: fenced"}
				elseif newGen == curGen and newSeq < curSeq then
					return {0, "stale sequence: rejected"}
				end
			end
			redis.call('SETEX', KEYS[1], ARGV[5], ARGV[1])
			redis.call('SETEX', KEYS[2], ARGV[5], ARGV[2])
			return {1, "ok"}
		`
		keys := []string{"snapshot:" + tableID, "snapshot:meta:" + tableID, "table:generation:" + tableID}
		res, err := sm.redisClient.Eval(ctx, luaScript, keys, string(data), string(metaBytes), sequence, generation, int(sm.ttl.Seconds())).Result()
		if err == nil {
			if arr, ok := res.([]interface{}); ok && len(arr) >= 2 {
				if arr[0].(int64) == 1 {
					return nil
				}
				return fmt.Errorf("%v", arr[1])
			}
		}
	}

	// In-memory fallback
	sm.memMu.Lock()
	defer sm.memMu.Unlock()
	if curTableGen, exists := sm.memGen[tableID]; exists && generation < curTableGen {
		return fmt.Errorf("stale generation: fenced")
	}
	if existing, exists := sm.memMeta[tableID]; exists {
		if generation < existing.Generation {
			return fmt.Errorf("stale generation: fenced")
		}
		if generation == existing.Generation && sequence < existing.Sequence {
			return fmt.Errorf("stale sequence: rejected")
		}
	}
	sm.memData[tableID] = data
	sm.memMeta[tableID] = meta
	return nil
}

func (sm *SnapshotManager) SaveSnapshot(tableID string, state interface{}) error {
	return sm.SaveVersionedSnapshot(tableID, 0, 0, state)
}

func (sm *SnapshotManager) GetSnapshotInto(tableID string, destination interface{}) error {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if sm.redisClient != nil {
		data, err := sm.redisClient.Get(ctx, "snapshot:"+tableID).Bytes()
		if err == nil {
			return json.Unmarshal(data, destination)
		}
	}

	sm.memMu.RLock()
	defer sm.memMu.RUnlock()
	data, exists := sm.memData[tableID]
	if !exists {
		return fmt.Errorf("snapshot not found")
	}
	return json.Unmarshal(data, destination)
}

func (sm *SnapshotManager) GetSnapshot(tableID string) (map[string]interface{}, error) {
	var state map[string]interface{}
	err := sm.GetSnapshotInto(tableID, &state)
	return state, err
}

func (sm *SnapshotManager) SnapshotMetaFor(tableID string) (SnapshotMeta, bool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if sm.redisClient != nil {
		data, err := sm.redisClient.Get(ctx, "snapshot:meta:"+tableID).Bytes()
		if err == nil {
			var meta SnapshotMeta
			if err := json.Unmarshal(data, &meta); err == nil {
				return meta, true, nil
			}
		}
	}

	sm.memMu.RLock()
	defer sm.memMu.RUnlock()
	meta, exists := sm.memMeta[tableID]
	return meta, exists, nil
}
