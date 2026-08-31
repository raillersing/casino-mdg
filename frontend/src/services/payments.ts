export type PaymentIntent = {
  id: string;
  provider: "mvola" | "orange" | "airtel";
  provider_display: string;
  direction: "deposit" | "withdrawal";
  direction_display: string;
  amount: number;
  currency: string;
  phone_number: string;
  provider_reference: string;
  checkout_url: string;
  error_message: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  status_display: string;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
};

export type PaymentIntentResponse = {
  id: string;
  status: string;
  provider_reference: string;
  checkout_url: string;
  message: string;
  intent: PaymentIntent;
  sandbox: boolean;
};

export function createPaymentIntent(
  accessToken: string,
  provider: "mvola" | "orange" | "airtel",
  direction: "deposit" | "withdrawal",
  amount: number,
  phone_number: string,
  idempotencyKey: string,
  sandbox = true
) {
  return fetch("/api/v1/payments/intents/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      provider,
      direction,
      amount,
      phone_number,
      idempotency_key: idempotencyKey,
      sandbox,
    }),
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.detail || "Impossible d'initier la transaction Mobile Money.");
    }
    return payload as PaymentIntentResponse;
  });
}

export function getPaymentIntents(accessToken: string) {
  return fetch("/api/v1/payments/intents/", {
    headers: { Authorization: `Bearer ${accessToken}` },
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.detail || "Impossible de charger les transactions.");
    }
    return payload as { results: PaymentIntent[] };
  });
}
