package state

import (
	"context"
	"encoding/json"
	"time"

	"github.com/redis/go-redis/v9"
)

type SnapshotManager struct {
	redisClient *redis.Client
	ttl         time.Duration
}

func NewSnapshotManager(redisURL string) *SnapshotManager {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		panic(err)
	}
	return &SnapshotManager{
		redisClient: redis.NewClient(opts),
		ttl:         5 * time.Minute,
	}
}

func (sm *SnapshotManager) SaveSnapshot(tableID string, state interface{}) error {
	ctx := context.Background()
	data, err := json.Marshal(state)
	if err != nil {
		return err
	}
	return sm.redisClient.Set(ctx, "snapshot:"+tableID, data, sm.ttl).Err()
}

func (sm *SnapshotManager) GetSnapshot(tableID string) (map[string]interface{}, error) {
	ctx := context.Background()
	data, err := sm.redisClient.Get(ctx, "snapshot:"+tableID).Bytes()
	if err != nil {
		return nil, err
	}

	var state map[string]interface{}
	if err := json.Unmarshal(data, &state); err != nil {
		return nil, err
	}
	return state, nil
}
