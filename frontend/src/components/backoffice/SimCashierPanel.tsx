import { useCallback, useEffect, useState } from "react";
import {
  decideSimGrant,
  getSimGrants,
  getSimLedger,
  getSimSummary,
  requestSimGrant,
  type SimCashierSummary,
  type SimGrant,
  type SimLedger,
} from "@/services/backofficePlayersSim";

export function SimCashierPanel({ token }: { token: string }) {
  const [summary, setSummary] = useState<SimCashierSummary | null>(null);
  const [grants, setGrants] = useState<SimGrant[]>([]);
  const [ledger, setLedger] = useState<SimLedger | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [selectedGrant, setSelectedGrant] = useState("");
  const [action, setAction] = useState<"approve" | "reject">("approve");
  const [decisionReason, setDecisionReason] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [s, g] = await Promise.all([
        getSimSummary(token),
        getSimGrants(token),
      ]);
      setSummary(s);
      setGrants(g.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Caisse inaccessible.");
    }
    // A staff reader without full accounting privileges may see summaries.
    getSimLedger(token).then(setLedger).catch(() => setLedger(null));
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submitRequest = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const grant = await requestSimGrant(
        token,
        Number(playerId),
        Number(amount),
        reason.trim(),
        requestKey,
      );
      setMessage(`Demande ${grant.id} enregistrée sans crédit immédiat.`);
      setPlayerId("");
      setAmount("");
      setReason("");
      setRequestKey(crypto.randomUUID());
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demande refusée.");
    } finally {
      setBusy(false);
    }
  };

  const submitDecision = async () => {
    if (!selectedGrant) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const grant = await decideSimGrant(
        token,
        selectedGrant,
        action,
        decisionReason.trim(),
        mfaCode,
      );
      setMessage(`Demande ${grant.id} : ${grant.status}. Écriture : ${grant.transaction_id || "aucune"}.`);
      setSelectedGrant("");
      setMfaCode("");
      setDecisionReason("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Décision refusée.");
    } finally {
      setBusy(false);
    }
  };

  const pending = grants.filter((grant) => grant.status === "pending");

  return (
    <section className="activity-card" aria-labelledby="sim-cashier-title">
      <div className="section-heading compact">
        <div>
          <span className="eyebrow gold">Caisse virtuelle</span>
          <h2 id="sim-cashier-title">Gestion des jetons SIM</h2>
        </div>
      </div>
      <p>
        Jetons de simulation uniquement. Aucune fonction de cet écran ne
        transfère ni ne débite des Ariary (MGA).
      </p>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {summary && (
        <div className="stats-grid" aria-label="Bilan du grand livre SIM">
          <div>
            <strong>{summary.total_balances_sim.toLocaleString("fr-FR")}</strong>
            <span>Somme de tous les comptes SIM</span>
          </div>
          <div>
            <strong>{summary.entries_debit_sim.toLocaleString("fr-FR")}</strong>
            <span>Débits SIM comptabilisés</span>
          </div>
          <div>
            <strong>{summary.entries_credit_sim.toLocaleString("fr-FR")}</strong>
            <span>Crédits SIM comptabilisés</span>
          </div>
          <div>
            <strong>{summary.ledger_entries_balanced ? "Équilibré" : "ÉCART"}</strong>
            <span>Somme débits / crédits du journal</span>
          </div>
          <div>
            <strong>{summary.pending_adjustments}</strong>
            <span>Demandes à approuver</span>
          </div>
        </div>
      )}
      <div style={{ display: "grid", gap: "10px", marginTop: "16px" }}>
        <h3>Demander une dotation SIM</h3>
        <label className="field-label" htmlFor="sim-grant-player">
          Identifiant du joueur
        </label>
        <input
          id="sim-grant-player"
          type="number"
          min={1}
          className="auth-name-field"
          value={playerId}
          onChange={(event) => setPlayerId(event.target.value)}
        />
        <label className="field-label" htmlFor="sim-grant-amount">
          Montant en jetons SIM (1 à 1 000 000)
        </label>
        <input
          id="sim-grant-amount"
          type="number"
          min={1}
          max={1000000}
          className="auth-name-field"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        <label className="field-label" htmlFor="sim-grant-reason">
          Justification traçable
        </label>
        <textarea
          id="sim-grant-reason"
          className="auth-name-field"
          maxLength={1000}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Motif métier détaillé (20 caractères minimum)"
        />
        <button
          type="button"
          className="button button-outline"
          disabled={
            busy ||
            !Number.isInteger(Number(playerId)) ||
            Number(playerId) <= 0 ||
            !Number.isInteger(Number(amount)) ||
            Number(amount) <= 0 ||
            Number(amount) > 1000000 ||
            reason.trim().length < 20
          }
          onClick={() => void submitRequest()}
        >
          Enregistrer la demande (sans crédit)
        </button>
      </div>
      <div style={{ marginTop: "18px", display: "grid", gap: "10px" }}>
        <h3>Approbation séparée</h3>
        <p style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
          Approbateur différent du demandeur, super-administrateur
          authentifié et code TOTP obligatoire.
        </p>
        <label className="field-label" htmlFor="sim-decision-request">
          Demande en attente
        </label>
        <select
          id="sim-decision-request"
          className="auth-name-field"
          value={selectedGrant}
          onChange={(event) => setSelectedGrant(event.target.value)}
        >
          <option value="">Sélectionner une demande</option>
          {pending.map((grant) => (
            <option key={grant.id} value={grant.id}>
              #{grant.id.slice(0, 8)} · Joueur {grant.player_id} · {grant.amount} SIM
            </option>
          ))}
        </select>
        <label className="field-label" htmlFor="sim-decision-action">
          Décision
        </label>
        <select
          id="sim-decision-action"
          className="auth-name-field"
          value={action}
          onChange={(event) => setAction(event.target.value as "approve" | "reject")}
        >
          <option value="approve">Approuver</option>
          <option value="reject">Refuser</option>
        </select>
        <label className="field-label" htmlFor="sim-decision-reason">
          Motif de décision
        </label>
        <textarea
          id="sim-decision-reason"
          className="auth-name-field"
          value={decisionReason}
          maxLength={1000}
          onChange={(event) => setDecisionReason(event.target.value)}
        />
        <label className="field-label" htmlFor="sim-decision-mfa">
          Code TOTP du superviseur
        </label>
        <input
          id="sim-decision-mfa"
          className="auth-name-field"
          inputMode="numeric"
          maxLength={6}
          value={mfaCode}
          onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ""))}
        />
        <button
          className="button button-gold"
          type="button"
          disabled={
            busy ||
            !selectedGrant ||
            decisionReason.trim().length < 10 ||
            mfaCode.length !== 6
          }
          onClick={() => void submitDecision()}
        >
          Confirmer la décision
        </button>
      </div>
      {ledger ? (
        <div style={{ marginTop: "18px" }}>
          <h3>Journal SIM (15 dernières transactions)</h3>
          {ledger.results.map((tx) => (
            <div className="activity-row" key={tx.id}>
              <div>
                <strong>{tx.transaction_code}</strong>
                <span>
                  {tx.type} · {tx.amount.toLocaleString("fr-FR")} SIM · {tx.status}
                </span>
                <small>{tx.entries.length} écritures comptables</small>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
          Journal détaillé réservé aux responsables habilités.
        </p>
      )}
    </section>
  );
}
