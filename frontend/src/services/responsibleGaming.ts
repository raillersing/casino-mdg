export type ResponsibleGamingProfile = {
  daily_deposit_limit: number | null;
  weekly_deposit_limit: number | null;
  monthly_deposit_limit: number | null;
  daily_loss_limit: number | null;
  daily_bet_limit: number | null;
  session_time_limit_minutes: number | null;
  reality_check_interval_minutes: number;
  is_active_cooling_off: boolean;
  cooling_off_until: string | null;
  is_active_self_exclusion: boolean;
  is_permanently_excluded: boolean;
  self_exclusion_until: string | null;
  is_blocked: boolean;
  deposit_usage: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  updated_at: string;
};

export async function getResponsibleGamingStatus(
  accessToken: string
): Promise<ResponsibleGamingProfile> {
  const response = await fetch("/api/v1/responsible-gaming/status/", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || "Impossible de charger le profil de Jeu Responsable.");
  }
  return payload as ResponsibleGamingProfile;
}

export async function updateResponsibleGamingLimits(
  accessToken: string,
  limits: Partial<ResponsibleGamingProfile>
): Promise<{ message: string; profile: ResponsibleGamingProfile }> {
  const response = await fetch("/api/v1/responsible-gaming/limits/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(limits),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || "Impossible d'enregistrer les limites.");
  }
  return payload as { message: string; profile: ResponsibleGamingProfile };
}

export async function activateCoolingOff(
  accessToken: string,
  durationHours: number,
  reason = ""
): Promise<{ message: string; profile: ResponsibleGamingProfile }> {
  const response = await fetch("/api/v1/responsible-gaming/cooling-off/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ duration_hours: durationHours, reason }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || "Impossible d'activer la pause.");
  }
  return payload as { message: string; profile: ResponsibleGamingProfile };
}

export async function activateSelfExclusion(
  accessToken: string,
  options: { months?: number; permanent?: boolean; reason?: string }
): Promise<{ message: string; profile: ResponsibleGamingProfile }> {
  const response = await fetch("/api/v1/responsible-gaming/self-exclude/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(options),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || "Impossible d'activer l'auto-exclusion.");
  }
  return payload as { message: string; profile: ResponsibleGamingProfile };
}
