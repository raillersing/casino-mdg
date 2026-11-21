import { useCallback, useEffect, useState } from "react";
import {
  cancelStaleMatchmakingTicket,
  downloadOpsReport,
  getOpsReport,
  getOpsTables,
  getMatchmakingDiagnostics,
  type MatchmakingDiagnostics,
  type OperationsReport,
  type OperationsTable,
} from "@/services/backofficeReports";

const formatNumber = (n: number) => n.toLocaleString("fr-FR");

export function OperationsReportsPanel({ token }: { token: string }) {
  const [days, setDays] = useState<1 | 7 | 30 | 90>(7);
  const [report, setReport] = useState<OperationsReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setReport(await getOpsReport(token, days));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rapport inaccessible.");
    } finally {
      setLoading(false);
    }
  }, [token, days]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportCsv = async () => {
    setDownloading(true);
    setError("");
    setMessage("");
    try {
      await downloadOpsReport(token, days);
      setMessage("Export agrégé CSV demandé et consigné dans l'audit.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export refusé.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section className="activity-card" aria-labelledby="ops-report-title">
      <div className="section-heading compact">
        <div>
          <span className="eyebrow gold">
            Rapports & conformité des données
          </span>
          <h2 id="ops-report-title">Rapports opérationnels vérifiables</h2>
        </div>
      </div>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
        Sources serveur uniquement. Aucune conversion SIM/MGA. Les intents de
        paiement ne prouvent pas leur rapprochement avec un prestataire.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        <label htmlFor="ops-report-period" className="field-label">
          Période
        </label>
        <select
          id="ops-report-period"
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
        <button
          type="button"
          className="button button-outline"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? "Actualisation..." : "Actualiser"}
        </button>
        <button
          type="button"
          className="button button-outline"
          disabled={downloading}
          onClick={() => void exportCsv()}
        >
          {downloading ? "Export..." : "Exporter CSV agrégé"}
        </button>
      </div>
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {report && (
        <>
          <div className="stats-grid">
            <div>
              <strong>{formatNumber(report.players.registered_total)}</strong>
              <span>Joueurs inscrits (hors staff)</span>
            </div>
            <div>
              <strong>{formatNumber(report.players.new_in_window)}</strong>
              <span>Nouveaux joueurs sur la période</span>
            </div>
            <div>
              <strong>{formatNumber(report.players.email_verified)}</strong>
              <span>Adresses email vérifiées</span>
            </div>
            <div>
              <strong>{formatNumber(report.players.phone_verified)}</strong>
              <span>Numéros de téléphone vérifiés</span>
            </div>
            <div>
              <strong>{formatNumber(report.games.tables_created)}</strong>
              <span>Tables réellement créées en base</span>
            </div>
            <div>
              <strong>{formatNumber(report.games.games_with_results)}</strong>
              <span>Parties avec résultat enregistré</span>
            </div>
            <div>
              <strong>{formatNumber(report.payments.webhooks_received)}</strong>
              <span>Événements entrants prestataires</span>
            </div>
            <div>
              <strong>
                {report.payments.settlement_verified ? "Oui" : "Non"}
              </strong>
              <span>Rapprochement bancaire attesté</span>
            </div>
          </div>
          <h3>Flux comptables par devise</h3>
          {(["SIM", "MGA"] as const).map((currency) => (
            <div key={currency}>
              <strong>{currency} — registre interne</strong>
              {report.wallet[currency].length ? (
                report.wallet[currency].map((row) => (
                  <p
                    key={`${currency}:${row.type}:${row.direction}:${row.status}`}
                  >
                    {row.type} · {row.direction} · {row.status} :{" "}
                    {formatNumber(row.amount)} {currency}
                    {" · "}
                    {row.count} transaction(s)
                  </p>
                ))
              ) : (
                <p>Aucune écriture pour la période.</p>
              )}
            </div>
          ))}
        </>
      )}
    </section>
  );
}

