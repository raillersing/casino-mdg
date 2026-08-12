export type KYCStatus = {
  level: string;
  limits_mga: { deposit: number; withdrawal: number };
  request: { id: number; level: string; status: string } | null;
  documents_enabled: boolean;
};

export function getKYCStatus(accessToken: string) {
  return fetch("/api/v1/kyc/status/", {
    headers: { Authorization: `Bearer ${accessToken}` },
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(payload.detail || "Impossible de charger le statut KYC.");
    return payload as KYCStatus;
  });
}
