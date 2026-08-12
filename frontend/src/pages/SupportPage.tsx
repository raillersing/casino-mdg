import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, LifeBuoy, Send } from "lucide-react";
import { Link } from "react-router-dom";
import { useGameStore } from "@stores/gameStore";
import {
  createSupportTicket,
  getSupportTickets,
  type SupportTicket,
} from "@services/support";
import { useTranslation } from "react-i18next";

export function SupportPage() {
  const { t } = useTranslation();
  const token = useGameStore((state) => state.accessToken);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [category, setCategory] = useState("other");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
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
      await createSupportTicket(token, category, subject, description);
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
          <h3>{t("support.openTicket")}</h3>
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
