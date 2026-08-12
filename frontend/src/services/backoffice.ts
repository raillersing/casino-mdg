async function get<T>(path: string, token: string) {
  const response = await fetch(`/api/v1/backoffice/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(payload.detail || `Accès refusé (${response.status}).`);
  return payload as T;
}
export type AuditEvent = {
  id: string;
  actor: string | null;
  action: string;
  target_type: string;
  target_id: string;
  created_at: string;
};
export type FeatureFlag = {
  key: string;
  enabled: boolean;
  reason: string;
  updated_at: string;
};
export function getAuditEvents(token: string) {
  return get<{ results: AuditEvent[] }>("audit-events/", token);
}
export function getFeatureFlags(token: string) {
  return get<{ results: FeatureFlag[] }>("feature-flags/", token);
}
export function getPaymentReconciliation(token: string) {
  return get<{
    intents_pending: number;
    intents_completed: number;
    webhooks_received: number;
    webhooks_processed: number;
    unmatched_webhooks: string[];
    sandbox: boolean;
  }>("payment-reconciliation/", token);
}

export function getProductEventSummary(token: string) {
  return fetch("/api/v1/analytics/summary/", {
    headers: { Authorization: `Bearer ${token}` },
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(payload.detail || `Accès refusé (${response.status}).`);
    return payload as {
      window: string;
      since: string;
      total: number;
      events: Record<string, number>;
    };
  });
}
