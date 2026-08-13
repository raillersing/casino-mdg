export type GameTable = {
  id: string;
  table_code: string;
  name: string;
  game_type: "poker" | "belote" | "rami";
  stakes: string;
  max_players: number;
  player_count: number;
  status: "open" | "running" | "finished";
  mode: "SIMULATION_SOLO" | "DEMO_AI" | "HUMAN_MATCH" | "REAL_MONEY";
  is_private: boolean;
  club_id: string | null;
  club_name: string | null;
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1/games/${path}`, options);
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) throw new Error("AUTH_REQUIRED");
  if (!response.ok)
    throw new Error(payload.detail || "Impossible de charger les tables.");
  return payload as T;
}

export function getTables(gameType?: string) {
  const query =
    gameType && gameType !== "Tous"
      ? `?game_type=${gameType.toLowerCase()}`
      : "";
  return request<{ results: GameTable[] }>(`tables/${query}`);
}

export type BotSimulation = {
  session_id: string;
  table_id: string;
  table_code: string;
  game_type: "poker" | "belote" | "rami";
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
  created_at: string;
};

export function startBotSimulation(
  accessToken: string,
  gameType: BotSimulation["game_type"],
  profile: BotSimulation["profile"],
  idempotencyKey: string,
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
    }),
  });
}

export function cancelBotSimulation(accessToken: string, sessionId: string) {
  return request<BotSimulation>(`bot-simulations/${sessionId}/`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function createTable(
  accessToken: string,
  payload: {
    name: string;
    game_type: "poker" | "belote" | "rami";
    max_players: number;
    is_private: boolean;
    club_id?: string;
  },
) {
  return request<GameTable>("tables/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export type MatchmakingTicket = {
  ticket_id: string;
  game_type: "poker" | "belote" | "rami";
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
  gameType: "poker" | "belote" | "rami",
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

export function joinTable(tableId: string, accessToken: string) {
  return request<{ table: GameTable; created: boolean }>(
    `tables/${tableId}/join/`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
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
