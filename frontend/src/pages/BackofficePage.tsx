import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useGameStore } from "@stores/gameStore";
import {
  getAuditEvents,
  getFeatureFlags,
  getPaymentReconciliation,
  getProductEventSummary,
  getPilotFeedbackSummary,
  getPilotGateSummary,
  getPilotIncidents,
  updatePilotIncidentStatus,
  type PilotIncident,
  type AuditEvent,
  type FeatureFlag,
} from "@services/backoffice";

export function BackofficePage() {
  const token = useGameStore((state) => state.accessToken);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [reconciliation, setReconciliation] = useState<{
    intents_pending: number;
    intents_completed: number;
    webhooks_received: number;
    webhooks_processed: number;
    unmatched_webhooks: string[];
  } | null>(null);
  const [pilotGate, setPilotGate] = useState<{
    status: "blocked" | "monitor" | "go_provisional";
    criteria: Array<{
      key: string;
      label: string;
      observed: number | null;
      target: number;
      unit: string;
      status: "pass" | "pending" | "blocked";
    }>;
  } | null>(null);
  const [feedbackSummary, setFeedbackSummary] = useState<{
    count: number;
    average_rating: number | null;
  } | null>(null);
  const [incidents, setIncidents] = useState<PilotIncident[]>([]);
  const [incidentUpdateError, setIncidentUpdateError] = useState("");
  const [error, setError] = useState("");
  const [productSummary, setProductSummary] = useState<{
    total: number;
    events: Record<string, number>;
    unique_actors: number;
    unique_sessions: number;
    funnel: Record<string, number>;
    errors_per_completed_game: number | null;
    reconnections_succeeded: number;
    heartbeat_latency_ms: {
      samples: number;
      average: number | null;
      p95: number | null;
    };
    retention: Record<
      "d1" | "d7",
      {
        eligible_actors: number;
        returned_actors: number;
        rate: number | null;
      }
    >;
  } | null>(null);
  useEffect(() => {
    if (!token) {
      setError("Connexion staff requise.");
      return;
    }
    Promise.all([
      getAuditEvents(token),
      getFeatureFlags(token),
      getPaymentReconciliation(token),
      getProductEventSummary(token),
      getPilotFeedbackSummary(token),
      getPilotGateSummary(token),
      getPilotIncidents(token),
    ])
      .then(
        ([audit, featureFlags, report, summary, feedback, gate, tickets]) => {
          setEvents(audit.results);
          setFlags(featureFlags.results);
          setReconciliation(report);
          setProductSummary(summary);
          setFeedbackSummary(feedback);
          setPilotGate(gate);
          setIncidents(tickets.results);
        },
      )
      .catch((reason: Error) => setError(reason.message));
  }, [token]);
  const updateIncidentStatus = async (ticketId: number, status: string) => {
    if (!token) return;
    setIncidentUpdateError("");
    try {
      const updated = await updatePilotIncidentStatus(token, ticketId, status);
      setIncidents((current) =>
        current.map((incident) =>
          incident.id === ticketId
            ? { ...incident, status: updated.status }
            : incident,
        ),
      );
    } catch (reason) {
      setIncidentUpdateError(
        reason instanceof Error ? reason.message : "Statut non mis à jour.",
      );
    }
  };
  if (error)
    return (
      <div className="page-stack">
        <div className="empty-note">
          <ShieldCheck size={18} />
          <span>{error}</span>
        </div>
        <Link to="/profile" className="back-link">
          <ArrowLeft size={16} /> Retour
        </Link>
      </div>
    );
  return (
    <div className="page-stack">
      <div className="page-title-row">
        <div>
          <span className="eyebrow gold">
            <ShieldCheck size={13} /> Back-office
          </span>
          <h1>
            Contrôle <em>opérationnel.</em>
          </h1>
          <p>
            Audit, flags et rapprochement sandbox protégés par le rôle staff.
          </p>
        </div>
        <Link to="/profile" className="back-link">
          <ArrowLeft size={16} /> Retour
        </Link>
      </div>
      <div className="stats-grid">
        <div>
          <strong>{reconciliation?.intents_pending ?? "…"}</strong>
          <span>Intents en attente</span>
        </div>
        <div>
          <strong>{reconciliation?.intents_completed ?? "…"}</strong>
          <span>Intents terminés</span>
        </div>
        <div>
          <strong>{reconciliation?.webhooks_processed ?? "…"}</strong>
          <span>Webhooks traités</span>
        </div>
        <div>
          <strong>{reconciliation?.unmatched_webhooks.length ?? "…"}</strong>
          <span>Non rapprochés</span>
        </div>
        <div>
          <strong>{productSummary?.total ?? "…"}</strong>
          <span>Événements produit · 7j</span>
        </div>
        <div>
          <strong>{feedbackSummary?.average_rating?.toFixed(1) ?? "…"}</strong>
          <span>Note pilote</span>
        </div>
        <div>
          <strong>{productSummary?.unique_actors ?? "…"}</strong>
          <span>Acteurs uniques · 7j</span>
        </div>
        <div>
          <strong>{productSummary?.errors_per_completed_game ?? "—"}</strong>
          <span>Erreurs / partie terminée</span>
        </div>
        <div>
          <strong>{productSummary?.reconnections_succeeded ?? "…"}</strong>
          <span>Reconnexions réussies · 7j</span>
        </div>
        <div>
          <strong>{productSummary?.heartbeat_latency_ms.p95 ?? "—"}</strong>
          <span>Latence réseau p95 · ms</span>
        </div>
        <div>
          <strong>
            {productSummary?.retention.d1.rate === null ||
            productSummary?.retention.d1.rate === undefined
              ? "—"
              : `${Math.round(productSummary.retention.d1.rate * 100)}%`}
          </strong>
          <span>Rétention D1 · acteurs éligibles</span>
        </div>
        <div>
          <strong>
            {productSummary?.retention.d7.rate === null ||
            productSummary?.retention.d7.rate === undefined
              ? "—"
              : `${Math.round(productSummary.retention.d7.rate * 100)}%`}
          </strong>
          <span>Rétention D7 · acteurs éligibles</span>
        </div>
      </div>
      <div className="wallet-layout">
        <section className="activity-card">
          <div className="chat-head">Incidents pilote · reproduction</div>
          {incidents.length ? (
            incidents.slice(0, 8).map((incident) => (
              <div className="activity-row" key={incident.id}>
                <div>
                  <strong>{incident.subject}</strong>
                  <span>
                    {incident.player} ·{" "}
                    {incident.game_type || "jeu non précisé"} ·{" "}
                    {incident.status}
                  </span>
                  <small>
                    Table {incident.table_id || "—"} · session{" "}
                    {incident.session_id || "—"} ·{" "}
                    {incident.app_version || "version inconnue"}
                  </small>
                  <select
                    aria-label={`Statut de ${incident.subject}`}
                    value={incident.status}
                    onChange={(event) =>
                      void updateIncidentStatus(incident.id, event.target.value)
                    }
                  >
                    <option value="open">Ouvert</option>
                    <option value="in_progress">En cours</option>
                    <option value="closed">Fermé</option>
                  </select>
                </div>
                <small>
                  {new Date(incident.created_at).toLocaleDateString("fr-FR")}
                </small>
              </div>
            ))
          ) : (
            <div className="empty-wallet">Aucun incident signalé.</div>
          )}
          {incidentUpdateError && (
            <small className="form-error">{incidentUpdateError}</small>
          )}
        </section>
        <section className="activity-card">
          <div className="chat-head">Décision pilote · fenêtre 7 jours</div>
          {pilotGate ? (
            <>
              <div className="activity-row">
                <div>
                  <strong>
                    {pilotGate.status === "go_provisional"
                      ? "GO provisoire"
                      : pilotGate.status === "blocked"
                        ? "Bloqué"
                        : "À surveiller"}
                  </strong>
                  <span>Décision assistée par les preuves disponibles</span>
                </div>
                <b>
                  {
                    pilotGate.criteria.filter((item) => item.status === "pass")
                      .length
                  }
                  /{pilotGate.criteria.length}
                </b>
              </div>
              {pilotGate.criteria.map((criterion) => (
                <div className="activity-row" key={criterion.key}>
                  <div>
                    <strong>{criterion.label}</strong>
                    <span>
                      Objectif : {criterion.target} {criterion.unit}
                    </span>
                  </div>
                  <b>
                    {criterion.observed ?? "—"} · {criterion.status}
                  </b>
                </div>
              ))}
            </>
          ) : (
            <div className="empty-wallet">Chargement des critères.</div>
          )}
        </section>
        <section className="activity-card">
          <div className="chat-head">Activation · 7 derniers jours</div>
          {productSummary ? (
            [
              "activation_viewed",
              "test_game_played",
              "human_match_found",
              "demo_started",
            ].map((name) => (
              <div className="activity-row" key={name}>
                <div>
                  <strong>{name}</strong>
                  <span>Événements reçus</span>
                </div>
                <b>{productSummary.events[name] ?? 0}</b>
              </div>
            ))
          ) : (
            <div className="empty-wallet">Chargement des métriques.</div>
          )}
        </section>
        <section className="activity-card">
          <div className="chat-head">Feature flags</div>
          {flags.length ? (
            flags.map((flag) => (
              <div className="activity-row" key={flag.key}>
                <div>
                  <strong>{flag.key}</strong>
                  <span>{flag.reason || "Sans raison"}</span>
                </div>
                <b>{flag.enabled ? "ON" : "OFF"}</b>
              </div>
            ))
          ) : (
            <div className="empty-wallet">Aucun flag configuré.</div>
          )}
        </section>
        <section className="activity-card">
          <div className="chat-head">Derniers événements d’audit</div>
          {events.length ? (
            events.slice(0, 10).map((event) => (
              <div className="activity-row" key={event.id}>
                <div>
                  <strong>{event.action}</strong>
                  <span>
                    {event.actor || "Système"} · {event.target_type}
                  </span>
                </div>
                <small>
                  {new Date(event.created_at).toLocaleDateString("fr-FR")}
                </small>
              </div>
            ))
          ) : (
            <div className="empty-wallet">Aucun événement.</div>
          )}
        </section>
      </div>
    </div>
  );
}
