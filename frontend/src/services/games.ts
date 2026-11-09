export type GameTable = {
  id: string;
  joined?: boolean;
  created_by_id?: string | null;
  table_code: string;
  name: string;
  game_type: "poker" | "belote" | "rami" | "ludo" | "domino";
  stakes: string;
  stake_amount?: number;
  turn_duration?: number;
  rules_config?: Record<string, unknown>;
  access_code?: string | null;
  max_players: number;
  player_count: number;
  status: "open" | "running" | "finished";
  mode: "SIMULATION_SOLO" | "DEMO_AI" | "HUMAN_MATCH" | "REAL_MONEY";
  is_private: boolean;
  club_id: string | null;
  club_name: string | null;
  club_is_certified?: boolean;
};

export type LiveGameStats = {
  in_game_players?: number;
  name: string;
  online_players: number;
  running_tables: number;
  open_tables: number;
  total_tables: number;
};

export type LiveStatsResponse = {
  running_tables_verified: boolean;
  total_online_players: number;
  total_in_game_players?: number;
  total_running_tables: number;
  total_open_tables: number;
  total_active_tables: number;
  games: {
    belote: LiveGameStats;
    domino: LiveGameStats;
    ludo: LiveGameStats;
    rami: LiveGameStats;
    poker: LiveGameStats;
    [key: string]: LiveGameStats;
  };
  updated_at: string;
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1/games/${path}`, options);
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) throw new Error("AUTH_REQUIRED");
  if (!response.ok)
    throw new Error(payload.detail || "Impossible de charger les tables.");
  return payload as T;
}

export function getTables(gameType?: string, accessToken?: string) {
  const query =
    gameType && gameType !== "Tous"
      ? `?game_type=${gameType.toLowerCase()}`
      : "";
  return request<{ results: GameTable[] }>(`tables/${query}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
}

export type BotSimulation = {
  session_id: string;
  table_id: string;
  table_code: string;
  game_type: "poker" | "belote" | "rami" | "ludo" | "domino";
  mode: "DEMO_AI";
  profile: "tutorial" | "balanced" | "expert";
  status: "queued" | "running" | "completed" | "cancelled";
  bots: Array<{
    bot_key: string;
    display_name: string;
    seat_index: number;
    profile: string;
    is_bot: true;
  }>;
  admission_token?: string;
  created_at: string;
};

export function startBotSimulation(
  accessToken: string,
  gameType: BotSimulation["game_type"],
  profile: BotSimulation["profile"],
  idempotencyKey: string,
  botCount?: number,
) {
  return request<BotSimulation>("bot-simulations/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      game_type: gameType,
      profile,
      idempotency_key: idempotencyKey,
      bot_count: botCount,
    }),
  });
}

