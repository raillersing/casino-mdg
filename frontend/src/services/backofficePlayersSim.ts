export type BackofficePlayer = {
  id: number;
  display_name: string;
  email: string;
  phone: string;
  email_verified: boolean;
  phone_verified: boolean;
  kyc_level: string;
  is_active: boolean;
  date_joined: string;
};

export type PlayerDirectory = {
  count: number;
  next_offset: number | null;
  results: BackofficePlayer[];
};

export type PlayerDetail = {
  player: BackofficePlayer;
  wallets: Array<{
    currency_code: string;
    balance: number;
    held_balance: number;
    status: string;
  }>;
  transactions: Array<{
    id: string;
    type: string;
    direction: string;
    amount: number;
    currency: string;
    status: string;
    created_at: string;
  }>;
  payments: Array<{
    id: string;
    provider: string;
    direction: string;
    amount: number;
    currency: string;
    status: string;
    created_at: string;
  }>;
};

export type SimCashierSummary = {
  currency: "SIM";
  total_balances_sim: number;
  entries_debit_sim: number;
  entries_credit_sim: number;
  ledger_entries_balanced: boolean;
  pending_adjustments: number;
  money_mode: "simulation_only";
  generated_at: string;
  account_groups: Array<{
    account_type: string;
    count: number;
    balance: number | null;
    held: number | null;
  }>;
};

export type SimGrant = {
  id: string;
  player_id: number;
  amount: number;
  currency: "SIM";
  reason: string;
  status: "pending" | "approved" | "rejected";
  requested_by_id: number;
  decided_by_id: number | null;
  decision_reason: string;
  transaction_id: string | null;
  created_at: string;
  decided_at: string | null;
};

export type SimLedger = {
  currency: "SIM";
  count: number;
  next_offset: number | null;
  results: Array<{
    id: string;
    transaction_code: string;
    player_id: number;
    amount: number;
    currency: "SIM";
    type: string;
    direction: string;
    status: string;
    created_at: string;
    entries: Array<{
      account_id: number;
      entry_type: "debit" | "credit";
      amount: number;
      balance_after: number;
    }>;
  }>;
};

async function api<T>(
  token: string,
  path: string,
  method: "GET" | "POST" = "GET",
  payload?: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<T> {
  const response = await fetch(`/api/v1/backoffice/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.detail || "Requête back-office refusée.");
  return data as T;
}

export function getBackofficePlayers(token: string, query: string) {
  const params = new URLSearchParams({ q: query, limit: "25" });
  return api<PlayerDirectory>(token, `players/?${params}`);
}

export function getBackofficePlayerDetail(token: string, id: number) {
  return api<PlayerDetail>(token, `players/${id}/`);
}

export type PlayerStatusChange = {
  player_id: number;
  is_active: boolean;
  jwt_sessions_revoked: boolean;
  live_engine_disconnect_verified: boolean;
};

export function changePlayerStatus(
  token: string,
  playerId: number,
  isActive: boolean,
  reason: string,
  mfaCode: string,
) {
  return api<PlayerStatusChange>(token, `players/${playerId}/status/`, "POST", {
    action: isActive ? "suspend" : "reactivate",
    expected_active: isActive,
    reason,
    mfa_code: mfaCode,
  });
}

export function getSimSummary(token: string) {
  return api<SimCashierSummary>(token, "sim/summary/");
}

export function getSimLedger(token: string) {
  return api<SimLedger>(token, "sim/ledger/?limit=15");
}

export function getSimGrants(token: string) {
  return api<{ count: number; results: SimGrant[] }>(
    token,
    "sim/adjustments/?limit=25",
  );
}

export function requestSimGrant(
  token: string,
  playerId: number,
  amount: number,
  reason: string,
  idempotencyKey: string,
) {
  return api<SimGrant>(
    token,
    "sim/adjustments/",
    "POST",
    { player_id: playerId, amount, reason },
    idempotencyKey,
  );
}

export function decideSimGrant(
  token: string,
  grantId: string,
  action: "approve" | "reject",
  reason: string,
  mfaCode: string,
) {
  return api<SimGrant>(token, `sim/adjustments/${grantId}/decision/`, "POST", {
    action,
    reason,
    mfa_code: mfaCode,
  });
}
