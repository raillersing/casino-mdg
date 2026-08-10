package config

import (
	"os"
	"time"
)

type Config struct {
	ServerAddr      string
	RedisURL        string
	JWTSecret       string
	GracePeriod     time.Duration
	SnapshotInterval time.Duration
	MaxTables       int
	MaxPlayersPerTable int
}

func Load() (*Config, error) {
	return &Config{
		ServerAddr:           getEnv("GAME_ENGINE_ADDR", ":8080"),
		RedisURL:             getEnv("REDIS_URL", "redis://localhost:6379/0"),
		JWTSecret:            getEnv("JWT_SECRET", "dev-secret"),
		GracePeriod:          30 * time.Second,
		SnapshotInterval:     5 * time.Second,
		MaxTables:            10000,
		MaxPlayersPerTable:   9,
	}, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
