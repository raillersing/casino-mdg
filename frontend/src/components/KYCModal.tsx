import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileCheck,
  FileText,
  FileUp,
  Lock,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import {
  type KYCDocument,
  type KYCStatus,
  submitKYCRequest,
  uploadKYCDocument,
} from "@services/kyc";

interface KYCModalProps {
  isOpen: boolean;
  onClose: () => void;
  kycStatus: KYCStatus | null;
  token: string | null;
  onStatusUpdated: () => void;
}

const DOCUMENT_CATEGORIES = [
  {
    code: "national_id_front",
    label: "CIN (Recto)",
    description: "Carte Nationale d'Identité malgache — Face avant lisible",
    icon: FileText,
  },
  {
    code: "national_id_back",
    label: "CIN (Verso)",
    description: "Carte Nationale d'Identité malgache — Face arrière",
    icon: FileText,
  },
  {
    code: "proof_of_residence",
    label: "Certificat de résidence",
    description: "Délivré par le Fokontany ou facture Jirama de moins de 3 mois",
    icon: FileCheck,
  },
  {
    code: "source_of_funds",
    label: "Source de revenus (VIP)",
    description: "Fiche de paie, relevé bancaire ou registre de commerce",
    icon: ShieldCheck,
  },
];

export function KYCModal({
  isOpen,
  onClose,
  kycStatus,
  token,
  onStatusUpdated,
}: KYCModalProps) {
  const [selectedLevel, setSelectedLevel] = useState<"verified" | "vip">(
    kycStatus?.level === "verified" ? "vip" : "verified"
  );
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  if (!isOpen) return null;

  const currentRequest = kycStatus?.request;
  const attachedDocs = currentRequest?.documents || [];
  const docsMap = new Map<string, KYCDocument>(
    attachedDocs.map((doc) => [doc.document_type, doc])
  );

  const handleFileUpload = async (
    documentType: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;

    if (file.size > 5 * 1024 * 1024) {
      setError("Le fichier est trop volumineux (maximum 5 Mo).");
      return;
    }

    setUploadingType(documentType);
    setError("");
    setSuccessMsg("");

    try {
      await uploadKYCDocument(token, documentType, file, selectedLevel);
      setSuccessMsg(`Document ${file.name} téléversé avec succès.`);
      onStatusUpdated();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Erreur lors du téléversement du document."
      );
    } finally {
      setUploadingType(null);
      e.target.value = "";
    }
  };

  const handleUpgradeRequest = async () => {
    if (!token) return;
    setError("");
    try {
      await submitKYCRequest(token, selectedLevel);
      setSuccessMsg("Votre demande a été soumise avec succès.");
      onStatusUpdated();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de soumettre la demande."
      );
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card kyc-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "620px", width: "95%" }}
      >
        <div className="modal-header">
          <div className="modal-title-lockup">
            <span className="eyebrow gold">Conformité & Sécurité</span>
            <h2>Vérification d'identité (KYC)</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="kyc-modal-body">
          {error && (
            <div className="alert-box error" style={{ marginBottom: "16px" }}>
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="alert-box success" style={{ marginBottom: "16px" }}>
              <CheckCircle2 size={18} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Statut actuel */}
          <div className="kyc-tier-status-card">
            <div className="kyc-tier-header">
              <div>
                <span className="eyebrow">Statut actuel</span>
                <h3>
                  Niveau :{" "}
                  <strong style={{ color: "var(--gold)" }}>
                    {kycStatus?.level.toUpperCase() || "DÉCOUVERT"}
                  </strong>
                </h3>
              </div>
              <div className="kyc-limits-badge">
                <span>Plafond dépôt :</span>
                <strong>
                  {kycStatus?.limits_mga.deposit.toLocaleString("fr-FR")} Ar
                </strong>
              </div>
            </div>

            {currentRequest && (
              <div
                className={`kyc-request-pill status-${currentRequest.status}`}
                style={{
                  marginTop: "10px",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  background: "rgba(211, 176, 107, 0.12)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "12px",
                }}
              >
                {currentRequest.status === "approved" ? (
                  <CheckCircle2 size={16} color="var(--green)" />
                ) : currentRequest.status === "rejected" ? (
                  <AlertCircle size={16} color="var(--red)" />
                ) : (
                  <Clock size={16} color="var(--gold)" />
                )}
                <span>
                  Demande de surclassement vers{" "}
                  <strong>{currentRequest.level_display}</strong> :{" "}
                  <em>{currentRequest.status_display}</em>
                </span>
              </div>
            )}
          </div>

          {/* Sélecteur de palier visé */}
          <div className="kyc-level-selector" style={{ margin: "20px 0 15px" }}>
            <span className="eyebrow">Choisir le palier souhaité</span>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px",
                marginTop: "8px",
              }}
            >
              <button
                type="button"
                className={`tier-btn ${selectedLevel === "verified" ? "active" : ""}`}
                onClick={() => setSelectedLevel("verified")}
                style={{
                  padding: "12px",
                  borderRadius: "8px",
                  border:
                    selectedLevel === "verified"
                      ? "1px solid var(--gold)"
                      : "1px solid var(--line)",
                  background:
                    selectedLevel === "verified"
                      ? "rgba(211, 176, 107, 0.14)"
                      : "var(--panel)",
                  textAlign: "left",
                }}
              >
                <strong style={{ display: "block", fontSize: "14px" }}>
                  Joueur Vérifié
                </strong>
                <small style={{ color: "var(--muted)", fontSize: "11px" }}>
                  Plafond : 1 000 000 Ar · CIN + Résidence
                </small>
              </button>

              <button
                type="button"
                className={`tier-btn ${selectedLevel === "vip" ? "active" : ""}`}
                onClick={() => setSelectedLevel("vip")}
                style={{
                  padding: "12px",
                  borderRadius: "8px",
                  border:
                    selectedLevel === "vip"
                      ? "1px solid var(--gold)"
                      : "1px solid var(--line)",
                  background:
                    selectedLevel === "vip"
                      ? "rgba(211, 176, 107, 0.14)"
                      : "var(--panel)",
                  textAlign: "left",
                }}
              >
                <strong style={{ display: "block", fontSize: "14px" }}>
                  Membre VIP
                </strong>
                <small style={{ color: "var(--muted)", fontSize: "11px" }}>
                  Plafond : 10 000 000 Ar · Justificatifs complets
                </small>
              </button>
            </div>
          </div>

          {/* Liste des documents d'upload */}
          <div className="kyc-documents-list">
            <span className="eyebrow">Pièces justificatives à fournir</span>
            <div
              style={{
                display: "grid",
                gap: "10px",
                marginTop: "8px",
              }}
            >
              {DOCUMENT_CATEGORIES.map((cat) => {
                const doc = docsMap.get(cat.code);
                const isRequired =
                  selectedLevel === "vip" || cat.code !== "source_of_funds";
                const IconComponent = cat.icon;
                const isUploading = uploadingType === cat.code;

                return (
                  <div
                    key={cat.code}
                    className="kyc-doc-item"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 14px",
                      borderRadius: "8px",
                      background: "var(--panel)",
                      border: doc ? "1px solid rgba(105, 214, 160, 0.3)" : "1px solid var(--line)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
                      <div
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "50%",
                          background: "var(--panel-2)",
                          display: "grid",
                          placeItems: "center",
                          color: doc ? "var(--green)" : "var(--gold)",
                        }}
                      >
                        {doc?.status === "valid" ? (
                          <CheckCircle2 size={18} />
                        ) : (
                          <IconComponent size={18} />
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <strong style={{ fontSize: "13px" }}>{cat.label}</strong>
                          {isRequired && (
                            <span
                              style={{
                                fontSize: "10px",
                                color: "var(--gold)",
                                background: "rgba(211, 176, 107, 0.15)",
                                padding: "1px 5px",
                                borderRadius: "4px",
                              }}
                            >
                              Requis
                            </span>
                          )}
                        </div>
                        <p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--muted)" }}>
                          {doc ? (
                            <span style={{ color: "var(--green)" }}>
                              ✓ Fichier : {doc.file_name} ({(doc.file_size / 1024).toFixed(0)} Ko)
                            </span>
                          ) : (
                            cat.description
                          )}
                        </p>
                      </div>
                    </div>

                    <div style={{ marginLeft: "12px" }}>
                      <label
                        className="button button-secondary button-sm"
                        style={{
                          cursor: isUploading ? "wait" : "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "12px",
                          padding: "6px 12px",
                          borderRadius: "6px",
                          background: "var(--panel-2)",
                          border: "1px solid var(--line)",
                          color: "var(--text)",
                        }}
                      >
                        {isUploading ? (
                          <span>Envoi…</span>
                        ) : doc ? (
                          <>
                            <FileUp size={14} />
                            <span>Remplacer</span>
                          </>
                        ) : (
                          <>
                            <Upload size={14} />
                            <span>Sélectionner</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          style={{ display: "none" }}
                          disabled={isUploading}
                          onChange={(e) => handleFileUpload(cat.code, e)}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div
            className="security-notice"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginTop: "18px",
              padding: "10px",
              borderRadius: "6px",
              background: "rgba(255, 255, 255, 0.04)",
              fontSize: "11px",
              color: "var(--muted)",
            }}
          >
            <Lock size={14} color="var(--gold)" />
            <span>
              Vos documents sont chiffrés et stockés sur un serveur sécurisé MinIO/S3 immuable,
              strictement réservé à la conformité financière anti-fraude.
            </span>
          </div>
        </div>

        <div
          className="modal-footer"
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px",
            marginTop: "20px",
            paddingTop: "14px",
            borderTop: "1px solid var(--line)",
          }}
        >
          <button type="button" className="button button-outline" onClick={onClose}>
            Fermer
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={handleUpgradeRequest}
          >
            Soumettre la demande
          </button>
        </div>
      </div>
    </div>
  );
}
