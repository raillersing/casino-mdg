export type GameTable = {
  id: string
  table_code: string
  name: string
  game_type: 'poker' | 'belote' | 'rami'
  stakes: string
  max_players: number
  player_count: number
  status: 'open' | 'running' | 'finished'
  is_private: boolean
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1/games/${path}`, options)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.detail || 'Impossible de charger les tables.')
  return payload as T
}

export function getTables(gameType?: string) {
  const query = gameType && gameType !== 'Tous' ? `?game_type=${gameType.toLowerCase()}` : ''
  return request<{ results: GameTable[] }>(`tables/${query}`)
}

export function joinTable(tableId: string, accessToken: string) {
  return request<{ table: GameTable; created: boolean }>(`tables/${tableId}/join/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}
