export type WalletBalance = { account_id: number; balance: number; held_balance: number; currency: string }
export type WalletTransaction = { id: string; type: string; direction: 'credit' | 'debit'; amount: number; currency: string; status: string; description: string; created_at: string }

async function get<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`/api/v1/wallet/${path}`, { headers: { Authorization: `Bearer ${accessToken}` } })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.detail || 'Impossible de charger le portefeuille.')
  return payload as T
}

export function getWalletBalance(accessToken: string) { return get<WalletBalance>('balance/', accessToken) }
export function getWalletTransactions(accessToken: string) { return get<{ results: WalletTransaction[] }>('transactions/', accessToken) }
