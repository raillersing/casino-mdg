import { useEffect, useRef, useCallback } from 'react'
import { useGameStore } from '@stores/gameStore'

const RECONNECT_DELAY = 3000
const MAX_RECONNECT_ATTEMPTS = 5

export function useWebSocket(url: string) {
  const ws = useRef<WebSocket | null>(null)
  const reconnectAttempts = useRef(0)
  const setReconnecting = useGameStore((state) => state.setReconnecting)

  const connect = useCallback(() => {
    setReconnecting(true)
    
    ws.current = new WebSocket(url)
    
    ws.current.onopen = () => {
      reconnectAttempts.current = 0
      setReconnecting(false)
    }
    
    ws.current.onclose = () => {
      if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts.current++
        setTimeout(connect, RECONNECT_DELAY * reconnectAttempts.current)
      }
    }
    
    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error)
    }
  }, [url, setReconnecting])

  const send = useCallback((data: object) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data))
    }
  }, [])

  useEffect(() => {
    connect()
    return () => ws.current?.close()
  }, [connect])

  return { ws, send }
}
