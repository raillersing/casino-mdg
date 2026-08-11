export type DailyMission = { key: string; title: string; progress: number; goal: number; reward: number; claimed: boolean; claimable: boolean }

export async function getDailyMissions(token: string) {
  const response = await fetch('/api/v1/games/missions/', { headers: { Authorization: `Bearer ${token}` } })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.detail || 'Impossible de charger les missions.')
  return payload as { date: string; missions: DailyMission[] }
}

export async function claimDailyMission(token: string, key: string) {
  const response = await fetch('/api/v1/games/missions/', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ key }) })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.detail || 'Mission non disponible.')
  return payload as { claimed: boolean; duplicate: boolean; transaction_id: string }
}
