// Game engine contracts

export interface GameEvent {
  eventId: string
  tableId: string
  gameType: 'poker' | 'belote' | 'rami'
  eventType: string
  payload: unknown
  timestamp: string
  sequence: number
}

export interface TableState {
  tableId: string
  gameType: string
  status: 'waiting' | 'playing' | 'finished'
  players: PlayerState[]
  currentPlayer?: string
  pot: number
  phase: string
  dealerPosition: number
  smallBlind?: number
  bigBlind?: number
}

export interface PlayerState {
  id: string
  name: string
  seat: number
  stack: number
  bet: number
  cards: string[]
  isActive: boolean
  isAllIn: boolean
}
