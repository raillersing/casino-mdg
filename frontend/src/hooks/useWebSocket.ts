import { useEffect, useRef, useCallback } from "react";
import { useGameStore } from "@stores/gameStore";

const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;

type WebSocketOptions = {
  enabled?: boolean;
  onOpen?: (socket: WebSocket) => void;
  onClose?: () => void;
  onMessage?: (event: MessageEvent<string>) => void;
};

export function useWebSocket(url: string, options: WebSocketOptions = {}) {
  const ws = useRef<WebSocket | null>(null);
  const closed = useRef(false);
  const reconnectAttempts = useRef(0);
  const setReconnecting = useGameStore((state) => state.setReconnecting);
  const accessToken = useGameStore((state) => state.accessToken);
  const { enabled = true, onOpen, onClose, onMessage } = options;

  const connect = useCallback(() => {
    closed.current = false;
    setReconnecting(true);

    const separator = url.includes("?") ? "&" : "?";
    ws.current = new WebSocket(
      accessToken
        ? `${url}${separator}token=${encodeURIComponent(accessToken)}`
        : url,
    );

    ws.current.onopen = () => {
      reconnectAttempts.current = 0;
      setReconnecting(false);
      onOpen?.(ws.current!);
    };

    ws.current.onclose = () => {
      onClose?.();
      if (
        !closed.current &&
        reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS
      ) {
        reconnectAttempts.current++;
        setTimeout(connect, RECONNECT_DELAY * reconnectAttempts.current);
      }
    };

    ws.current.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
    ws.current.onmessage = (event) => onMessage?.(event);
  }, [accessToken, onClose, onMessage, onOpen, setReconnecting, url]);

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
      ws.current?.close();
    };
  }, [accessToken, connect, enabled, url]);

  return { ws, send };
}
