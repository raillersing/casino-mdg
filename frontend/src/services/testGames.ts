export type InstantGame = {
  slug: string
  name: string
  game_type: 'scratch' | 'wheel'
  version: string
  cost: number
  max_prize: number
  status: 'active' | 'paused'
  rules: Record<string, unknown>
}

export type InstantPlay = {
  play_id: string
  game_slug: string
  game_version: string
  status: 'completed' | 'failed'
  currency: 'SIM'
  cost: number
  prize: number
  result_label: string
  transaction_id: string | null
  audit: { commitment?: string; proof_available: boolean; version?: string }
  created_at: string
}

export type TestDraw = {
  slug: string
  name: string
  draw_type: 'three_digits' | 'five_numbers'
  version: string
  status: 'open' | 'closed' | 'drawn' | 'settled' | 'cancelled'
  entry_cost: number
  closes_at: string
  rules: Record<string, unknown>
  result: { numbers: number[]; commitment: string; proof: Record<string, unknown>; created_at: string } | null
  can_simulate?: boolean
}

type RequestOptions = RequestInit & { token: string }

async function request<T>(path: string, { token, ...options }: RequestOptions): Promise<T> {
  const response = await fetch(`/api/v1/games/${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.detail || 'Service de jeu indisponible.')
  return payload as T
}

export function getTestGames(token: string) {
  return request<{ currency: 'SIM'; results: InstantGame[] }>('test-games/catalog/', { token })
}

export function playTestGame(token: string, slug: string, idempotencyKey: string) {
  return request<InstantPlay>(`test-games/${slug}/plays/`, { token, method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ idempotency_key: idempotencyKey }) })
}

export function getTestDraws(token: string) {
  return request<{ currency: 'SIM'; results: TestDraw[] }>('test-draws/', { token })
}

export function enterTestDraw(token: string, slug: string, numbers: number[], idempotencyKey: string) {
  return request<{ entry_id: string; draw_slug: string; numbers: number[]; transaction_id: string; created: boolean }>(`test-draws/${slug}/entries/`, { token, method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ numbers, idempotency_key: idempotencyKey }) })
}

export function getTestActivity(token: string) {
  return request<{ plays: InstantPlay[]; entries: Array<{ entry_id: string; draw_slug: string; draw_name: string; numbers: number[]; transaction_id: string; created_at: string }> }>('test-games/activity/', { token })
}

export function simulateTestDraw(token: string, slug: string) {
  return request<TestDraw & { created: boolean }>(`test-draws/${slug}/result/`, { token, method: 'POST', body: '{}' })
}
