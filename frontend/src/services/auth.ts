type OtpRequestResponse = {
  request_id: string;
  expires_in: number;
  dev_code?: string;
  sms_sent?: boolean;
  email_sent?: boolean;
};

type AuthResponse = {
  access: string;
  refresh: string;
  user: {
    id: string;
    display_name: string;
    phone: string;
    email: string;
    email_verified: boolean;
    xp: number;
    level: number;
    is_staff: boolean;
  };
  wallet: { balance: number; currency: string };
};

async function post<T>(path: string, body: Record<string, string>): Promise<T> {
  const response = await fetch(`/api/v1/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(payload.detail || "Une erreur est survenue.");
  return payload as T;
}

export function requestOtp(phone: string) {
  return post<OtpRequestResponse>("otp/request/", { phone });
}
export function verifyOtp(phone: string, code: string, displayName: string) {
  return post<AuthResponse>("otp/verify/", {
    phone,
    code,
    display_name: displayName,
  });
}

export function requestEmailOtp(phone: string, email: string) {
  return post<OtpRequestResponse>("email/request/", { phone, email });
}

export function verifyEmailOtp(
  requestId: string,
  code: string,
  displayName: string,
) {
  return post<AuthResponse>("email/verify/", {
    request_id: requestId,
    code,
    display_name: displayName,
  });
}

export async function requestEmailBinding(token: string, email: string) {
  const response = await fetch("/api/v1/auth/me/email/request/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || "Envoi email impossible.");
  return payload as OtpRequestResponse;
}

export async function verifyEmailBinding(
  token: string,
  requestId: string,
  code: string,
) {
  const response = await fetch("/api/v1/auth/me/email/verify/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ request_id: requestId, code }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || "Code invalide.");
  return payload as { email: string; email_verified: boolean };
}

export function getCurrentUser(token: string) {
  return fetch("/api/v1/auth/me/", {
    headers: { Authorization: `Bearer ${token}` },
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || "Session expirée.");
    return payload as {
      id: string;
      display_name: string;
      phone: string;
      email: string;
      email_verified: boolean;
      xp: number;
      level: number;
      is_staff: boolean;
    };
  });
}

export function refreshAccessToken(refresh: string) {
  return fetch("/api/v1/auth/refresh/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || "Session expirée.");
    return payload as { access: string; refresh: string };
  });
}

export function createGuestToken(displayName: string) {
  return post<AuthResponse>("guest/", { display_name: displayName });
}

export function updateCurrentUser(token: string, displayName: string) {
  return fetch("/api/v1/auth/me/", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ display_name: displayName }),
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(payload.detail || "Impossible de modifier le profil.");
    return payload as {
      id: string;
      display_name: string;
      phone: string;
      email: string;
      email_verified: boolean;
      xp: number;
      level: number;
      is_staff: boolean;
    };
  });
}