export function GameOperationsPanel({ token }: { token: string }) {
  const [status, setStatus] = useState("all");
  const [tables, setTables] = useState<OperationsTable[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [diagnostics, setDiagnostics] = useState<MatchmakingDiagnostics | null>(
    null,
  );
  const [selectedTicketId, setSelectedTicketId] = useState("");
  const [reason, setReason] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [intervening, setIntervening] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [data, queue] = await Promise.all([
        getOpsTables(token, status),
        getMatchmakingDiagnostics(token),
      ]);
      setTables(data.results);
      setTotal(data.count);
      setDiagnostics(queue);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tables indisponibles.");
    } finally {
      setLoading(false);
    }
  }, [token, status]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const cancelSelected = async () => {
    const ticket = diagnostics?.stale_sample.find(
      (item) => item.ticket_id === selectedTicketId,
    );
    if (!ticket || intervening) return;
    setIntervening(true);
    setError("");
    setMessage("");
    try {
      await cancelStaleMatchmakingTicket(
        token,
        ticket.ticket_id,
        ticket.expected_updated_at,
        reason.trim(),
        mfaCode,
      );
      setMessage("Ticket périmé annulé et action consignée dans l'audit.");
      setSelectedTicketId("");
      setMfaCode("");
      setReason("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Intervention refusée.");
    } finally {
      setIntervening(false);
    }
  };

  return (
    <section className="activity-card" aria-labelledby="ops-tables-title">
      <div className="section-heading compact">
        <div>
          <span className="eyebrow gold">Supervision des jeux</span>
          <h2 id="ops-tables-title">Tables et matchmaking</h2>
        </div>
      </div>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
        Les états affichés proviennent de la base de données ; une table marquée
        « en cours » n'atteste pas une session WebSocket effectivement active.
        Aucun code privé ou secret d'admission n'est divulgué.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        <label className="field-label" htmlFor="ops-table-status">
          Statut
        </label>
        <select
          id="ops-table-status"
          className="auth-name-field"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="all">Toutes</option>
          <option value="open">Ouvertes</option>
          <option value="running">En cours</option>
          <option value="finished">Terminées</option>
        </select>
        <button
          className="button button-outline"
          type="button"
          disabled={loading}
          onClick={() => void refresh()}
        >
          {loading ? "Actualisation..." : "Actualiser"}
        </button>
      </div>
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
      <p>{total} table(s) correspondante(s), 30 premières affichées.</p>
      <div style={{ display: "grid", gap: "8px" }}>
        {tables.map((table) => (
          <div className="activity-row" key={table.id}>
            <div>
              <strong>
                {table.name} — {table.game_type}
              </strong>
              <span>
                {table.code} · {table.status} · {table.max_players} sièges
                {" · "}
                {table.is_private ? "Privée" : "Publique"}
              </span>
              <small>
                Propriétaire : {table.owner_display_name || "Non attribué"}
                {" · "}
                {new Date(table.updated_at).toLocaleString("fr-FR")}
              </small>
            </div>
          </div>
        ))}
      </div>
      <h3>Diagnostic de file d'attente</h3>
      <p style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
        Lecture des tickets stockés uniquement. La santé du moteur de jeu
        WebSocket n'est pas vérifiée par ces statistiques.
      </p>
      {diagnostics && (
        <>
          <div className="stats-grid">
            <div>
              <strong>{diagnostics.queued_fresh}</strong>
              <span>Recherches récentes</span>
            </div>
            <div>
              <strong>{diagnostics.queued_stale}</strong>
              <span>Tickets périmés</span>
            </div>
            <div>
              <strong>{diagnostics.matched_without_table}</strong>
              <span>Associations sans table</span>
            </div>
          </div>
          {diagnostics.stale_sample.map((ticket) => (
            <div className="activity-row" key={ticket.ticket_id}>
              <div>
                <strong>{ticket.game_type}</strong>
                <span>
                  {ticket.target_players} joueurs · dernier signal il y a{" "}
                  {ticket.age_seconds} secondes
                </span>
              </div>
              <button
                type="button"
                className="button button-outline button-small"
                onClick={() => {
                  setSelectedTicketId(ticket.ticket_id);
                  setError("");
                  setMessage("");
                }}
              >
                Examiner
              </button>
            </div>
          ))}
        </>
      )}
      {selectedTicketId && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void cancelSelected();
          }}
          style={{ display: "grid", gap: "8px", maxWidth: "480px" }}
        >
          <h3>Annulation d'un ticket périmé</h3>
          <p style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
            Seul un super-administrateur avec TOTP peut confirmer. Les tables
            actives et les transactions sont exclues de cette opération.
          </p>
          <label htmlFor="matchmaking-reason">Motif (12–255 caractères)</label>
          <textarea
            className="auth-name-field"
            id="matchmaking-reason"
            maxLength={255}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <label htmlFor="matchmaking-totp">Code TOTP</label>
          <input
            className="auth-name-field"
            id="matchmaking-totp"
            type="password"
            inputMode="numeric"
            maxLength={6}
            autoComplete="one-time-code"
            value={mfaCode}
            onChange={(event) => setMfaCode(event.target.value)}
          />
          <button
            className="button button-outline"
            disabled={
              intervening || reason.trim().length < 12 || mfaCode.length !== 6
            }
            type="submit"
          >
            {intervening ? "Vérification..." : "Annuler le ticket périmé"}
          </button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
