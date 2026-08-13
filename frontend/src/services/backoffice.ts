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
      unique_actors: number;
      unique_sessions: number;
      funnel: Record<string, number>;
      errors_per_completed_game: number | null;
      reconnections_succeeded: number;
      heartbeat_latency_ms: {
        samples: number;
        average: number | null;
        p95: number | null;
      };
      retention: Record<
        "d1" | "d7",
        {
          eligible_actors: number;
          returned_actors: number;
          rate: number | null;
        }
      >;
    };
  });
}

export function getPilotFeedbackSummary(token: string) {
  return fetch("/api/v1/support/feedback/summary/", {
    headers: { Authorization: `Bearer ${token}` },
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(payload.detail || `Accès refusé (${response.status}).`);
    return payload as {
      count: number;
      average_rating: number | null;
      categories: Record<string, number>;
    };
  });
}

export function getPilotGateSummary(token: string) {
  return fetch("/api/v1/analytics/pilot-gate/", {
    headers: { Authorization: `Bearer ${token}` },
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(payload.detail || `Accès refusé (${response.status}).`);
    return payload as {
      window: string;
      since: string;
      status: "blocked" | "monitor" | "go_provisional";
      criteria: Array<{
        key: string;
        label: string;
        observed: number | null;
        target: number;
        unit: string;
        status: "pass" | "pending" | "blocked";
      }>;
    };
  });
}

export type PilotIncident = {
  id: number;
  player: string;
  category: string;
  subject: string;
  description: string;
  game_type: string;
  table_id: string;
  session_id: string;
  app_version: string;
  status: string;
  created_at: string;
};

export function getPilotIncidents(token: string) {
  return fetch("/api/v1/support/tickets/staff/", {
    headers: { Authorization: `Bearer ${token}` },
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(payload.detail || `Accès refusé (${response.status}).`);
    return payload as { results: PilotIncident[] };
  });
}
