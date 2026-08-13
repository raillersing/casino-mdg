import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, LifeBuoy, Send } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useGameStore } from "@stores/gameStore";
import {
  createSupportTicket,
  createPilotFeedback,
  getSupportTickets,
  type SupportTicket,
} from "@services/support";
import { useTranslation } from "react-i18next";

export function SupportPage() {
  const { t } = useTranslation();
  const token = useGameStore((state) => state.accessToken);
  const [params] = useSearchParams();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [category, setCategory] = useState("other");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackCategory, setFeedbackCategory] = useState("gameplay");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const incidentMode = params.get("mode") === "incident";
  const gameContext = params.get("game_type") || undefined;
  const tableContext = params.get("table_id") || undefined;
  const sessionContext =
    localStorage.getItem("mdg_analytics_session_id") || undefined;
  const appVersion = import.meta.env.VITE_APP_VERSION || "web-dev";
  useEffect(() => {
    if (token)
      getSupportTickets(token)
        .then((result) => setTickets(result.results))
        .catch((error: Error) => setMessage(error.message));
  }, [token]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) {
      setMessage(t("support.loginRequired"));
      return;
    }
    setLoading(true);
    try {
      await createSupportTicket(token, category, subject, description, {
        game_type: gameContext,
        table_id: tableContext,
        session_id: sessionContext,
        app_version: appVersion,
      });
      setMessage(t("support.sent"));
      setSubject("");
      setDescription("");
      const result = await getSupportTickets(token);
      setTickets(result.results);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("support.failed"));
    } finally {
      setLoading(false);
    }
  };
  const submitFeedback = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) {
      setFeedbackStatus(t("support.loginRequired"));
      return;
    }
    try {
      await createPilotFeedback(
        token,
        feedbackRating,
        feedbackCategory,
        feedbackMessage,
        {
          game_type: params.get("game_type") || undefined,
          table_id: params.get("table_id") || undefined,
        },
      );
      setFeedbackMessage("");
      setFeedbackStatus("Merci, votre retour aide à améliorer le pilote.");
    } catch (error) {
      setFeedbackStatus(
        error instanceof Error ? error.message : t("support.failed"),
      );
    }
  };
  return (
    <div className="page-stack">
      <div className="page-title-row">
        <div>
          <span className="eyebrow">
            <LifeBuoy size={13} /> Support
          </span>
          <h1>{t("support.title")}</h1>
          <p>{t("support.intro")}</p>
        </div>
        <Link to="/profile" className="back-link">
          <ArrowLeft size={16} /> {t("support.back")}
        </Link>
      </div>
      <div className="wallet-layout">
        <form className="payment-card" onSubmit={submit}>
          <h3>
            {incidentMode
              ? "Signaler un problème de partie"
              : t("support.openTicket")}
          </h3>
          {incidentMode && (
            <p className="secure-note">
              Le contexte de la partie est joint automatiquement pour faciliter
              la reproduction.
            </p>
          )}
          <label className="field-label">
            {t("support.category")}
            <select
              className="auth-name-field"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="account">{t("support.account")}</option>
              <option value="wallet">{t("support.wallet")}</option>
              <option value="game">{t("support.game")}</option>
              <option value="other">{t("support.other")}</option>
            </select>
          </label>
          <label className="field-label">
            {t("support.subject")}
            <input
              className="auth-name-field"
              required
              maxLength={120}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder={t("support.subjectPlaceholder")}
            />
          </label>
          <label className="field-label">
            {t("support.description")}
            <textarea
              className="auth-name-field"
              required
              maxLength={2000}
              rows={6}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("support.descriptionPlaceholder")}
            />
          </label>
          <button className="button button-gold" disabled={loading}>
            <Send size={16} />{" "}
            {loading ? t("support.sending") : t("support.send")}
          </button>
          {message && <p className="secure-note">{message}</p>}
        </form>
        <form className="payment-card" onSubmit={submitFeedback}>
          <h3>Retour pilote</h3>
          <p className="secure-note">
            Votre avis est associé à votre session de test, sans valeur
            commerciale.
          </p>
          <label className="field-label">
            Note
            <select
              className="auth-name-field"
              value={feedbackRating}
              onChange={(event) =>
                setFeedbackRating(Number(event.target.value))
              }
            >
              {[5, 4, 3, 2, 1].map((value) => (
                <option value={value} key={value}>
                  {value} / 5
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Catégorie
            <select
              className="auth-name-field"
              value={feedbackCategory}
              onChange={(event) => setFeedbackCategory(event.target.value)}
            >
              <option value="gameplay">Expérience de jeu</option>
              <option value="connection">Connexion</option>
              <option value="clarity">Clarté</option>
              <option value="other">Autre</option>
            </select>
          </label>
          <label className="field-label">
            Votre retour
            <textarea
              className="auth-name-field"
              required
              maxLength={1000}
              rows={5}
              value={feedbackMessage}
              onChange={(event) => setFeedbackMessage(event.target.value)}
              placeholder="Qu'est-ce qui vous a aidé ou bloqué ?"
            />
          </label>
          <button className="button button-gold">Envoyer le feedback</button>
          {feedbackStatus && <p className="secure-note">{feedbackStatus}</p>}
        </form>
        <section className="activity-card">
          <div className="chat-head">{t("support.yourTickets")}</div>
          {tickets.length ? (
            tickets.map((ticket) => (
              <div className="activity-row" key={ticket.id}>
                <div>
                  <strong>{ticket.subject}</strong>
                  <span>
                    {ticket.category} · {ticket.status}
                  </span>
                </div>
                <small>
                  {new Date(ticket.created_at).toLocaleDateString("fr-FR")}
                </small>
              </div>
            ))
          ) : (
            <div className="empty-wallet">{t("support.empty")}</div>
          )}
        </section>
      </div>
    </div>
  );
}
