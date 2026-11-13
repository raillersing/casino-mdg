export type DailyMission = {
  key: string;
  title: string;
  progress: number;
  goal: number;
  reward: number;
  claimed: boolean;
  claimable: boolean;
};

export type DailyStreakInfo = {
  current_day: number;
  claimed: boolean;
  reward: number;
  schedule: number[];
};

export type DailyMissionsPayload = {
  date: string;
  missions: DailyMission[];
  streak: DailyStreakInfo;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/v1";

export async function fetchDailyMissions(
  accessToken: string,
): Promise<DailyMissionsPayload> {
  const res = await fetch(`${API_BASE}/games/missions/`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    throw new Error("Impossible de charger les missions quotidiennes.");
  }
  return res.json();
}

export async function claimMissionOrStreak(
  accessToken: string,
  key: string,
): Promise<{
  claimed: boolean;
  reward?: number;
  day?: number;
  duplicate?: boolean;
}> {
  const res = await fetch(`${API_BASE}/games/missions/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ key }),
  });
  if (!res.ok) {
    throw new Error("Impossible de réclamer la récompense.");
  }
  return res.json();
}

export const getDailyMissions = fetchDailyMissions;
export const claimDailyMission = claimMissionOrStreak;
