import { useEffect, useState } from "react";
import {
  getBackofficeAuthPolicy,
  updateBackofficeAuthPolicy,
  type BackofficeAuthPolicy,
  type AuthPolicyMode,
} from "@/services/backofficeAuth";

const MODES: Array<{ value: AuthPolicyMode; label: string }> = [
  { value: "email", label: "Email uniquement" },
  { value: "sms", label: "SMS uniquement" },
  { value: "both", label: "Email et SMS" },
  { value: "none", label: "Aucun canal (arrêt d'urgence)" },
];

export function AuthChannelsPanel({ token }: { token: string }) {
  const [policy, setPolicy] = useState<BackofficeAuthPolicy | null>(null);
  const [mode, setMode] = useState<AuthPolicyMode>("both");
  const [reason, setReason] = useState("");
  const [mfa, setMfa] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    getBackofficeAuthPolicy(token)
      .then((result) => {
        if (!active) return;
        setPolicy(result);
        setMode(result.mode);
        setReason("");
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Configuration indisponible.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  const save = async () => {
    if (!policy || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const updated = await updateBackofficeAuthPolicy(
        token,
        mode,
        policy.revision,
        reason,
        mfa,
      );
      const refreshed = await getBackofficeAuthPolicy(token);
      setPolicy(refreshed);
      setMode(updated.mode);
      setReason("");
      setMfa("");
      setMessage("Politique enregistrée, appliquée aux demandes OTP.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Modification non autorisée.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="activity-card" aria-labelledby="auth-channels-title">
      <div className="section-heading compact">
        <div>
          <span className="eyebrow gold">Communications & sécurité</span>
          <h2 id="auth-channels-title">Connexion des joueurs — Email / SMS</h2>
        </div>
      </div>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {!policy ? (
        <p>Chargement de la configuration...</p>
      ) : (
        <>
          <p>
            Configuration actuelle :{" "}
            <strong>{MODES.find((x) => x.value === policy.mode)?.label}</strong>
            {" · "}Révision #{policy.revision}
          </p>
          <div className="stats-grid" aria-label="État des fournisseurs OTP">
            <div>
              <strong>
                {policy.providers.email.configured ? "Configuré" : "Absent"}
              </strong>
              <span>Serveur email SMTP</span>
            </div>
            <div>
              <strong>
                {policy.providers.sms.configured ? "Configuré" : "Absent"}
              </strong>
              <span>Passerelle SMS</span>
            </div>
          </div>
          <p style={{ color: "var(--muted)", fontSize: "0.82rem" }}>
            La présence des paramètres ne garantit pas la réception du code. Les
            secrets restent sur le serveur. Les modifications sont auditées.
          </p>
          {policy.can_update ? (
            <div style={{ display: "grid", gap: "12px" }}>
              <label className="field-label" htmlFor="admin-auth-mode">
                Canaux autorisés
              </label>
              <select
                id="admin-auth-mode"
                className="auth-name-field"
                value={mode}
                onChange={(event) =>
                  setMode(event.target.value as AuthPolicyMode)
                }
              >
                {MODES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <label className="field-label" htmlFor="admin-auth-reason">
                Justification obligatoire
              </label>
              <textarea
                id="admin-auth-reason"
                className="auth-name-field"
                value={reason}
                maxLength={255}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Ex. SMS temporairement indisponible, email validé en staging..."
              />
              <label className="field-label" htmlFor="admin-auth-totp">
                Code TOTP du super-administrateur (6 chiffres)
              </label>
              <input
                id="admin-auth-totp"
                className="auth-name-field"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={mfa}
                onChange={(event) =>
                  setMfa(event.target.value.replace(/\D/g, ""))
                }
              />
              <button
                className="button button-gold"
                type="button"
                disabled={busy || reason.trim().length < 10 || mfa.length !== 6}
                onClick={() => void save()}
              >
                {busy ? "Enregistrement..." : "Confirmer le changement"}
              </button>
            </div>
          ) : (
            <p style={{ color: "var(--muted)" }}>
              Lecture seule : la modification exige un super-administrateur
              possédant un appareil TOTP confirmé, provisionné en dehors de la
              session de connexion par email.
            </p>
          )}
        </>
      )}
    </section>
  );
}
