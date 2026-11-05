import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Lock,
  MessageCircle,
  Plus,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Trophy,
  Medal,
  Crown,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGameStore } from "@stores/gameStore";
import {
  createClub,
  completeClubEvent,
  getClubEvents,
  getClubLeaderboard,
  getClubMembers,
  getClubs,
  joinClub,
  joinClubEvent,
  removeClubMember,
  updateClubMember,
  getClubCertificationInfo,
  requestClubCertification,
  getClubChat,
  sendClubMessage,
  getClubLeague,
  type Club,
  type ClubMember,
  type ClubEvent,
  type ClubLeaderboardEntry,
  type ClubChatMessage,
  type ClubCertificationInfo,
  type ClubLeagueEntry,
} from "@services/clubs";
import { createTable } from "@services/games";

export function ClubsPage() {
  const { t } = useTranslation();
  const accessToken = useGameStore((state) => state.accessToken);
  const navigate = useNavigate();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [managedClub, setManagedClub] = useState<Club | null>(null);
  const [activeTab, setActiveTab] = useState<
    "members" | "chat" | "certification"
  >("members");
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [clubChatMessages, setClubChatMessages] = useState<ClubChatMessage[]>(
    [],
  );
  const [clubChatLoading, setClubChatLoading] = useState(false);
  const [clubChatInput, setClubChatInput] = useState("");
  const [certifying, setCertifying] = useState(false);
  const [certInfo, setCertInfo] = useState<ClubCertificationInfo | null>(null);
  const [certLoading, setCertLoading] = useState(false);
  const [certSuccessMsg, setCertSuccessMsg] = useState("");
  const [copiedCode, setCopiedCode] = useState("");
  const [clubEvents, setClubEvents] = useState<Record<string, ClubEvent[]>>({});
  const [clubLeaderboards, setClubLeaderboards] = useState<
    Record<string, ClubLeaderboardEntry[]>
  >({});
  const [form, setForm] = useState({
    name: "",
    city: "",
    description: "",
    language: "fr" as "fr" | "mg",
    visibility: "open" as "open" | "invite",
  });

  const [viewMode, setViewMode] = useState<"clubs" | "league">("clubs");
  const [league, setLeague] = useState<ClubLeagueEntry[]>([]);
  const [leagueLoading, setLeagueLoading] = useState(false);

  const loadLeague = async () => {
    setLeagueLoading(true);
    try {
      const res = await getClubLeague(accessToken || "");
      setLeague(res.league || []);
    } catch {
      // Ignored
    } finally {
      setLeagueLoading(false);
    }
  };

  useEffect(() => {
    getClubs(accessToken)
      .then(async (payload) => {
        setClubs(payload.results);
        if (accessToken) {
          const entries = await Promise.all(
            payload.results
              .filter((club) => club.joined)
              .map(async (club) => {
                try {
                  const [events, leaderboard] = await Promise.all([
                    getClubEvents(accessToken, club.id),
                    getClubLeaderboard(accessToken, club.id),
                  ]);
                  return {
                    id: club.id,
                    events: events.results,
                    leaderboard: leaderboard.results,
                  };
                } catch {
                  return { id: club.id, events: [], leaderboard: [] };
                }
              }),
          );
          setClubEvents(
            Object.fromEntries(
              entries.map((entry) => [entry.id, entry.events]),
            ),
          );
          setClubLeaderboards(
            Object.fromEntries(
              entries.map((entry) => [entry.id, entry.leaderboard]),
            ),
          );
        }
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [accessToken]);

  const submit = async () => {
    if (!accessToken) {
      navigate("/auth?next=/clubs");
      return;
    }
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
    if (!accessToken) {
      navigate("/auth?next=/clubs");
      return;
    }
    try {
      const joined = await joinClub(accessToken, club.id);
      setClubs((current) =>
        current.map((item) => (item.id === club.id ? joined : item)),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("app.error"));
    }
  };

  const manage = async (club: Club) => {
    setManagedClub(club);
    setActiveTab("members");
    setMembersLoading(true);
    setCertSuccessMsg("");
    if (!accessToken) return;
    if (club.role === "owner") {
      void loadCertification(club.id);
    }
    try {
      const payload = await getClubMembers(accessToken, club.id);
      setMembers(payload.results);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("app.error"));
    } finally {
      setMembersLoading(false);
    }
  };

  const loadCertification = async (clubId: string) => {
    if (!accessToken) return;
    setCertLoading(true);
    setCertSuccessMsg("");
    try {
      const info = await getClubCertificationInfo(accessToken, clubId);
      setCertInfo(info);
    } catch {
      // ignore
    } finally {
      setCertLoading(false);
    }
  };

  const loadClubChat = async (clubId: string) => {
    if (!accessToken) return;
    setClubChatLoading(true);
    try {
      const res = await getClubChat(accessToken, clubId);
      setClubChatMessages(res.results);
    } catch {
      // ignore
    } finally {
      setClubChatLoading(false);
    }
  };

  const sendClubChatMessage = async (clubId: string, text?: string) => {
    const msg = text || clubChatInput.trim();
    if (!msg || !accessToken) return;
    try {
      const sent = await sendClubMessage(accessToken, clubId, msg);
      setClubChatMessages((prev) => [...prev, sent]);
      if (!text) setClubChatInput("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("app.error"));
    }
  };

  const handleRequestCertification = async (clubId: string) => {
    if (!accessToken) return;
    setCertifying(true);
    setError("");
    setCertSuccessMsg("");
    try {
      const updated = await requestClubCertification(accessToken, clubId);
      setCertInfo(updated);
      if (updated.detail) setCertSuccessMsg(updated.detail);
      if (updated.club) {
        setClubs((prev) =>
          prev.map((c) => (c.id === clubId ? updated.club! : c)),
        );
        setManagedClub(updated.club);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("app.error"));
    } finally {
      setCertifying(false);
    }
  };

  const shareWhatsApp = (club: Club) => {
    const code = club.code || `MDG-${club.id.slice(0, 4).toUpperCase()}`;
    const text = `Salama! Manasa anao hiditra ao amin'ny club "${club.name}" ao amin'ny Casino MDG. Code club: ${code} 👉 ${window.location.origin}/clubs`;
    window.open(
      `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`,
      "_blank",
    );
  };

  const copyClubCode = (club: Club) => {
    const code = club.code || `MDG-${club.id.slice(0, 4).toUpperCase()}`;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(""), 2500);
    }
  };

  const changeRole = async (member: ClubMember) => {
    if (!managedClub || !accessToken) return;
    try {
      const next = member.role === "admin" ? "member" : "admin";
      await updateClubMember(accessToken, managedClub.id, member.user_id, next);
      setMembers((current) =>
        current.map((item) =>
          item.user_id === member.user_id ? { ...item, role: next } : item,
        ),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("app.error"));
    }
  };

  const removeMember = async (member: ClubMember) => {
    if (!managedClub || !accessToken) return;
    try {
      await removeClubMember(accessToken, managedClub.id, member.user_id);
      setMembers((current) =>
        current.filter((item) => item.user_id !== member.user_id),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("app.error"));
    }
  };

  const joinEvent = async (clubId: string, event: ClubEvent) => {
    if (!accessToken) {
      navigate("/auth?next=/clubs");
      return;
    }
    try {
      const joined = await joinClubEvent(accessToken, event.id);
      setClubEvents((current) => ({
        ...current,
        [clubId]: (current[clubId] || []).map((item) =>
          item.id === event.id ? joined : item,
        ),
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("app.error"));
    }
  };

  const completeEvent = async (clubId: string, eventId: string) => {
    if (!accessToken) return;
    try {
      await completeClubEvent(accessToken, eventId);
      const [events, leaderboard] = await Promise.all([
        getClubEvents(accessToken, clubId),
        getClubLeaderboard(accessToken, clubId),
      ]);
      setClubEvents((current) => ({
        ...current,
        [clubId]: events.results,
      }));
      setClubLeaderboards((current) => ({
        ...current,
        [clubId]: leaderboard.results,
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("app.error"));
    }
  };

  const createClubTable = async (club: Club) => {
    if (!accessToken) {
      navigate("/auth?next=/clubs");
      return;
    }
    try {
      const payload = await createTable(accessToken, {
        name: `Table privée ${club.name}`,
        game_type: "poker",
        max_players: 6,
        is_private: true,
        club_id: club.id,
      });
      navigate(`/game/poker/${payload.table_code}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("app.error"));
    }
  };

  return (
    <div className="page-stack">
      {/* Top Header */}
      <div className="page-title-row">
        <div>
          <span className="eyebrow">{t("clubs.eyebrow")}</span>
          <h1>{t("clubs.title")}</h1>
          <p>{t("clubs.intro")}</p>
        </div>
        <button
          className="button button-gold"
          onClick={() => {
            if (!accessToken) navigate("/auth?next=/clubs");
            else setShowCreate(true);
          }}
        >
          <Plus size={17} /> {t("clubs.create")}
        </button>
      </div>

      {!accessToken && (
        <div
          className="guest-banner"
          style={{
            margin: "0 0 16px",
            borderRadius: "10px",
            padding: "12px 16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Sparkles size={16} style={{ color: "var(--gold)" }} />
            <span>
              Découvrez les cercles de joueurs officiels ou fondez votre club
              privé.
            </span>
          </div>
          <Link
            to="/auth?next=/clubs"
            className="button button-small button-gold"
          >
            {t("nav.login")}
          </Link>
        </div>
      )}

      {error && (
        <div className="empty-note">
          <span>{error}</span>
        </div>
      )}

      {/* Sélecteur de mode : Salons de Clubs vs Ligue & Classement Général */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          margin: "16px 0 20px",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={() => setViewMode("clubs")}
          style={{
            padding: "8px 18px",
            borderRadius: "10px",
            border:
              viewMode === "clubs"
                ? "1px solid var(--gold)"
                : "1px solid rgba(255, 255, 255, 0.1)",
            background:
              viewMode === "clubs"
                ? "rgba(211, 176, 107, 0.15)"
                : "rgba(255, 255, 255, 0.04)",
            color: viewMode === "clubs" ? "var(--gold)" : "var(--soft)",
            fontWeight: 700,
            fontSize: "0.9rem",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <UsersRound size={16} />
          Tous les Clubs ({clubs.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setViewMode("league");
            if (league.length === 0) void loadLeague();
          }}
          style={{
            padding: "8px 18px",
            borderRadius: "10px",
            border:
              viewMode === "league"
                ? "1px solid var(--gold)"
                : "1px solid rgba(255, 255, 255, 0.1)",
            background:
              viewMode === "league"
                ? "rgba(211, 176, 107, 0.15)"
                : "rgba(255, 255, 255, 0.04)",
            color: viewMode === "league" ? "var(--gold)" : "var(--soft)",
            fontWeight: 700,
            fontSize: "0.9rem",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <Trophy size={16} />
          Ligue &amp; Classement Général 🏆
        </button>
      </div>

      {viewMode === "league" ? (
        <section
          className="club-league-section"
          style={{ marginBottom: "24px" }}
        >
          {leagueLoading && league.length === 0 ? (
            <div className="empty-note">
              Chargement du classement de la Ligue...
            </div>
          ) : league.length === 0 ? (
            <div className="empty-note">
              Aucun club classé dans la ligue pour le moment.
            </div>
          ) : (
            <div>
              {/* Podium Top 3 */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "14px",
                  marginBottom: "24px",
                }}
              >
                {league.slice(0, 3).map((c, idx) => {
                  const isFirst = idx === 0;
                  const isSecond = idx === 1;
                  const medalColor = isFirst
                    ? "var(--gold)"
                    : isSecond
                      ? "#b0bec5"
                      : "#bcaaa4";
                  const medalBg = isFirst
                    ? "rgba(211, 176, 107, 0.15)"
                    : isSecond
                      ? "rgba(176, 190, 197, 0.15)"
                      : "rgba(188, 170, 164, 0.15)";
                  return (
                    <div
                      key={c.club_id}
                      style={{
                        borderRadius: "14px",
                        padding: "18px 16px",
                        background: "rgba(255, 255, 255, 0.03)",
                        border: `1px solid ${isFirst ? "var(--gold)" : "rgba(255, 255, 255, 0.1)"}`,
                        boxShadow: isFirst
                          ? "0 0 20px rgba(211, 176, 107, 0.18)"
                          : undefined,
                        textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          width: "44px",
                          height: "44px",
                          borderRadius: "50%",
                          background: medalBg,
                          color: medalColor,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          margin: "0 auto 10px",
                        }}
                      >
                        {isFirst ? <Crown size={24} /> : <Medal size={22} />}
                      </div>
                      <div
                        style={{
                          fontSize: "0.82rem",
                          fontWeight: 700,
                          color: medalColor,
                        }}
                      >
                        Rang #{c.rank} · {c.tier}
                      </div>
                      <h3 style={{ margin: "4px 0", fontSize: "1.1rem" }}>
                        {c.name}
                      </h3>
                      <div
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--muted)",
                          marginBottom: "8px",
                        }}
                      >
                        {c.city || "Madagascar"} · {c.member_count} membres
                      </div>
                      <div
                        style={{
                          display: "inline-block",
                          padding: "4px 12px",
                          borderRadius: "20px",
                          background: "rgba(211, 176, 107, 0.12)",
                          color: "var(--gold)",
                          fontWeight: 700,
                          fontSize: "0.85rem",
                        }}
                      >
                        {c.total_points} Pts de Gloire
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Tableau complet de la Ligue */}
              <div
                style={{
                  background: "rgba(255, 255, 255, 0.02)",
                  borderRadius: "12px",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "50px 1.5fr 1fr 1fr 120px",
                    padding: "12px 16px",
                    background: "rgba(255, 255, 255, 0.04)",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    color: "var(--muted)",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
                  }}
                >
                  <span>RANG</span>
                  <span>CLUB</span>
                  <span>STATUT</span>
                  <span>TABLES</span>
                  <span style={{ textAlign: "right" }}>POINTS</span>
                </div>
                {league.map((c) => (
                  <div
                    key={c.club_id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "50px 1.5fr 1fr 1fr 120px",
                      padding: "12px 16px",
                      borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                      fontSize: "0.85rem",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 700,
                        color: c.rank <= 3 ? "var(--gold)" : "var(--muted)",
                      }}
                    >
                      #{c.rank}
                    </span>
                    <div>
                      <strong style={{ display: "block" }}>{c.name}</strong>
                      <small
                        style={{ color: "var(--muted)", fontSize: "0.75rem" }}
                      >
                        {c.code} · {c.city || "Madagascar"}
                      </small>
                    </div>
                    <div>
                      {c.is_certified ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            color: "var(--gold)",
                            fontSize: "0.78rem",
                            fontWeight: 600,
                          }}
                        >
                          <ShieldCheck size={13} /> Certifié
                        </span>
                      ) : (
                        <span
                          style={{ color: "var(--muted)", fontSize: "0.78rem" }}
                        >
                          Standard
                        </span>
                      )}
                    </div>
                    <span style={{ color: "var(--soft)" }}>
                      {c.tables_count} active(s)
                    </span>
                    <span
                      style={{
                        textAlign: "right",
                        fontWeight: 700,
                        color: "var(--gold)",
                      }}
                    >
                      {c.total_points} pts
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      ) : loading ? (
        <div className="empty-note">
          <span>{t("app.loading")}</span>
        </div>
      ) : clubs.length === 0 ? (
        <div className="empty-note club-empty">
          <span>{t("clubs.empty")}</span>
        </div>
      ) : (
        <div className="clubs-grid">
          {clubs.map((club) => {
            const clubCode =
              club.code || `MDG-${club.id.slice(0, 4).toUpperCase()}`;
            return (
              <article className="club-card" key={club.id}>
                <div className="club-card-top">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <span className="club-mark">
                      <UsersRound size={20} />
                    </span>
                    {club.is_certified && (
                      <span
                        className="club-certified-badge"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          background: "rgba(211, 176, 107, 0.15)",
                          border: "1px solid rgba(211, 176, 107, 0.35)",
                          borderRadius: "12px",
                          padding: "2px 8px",
                          color: "var(--gold)",
                          fontSize: "10.5px",
                          fontWeight: 600,
                        }}
                      >
                        <ShieldCheck size={13} strokeWidth={2.4} />{" "}
                        {t("clubs.certified")}
                      </span>
                    )}
                  </div>
                  {club.visibility === "invite" && (
                    <Lock size={15} style={{ color: "var(--muted)" }} />
                  )}
                </div>

                <h2>{club.name}</h2>
                <p>{club.description || t("clubs.noDescription")}</p>

                <div className="club-meta">
                  <span>{club.city || t("clubs.anywhere")}</span>
                  <span>
                    {club.member_count}/{club.member_limit}
                  </span>
                </div>

                {/* Code Club & Partage WhatsApp */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 10px",
                    background: "rgba(17, 22, 30, 0.6)",
                    borderRadius: "6px",
                    border: "1px solid var(--line)",
                    marginBottom: "12px",
                    fontSize: "11px",
                  }}
                >
                  <span
                    style={{ color: "var(--muted)", fontFamily: "var(--mono)" }}
                  >
                    Code:{" "}
                    <strong style={{ color: "var(--gold)" }}>{clubCode}</strong>
                  </span>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => copyClubCode(club)}
                      title="Copier le code club"
                      aria-label="Copier le code club"
                      style={{ padding: "3px" }}
                    >
                      <Copy size={13} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => shareWhatsApp(club)}
                      title={t("clubs.shareWhatsApp")}
                      aria-label={t("clubs.shareWhatsApp")}
                      style={{ padding: "3px", color: "var(--gold)" }}
                    >
                      <Share2 size={13} />
                    </button>
                  </div>
                </div>
                {copiedCode === clubCode && (
                  <small
                    style={{
                      color: "var(--gold)",
                      fontSize: "10px",
                      textAlign: "right",
                      marginTop: "-8px",
                      marginBottom: "8px",
                    }}
                  >
                    Code copié !
                  </small>
                )}

                {/* Actions */}
                {club.joined ? (
                  <div className="club-card-actions">
                    <span className="club-role">
                      {t(`clubs.roles.${club.role}`)}
                    </span>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        className="text-link"
                        onClick={() => void manage(club)}
                      >
                        {t("clubs.manage")}
                      </button>
                      {(club.role === "owner" || club.role === "admin") && (
                        <button
                          className="text-link"
                          onClick={() => void createClubTable(club)}
                        >
                          {t("clubs.createTable")}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <button
                    className="button button-outline"
                    onClick={() => void join(club)}
                  >
                    {t("clubs.join")}
                  </button>
                )}

                {/* Événements */}
                {club.joined && (clubEvents[club.id] || []).length > 0 && (
                  <div className="club-events-mini">
                    <span className="eyebrow">{t("clubs.eventHistory")}</span>
                    {(clubEvents[club.id] || []).slice(0, 3).map((event) => (
                      <div className="club-event-row" key={event.id}>
                        <span>
                          <strong>{event.title}</strong>
                          <small>
                            {new Date(event.starts_at).toLocaleString()} · +
                            {event.points_reward} pts
                          </small>
                        </span>
                        {event.status === "completed" ? (
                          <small>{t("clubs.completed")}</small>
                        ) : event.joined ? (
                          <small>{t("clubs.registered")}</small>
                        ) : (
                          <button
                            className="text-link"
                            onClick={() => void joinEvent(club.id, event)}
                          >
                            {t("clubs.register")}
                          </button>
                        )}
                        {event.status === "scheduled" &&
                          (club.role === "owner" || club.role === "admin") && (
                            <button
                              className="text-link"
                              onClick={() =>
                                void completeEvent(club.id, event.id)
                              }
                            >
                              {t("clubs.complete")}
                            </button>
                          )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Classement */}
                {club.joined &&
                  (clubLeaderboards[club.id] || []).length > 0 && (
                    <div className="club-leaderboard">
                      <span className="eyebrow">{t("clubs.leaderboard")}</span>
                      {(clubLeaderboards[club.id] || [])
                        .slice(0, 3)
                        .map((entry) => (
                          <div className="club-ranking-row" key={entry.user_id}>
                            <span>
                              <strong>#{entry.rank}</strong>{" "}
                              {entry.display_name}
                            </span>
                            <small>{entry.points} pts</small>
                          </div>
                        ))}
                    </div>
                  )}
              </article>
            );
          })}
        </div>
      )}

      {/* Panneau de Gestion & Salon de Club */}
      {managedClub && (
        <section className="club-members-panel" style={{ marginTop: "24px" }}>
          <div className="section-heading compact">
            <div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <span className="eyebrow">{t("clubs.eyebrow")}</span>
                {managedClub.is_certified && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "3px",
                      color: "var(--gold)",
                      fontSize: "11px",
                      fontWeight: 600,
                    }}
                  >
                    <ShieldCheck size={14} /> {t("clubs.certified")}
                  </span>
                )}
              </div>
              <h2>{managedClub.name}</h2>
            </div>
            <button className="text-link" onClick={() => setManagedClub(null)}>
              {t("clubs.close")}
            </button>
          </div>

          {/* Onglets du Club */}
          <div className="tabs" style={{ marginBottom: "16px" }}>
            <button
              className={activeTab === "members" ? "active" : ""}
              onClick={() => setActiveTab("members")}
            >
              {t("clubs.members")} ({members.length})
            </button>
            <button
              className={activeTab === "chat" ? "active" : ""}
              onClick={() => {
                setActiveTab("chat");
                void loadClubChat(managedClub.id);
              }}
            >
              <MessageCircle size={14} /> {t("clubs.clubChat")}
            </button>
            {managedClub.role === "owner" && (
              <button
                className={activeTab === "certification" ? "active" : ""}
                onClick={() => {
                  setActiveTab("certification");
                  void loadCertification(managedClub.id);
                }}
              >
                <ShieldCheck size={14} /> {t("clubs.certified")}
              </button>
            )}
          </div>

          {/* Tab 1 : Membres */}
          {activeTab === "members" && (
            <>
              {membersLoading ? (
                <p className="secure-note">{t("app.loading")}</p>
              ) : (
                <div className="club-member-list">
                  {members.map((member) => (
                    <div className="club-member-row" key={member.user_id}>
                      <div>
                        <strong>{member.display_name}</strong>
                        <small>{t(`clubs.roles.${member.role}`)}</small>
                      </div>
                      {member.role !== "owner" && (
                        <div className="club-member-actions">
                          <button
                            className="text-link"
                            onClick={() => void changeRole(member)}
                          >
                            {member.role === "admin"
                              ? t("clubs.demote")
                              : t("clubs.promote")}
                          </button>
                          <button
                            className="text-link danger-link"
                            onClick={() => void removeMember(member)}
                          >
                            {t("clubs.remove")}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Tab 2 : Salon du Club (Chat Persistant) */}
          {activeTab === "chat" && (
            <div className="club-chat-panel">
              <div
                className="chat-messages"
                style={{
                  minHeight: "180px",
                  maxHeight: "300px",
                  overflowY: "auto",
                  background: "rgba(10, 13, 18, 0.6)",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  marginBottom: "10px",
                  border: "1px solid var(--line)",
                }}
              >
                {clubChatLoading ? (
                  <p className="muted">{t("app.loading")}</p>
                ) : clubChatMessages.length ? (
                  clubChatMessages.map((m) => (
                    <p key={m.id} style={{ margin: "4px 0", fontSize: "12px" }}>
                      <b style={{ color: "var(--gold)" }}>{m.author} :</b>{" "}
                      {m.body}
                    </p>
                  ))
                ) : (
                  <p className="muted">{t("game.noMessages")}</p>
                )}
              </div>

              {/* Phrases rapides */}
              <div
                className="quick-phrases-strip"
                style={{
                  display: "flex",
                  gap: "6px",
                  overflowX: "auto",
                  paddingBottom: "8px",
                  scrollbarWidth: "none",
                }}
              >
                {[
                  "Tsara lalao !",
                  "Miarahaba ny rehetra !",
                  "Iza no milalao anio ?",
                  "Manasa latabatra !",
                  "Alefa !",
                ].map((phrase) => (
                  <button
                    key={phrase}
                    type="button"
                    className="button button-small button-outline"
                    style={{
                      fontSize: "11px",
                      padding: "3px 8px",
                      borderRadius: "99px",
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                    }}
                    onClick={() =>
                      void sendClubChatMessage(managedClub.id, phrase)
                    }
                  >
                    {phrase}
                  </button>
                ))}
              </div>

              {/* Saisie */}
              <div
                className="chat-input"
                style={{ border: "1px solid var(--line)", borderRadius: "8px" }}
              >
                <input
                  placeholder="Ecrire un message au club..."
                  value={clubChatInput}
                  onChange={(e) => setClubChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter")
                      void sendClubChatMessage(managedClub.id);
                  }}
                />
                <button
                  type="button"
                  onClick={() => void sendClubChatMessage(managedClub.id)}
                  aria-label="Envoyer"
                >
                  <Send size={15} />
                </button>
              </div>
            </div>
          )}

          {/* Tab 3 : Demande de Certification (Propriétaire uniquement) */}
          {activeTab === "certification" && managedClub.role === "owner" && (
            <div
              style={{
                background: "rgba(17, 22, 30, 0.8)",
                border: "1px solid var(--line)",
                borderRadius: "10px",
                padding: "20px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "8px",
                }}
              >
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "8px",
                    background: "rgba(211, 176, 107, 0.15)",
                    display: "grid",
                    placeItems: "center",
                    color: "var(--gold)",
                  }}
                >
                  <ShieldCheck size={22} strokeWidth={2.2} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "16px", color: "#fff" }}>
                    Certification Officielle Casino MDG
                  </h3>
                  <p
                    style={{
                      margin: "2px 0 0",
                      fontSize: "12px",
                      color: "var(--muted)",
                    }}
                  >
                    Gage de confiance, d'intégrité et de prestige pour votre
                    communauté
                  </p>
                </div>
              </div>

              {certSuccessMsg && (
                <div
                  style={{
                    margin: "12px 0",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    background: "rgba(74, 222, 128, 0.12)",
                    border: "1px solid rgba(74, 222, 128, 0.3)",
                    color: "#4ade80",
                    fontSize: "12.5px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <CheckCircle2 size={16} />
                  <span>{certSuccessMsg}</span>
                </div>
              )}

              {/* Statut 1 : Club Déjà Certifié */}
              {managedClub.is_certified ? (
                <div
                  style={{
                    margin: "14px 0",
                    padding: "16px",
                    borderRadius: "8px",
                    background:
                      "linear-gradient(135deg, rgba(211, 176, 107, 0.15) 0%, rgba(17, 22, 30, 0.9) 100%)",
                    border: "1px solid rgba(211, 176, 107, 0.4)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      marginBottom: "10px",
                    }}
                  >
                    <ShieldCheck size={20} style={{ color: "var(--gold)" }} />
                    <strong style={{ color: "var(--gold)", fontSize: "14px" }}>
                      Félicitations ! Votre club est Certifié Officiel MDG
                    </strong>
                  </div>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "var(--soft)",
                      margin: "0 0 12px",
                      lineHeight: 1.5,
                    }}
                  >
                    Votre club bénéficie des privilèges certifiés maximaux :
                    capacité décuplée à 250 membres, priorité dans le Lobby et
                    le répertoire, et écusson officiel visible sur toutes vos
                    tables.
                  </p>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: "8px",
                      fontSize: "11.5px",
                    }}
                  >
                    <span
                      style={{
                        color: "var(--soft)",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <CheckCircle2 size={14} style={{ color: "#4ade80" }} />{" "}
                      Limite 250 membres active
                    </span>
                    <span
                      style={{
                        color: "var(--soft)",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <CheckCircle2 size={14} style={{ color: "#4ade80" }} />{" "}
                      Écusson vérifié sur vos tables
                    </span>
                    <span
                      style={{
                        color: "var(--soft)",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <CheckCircle2 size={14} style={{ color: "#4ade80" }} />{" "}
                      Visibilité prioritaire Lobby
                    </span>
                    <span
                      style={{
                        color: "var(--soft)",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <CheckCircle2 size={14} style={{ color: "#4ade80" }} />{" "}
                      Tournois officiels inter-clubs
                    </span>
                  </div>
                </div>
              ) : managedClub.certification_status === "pending" ? (
                /* Statut 2 : Dossier en cours d'examen */
                <div
                  style={{
                    margin: "14px 0",
                    padding: "14px",
                    borderRadius: "8px",
                    background: "rgba(211, 176, 107, 0.08)",
                    border: "1px solid rgba(211, 176, 107, 0.3)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      color: "var(--gold)",
                      marginBottom: "6px",
                    }}
                  >
                    <Sparkles size={16} />
                    <strong style={{ fontSize: "13px" }}>
                      Dossier soumis & en cours d'examen
                    </strong>
                  </div>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "var(--muted)",
                      margin: 0,
                      lineHeight: 1.5,
                    }}
                  >
                    Votre demande de certification a bien été transmise à notre
                    équipe de conformité. L'évaluation des critères et de
                    l'intégrité de jeu est généralement effectuée sous 24 à 48
                    heures.
                  </p>
                </div>
              ) : (
                /* Statut 3 : Éligibilité & Checklist des critères */
                <div style={{ marginTop: "16px" }}>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "#fff",
                      marginBottom: "10px",
                    }}
                  >
                    Critères d'Éligibilité à la Certification :
                  </div>

                  {certLoading ? (
                    <p style={{ fontSize: "12px", color: "var(--muted)" }}>
                      Vérification des critères en cours...
                    </p>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                        marginBottom: "16px",
                      }}
                    >
                      {/* Critère 1 : KYC Fondateur */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 14px",
                          background: "rgba(10, 13, 18, 0.5)",
                          borderRadius: "8px",
                          border: "1px solid var(--line)",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: "12.5px",
                              fontWeight: 500,
                              color: "#fff",
                            }}
                          >
                            1. Identité du Fondateur (KYC)
                          </div>
                          <div
                            style={{ fontSize: "11px", color: "var(--muted)" }}
                          >
                            Le compte fondateur doit être vérifié (Niveau 1
                            minimum)
                          </div>
                        </div>
                        {certInfo?.criteria.founder_kyc_approved ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              color: "#4ade80",
                              fontSize: "12px",
                              fontWeight: 600,
                            }}
                          >
                            <CheckCircle2 size={15} /> Vérifié
                          </span>
                        ) : (
                          <Link
                            to="/profile"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              color: "var(--gold)",
                              fontSize: "11.5px",
                              textDecoration: "none",
                              padding: "4px 8px",
                              borderRadius: "6px",
                              background: "rgba(211, 176, 107, 0.12)",
                              border: "1px solid rgba(211, 176, 107, 0.3)",
                            }}
                          >
                            <AlertCircle size={13} /> Valider KYC{" "}
                            <ExternalLink size={11} />
                          </Link>
                        )}
                      </div>

                      {/* Critère 2 : Quorum de membres */}
                      <div
                        style={{
                          padding: "10px 14px",
                          background: "rgba(10, 13, 18, 0.5)",
                          borderRadius: "8px",
                          border: "1px solid var(--line)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: "6px",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontSize: "12.5px",
                                fontWeight: 500,
                                color: "#fff",
                              }}
                            >
                              2. Quorum de Membres Actifs
                            </div>
                            <div
                              style={{
                                fontSize: "11px",
                                color: "var(--muted)",
                              }}
                            >
                              Le club doit compter au moins 5 membres
                              enregistrés
                            </div>
                          </div>
                          <span
                            style={{
                              fontSize: "12px",
                              fontWeight: 600,
                              color: certInfo?.criteria.members_satisfied
                                ? "#4ade80"
                                : "var(--gold)",
                            }}
                          >
                            {certInfo?.criteria.member_count ??
                              managedClub.member_count}{" "}
                            / 5 membres
                          </span>
                        </div>
                        {/* Mini progress bar */}
                        <div
                          style={{
                            width: "100%",
                            height: "5px",
                            background: "rgba(255,255,255,0.08)",
                            borderRadius: "99px",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(100, ((certInfo?.criteria.member_count ?? managedClub.member_count) / 5) * 100)}%`,
                              height: "100%",
                              background: certInfo?.criteria.members_satisfied
                                ? "#4ade80"
                                : "var(--gold)",
                              transition: "width 0.3s ease",
                            }}
                          />
                        </div>
                      </div>

                      {/* Critère 3 : Tables hébergées */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 14px",
                          background: "rgba(10, 13, 18, 0.5)",
                          borderRadius: "8px",
                          border: "1px solid var(--line)",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: "12.5px",
                              fontWeight: 500,
                              color: "#fff",
                            }}
                          >
                            3. Activité de Tables
                          </div>
                          <div
                            style={{ fontSize: "11px", color: "var(--muted)" }}
                          >
                            Avoir créé au moins 1 table de jeu sous le club
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: "12px",
                            fontWeight: 600,
                            color: certInfo?.criteria.tables_satisfied
                              ? "#4ade80"
                              : "var(--gold)",
                          }}
                        >
                          {certInfo?.criteria.tables_satisfied ? (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <CheckCircle2 size={15} /> Confirmé
                            </span>
                          ) : (
                            `${certInfo?.criteria.tables_count ?? 0} / 1 table`
                          )}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Bouton de soumission */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      type="button"
                      className="button button-gold"
                      disabled={certifying}
                      onClick={() =>
                        void handleRequestCertification(managedClub.id)
                      }
                      style={{ fontSize: "13px" }}
                    >
                      <ShieldCheck size={16} />
                      {certifying
                        ? "Vérification en cours…"
                        : certInfo?.criteria.can_certify
                          ? "Activer la Certification Immédiate"
                          : "Demander l'examen de Certification"}
                    </button>

                    <small style={{ color: "var(--muted)", fontSize: "11px" }}>
                      {certInfo?.criteria.can_certify
                        ? "✓ Tous les critères sont validés pour une activation instantanée !"
                        : "Les dossiers conformes sont traités en priorité par le backoffice."}
                    </small>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Modal Création de Club */}
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
                <X size={18} />
              </button>
            </div>

            <label className="field-label" htmlFor="club-name">
              {t("clubs.name")}
            </label>
            <input
              id="club-name"
              className="text-input"
              placeholder="Ex: Poker Club Antananarivo"
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
              placeholder="Ex: Antananarivo, Toamasina, Mahajanga..."
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
              placeholder="Présentez votre cercle de jeu et vos créneaux favoris..."
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
