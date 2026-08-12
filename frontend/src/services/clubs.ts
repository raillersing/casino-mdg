export type Club = {
  id: string;
  name: string;
  city: string;
  description: string;
  language: "fr" | "mg";
  visibility: "open" | "invite";
  member_count: number;
  member_limit: number;
  joined: boolean;
  role: "owner" | "admin" | "member" | null;
};

async function request<T>(
  accessToken: string,
  path = "",
  options?: RequestInit,
) {
  const response = await fetch(`/api/v1/clubs/${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(options?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || "Clubs indisponibles.");
  return payload as T;
}

export function getClubs(accessToken: string) {
  return request<{ results: Club[] }>(accessToken);
}

export function createClub(
  accessToken: string,
  payload: Pick<
    Club,
    "name" | "city" | "description" | "language" | "visibility"
  >,
) {
  return request<Club>(accessToken, "", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function joinClub(accessToken: string, clubId: string) {
  return request<Club>(accessToken, `${clubId}/join/`, { method: "POST" });
}
