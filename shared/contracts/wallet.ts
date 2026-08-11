// Wallet service contracts (shared between backend and game engine)

export interface WalletOperation {
  userId: string
  amount: number
  currency: 'MGA' | 'SIM'
  type: 'deposit' | 'withdrawal' | 'win' | 'loss' | 'rake'
  metadata?: Record<string, unknown>
}

export interface LedgerEntry {
  id: string
  accountId: string
  transactionId: string
  entryType: 'debit' | 'credit'
  amount: number
  balance: number
  createdAt: string
}

export interface Transaction {
  id: string
  userId: string
  type: 'deposit' | 'withdrawal' | 'game'
  amount: number
  status: 'pending' | 'completed' | 'failed' | 'reversed'
  provider?: string
  providerRef?: string
  createdAt: string
  completedAt?: string
}
