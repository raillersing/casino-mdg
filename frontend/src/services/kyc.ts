export type KYCDocument = {
  id: string;
  document_type: string;
  document_type_display: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  file_hash: string;
  status: "pending" | "valid" | "rejected";
  status_display: string;
  rejection_reason: string;
  uploaded_at: string;
  download_url: string;
};

export type KYCRequestData = {
  id: number;
  level: "light_player" | "verified" | "vip";
  level_display: string;
  status: "pending" | "approved" | "rejected" | "resubmission_requested";
  status_display: string;
  note: string;
  reviewer_notes: string;
  created_at: string;
  reviewed_at: string | null;
  documents: KYCDocument[];
  user?: {
    id: string;
    phone: string;
    display_name: string;
    email: string;
    current_level: string;
  };
  reviewer?: {
    id: string;
    display_name: string;
  };
};

export type KYCStatus = {
  level: "discovered" | "light_player" | "verified" | "vip";
  limits_mga: { deposit: number; withdrawal: number };
  request: KYCRequestData | null;
  documents_enabled: boolean;
  available_document_types: Array<{ code: string; label: string }>;
};

export async function getKYCStatus(accessToken: string): Promise<KYCStatus> {
  const response = await fetch("/api/v1/kyc/status/", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || "Impossible de charger le statut KYC.");
  }
  return payload as KYCStatus;
}

export async function submitKYCRequest(
  accessToken: string,
  requestedLevel: string,
  note = ""
): Promise<KYCRequestData> {
  const response = await fetch("/api/v1/kyc/status/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ requested_level: requestedLevel, note }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || "Impossible d'initier la demande KYC.");
  }
  return payload.request as KYCRequestData;
}

export async function uploadKYCDocument(
  accessToken: string,
  documentType: string,
  file: File,
  requestedLevel?: string
): Promise<{ document: KYCDocument; request: KYCRequestData }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("document_type", documentType);
  if (requestedLevel) {
    formData.append("requested_level", requestedLevel);
  }

  const response = await fetch("/api/v1/kyc/documents/upload/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || "Échec du téléversement du document.");
  }
  return payload as { document: KYCDocument; request: KYCRequestData };
}

export async function getBackofficeKYCRequests(
  accessToken: string,
  statusFilter?: string
): Promise<{ results: KYCRequestData[]; count: number }> {
  const url = statusFilter
    ? `/api/v1/backoffice/kyc/?status=${encodeURIComponent(statusFilter)}`
    : "/api/v1/backoffice/kyc/";
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || "Impossible de charger les demandes KYC.");
  }
  return payload as { results: KYCRequestData[]; count: number };
}

export async function reviewBackofficeKYCRequest(
  accessToken: string,
  requestId: number,
  action: "approve" | "reject" | "request_resubmission",
  notes = ""
): Promise<KYCRequestData> {
  const response = await fetch(`/api/v1/backoffice/kyc/${requestId}/review/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ action, notes }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || "Échec de la validation KYC.");
  }
  return payload.request as KYCRequestData;
}
