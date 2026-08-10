// Shared types for Casino MDG frontend

export interface User {
  id: string
  displayName: string
  email: string
  avatar?: string
  xp: number
  level: number
  balance: number
  streakDays: number
}

export interface Table {
  id: string
  gameType: 'poker' | 'belote' | 'rami'
  name: string
  players: Player[]
  minBuyIn: number
  maxBuyIn: number
  status: 'waiting' | 'playing' | 'finished'
  theme?: string
}

export interface Player {
  id: string
  name: string
  avatar?: string
  stack: number
  seat: number
  isActive: boolean
}

export interface GameAction {
  type: 'fold' | 'check' | 'call' | 'raise' | 'all_in'
  playerId: string
  amount?: number
  timestamp: string
}

export interface WebSocketMessage {
  type: string
  table_id?: string
  player_id?: string
  action?: string
  payload?: unknown
  timestamp: string
  event_id?: string
}
