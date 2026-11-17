import type { AuthMethodCapabilities } from "@/services/auth";

export type AuthPolicyMode = "email" | "sms" | "both" | "none";

export type BackofficeAuthPolicy = {
  mode: AuthPolicyMode;
  revision: number;
  reason: string;
  updated_at: string | null;
  providers: {
    email: { configured: boolean };
    sms: { configured: boolean };
  };
  capabilities: AuthMethodCapabilities;
  can_update: boolean;
};

async function policyRequest<T>(
  token: string,
  method: "GET" | "PATCH",
  body?: Record<string, string | number>,
): Promise<T> {
  const response = await fetch("/api/v1/backoffice/config/auth-methods/", {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || "Configuration indisponible.");
  }
  return data as T;
}

export function getBackofficeAuthPolicy(token: string) {
  return policyRequest<BackofficeAuthPolicy>(token, "GET");
}

export function updateBackofficeAuthPolicy(
  token: string,
  mode: AuthPolicyMode,
  revision: number,
  reason: string,
  mfaCode: string,
) {
  return policyRequest<
    Pick<BackofficeAuthPolicy, "mode" | "revision" | "reason" | "capabilities">
  >(token, "PATCH", {
    mode,
    revision,
    reason,
    mfa_code: mfaCode,
  });
}
