export type FinanceReportBucket = {
  type: string;
  direction: string;
  status: string;
  count: number;
  amount: number;
  currency: "SIM" | "MGA";
};

export type OperationsReport = {
  report_type: "operational_snapshot";
  window_days: number;
  since: string;
  generated_at: string;
  measurement_notes: Record<string, string>;
  players: {
    registered_total: number;
    new_in_window: number;
    active_accounts: number;
    suspended_accounts: number;
    email_verified: number;
    phone_verified: number;
    kyc_levels: Record<string, number>;
  };
  games: {
    tables_created: number;
    tables_by_game: Record<string, number>;
    tables_by_status: Record<string, number>;
    games_with_results: number;
    matchmaking_tickets: Record<string, number>;
  };
  wallet: {
    SIM: FinanceReportBucket[];
    MGA: FinanceReportBucket[];
  };
  payments: {
    intent_counts: Record<string, number>;
    intent_providers: Record<string, number>;
    webhooks_received: number;
    currency: "MGA";
    settlement_verified: boolean;
  };
};

export type OperationsTable = {
  id: string;
  code: string;
  name: string;
  game_type: string;
  mode: string;
  status: "open" | "running" | "finished";
  is_private: boolean;
  max_players: number;
  owner_display_name: string | null;
  updated_at: string;
};

async function get<T>(token: string, path: string): Promise<T> {
  const response = await fetch(`/api/v1/backoffice/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.detail || "Rapport administratif indisponible.");
  }
  return result as T;
}

export function getOpsReport(token: string, days: 1 | 7 | 30 | 90) {
  return get<OperationsReport>(token, `reports/overview/?days=${days}`);
}

export function getOpsTables(token: string, status: string) {
  const params = new URLSearchParams({ status, limit: "30" });
  return get<{
    count: number;
    next_offset: number | null;
    status: string;
    status_provenance: string;
    results: OperationsTable[];
  }>(token, `games/tables/?${params}`);
}

export async function downloadOpsReport(
  token: string,
  days: 1 | 7 | 30 | 90,
) {
  const response = await fetch(
    `/api/v1/backoffice/reports/export.csv?days=${days}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    throw new Error(details.detail || "Export réservé aux administrateurs.");
  }
  const data = await response.blob();
  const url = URL.createObjectURL(data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `casino-mdg-operational-${days}d.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