export function cancelBotSimulation(accessToken: string, sessionId: string) {
  return request<BotSimulation>(`bot-simulations/${sessionId}/`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export type CreateTablePayload = {
  idempotency_key?: string;
  name: string;
  game_type: "poker" | "belote" | "rami" | "ludo" | "domino";
  max_players: number;
  is_private: boolean;
  stake_amount?: number;
  buy_in?: number;
  turn_duration?: number;
  rules_config?: Record<string, unknown>;
  club_id?: string;
};

export function createTable(accessToken: string, payload: CreateTablePayload) {
  return request<
    {
      table: GameTable;
      table_id: string;
      seat_index: number;
      admission_token: string;
      created: boolean;
    } & GameTable
  >("tables/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function getLiveStats(pingGame?: string) {
  const query = pingGame ? `?ping_game=${encodeURIComponent(pingGame)}` : "";
  return request<LiveStatsResponse>(`live-stats/${query}`, {
    signal: AbortSignal.timeout(8000),
  }).then((data) => {
    if (data.running_tables_verified !== true)
      throw new Error("Activité non confirmée");
    return data;
  });
}

export function joinTableByCode(
  accessToken: string,
  code: string,
  buyIn?: number,
) {
  return request<{
    table: GameTable;
    table_id: string;
    seat_index: number;
    admission_token: string;
    created: boolean;
  }>("tables/join-by-code/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code, buy_in: buyIn }),
  });
}

export function previewTableByCode(accessToken: string, code: string) {
  return request<{ table: GameTable }>("tables/join-by-code/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code, preview: true }),
  });
}

export type MatchmakingTicket = {
  ticket_id: string;
  game_type: "poker" | "belote" | "rami" | "ludo" | "domino";
  status: "queued" | "matched" | "cancelled";
  table_id: string | null;
  table_code: string | null;
  created_at: string;
  waiting_seconds: number;
  timeout_seconds: number;
};
export type MatchmakingStatus = {
  game_type: string | null;
  human_online: number;
  queued: number;
  estimated_wait_seconds: number;
  timeout_seconds: number;
  ticket: MatchmakingTicket | null;
};

export function getMatchmakingStatus(accessToken: string, gameType?: string) {
  return request<MatchmakingStatus>(
    `matchmaking/status/${gameType ? `?game_type=${gameType}` : ""}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
}
export function sendMatchmakingHeartbeat(
  accessToken: string,
  gameType?: string,
) {
  return request<{ status: string; game_type: string | null }>(
    "matchmaking/heartbeat/",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ game_type: gameType }),
    },
  );
}
export function queueMatch(
  accessToken: string,
  gameType: "poker" | "belote" | "rami" | "ludo" | "domino",
) {
  return request<{ ticket: MatchmakingTicket; created: boolean }>(
    "matchmaking/queue/",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ game_type: gameType }),
    },
  );
}
export function cancelMatch(accessToken: string, ticketId: string) {
  return request<{ ticket: MatchmakingTicket }>(
    `matchmaking/queue/${ticketId}/`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
  );
}

export function joinTable(
  tableId: string,
  accessToken: string,
  accessCode?: string,
  buyIn?: number,
) {
  return request<{
    table: GameTable;
    table_id: string;
    seat_index: number;
    created: boolean;
    admission_token?: string;
  }>(`tables/${tableId}/join/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ access_code: accessCode, buy_in: buyIn }),
  });
}

export function getTableAdmission(
  tableId: string,
  accessToken: string,
  accessCode?: string,
) {
  return request<{
    admission_token: string;
    table_id: string;
    seat_index: number | null;
    role: string;
    expires_in: number;
  }>(`tables/${tableId}/admission/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ access_code: accessCode }),
  });
}

export function topUpTable(
  tableId: string,
  accessToken: string,
  amount: number,
  idempotencyKey: string,
) {
  return request<{
    table_id: string;
    pending_top_up: number;
    current_stack: number;
    reserved_amount: number;
    status: string;
  }>(`tables/${tableId}/top-up/`, {
    method: "POST",
    signal: AbortSignal.timeout(10000),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ amount, idempotency_key: idempotencyKey }),
  });
}

export function leaveTable(tableId: string, accessToken: string) {
  return request<{ left: boolean; table_closed: boolean; table_id: string }>(
    `tables/${tableId}/leave/`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    },
  );
}

export type GameStats = {
  played: number;
  wins: number;
  losses: number;
  draws: number;
  total_won: number;
};
export function getGameStats(accessToken: string) {
  return request<{ stats: GameStats }>("results/", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
export function recordGameResult(
  accessToken: string,
  gameId: string,
  gameType: string,
  outcome: "win" | "loss" | "draw",
  amount = 0,
  signature?: string,
) {
  return request<{
    created: boolean;
    outcome: string;
    transaction_id: string | null;
  }>("results/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(signature ? { "X-Game-Engine-Signature": signature } : {}),
    },
    body: JSON.stringify({
      game_id: gameId,
      game_type: gameType,
      outcome,
      amount,
    }),
  });
}
export function getLeaderboard() {
  return request<{
    results: Array<{
      rank: number;
      display_name: string;
      wins: number;
      total_won: number;
    }>;
  }>("leaderboard/");
}
