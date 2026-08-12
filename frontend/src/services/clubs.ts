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
export type ClubMember = {
  user_id: string;
  display_name: string;
  role: "owner" | "admin" | "member";
  joined_at: string;
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

export function getClubMembers(accessToken: string, clubId: string) {
  return request<{ results: ClubMember[] }>(accessToken, `${clubId}/members/`);
}

export function updateClubMember(
  accessToken: string,
  clubId: string,
  userId: string,
  role: "admin" | "member",
) {
  return request<{ user_id: string; role: "admin" | "member" }>(
    accessToken,
    `${clubId}/members/`,
    { method: "PATCH", body: JSON.stringify({ user_id: userId, role }) },
  );
}

export function removeClubMember(
  accessToken: string,
  clubId: string,
  userId: string,
) {
  return request<void>(accessToken, `${clubId}/members/`, {
    method: "DELETE",
    body: JSON.stringify({ user_id: userId }),
  });
}
