import { useEffect, useRef, useCallback, useState } from "react";
import { useGameStore } from "@stores/gameStore";
import { trackEvent } from "@services/analytics";

const BASE_RECONNECT_DELAY = 1500;
const MAX_RECONNECT_DELAY = 12000;
const MAX_RECONNECT_ATTEMPTS = 15;
const HEARTBEAT_INTERVAL = 10000;

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "closed" | "offline";

type WebSocketOptions = {
  enabled?: boolean;
  onOpen?: (socket: WebSocket) => void;
  onClose?: () => void;
  onMessage?: (event: MessageEvent<string>) => void;
  onConnectionStateChange?: (state: ConnectionState) => void;
  onLatencyUpdate?: (latencyMs: number) => void;
};

export function useWebSocket(url: string, options: WebSocketOptions = {}) {
  const ws = useRef<WebSocket | null>(null);
  const closed = useRef(false);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<number | null>(null);
  const heartbeatTimer = useRef<number | null>(null);
  const heartbeatSentAt = useRef<number | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [connState, setConnState] = useState<ConnectionState>("connecting");

  const callbacks = useRef<WebSocketOptions>({});
  const setReconnecting = useGameStore((state) => state.setReconnecting);
  const accessToken = useGameStore((state) => state.accessToken);
  const {
    enabled = true,
    onOpen,
    onClose,
    onMessage,
    onConnectionStateChange,
    onLatencyUpdate,
  } = options;

  callbacks.current = {
    onOpen,
    onClose,
    onMessage,
    onConnectionStateChange,
    onLatencyUpdate,
  };

  const updateState = useCallback((state: ConnectionState) => {
    setConnState(state);
    callbacks.current.onConnectionStateChange?.(state);
  }, []);

  const connect = useCallback(() => {
    if (!navigator.onLine) {
      updateState("offline");
      return;
    }

    closed.current = false;
    setReconnecting(true);
    updateState(reconnectAttempts.current ? "reconnecting" : "connecting");

    const socketUrl = new URL(url, window.location.href);
    socketUrl.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    if (accessToken) {
      socketUrl.searchParams.set("token", accessToken);
    }
    const socket = new WebSocket(socketUrl.toString());
    ws.current = socket;

    socket.onopen = () => {
      const wasReconnect = reconnectAttempts.current > 0;
      reconnectAttempts.current = 0;
      setReconnecting(false);
      if (wasReconnect) void trackEvent("reconnection_succeeded");
      updateState("connected");

      if (heartbeatTimer.current !== null) {
        window.clearInterval(heartbeatTimer.current);
      }
      heartbeatTimer.current = window.setInterval(() => {
        if (ws.current?.readyState === WebSocket.OPEN) {
          heartbeatSentAt.current = performance.now();
          ws.current.send(
            JSON.stringify({
              type: "ping",
              timestamp: new Date().toISOString(),
            })
          );
        }
      }, HEARTBEAT_INTERVAL);

      callbacks.current.onOpen?.(socket);
    };

    socket.onclose = () => {
      if (ws.current !== socket) return;
      if (heartbeatTimer.current !== null) {
        window.clearInterval(heartbeatTimer.current);
        heartbeatTimer.current = null;
      }
      callbacks.current.onClose?.();

      if (!closed.current && reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts.current++;
        updateState("reconnecting");
        if (reconnectTimer.current !== null) {
          window.clearTimeout(reconnectTimer.current);
        }
        // Calcul exponentiel avec gigue (jitter) pour Madagascar mobile 3G/4G
        const expDelay = Math.min(
          BASE_RECONNECT_DELAY * Math.pow(1.3, reconnectAttempts.current) + Math.random() * 400,
          MAX_RECONNECT_DELAY
        );
        reconnectTimer.current = window.setTimeout(connect, expDelay);
      } else if (closed.current) {
        updateState("closed");
      }
    };

    socket.onerror = (error) => {
      console.warn("WebSocket status warning:", error);
    };

    socket.onmessage = (event) => {
      callbacks.current.onMessage?.(event);
      try {
        const message = JSON.parse(String(event.data)) as { type?: string };
        if (
          (message.type === "pong" || message.type === "heartbeat") &&
          heartbeatSentAt.current !== null
        ) {
          const latencyMs = Math.round(performance.now() - heartbeatSentAt.current);
          heartbeatSentAt.current = null;
          setLatency(latencyMs);
          callbacks.current.onLatencyUpdate?.(latencyMs);
          void trackEvent("heartbeat_latency", {
            metadata: { latency_ms: latencyMs },
          });
        }
      } catch {
        // Handled by consumer callbacks
      }
    };
  }, [accessToken, setReconnecting, updateState, url]);

  const send = useCallback((data: object) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data));
    }
  }, []);

  // Gestion des événements réseau du navigateur (Online / Offline instantané)
  useEffect(() => {
    const handleOnline = () => {
      if (reconnectTimer.current !== null) {
        window.clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      reconnectAttempts.current = 0;
      connect();
    };

    const handleOffline = () => {
      updateState("offline");
      if (reconnectTimer.current !== null) {
        window.clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [connect, updateState]);

  useEffect(() => {
    if (!enabled || !url || !accessToken) return;
    connect();
    return () => {
      closed.current = true;
      if (reconnectTimer.current !== null) {
        window.clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (heartbeatTimer.current !== null) {
        window.clearInterval(heartbeatTimer.current);
        heartbeatTimer.current = null;
      }
      ws.current?.close();
    };
  }, [accessToken, connect, enabled, url]);

  return { ws, send, latency, connectionState: connState };
}
