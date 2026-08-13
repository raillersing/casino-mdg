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

export type ModerationMessage = {
  id: number;
  table_id: string;
  author: string;
  body: string;
  hidden: boolean;
  created_at: string;
};

export function getModerationMessages(token: string) {
  return get<{ results: ModerationMessage[] }>("chat-messages/", token);
}

export function setModerationMessage(
  token: string,
  messageId: number,
  hidden: boolean,
) {
  return fetch("/api/v1/backoffice/chat-messages/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message_id: messageId, hidden }),
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || "Action refusée.");
    return payload as { id: number; hidden: boolean };
  });
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
      scope: "pilot_cohort";
      participants: number;
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

export type PilotParticipant = {
  id: number;
  user_id: number;
  display_name: string;
  email: string;
  status: "invited" | "active" | "completed" | "withdrawn";
  invited_at: string;
  progress: {
    activated: boolean;
    played: boolean;
    completed: boolean;
  };
};

export function getPilotParticipants(token: string) {
  return fetch("/api/v1/analytics/pilot-participants/", {
    headers: { Authorization: `Bearer ${token}` },
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(payload.detail || `Accès refusé (${response.status}).`);
    return payload as { results: PilotParticipant[] };
  });
}

export function updatePilotParticipantStatus(
  token: string,
  participantId: number,
  status: PilotParticipant["status"],
) {
  return fetch(`/api/v1/analytics/pilot-participants/${participantId}/`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status }),
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        payload.detail || `Mise à jour refusée (${response.status}).`,
      );
    return payload as { id: number; status: PilotParticipant["status"] };
  });
}

export type PilotSession = {
  user_id: number;
  display_name: string;
  session_id: string;
  started_at: string;
  last_event_at: string;
  events: number;
  game_types: string[];
  modes: string[];
  completed: boolean;
  errors: boolean;
  event_names: string[];
};

export function getPilotSessions(token: string) {
  return fetch("/api/v1/analytics/pilot-sessions/", {
    headers: { Authorization: `Bearer ${token}` },
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(payload.detail || `Accès refusé (${response.status}).`);
    return payload as { window: string; results: PilotSession[] };
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

export function updatePilotIncidentStatus(
  token: string,
  ticketId: number,
  status: string,
) {
  return fetch(`/api/v1/support/tickets/staff/${ticketId}/`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status }),
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        payload.detail || `Mise à jour refusée (${response.status}).`,
      );
    return payload as { id: number; status: string };
  });
}
