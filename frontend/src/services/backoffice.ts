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
export function setFeatureFlag(
  token: string,
  key: string,
  enabled: boolean,
  reason = "Mise à jour Live Ops",
) {
  return fetch("/api/v1/backoffice/feature-flags/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ key, enabled, reason }),
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || "Action refusée.");
    return payload as FeatureFlag;
  });
}

export type LiveDashboardTableGame = {
  game_type: string;
  label: string;
  tables_open: number;
  tables_running: number;
  active_human_seats: number;
  active_bot_seats: number;
  results_count: number;
  wins: number;
  losses: number;
  draws: number;
  volume_settled_sim: number;
  errors_count: number;
  sessions_started: number;
  sessions_completed: number;
  completion_rate_pct: number | null;
};

export type LiveDashboardInstantGame = {
  slug: string;
  name: string;
  game_type: string;
  status: string;
  cost: number;
  max_prize: number;
  plays_count: number;
  total_handle_sim: number;
  total_payout_sim: number;
  ggr_sim: number;
  observed_rtp_pct: number;
  theoretical_rtp_pct: number;
  win_rate_pct: number;
};

export type LiveDashboardDrawGame = {
  slug: string;
  name: string;
  draw_type: string;
  status: string;
  entry_cost: number;
  entries_count: number;
  total_pool_sim: number;
  closes_at: string;
};

export type LiveDashboardTableRadar = {
  id: string;
  table_code: string;
  name: string;
  game_type: string;
  mode: string;
  stakes: string;
  status: string;
  max_players: number;
  human_players: number;
  bot_players: number;
  player_count: number;
  is_private: boolean;
  updated_at: string;
};

export type LiveDashboardRegionLatency = {
  region_code: string;
  region_name: string;
  transport: string;
  rtt_ms: number;
  jitter_ms: number;
  turn_budget_remaining_sec: number;
  effective_window_pct: number;
  recommended_lag_comp_ms: number;
  status: "optimal" | "good" | "fair" | "warning";
};

export type LiveDashboardCapacityTier = {
  tier_id: string;
  label: string;
  target_ccu: number;
  status: "ready" | "warning" | "critical" | "blocked";
  estimated_ws_lookups_per_sec: number;
  estimated_http_req_per_sec: number;
  estimated_db_writes_per_sec: number;
  headroom_pct: number;
  bottleneck_analysis: string;
};

export type LiveDashboardFunnelStage = {
  key: string;
  label: string;
  count: number;
  conversion_from_top_pct: number;
  step_conversion_pct: number;
  drop_off_pct: number;
};

export type LiveDashboardHourlyBucket = {
  hour_label: string;
  iso_hour: string;
  events_count: number;
  active_sessions: number;
  games_played: number;
  errors_count: number;
};

export type LiveDashboardActivityEvent = {
  id: string;
  event_name: string;
  actor: string;
  game_type: string;
  mode: string;
  session_id: string;
  latency_ms: number | null;
  created_at: string;
};

export type PeriodMetrics = {
  tables_created: number;
  games_played: number;
  total_stakes_mga: number;
  total_payouts_mga: number;
  ggr_mga: number;
  ggr_margin_pct: number;
  deposits_volume_mga: number;
  deposits_count: number;
  withdrawals_volume_mga: number;
  withdrawals_count: number;
  net_cash_flow_mga: number;
  unique_active_players: number;
  avg_stake_mga: number;
};

export type GameAnalyticsItem = {
  game_type: string;
  label: string;
  tables_created: number;
  active_tables: number;
  games_played: number;
  total_stakes_mga: number;
  total_payouts_mga: number;
  ggr_mga: number;
  unique_players: number;
};

export type LeaderboardWinner = {
  user_id: number;
  display_name: string;
  identifier: string;
  wins_count: number;
  total_won_mga: number;
};

export type LeaderboardBettor = {
  user_id: number;
  display_name: string;
  identifier: string;
  total_staked_mga: number;
  bets_count: number;
  avg_stake_mga: number;
};

export type BiggestWinItem = {
  id: string;
  user_id: number;
  display_name: string;
  identifier: string;
  game_type: string;
  game_label: string;
  amount: number;
  created_at: string;
};

export type RecentTransactionItem = {
  id: string;
  transaction_code: string;
  type: string;
  direction: string;
  amount: number;
  currency_code: string;
  status: string;
  description: string;
  user_id: number | null;
  user_display_name: string;
  user_identifier: string;
  created_at: string;
};

export type RecentGameItem = {
  id: string;
  game_type: string;
  game_label: string;
  player_name: string;
  outcome: string;
  amount: number;
  created_at: string;
};

export type ExecutiveDashboardData = {
  selected_period: {
    period: "day" | "week" | "month" | "year";
    window_days: number;
    since: string;
    until: string;
  };
  periods_comparison: {
    day: PeriodMetrics;
    week: PeriodMetrics;
    month: PeriodMetrics;
    year: PeriodMetrics;
  };
  by_game_analytics: GameAnalyticsItem[];
  financial_overview: {
    deposits_volume_mga: number;
    deposits_count: number;
    withdrawals_volume_mga: number;
    withdrawals_count: number;
    pending_withdrawals_volume_mga: number;
    pending_withdrawals_count: number;
    bonus_volume_mga: number;
    bonus_count: number;
    net_cash_flow_mga: number;
    recent_transactions: RecentTransactionItem[];
  };
  leaderboards: {
    top_winners: LeaderboardWinner[];
    top_bettors: LeaderboardBettor[];
    biggest_wins: BiggestWinItem[];
  };
  recent_games_feed: RecentGameItem[];
};

