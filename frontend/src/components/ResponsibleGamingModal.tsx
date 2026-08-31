import { useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  CheckCircle2,
  HeartHandshake,
  Hourglass,
  PauseCircle,
  ShieldAlert,
  Sliders,
  X,
} from "lucide-react";
import {
  activateCoolingOff,
  activateSelfExclusion,
  type ResponsibleGamingProfile,
  updateResponsibleGamingLimits,
} from "@services/responsibleGaming";

interface ResponsibleGamingModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string | null;
  profile: ResponsibleGamingProfile | null;
  onProfileUpdated: () => void;
}

export function ResponsibleGamingModal({
  isOpen,
  onClose,
  token,
  profile,
  onProfileUpdated,
}: ResponsibleGamingModalProps) {
  const [tab, setTab] = useState<"limits" | "pause" | "exclusion">("limits");
  const [dailyLimit, setDailyLimit] = useState<string>(
    profile?.daily_deposit_limit ? profile.daily_deposit_limit.toString() : ""
  );
  const [weeklyLimit, setWeeklyLimit] = useState<string>(
    profile?.weekly_deposit_limit ? profile.weekly_deposit_limit.toString() : ""
  );
  const [monthlyLimit, setMonthlyLimit] = useState<string>(
    profile?.monthly_deposit_limit ? profile.monthly_deposit_limit.toString() : ""
  );
  const [realityCheck, setRealityCheck] = useState<number>(
    profile?.reality_check_interval_minutes || 30
  );

  const [coolingHours, setCoolingHours] = useState<number>(24);
  const [pauseReason, setPauseReason] = useState("");

  const [exclusionMonths, setExclusionMonths] = useState<number>(1);
  const [isPermanent, setIsPermanent] = useState<boolean>(false);
  const [exclusionReason, setExclusionReason] = useState("");
  const [confirmExclusion, setConfirmExclusion] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  if (!isOpen) return null;

  const handleSaveLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await updateResponsibleGamingLimits(token, {
        daily_deposit_limit: dailyLimit ? parseInt(dailyLimit, 10) : null,
        weekly_deposit_limit: weeklyLimit ? parseInt(weeklyLimit, 10) : null,
        monthly_deposit_limit: monthlyLimit ? parseInt(monthlyLimit, 10) : null,
        reality_check_interval_minutes: realityCheck,
      });
      setSuccessMsg(res.message);
      onProfileUpdated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur lors de la mise à jour.");
    } finally {
      setLoading(false);
    }
  };

  const handleApplyCoolingOff = async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await activateCoolingOff(token, coolingHours, pauseReason);
      setSuccessMsg(res.message);
      onProfileUpdated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'activation de la pause.");
    } finally {
      setLoading(false);
    }
  };

  const handleApplySelfExclusion = async () => {
    if (!token) return;
    if (!confirmExclusion) {
      setError("Veuillez cocher la case de confirmation pour valider l'auto-exclusion.");
      return;
    }
    setLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await activateSelfExclusion(token, {
        permanent: isPermanent,
        months: isPermanent ? undefined : exclusionMonths,
        reason: exclusionReason,
      });
      setSuccessMsg(res.message);
      onProfileUpdated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'auto-exclusion.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card rg-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "580px", width: "95%" }}
      >
        <div className="modal-header">
          <div className="modal-title-lockup">
            <span className="eyebrow gold">
              <HeartHandshake size={13} /> Protection du Joueur
            </span>
            <h2>Jeu Responsable & Maîtrise</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        {/* État actuel de blocage / pause si actif */}
        {profile?.is_blocked && (
          <div
            style={{
              padding: "14px",
              borderRadius: "8px",
              background: "rgba(232, 120, 120, 0.15)",
              border: "1px solid rgba(232, 120, 120, 0.35)",
              marginBottom: "16px",
              display: "flex",
              alignItems: "flex-start",
              gap: "12px",
            }}
          >
            <ShieldAlert size={22} color="var(--red)" style={{ flexShrink: 0, marginTop: "2px" }} />
            <div>
              <strong style={{ color: "var(--red)", fontSize: "14px", display: "block" }}>
                {profile.is_permanently_excluded
                  ? "Auto-exclusion définitive active"
                  : profile.is_active_self_exclusion
                  ? `Auto-exclusion active jusqu'au ${new Date(profile.self_exclusion_until!).toLocaleDateString("fr-FR")}`
                  : `Pause de jeu active jusqu'au ${new Date(profile.cooling_off_until!).toLocaleString("fr-FR")}`}
              </strong>
              <small style={{ color: "var(--soft)", fontSize: "12px" }}>
                Durant cette période de protection, les dépôts et les participations aux tables en argent réel sont strictement bloqués.
              </small>
            </div>
          </div>
        )}

        {error && (
          <div className="alert-box error" style={{ marginBottom: "14px" }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="alert-box success" style={{ marginBottom: "14px" }}>
            <CheckCircle2 size={18} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Onglets de navigation RG */}
        <div className="wallet-tabs" style={{ marginBottom: "16px" }}>
          <button
            className={tab === "limits" ? "active" : ""}
            onClick={() => setTab("limits")}
          >
            <Sliders size={14} style={{ marginRight: "6px" }} /> Plafonds Personnels
          </button>
          <button
            className={tab === "pause" ? "active" : ""}
            onClick={() => setTab("pause")}
          >
            <PauseCircle size={14} style={{ marginRight: "6px" }} /> Faire une Pause
          </button>
          <button
            className={tab === "exclusion" ? "active" : ""}
            onClick={() => setTab("exclusion")}
          >
            <Ban size={14} style={{ marginRight: "6px" }} /> Auto-Exclusion
          </button>
        </div>

        {tab === "limits" && (
          <form onSubmit={handleSaveLimits}>
            <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "14px" }}>
              Fixez vos propres limites de dépôts en Ariary (MGA). La réduction d'une limite prend effet immédiatement.
            </p>

            {/* Dépôt Journalier */}
            <div style={{ marginBottom: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <label className="input-label" style={{ fontSize: "12px" }}>Plafond journalier (24h)</label>
                <small style={{ color: "var(--gold)", fontSize: "11px" }}>
                  Utilisé : {(profile?.deposit_usage?.daily || 0).toLocaleString("fr-FR")} Ar
                </small>
              </div>
              <input
                type="number"
                min="0"
                step="5000"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(e.target.value)}
                placeholder="Ex: 50 000 Ar (Laisser vide pour illimité)"
                style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)" }}
              />
            </div>

            {/* Dépôt Hebdomadaire */}
            <div style={{ marginBottom: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <label className="input-label" style={{ fontSize: "12px" }}>Plafond hebdomadaire (7 jours)</label>
                <small style={{ color: "var(--gold)", fontSize: "11px" }}>
                  Utilisé : {(profile?.deposit_usage?.weekly || 0).toLocaleString("fr-FR")} Ar
                </small>
              </div>
              <input
                type="number"
                min="0"
                step="10000"
                value={weeklyLimit}
                onChange={(e) => setWeeklyLimit(e.target.value)}
                placeholder="Ex: 200 000 Ar"
                style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)" }}
              />
            </div>

            {/* Dépôt Mensuel */}
            <div style={{ marginBottom: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <label className="input-label" style={{ fontSize: "12px" }}>Plafond mensuel (30 jours)</label>
                <small style={{ color: "var(--gold)", fontSize: "11px" }}>
                  Utilisé : {(profile?.deposit_usage?.monthly || 0).toLocaleString("fr-FR")} Ar
                </small>
              </div>
              <input
                type="number"
                min="0"
                step="50000"
                value={monthlyLimit}
                onChange={(e) => setMonthlyLimit(e.target.value)}
                placeholder="Ex: 1 000 000 Ar"
                style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)" }}
              />
            </div>

            {/* Rappel Réalité */}
            <div style={{ marginBottom: "18px" }}>
              <label className="input-label" style={{ display: "block", marginBottom: "6px", fontSize: "12px" }}>
                Rappel de session en jeu ("Reality Check")
              </label>
              <select
                value={realityCheck}
                onChange={(e) => setRealityCheck(parseInt(e.target.value, 10))}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)" }}
              >
                <option value="15">Toutes les 15 minutes</option>
                <option value="30">Toutes les 30 minutes (Recommandé)</option>
                <option value="45">Toutes les 45 minutes</option>
                <option value="60">Toutes les 60 minutes</option>
              </select>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button type="button" className="button button-outline" onClick={onClose}>
                Annuler
              </button>
              <button type="submit" className="button button-primary" disabled={loading}>
                {loading ? "Enregistrement…" : "Enregistrer mes plafonds"}
              </button>
            </div>
          </form>
        )}

        {tab === "pause" && (
          <div className="rg-pause-tab">
            <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "14px" }}>
              Besoin de faire un break ? Activez une pause temporaire immédiate. Votre compte sera verrouillé pour la durée sélectionnée.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
              {[
                { hours: 24, label: "24 heures" },
                { hours: 48, label: "48 heures" },
                { hours: 72, label: "72 heures" },
                { hours: 168, label: "7 jours" },
              ].map((item) => (
                <button
                  key={item.hours}
                  type="button"
                  onClick={() => setCoolingHours(item.hours)}
                  style={{
                    padding: "14px",
                    borderRadius: "8px",
                    background: coolingHours === item.hours ? "rgba(211, 176, 107, 0.18)" : "var(--panel)",
                    border: coolingHours === item.hours ? "1px solid var(--gold)" : "1px solid var(--line)",
                    color: coolingHours === item.hours ? "var(--gold)" : "var(--text)",
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                >
                  <Hourglass size={18} style={{ margin: "0 auto 4px" }} />
                  {item.label}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: "18px" }}>
              <label className="input-label" style={{ display: "block", marginBottom: "4px", fontSize: "12px" }}>
                Motif personnel (facultatif)
              </label>
              <input
                type="text"
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
                placeholder="Ex: Repos, concentration professionnelle..."
                style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)" }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button type="button" className="button button-outline" onClick={onClose}>
                Fermer
              </button>
              <button
                type="button"
                className="button button-gold"
                onClick={handleApplyCoolingOff}
                disabled={loading || profile?.is_blocked}
              >
                {loading ? "Activation…" : `Activer la pause de ${coolingHours}h`}
              </button>
            </div>
          </div>
        )}

        {tab === "exclusion" && (
          <div className="rg-exclusion-tab">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "12px",
                borderRadius: "8px",
                background: "rgba(232, 120, 120, 0.12)",
                border: "1px solid rgba(232, 120, 120, 0.3)",
                marginBottom: "16px",
              }}
            >
              <AlertTriangle size={24} color="var(--red)" style={{ flexShrink: 0 }} />
              <p style={{ margin: 0, fontSize: "12px", color: "var(--red)" }}>
                <strong>Attention :</strong> L'auto-exclusion est un acte irréversible. Aucun déblocage anticipé ne sera accordé par le support client.
              </p>
            </div>

            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", marginBottom: "10px" }}>
                <input
                  type="checkbox"
                  checked={isPermanent}
                  onChange={(e) => setIsPermanent(e.target.checked)}
                />
                <strong style={{ fontSize: "13px", color: "var(--red)" }}>
                  Auto-exclusion définitive et permanente
                </strong>
              </label>

              {!isPermanent && (
                <div>
                  <label className="input-label" style={{ display: "block", marginBottom: "6px", fontSize: "12px" }}>
                    Durée d'auto-exclusion temporaire
                  </label>
                  <select
                    value={exclusionMonths}
                    onChange={(e) => setExclusionMonths(parseInt(e.target.value, 10))}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)" }}
                  >
                    <option value="1">1 mois</option>
                    <option value="3">3 mois</option>
                    <option value="6">6 mois</option>
                    <option value="12">1 an (12 mois)</option>
                  </select>
                </div>
              )}
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label className="input-label" style={{ display: "block", marginBottom: "4px", fontSize: "12px" }}>
                Raison de la demande (obligatoire pour conformité)
              </label>
              <input
                type="text"
                value={exclusionReason}
                onChange={(e) => setExclusionReason(e.target.value)}
                placeholder="Ex: Prévention financière, gestion du temps..."
                style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)" }}
                required
              />
            </div>

            <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", cursor: "pointer", marginBottom: "18px", fontSize: "12px", color: "var(--soft)" }}>
              <input
                type="checkbox"
                checked={confirmExclusion}
                onChange={(e) => setConfirmExclusion(e.target.checked)}
                style={{ marginTop: "2px" }}
              />
              <span>
                Je confirme comprendre que cette décision est ferme, immédiate et entraînera la clôture de mes sessions de jeu.
              </span>
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button type="button" className="button button-outline" onClick={onClose}>
                Annuler
              </button>
              <button
                type="button"
                className="button button-danger"
                onClick={handleApplySelfExclusion}
                disabled={loading || !confirmExclusion || profile?.is_blocked}
                style={{ background: "var(--red)", color: "#fff", border: "none" }}
              >
                {loading ? "Traitement…" : isPermanent ? "Confirmer l'exclusion définitive" : `Confirmer l'auto-exclusion (${exclusionMonths} mois)`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
