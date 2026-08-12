export type ChatMessage = {
  id: number;
  author: string;
  body: string;
  created_at: string;
};

async function request<T>(
  path: string,
  accessToken: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api/v1/social/${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(options?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(payload.detail || "Action sociale impossible.");
  return payload as T;
}

export function getTableChat(tableId: string, accessToken: string) {
  return request<{ results: ChatMessage[] }>(
    `tables/${tableId}/chat/`,
    accessToken,
  );
}
export function sendTableMessage(
  tableId: string,
  body: string,
  accessToken: string,
) {
  return request<ChatMessage>(`tables/${tableId}/chat/`, accessToken, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}
export function createTableInvitation(tableId: string, accessToken: string) {
  return request<{ token: string; expires_at: string }>(
    `tables/${tableId}/invitations/`,
    accessToken,
    { method: "POST" },
  );
}
