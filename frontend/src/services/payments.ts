export type PaymentIntent = { id: string; status: string; duplicate: boolean; sandbox: boolean }

export type PaymentIntentSummary = { id: string; provider: string; direction: string; amount: number; currency: string; status: string; idempotency_key: string }

export function createPaymentIntent(accessToken: string, provider: string, direction: 'deposit' | 'withdrawal', amount: number, idempotencyKey: string) {
  return fetch('/api/v1/payments/intents/', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ provider, direction, amount, idempotency_key: idempotencyKey }) }).then(async (response) => { const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.detail || 'Intent de paiement impossible.'); return payload as PaymentIntent })
}

export function getPaymentIntents(accessToken: string) { return fetch('/api/v1/payments/intents/', { headers: { Authorization: `Bearer ${accessToken}` } }).then(async (response) => { const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.detail || 'Impossible de charger les intents.'); return payload as { results: PaymentIntentSummary[] } }) }
