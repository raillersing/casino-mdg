/** Read-only internal MGA overview. No transfer or settlement operations. */

export type MgaSummary = {
  currency: "MGA";
  mode: "read_only_internal_ledger";
  window_days: 1 | 7 | 30 | 90;
  generated_at: string;
  external_psp_reconciliation_verified: false;
  real_money_activation_authorized: false;
  intents: {
    count: number;
    sandbox_count: number;
    unclassified_count: number;
    grouped: Array<{
      status: string;
      provider: string;
      direction: string;
      count: number;
      amount_mga: number;
    }>;
    pending_withdrawals: number;
  };
  wallet: {
    completed_deposit_total_mga: number;
    completed_withdrawal_total_mga: number;
    player_held_mga: number;
    ledger_entries_debit_mga: number;
    ledger_entries_credit_mga: number;
    aggregate_entries_balanced: boolean;
    aggregate_check_only: true;
  };
  webhooks: {
    received: number;
    processed: number;
    unprocessed: number;
  };
  warnings: string[];
};

export type MgaIntent = {
  id: string;
  player_id: number;
  provider: string;
  direction: string;
  status: string;
  amount_mga: number;
  sandbox: boolean;
  provider_reference: string;
  created_at: string;
};

export type MgaIntentPage = {
  count: number;
  next_offset: number | null;
  currency: "MGA";
  read_only: true;
  results: MgaIntent[];
};

async function financeRead<T>(token: string, path: string): Promise<T> {
  const response = await fetch(`/api/v1/backoffice/finance/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || "Accès aux finances MGA indisponible.");
  }
  return data as T;
}

export function getMgaSummary(token: string, days: 1 | 7 | 30 | 90) {
  return financeRead<MgaSummary>(token, `overview/?days=${days}`);
}

export function getMgaIntents(token: string, status: string) {
  const params = new URLSearchParams({ status, limit: "20" });
  return financeRead<MgaIntentPage>(token, `intents/?${params.toString()}`);
}
