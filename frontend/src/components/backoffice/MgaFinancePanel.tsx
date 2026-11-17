import { useCallback, useEffect, useState } from "react";
import {
  getMgaIntents,
  getMgaSummary,
  type MgaIntent,
  type MgaSummary,
} from "@/services/backofficeMga";

const fmt = (value: number) => value.toLocaleString("fr-FR");

export function MgaFinancePanel({ token }: { token: string }) {
  const [days, setDays] = useState<1 | 7 | 30 | 90>(7);
  const [intentStatus, setIntentStatus] = useState("all");
  const [summary, setSummary] = useState<MgaSummary | null>(null);
  const [intents, setIntents] = useState<MgaIntent[]>([]);
  const [intentsCount, setIntentsCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [overview, page] = await Promise.all([
        getMgaSummary(token, days),
        getMgaIntents(token, intentStatus),
      ]);
      setSummary(overview);
      setIntents(page.results);
      setIntentsCount(page.count);
    } catch (err) {
      setSummary(null);
      setIntents([]);
      setIntentsCount(0);
      setError(
        err instanceof Error ? err.message : "Consultation MGA indisponible.",
      );
    } finally {
      setLoading(false);
    }
  }, [token, days, intentStatus]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="activity-card" aria-labelledby="mga-audit-title">
      <div className="section-heading compact">
        <div>
          <span className="eyebrow gold">Contrôles financiers</span>
          <h2 id="mga-audit-title">Registre MGA — lecture seule</h2>
        </div>
      </div>
      <p role="status">
        Les fonds réels ne sont pas activés. Ces montants proviennent du
        registre interne ; les paiements PSP externes ne sont pas rapprochés.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
        <label htmlFor="mga-report-days" className="field-label">
          Période des flux
        </label>
        <select
          id="mga-report-days"
          className="auth-name-field"
          value={days}
          onChange={(event) =>
            setDays(Number(event.target.value) as 1 | 7 | 30 | 90)
          }
        >
          <option value={1}>24 heures</option>
          <option value={7}>7 jours</option>
          <option value={30}>30 jours</option>
          <option value={90}>90 jours</option>
        </select>
        <label htmlFor="mga-intent-status" className="field-label">
          Statut des opérations
        </label>
        <select
          id="mga-intent-status"
          className="auth-name-field"
          value={intentStatus}
          onChange={(event) => setIntentStatus(event.target.value)}
        >
          <option value="all">Tous</option>
          <option value="pending">En attente</option>
          <option value="processing">En traitement</option>
          <option value="completed">Terminés</option>
          <option value="failed">Échoués</option>
          <option value="cancelled">Annulés</option>
        </select>
        <button
          type="button"
          className="button button-outline"
          disabled={loading}
          onClick={() => void refresh()}
        >
          {loading ? "Actualisation…" : "Actualiser"}
        </button>
      </div>
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
      {summary && (
        <>
          <div className="stats-grid" aria-label="Aperçu MGA non rapproché">
            <div>
              <strong>{fmt(summary.intents.count)}</strong>
              <span>Opérations internes sur la période</span>
            </div>
            <div>
              <strong>{fmt(summary.intents.sandbox_count)}</strong>
              <span>Intents identifiés sandbox</span>
            </div>
            <div>
              <strong>{fmt(summary.intents.unclassified_count)}</strong>
              <span>Intents non classifiés comme sandbox</span>
            </div>
            <div>
              <strong>{fmt(summary.intents.pending_withdrawals)}</strong>
              <span>Retraits internes en attente</span>
            </div>
            <div>
              <strong>
                {fmt(summary.wallet.completed_deposit_total_mga)} MGA
              </strong>
              <span>Crédits internes de type dépôt</span>
            </div>
            <div>
              <strong>
                {fmt(summary.wallet.completed_withdrawal_total_mga)} MGA
              </strong>
              <span>Débits internes de type retrait</span>
            </div>
            <div>
              <strong>{fmt(summary.wallet.player_held_mga)} MGA</strong>
              <span>Soldes MGA réservés au total (instantané)</span>
            </div>
            <div>
              <strong>
                {summary.wallet.aggregate_entries_balanced
                  ? "Équilibré (agrégat)"
                  : "Écart détecté"}
              </strong>
              <span>Comparaison débits / crédits du journal interne</span>
            </div>
            <div>
              <strong>{fmt(summary.webhooks.unprocessed)}</strong>
              <span>Événements PSP non traités</span>
            </div>
            <div>
              <strong>Non vérifié</strong>
              <span>Rapprochement externe avec les prestataires</span>
            </div>
          </div>
          {summary.warnings.map((warning) => (
            <p
              key={warning}
              style={{ color: "var(--muted)", fontSize: "0.82rem" }}
            >
              {warning}
            </p>
          ))}
        </>
      )}
      <div style={{ marginTop: "14px" }}>
        <h3>Demandes de paiement MGA — consultation uniquement</h3>
        <p>{intentsCount} demandes correspondant au filtre (20 premières).</p>
        <div style={{ display: "grid", gap: "8px" }}>
          {intents.map((intent) => (
            <div className="activity-row" key={intent.id}>
              <div>
                <strong>
                  {intent.provider} · {intent.direction} ·{" "}
                  {fmt(intent.amount_mga)} MGA
                </strong>
                <span>
                  Joueur #{intent.player_id} · {intent.status}
                  {" · "}
                  {intent.sandbox ? "Simulation" : "Non classifié"}
                </span>
                <small>
                  {new Date(intent.created_at).toLocaleString("fr-FR")}
                </small>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