export type LiveDashboardData = {
  generated_at: string;
  window_days: number;
  games_stats: {
    overview: {
      tables_total: number;
      tables_open: number;
      tables_running: number;
      tables_finished: number;
      active_human_seats: number;
      active_bot_seats: number;
      bot_sessions_running: number;
      sessions_active: number;
      rounds_total: number;
      rounds_settled: number;
      results_recorded: number;
      instant_plays_count: number;
      draw_entries_count: number;
      tournaments_active: number;
      total_handle_sim: number;
      total_payout_sim: number;
      gross_gaming_revenue_sim: number;
      observed_rtp_pct: number;
    };
    by_table_game: LiveDashboardTableGame[];
    by_mode: Array<{
      mode: string;
      label: string;
      tables_count: number;
      events_count: number;
    }>;
    instant_games: LiveDashboardInstantGame[];
    draw_games: LiveDashboardDrawGame[];
    active_tables_radar: LiveDashboardTableRadar[];
  };
  application_stats: {
    services_health: {
      game_engine: {
        status: "online" | "degraded" | "standby" | "offline";
        probe_latency_ms: number | null;
        websocket_clients_ccu: number;
        tables_active: number;
        players_active: number;
        events_total: number;
      };
      database: {
        status: string;
        latency_ms: number | null;
        conn_max_age: number;
        pooling_mode: string;
      };
      cache_redis: {
        status: string;
        latency_ms: number | null;
      };
    };
    http_telemetry: {
      total_requests: number;
      avg_latency_ms: number;
      error_rate_pct: number;
      status_breakdown: {
        "2xx": number;
        "3xx": number;
        "4xx": number;
        "429_rate_limited": number;
        "5xx_errors": number;
      };
      top_endpoints: Array<{
        method: string;
        path: string;
        calls: number;
        avg_ms: number;
      }>;
    };
    network_latency: {
      samples: number;
      avg_ms: number | null;
      p50_ms: number | null;
      p95_ms: number | null;
      p99_ms: number | null;
      min_ms: number | null;
      max_ms: number | null;
      estimated_jitter_ms: number | null;
      quality_distribution: {
        excellent_lt_80ms: { count: number; pct: number };
        good_80_150ms: { count: number; pct: number };
        fair_150_350ms: { count: number; pct: number };
        poor_gt_350ms: { count: number; pct: number };
      };
      global_regions_matrix: LiveDashboardRegionLatency[];
    };
    concurrency_and_capacity: {
      websocket_clients_ccu: number;
      estimated_concurrent_users: number;
      production_readiness_score: number;
      readiness_pillars: {
        rng_and_game_rules: number;
        security_and_kyc: number;
        realtime_ws_engine: number;
        database_and_ledger_scale: number;
        global_edge_infrastructure: number;
      };
      capacity_tiers: LiveDashboardCapacityTier[];
    };
  };
  player_flow: {
    realtime_presence: {
      online_30s: number;
      online_5m: number;
      searching_matchmaking: number;
      queue_by_game: Record<string, number>;
      seated_human_players: number;
      playing_vs_ai: number;
      active_24h_dau: number;
      active_window_ua: number;
      active_window_sessions: number;
      total_registered_users: number;
    };
    conversion_funnel: LiveDashboardFunnelStage[];
    matchmaking_health: {
      started: number;
      human_matched: number;
      bot_fallback: number;
      timeout: number;
      cancelled: number;
      human_match_rate_pct: number;
      bot_fallback_rate_pct: number;
    };
    network_resilience: {
      reconnections_succeeded: number;
      sessions_paused: number;
      game_errors: number;
      recovery_rate_pct: number;
    };
    hourly_traffic_24h: LiveDashboardHourlyBucket[];
    user_segments: {
      kyc_breakdown: {
        discovered: number;
        light_player: number;
        verified: number;
        vip: number;
      };
      wallet_velocity: Record<string, { count: number; volume: number }>;
    };
    live_activity_stream: LiveDashboardActivityEvent[];
  };
  executive_dashboard?: ExecutiveDashboardData;
};

export function getLiveDashboard(
  token: string,
  days = 7,
  period?: "day" | "week" | "month" | "year",
) {
  const query = period ? `period=${period}` : `days=${days}`;
  return get<LiveDashboardData>(`live-dashboard/?${query}`, token);
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

export type PilotAction = {
  id: number;
  title: string;
  description: string;
  source: "incident" | "feedback";
  status: "todo" | "in_progress" | "done";
  incident_id: number | null;
  created_by: string;
  created_at: string;
};

export function getPilotActions(token: string) {
  return fetch("/api/v1/support/pilot-actions/", {
    headers: { Authorization: `Bearer ${token}` },
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || "Accès refusé.");
    return payload as { results: PilotAction[] };
  });
}

export function updatePilotActionStatus(
  token: string,
  actionId: number,
  status: PilotAction["status"],
) {
  return fetch(`/api/v1/support/pilot-actions/${actionId}/`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status }),
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || "Action refusée.");
    return payload as { id: number; status: PilotAction["status"] };
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

export type RGExclusionItem = {
  id: number;
  user: {
    id: string;
    phone: string;
    display_name: string;
    email: string;
  };
  is_active_cooling_off: boolean;
  cooling_off_until: string | null;
  is_active_self_exclusion: boolean;
  is_permanently_excluded: boolean;
  self_exclusion_until: string | null;
  reason: string;
  updated_at: string;
};

export function getResponsibleGamingExclusions(token: string) {
  return fetch("/api/v1/responsible-gaming/backoffice/exclusions/", {
    headers: { Authorization: `Bearer ${token}` },
  }).then(async (res) => {
    const payload = await res.json().catch(() => ({}));
    if (!res.ok)
      throw new Error(
        payload.detail || "Impossible de charger les exclusions.",
      );
    return payload as { results: RGExclusionItem[]; count: number };
  });
}
