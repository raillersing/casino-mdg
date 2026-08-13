import { useEffect, useRef, useCallback } from "react";
import { useGameStore } from "@stores/gameStore";
import { trackEvent } from "@services/analytics";

const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;
const HEARTBEAT_INTERVAL = 15000;

type WebSocketOptions = {
  enabled?: boolean;
  onOpen?: (socket: WebSocket) => void;
  onClose?: () => void;
  onMessage?: (event: MessageEvent<string>) => void;
  onConnectionStateChange?: (
    state: "connecting" | "connected" | "reconnecting" | "closed",
  ) => void;
};

export function useWebSocket(url: string, options: WebSocketOptions = {}) {
  const ws = useRef<WebSocket | null>(null);
  const closed = useRef(false);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<number | null>(null);
  const heartbeatTimer = useRef<number | null>(null);
  const heartbeatSentAt = useRef<number | null>(null);
  const callbacks = useRef<
    Pick<
      WebSocketOptions,
      "onOpen" | "onClose" | "onMessage" | "onConnectionStateChange"
    >
  >({});
  const setReconnecting = useGameStore((state) => state.setReconnecting);
  const accessToken = useGameStore((state) => state.accessToken);
  const {
    enabled = true,
    onOpen,
    onClose,
    onMessage,
    onConnectionStateChange,
  } = options;

  callbacks.current = {
    onOpen,
    onClose,
    onMessage,
    onConnectionStateChange,
  };

  const connect = useCallback(() => {
    closed.current = false;
    setReconnecting(true);
    callbacks.current.onConnectionStateChange?.(
      reconnectAttempts.current ? "reconnecting" : "connecting",
    );

    const separator = url.includes("?") ? "&" : "?";
    const socket = new WebSocket(
      accessToken
        ? `${url}${separator}token=${encodeURIComponent(accessToken)}`
        : url,
    );
    ws.current = socket;

    socket.onopen = () => {
      const wasReconnect = reconnectAttempts.current > 0;
      reconnectAttempts.current = 0;
      setReconnecting(false);
      if (wasReconnect) void trackEvent("reconnection_succeeded");
      callbacks.current.onConnectionStateChange?.("connected");
      if (heartbeatTimer.current !== null)
        window.clearInterval(heartbeatTimer.current);
      heartbeatTimer.current = window.setInterval(() => {
        if (ws.current?.readyState === WebSocket.OPEN)
          heartbeatSentAt.current = performance.now();
        if (ws.current?.readyState === WebSocket.OPEN)
          ws.current.send(
            JSON.stringify({
              type: "ping",
              timestamp: new Date().toISOString(),
            }),
          );
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
      if (
        !closed.current &&
        reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS
      ) {
        reconnectAttempts.current++;
        callbacks.current.onConnectionStateChange?.("reconnecting");
        if (reconnectTimer.current !== null)
          window.clearTimeout(reconnectTimer.current);
        reconnectTimer.current = window.setTimeout(
          connect,
          RECONNECT_DELAY * reconnectAttempts.current,
        );
      } else if (closed.current) {
        callbacks.current.onConnectionStateChange?.("closed");
      }
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
    socket.onmessage = (event) => {
      callbacks.current.onMessage?.(event);
      try {
        const message = JSON.parse(String(event.data)) as { type?: string };
        if (
          (message.type === "pong" || message.type === "heartbeat") &&
          heartbeatSentAt.current !== null
        ) {
          const latencyMs = Math.round(
            performance.now() - heartbeatSentAt.current,
          );
          heartbeatSentAt.current = null;
          void trackEvent("heartbeat_latency", {
            metadata: { latency_ms: latencyMs },
          });
        }
      } catch {
        // Application message parsing remains owned by the page callback.
      }
    };
  }, [accessToken, setReconnecting, url]);

  const send = useCallback((data: object) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data));
    }
  }, []);

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

  return { ws, send };
}
