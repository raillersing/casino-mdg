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
  const [feedbackSummary, setFeedbackSummary] = useState<{
    count: number;
    average_rating: number | null;
  } | null>(null);
  const [error, setError] = useState("");
  const [productSummary, setProductSummary] = useState<{
    total: number;
    events: Record<string, number>;
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
    ])
      .then(([audit, featureFlags, report, summary, feedback]) => {
        setEvents(audit.results);
        setFlags(featureFlags.results);
        setReconciliation(report);
        setProductSummary(summary);
        setFeedbackSummary(feedback);
      })
      .catch((reason: Error) => setError(reason.message));
  }, [token]);
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
      </div>
      <div className="wallet-layout">
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
