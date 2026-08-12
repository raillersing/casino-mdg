import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Lock, Plus, UsersRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGameStore } from "@stores/gameStore";
import { createClub, getClubs, joinClub, type Club } from "@services/clubs";

export function ClubsPage() {
  const { t } = useTranslation();
  const accessToken = useGameStore((state) => state.accessToken);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    city: "",
    description: "",
    language: "fr" as "fr" | "mg",
    visibility: "open" as "open" | "invite",
  });

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    getClubs(accessToken)
      .then((payload) => setClubs(payload.results))
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [accessToken]);

  if (!accessToken) {
    return (
      <div className="empty-note club-login-card">
        <h1>{t("clubs.title")}</h1>
        <p>{t("clubs.loginBody")}</p>
        <Link to="/auth" className="button button-gold">
          {t("nav.login")}
        </Link>
      </div>
    );
  }

  const submit = async () => {
    if (!form.name.trim()) return;
    setCreating(true);
    setError("");
    try {
      const club = await createClub(accessToken, {
        ...form,
        name: form.name.trim(),
      });
      setClubs((current) => [club, ...current]);
      setShowCreate(false);
      setForm({
        name: "",
        city: "",
        description: "",
        language: "fr",
        visibility: "open",
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("app.error"));
    } finally {
      setCreating(false);
    }
  };

  const join = async (club: Club) => {
    try {
      const joined = await joinClub(accessToken, club.id);
      setClubs((current) =>
        current.map((item) => (item.id === club.id ? joined : item)),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("app.error"));
    }
  };

  return (
    <div className="page-stack">
      <div className="page-title-row">
        <div>
          <span className="eyebrow">{t("clubs.eyebrow")}</span>
          <h1>{t("clubs.title")}</h1>
          <p>{t("clubs.intro")}</p>
        </div>
        <button
          className="button button-gold"
          onClick={() => setShowCreate(true)}
        >
          <Plus size={17} /> {t("clubs.create")}
        </button>
      </div>
      {error && (
        <div className="empty-note">
          <span>{error}</span>
        </div>
      )}
      {loading ? (
        <div className="empty-note">
          <span>{t("app.loading")}</span>
        </div>
      ) : clubs.length === 0 ? (
        <div className="empty-note club-empty">
          <span>{t("clubs.empty")}</span>
        </div>
      ) : (
        <div className="clubs-grid">
          {clubs.map((club) => (
            <article className="club-card" key={club.id}>
              <div className="club-card-top">
                <span className="club-mark">
                  <UsersRound size={20} />
                </span>
                {club.visibility === "invite" && <Lock size={15} />}
              </div>
              <h2>{club.name}</h2>
              <p>{club.description || t("clubs.noDescription")}</p>
              <div className="club-meta">
                <span>{club.city || t("clubs.anywhere")}</span>
                <span>
                  {club.member_count}/{club.member_limit}
                </span>
              </div>
              {club.joined ? (
                <span className="club-role">
                  {t(`clubs.roles.${club.role}`)}
                </span>
              ) : (
                <button
                  className="button button-outline"
                  onClick={() => void join(club)}
                >
                  {t("clubs.join")}
                </button>
              )}
            </article>
          ))}
        </div>
      )}
      {showCreate && (
        <div className="modal-backdrop">
          <section
            className="create-table-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="club-create-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">{t("clubs.eyebrow")}</span>
                <h2 id="club-create-title">{t("clubs.createTitle")}</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setShowCreate(false)}
                aria-label={t("clubs.close")}
              >
                ×
              </button>
            </div>
            <label className="field-label" htmlFor="club-name">
              {t("clubs.name")}
            </label>
            <input
              id="club-name"
              className="text-input"
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
            <label className="field-label" htmlFor="club-city">
              {t("clubs.city")}
            </label>
            <input
              id="club-city"
              className="text-input"
              value={form.city}
              onChange={(event) =>
                setForm({ ...form, city: event.target.value })
              }
            />
            <label className="field-label" htmlFor="club-description">
              {t("clubs.description")}
            </label>
            <textarea
              id="club-description"
              className="text-input"
              value={form.description}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
            />
            <label className="field-label" htmlFor="club-visibility">
              {t("clubs.visibility")}
            </label>
            <select
              id="club-visibility"
              className="text-input"
              value={form.visibility}
              onChange={(event) =>
                setForm({
                  ...form,
                  visibility: event.target.value as typeof form.visibility,
                })
              }
            >
              <option value="open">{t("clubs.open")}</option>
              <option value="invite">{t("clubs.inviteOnly")}</option>
            </select>
            <div className="modal-actions">
              <button
                className="button button-outline"
                onClick={() => setShowCreate(false)}
              >
                {t("clubs.cancel")}
              </button>
              <button
                className="button button-gold"
                disabled={creating || !form.name.trim()}
                onClick={() => void submit()}
              >
                {creating ? t("clubs.creating") : t("clubs.submit")}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
