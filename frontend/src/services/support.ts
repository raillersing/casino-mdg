export type SupportTicket = {
  id: number;
  category: string;
  subject: string;
  description: string;
  game_type: string;
  table_id: string;
  session_id: string;
  app_version: string;
  status: string;
  created_at: string;
};
async function request<T>(path: string, token: string, options?: RequestInit) {
  const response = await fetch(`/api/v1/support/${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(payload.detail || "Action support impossible.");
  return payload as T;
}
export function getSupportTickets(token: string) {
  return request<{ results: SupportTicket[] }>("tickets/", token);
}
export function createSupportTicket(
  token: string,
  category: string,
  subject: string,
  description: string,
  context: {
    game_type?: string;
    table_id?: string;
    session_id?: string;
    app_version?: string;
  } = {},
) {
  return request<{ id: number; status: string }>("tickets/", token, {
    method: "POST",
    body: JSON.stringify({ category, subject, description, ...context }),
  });
}

export function createPilotFeedback(
  token: string,
  rating: number,
  category: string,
  message: string,
  context: { game_type?: string; table_id?: string } = {},
) {
  return request<{ id: number; created: boolean }>("feedback/", token, {
    method: "POST",
    body: JSON.stringify({ rating, category, message, ...context }),
  });
}
