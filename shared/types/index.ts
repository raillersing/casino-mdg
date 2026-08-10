// Shared types for Casino MDG (used by all services)

// KYC Levels
export type KycLevel = 'discovered' | 'light_player' | 'verified' | 'vip'

// Transaction Status
export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'reversed'

// Game Types
export type GameType = 'poker' | 'belote' | 'rami'

// Table Status
export type TableStatus = 'waiting' | 'playing' | 'finished'

// WebSocket Message Types
export type WsMessageType =
  | 'join'
  | 'leave'
  | 'action'
  | 'state'
  | 'ping'
  | 'pong'
  | 'error'
  | 'sync'
  | 'heartbeat'

// Payment Providers
export type PaymentProvider = 'mvola' | 'orange_money' | 'airtel_money' | 'stripe'

// Social Features
export interface Club {
  id: string
  name: string
  description: string
  ownerId: string
  members: ClubMember[]
  createdAt: string
}

export interface ClubMember {
  userId: string
  role: 'owner' | 'admin' | 'moderator' | 'member'
  joinedAt: string
}

export interface Mission {
  id: string
  title: string
  description: string
  gameType?: GameType
  target: number
  reward: number
  frequency: 'daily' | 'weekly' | 'monthly'
  expiresAt: string
}

export interface Achievement {
  id: string
  title: string
  description: string
  icon: string
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
  unlockedAt?: string
}
