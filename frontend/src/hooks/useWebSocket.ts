import { useEffect, useRef, useCallback } from "react";
import { useGameStore } from "@stores/gameStore";

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
  const setReconnecting = useGameStore((state) => state.setReconnecting);
  const accessToken = useGameStore((state) => state.accessToken);
  const {
    enabled = true,
    onOpen,
    onClose,
    onMessage,
    onConnectionStateChange,
  } = options;

  const connect = useCallback(() => {
    closed.current = false;
    setReconnecting(true);
    onConnectionStateChange?.(
      reconnectAttempts.current ? "reconnecting" : "connecting",
    );

    const separator = url.includes("?") ? "&" : "?";
    ws.current = new WebSocket(
      accessToken
        ? `${url}${separator}token=${encodeURIComponent(accessToken)}`
        : url,
    );

    ws.current.onopen = () => {
      reconnectAttempts.current = 0;
      setReconnecting(false);
      onConnectionStateChange?.("connected");
      if (heartbeatTimer.current !== null)
        window.clearInterval(heartbeatTimer.current);
      heartbeatTimer.current = window.setInterval(() => {
        if (ws.current?.readyState === WebSocket.OPEN)
          ws.current.send(
            JSON.stringify({
              type: "ping",
              timestamp: new Date().toISOString(),
            }),
          );
      }, HEARTBEAT_INTERVAL);
      onOpen?.(ws.current!);
    };

    ws.current.onclose = () => {
      if (heartbeatTimer.current !== null) {
        window.clearInterval(heartbeatTimer.current);
        heartbeatTimer.current = null;
      }
      onClose?.();
      if (
        !closed.current &&
        reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS
      ) {
        reconnectAttempts.current++;
        onConnectionStateChange?.("reconnecting");
        if (reconnectTimer.current !== null)
          window.clearTimeout(reconnectTimer.current);
        reconnectTimer.current = window.setTimeout(
          connect,
          RECONNECT_DELAY * reconnectAttempts.current,
        );
      } else if (closed.current) {
        onConnectionStateChange?.("closed");
      }
    };

    ws.current.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
    ws.current.onmessage = (event) => onMessage?.(event);
  }, [
    accessToken,
    onClose,
    onMessage,
    onOpen,
    onConnectionStateChange,
    setReconnecting,
    url,
  ]);

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
