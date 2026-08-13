package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/casino-mdg/game-engine/internal/config"
	"github.com/casino-mdg/game-engine/internal/room"
	"github.com/casino-mdg/game-engine/internal/websocket"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Room Manager (core du game engine)
	rm := room.NewManager(cfg)

	// WebSocket Server
	wsServer := websocket.NewServer(cfg, rm)

	// HTTP routes
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", wsServer.HandleConnection)
	mux.HandleFunc("/internal/bots/attach", wsServer.AttachBots)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok","service":"game-engine","version":"1.0.0"}`))
	})
	mux.HandleFunc("/metrics", func(w http.ResponseWriter, r *http.Request) {
		stats := rm.Stats()
		w.Header().Set("Content-Type", "text/plain; version=0.0.4")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("# TYPE casino_tables_active gauge\ncasino_tables_active " + strconv.Itoa(stats.TablesActive) + "\n# TYPE casino_players_active gauge\ncasino_players_active " + strconv.Itoa(stats.PlayersActive) + "\n# TYPE casino_events_total counter\ncasino_events_total " + strconv.FormatUint(stats.EventsTotal, 10) + "\n# TYPE casino_websocket_clients gauge\ncasino_websocket_clients " + strconv.Itoa(wsServer.ClientCount()) + "\n"))
	})

	srv := &http.Server{
		Addr:         cfg.ServerAddr,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	// Graceful shutdown
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	log.Printf("🎮 Game Engine started on %s", cfg.ServerAddr)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("Server forced to shutdown: %v", err)
	}

	log.Println("Game Engine stopped gracefully")
}
