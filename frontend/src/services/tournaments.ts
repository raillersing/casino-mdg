export type TournamentPrize = {
  place: number;
  percent: number;
  amount: number;
};

export type TournamentParticipant = {
  user_id: string;
  display_name: string;
  chips: number;
  status: string;
  rank?: number | null;
  payout: number;
};

export type Tournament = {
  id: string;
  name: string;
  game_type: "poker" | "rami" | "belote";
  format: "sit_and_go" | "scheduled";
  buy_in: number;
  starting_chips: number;
  max_players: number;
  registered_count: number;
  blind_interval_minutes: number;
  status: "registering" | "running" | "completed" | "cancelled";
  prize_pool: number;
  club_id?: string | null;
  registered: boolean;
  user_status?: string | null;
  created_at: string;
  prizes: TournamentPrize[];
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/v1";

export async function getTournaments(
  accessToken: string = "",
): Promise<{ results: Tournament[] }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${API_BASE}/games/tournaments/`, { headers });
  if (!res.ok) throw new Error("Impossible de charger les tournois.");
  return res.json();
}

export async function getTournamentDetail(
  tournamentId: string,
  accessToken: string = "",
): Promise<{ tournament: Tournament; participants: TournamentParticipant[] }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${API_BASE}/games/tournaments/${tournamentId}/`, {
    headers,
  });
  if (!res.ok) throw new Error("Impossible de charger les détails du tournoi.");
  return res.json();
}

export async function registerTournament(
  accessToken: string,
  tournamentId: string,
): Promise<{ status: string; tournament: Tournament }> {
  const res = await fetch(
    `${API_BASE}/games/tournaments/${tournamentId}/register/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Échec de l'inscription au tournoi.");
  }
  return res.json();
}
