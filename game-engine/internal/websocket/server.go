package websocket

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/casino-mdg/game-engine/internal/config"
	"github.com/casino-mdg/game-engine/internal/room"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
	ReadBufferSize:   1024,
	WriteBufferSize:  1024,
	HandshakeTimeout: 10 * time.Second,
}

// Message types for WebSocket protocol
type MessageType string

const (
	MsgJoin      MessageType = "join"
	MsgLeave     MessageType = "leave"
	MsgAction    MessageType = "action"
	MsgState     MessageType = "state"
	MsgPing      MessageType = "ping"
	MsgPong      MessageType = "pong"
	MsgError     MessageType = "error"
	MsgSync      MessageType = "sync"
	MsgHeartbeat MessageType = "heartbeat"
)

type Message struct {
	Type      MessageType `json:"type"`
	TableID   string      `json:"table_id,omitempty"`
	PlayerID  string      `json:"player_id,omitempty"`
	Action    string      `json:"action,omitempty"`
	Payload   interface{} `json:"payload,omitempty"`
	Timestamp time.Time   `json:"timestamp"`
	EventID   string      `json:"event_id,omitempty"`
}

type Server struct {
	config      *config.Config
	roomManager *room.Manager
	clients     map[string]*Client
	mu          sync.RWMutex
}

type Client struct {
	conn     *websocket.Conn
	playerID string
	tableID  string
	send     chan []byte
	lastPong time.Time
}

func NewServer(cfg *config.Config, rm *room.Manager) *Server {
	return &Server{
		config:      cfg,
		roomManager: rm,
		clients:     make(map[string]*Client),
	}
}

func (s *Server) HandleConnection(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	client := &Client{
		conn:     conn,
		send:     make(chan []byte, 256),
		lastPong: time.Now(),
	}

	go s.writePump(client)
	s.readPump(client)
}

func (s *Server) readPump(client *Client) {
	defer func() {
		s.removeClient(client)
		client.conn.Close()
	}()

	client.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	client.conn.SetPongHandler(func(string) error {
		client.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		client.lastPong = time.Now()
		return nil
	})

	for {
		var msg Message
		err := client.conn.ReadJSON(&msg)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		msg.Timestamp = time.Now()
		s.handleMessage(client, &msg)
	}
}

func (s *Server) writePump(client *Client) {
	ticker := time.NewTicker(15 * time.Second)
	defer func() {
		ticker.Stop()
		client.conn.Close()
	}()

	for {
		select {
		case message, ok := <-client.send:
			if !ok {
				client.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			client.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			client.conn.WriteMessage(websocket.TextMessage, message)

		case <-ticker.C:
			client.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := client.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (s *Server) handleMessage(client *Client, msg *Message) {
	switch msg.Type {
	case MsgJoin:
		s.handleJoin(client, msg)
	case MsgLeave:
		s.handleLeave(client, msg)
	case MsgAction:
		s.handleAction(client, msg)
	case MsgPing:
		client.conn.WriteJSON(Message{Type: MsgPong, Timestamp: time.Now()})
	case MsgSync:
		s.handleSync(client, msg)
	default:
		client.conn.WriteJSON(Message{Type: MsgError, Payload: "unknown message type", Timestamp: time.Now()})
	}
}

func (s *Server) handleJoin(client *Client, msg *Message) {
	table, ok := s.roomManager.GetTable(msg.TableID)
	if !ok {
		client.conn.WriteJSON(Message{Type: MsgError, Payload: "table not found", Timestamp: time.Now()})
		return
	}

	client.tableID = msg.TableID
	client.playerID = msg.PlayerID
	s.addClient(client)

	state := map[string]interface{}{
		"table_id":  table.ID,
		"game_type": table.GameType,
		"players":   table.Players,
	}
	client.conn.WriteJSON(Message{Type: MsgState, Payload: state, Timestamp: time.Now()})
}

func (s *Server) handleLeave(client *Client, msg *Message) {
	s.removeClient(client)
}

func (s *Server) handleAction(client *Client, msg *Message) {
	msg.EventID = generateEventID()
	s.broadcastToTable(msg.TableID, msg)
}

func (s *Server) handleSync(client *Client, msg *Message) {
	// TODO: send missed events since last_event_id
}

func (s *Server) addClient(client *Client) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.clients[client.playerID] = client
}

func (s *Server) removeClient(client *Client) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.clients, client.playerID)
}

func (s *Server) broadcastToTable(tableID string, msg *Message) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, _ := json.Marshal(msg)
	for _, client := range s.clients {
		if client.tableID == tableID {
			select {
			case client.send <- data:
			default:
			}
		}
	}
}

func generateEventID() string {
	return time.Now().Format("20060102T150405.000") + "-" + uuid.New().String()[:8]
}
