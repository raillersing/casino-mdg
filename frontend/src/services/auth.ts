type OtpRequestResponse = { request_id: string; expires_in: number; dev_code?: string }

type AuthResponse = {
  access: string
  refresh: string
  user: { id: string; display_name: string; phone: string; xp: number; level: number }
}

async function post<T>(path: string, body: Record<string, string>): Promise<T> {
  const response = await fetch(`/api/v1/auth/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.detail || 'Une erreur est survenue.')
  return payload as T
}

export function requestOtp(phone: string) { return post<OtpRequestResponse>('otp/request/', { phone }) }
export function verifyOtp(phone: string, code: string, displayName: string) { return post<AuthResponse>('otp/verify/', { phone, code, display_name: displayName }) }
