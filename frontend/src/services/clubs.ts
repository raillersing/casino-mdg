export type Club = {
  id: string;
  name: string;
  code?: string;
  city: string;
  description: string;
  language: "fr" | "mg";
  visibility: "open" | "invite";
  is_certified?: boolean;
  certification_status?: "none" | "pending" | "certified" | "rejected";
  member_count: number;
  member_limit: number;
  tables_count?: number;
  joined: boolean;
  role: "owner" | "admin" | "member" | null;
};

export type ClubCertificationCriteria = {
  founder_kyc_approved: boolean;
  member_count: number;
  member_target: number;
  members_satisfied: boolean;
  tables_count: number;
  tables_target: number;
  tables_satisfied: boolean;
  can_certify: boolean;
  can_request: boolean;
};

export type ClubCertificationInfo = {
  club_id: string;
  is_certified: boolean;
  certification_status: "none" | "pending" | "certified" | "rejected";
  criteria: ClubCertificationCriteria;
  perks: string[];
  detail?: string;
  club?: Club;
};

export type ClubMember = {
  user_id: string;
  display_name: string;
  role: "owner" | "admin" | "member";
  joined_at: string;
};

export type ClubEvent = {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  capacity: number;
  participant_count: number;
  points_reward: number;
  status: "scheduled" | "completed";
  joined: boolean;
  rewarded: boolean;
};

export type ClubLeaderboardEntry = {
  rank: number;
  user_id: string;
  display_name: string;
  points: number;
};

export type ClubChatMessage = {
  id: string;
  author: string;
  body: string;
  created_at: string;
};

async function request<T>(
  accessToken?: string | null,
  path = "",
  options?: RequestInit,
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string> || {}),
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`/api/v1/clubs/${path}`, {
    ...options,
    headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || "Clubs indisponibles.");
  return payload as T;
}

export function getClubs(accessToken?: string | null) {
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

export function getClubCertificationInfo(accessToken: string, clubId: string) {
  return request<ClubCertificationInfo>(
    accessToken,
    `${clubId}/request-certification/`,
  );
}

export function requestClubCertification(accessToken: string, clubId: string) {
  return request<ClubCertificationInfo>(
    accessToken,
    `${clubId}/request-certification/`,
    {
      method: "POST",
    },
  );
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

export function getClubEvents(accessToken: string, clubId: string) {
  return request<{ results: ClubEvent[] }>(accessToken, `${clubId}/events/`);
}

export function getClubLeaderboard(accessToken: string, clubId: string) {
  return request<{ results: ClubLeaderboardEntry[] }>(
    accessToken,
    `${clubId}/leaderboard/`,
  );
}

export function joinClubEvent(accessToken: string, eventId: string) {
  return request<ClubEvent>(accessToken, `events/${eventId}/join/`, {
    method: "POST",
  });
}

export function completeClubEvent(accessToken: string, eventId: string) {
  return request<{ status: "completed"; awarded_count: number }>(
    accessToken,
    `events/${eventId}/complete/`,
    { method: "POST" },
  );
}

export function getClubChat(accessToken: string, clubId: string) {
  return request<{ results: ClubChatMessage[] }>(accessToken, `${clubId}/chat/`);
}

export function sendClubMessage(accessToken: string, clubId: string, body: string) {
  return request<ClubChatMessage>(accessToken, `${clubId}/chat/`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export type ClubLeagueEntry = {
  rank: number;
  club_id: string;
  name: string;
  code: string;
  city: string;
  is_certified: boolean;
  total_points: number;
  member_count: number;
  tables_count: number;
  tier: string;
};

export function getClubLeague(accessToken: string = "") {
  return request<{ league: ClubLeagueEntry[] }>(accessToken, "league/");
}

