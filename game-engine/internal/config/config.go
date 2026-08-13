package config

import (
	"fmt"
	"os"
	"time"
)

type Config struct {
	ServerAddr         string
	RedisURL           string
	JWTSecret          string
	BotServiceSecret   string
	ResultSecret       string
	GracePeriod        time.Duration
	SnapshotInterval   time.Duration
	MaxTables          int
	MaxPlayersPerTable int
	Deterministic      bool
	Blinds             bool
	BotActionDelay     time.Duration
	BotProfile         string
}

func Load() (*Config, error) {
	return &Config{
		ServerAddr:         getEnv("GAME_ENGINE_ADDR", ":8080"),
		RedisURL:           getEnv("REDIS_URL", "redis://localhost:6379/0"),
		JWTSecret:          getEnv("JWT_SECRET", "dev-jwt-secret-change-me-32-bytes"),
		BotServiceSecret:   getEnv("GAME_ENGINE_BOT_SECRET", "dev-game-engine-bot-secret-change-me"),
		ResultSecret:       getEnv("GAME_ENGINE_RESULT_SECRET", "dev-game-engine-result-secret-change-me"),
		GracePeriod:        30 * time.Second,
		SnapshotInterval:   5 * time.Second,
		MaxTables:          10000,
		MaxPlayersPerTable: 9,
		Blinds:             true,
		BotActionDelay:     botActionDelay(),
		BotProfile:         botProfile(),
	}, nil
}

func botProfile() string {
	profile := os.Getenv("GAME_ENGINE_BOT_PROFILE")
	if profile == "fast" || profile == "expert" {
		return profile
	}
	return "normal"
}

func botActionDelay() time.Duration {
	if os.Getenv("GAME_ENGINE_DETERMINISTIC") == "true" {
		return 0
	}
	value := os.Getenv("GAME_ENGINE_BOT_DELAY_MS")
	if value == "" {
		return 1100 * time.Millisecond
	}
	var milliseconds int
	if _, err := fmt.Sscanf(value, "%d", &milliseconds); err != nil || milliseconds < 0 {
		return 1100 * time.Millisecond
	}
	return time.Duration(milliseconds) * time.Millisecond
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
