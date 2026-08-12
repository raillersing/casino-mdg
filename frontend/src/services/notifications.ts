export type NotificationPreferences = {
  game_invites: boolean;
  matchmaking: boolean;
  table_turns: boolean;
  product_updates: boolean;
};

async function request<T>(
  accessToken: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch("/api/v1/notifications/preferences/", {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(options?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(payload.detail || "Préférences indisponibles.");
  return payload as T;
}

export function getNotificationPreferences(accessToken: string) {
  return request<NotificationPreferences>(accessToken);
}

export function updateNotificationPreferences(
  accessToken: string,
  preferences: Partial<NotificationPreferences>,
) {
  return request<NotificationPreferences>(accessToken, {
    method: "PATCH",
    body: JSON.stringify(preferences),
  });
}
