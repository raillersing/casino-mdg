import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowUpRight,
  Bot,
  Lock,
  Plus,
  Search,
  Sparkles,
  Users,
  ShieldCheck,
  Loader2,
  Zap,
  Trophy,
  Timer,
} from "lucide-react";
import {
  cancelMatch,
  createTable,
  getMatchmakingStatus,
  getTables,
  joinTable,
  startBotSimulation,
  queueMatch,
  sendMatchmakingHeartbeat,
  type GameTable,
  type MatchmakingTicket,
} from "@services/games";
import {
  getTournaments,
  registerTournament,
  type Tournament,
} from "@services/tournaments";
import { useGameStore } from "@stores/gameStore";
import { useTranslation } from "react-i18next";
import { trackEvent } from "@services/analytics";
import { createGuestToken } from "@services/auth";
import { BotCountSelector } from "@components/game/BotCountSelector";
import { haptics } from "@utils/haptics";

export function LobbyPage() {
  const { t } = useTranslation();
  const { gameType: urlGameType } = useParams();
  const [filter, setFilter] = useState(urlGameType || "all");
  const [stakeFilter, setStakeFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [tables, setTables] = useState<GameTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState<string | null>(null);
  const accessToken = useGameStore((state) => state.accessToken);
  const navigate = useNavigate();
  const matchmakingGame = (["poker", "belote", "rami", "ludo", "domino"].includes(filter)
    ? filter
    : "poker") as "poker" | "belote" | "rami" | "ludo" | "domino";
  const [matchStatus, setMatchStatus] = useState<{
    human_online: number;
    estimated_wait_seconds: number;
    ticket: MatchmakingTicket | null;
  }>({ human_online: 0, estimated_wait_seconds: 20, ticket: null });
  const [matchError, setMatchError] = useState("");
  const [waitingSeconds, setWaitingSeconds] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const [showCreateTable, setShowCreateTable] = useState(false);
  const [creatingTable, setCreatingTable] = useState(false);
  const [startingSimulation, setStartingSimulation] = useState<string | null>(
    null,
  );
  const [lobbyBotCounts, setLobbyBotCounts] = useState<Record<string, number>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("mdg-bot-counts") || "{}");
      return { poker: saved.poker ?? 3, belote: saved.belote ?? 3, rami: saved.rami ?? 1, ludo: saved.ludo ?? 3, domino: saved.domino ?? 3, ...saved };
    } catch {
      return { poker: 3, belote: 3, rami: 1, ludo: 3, domino: 3 };
    }
  });
  const setLobbyBotCount = (gameId: string, value: number) => {
    setLobbyBotCounts((prev) => {
      const next = { ...prev, [gameId]: value };
      localStorage.setItem("mdg-bot-counts", JSON.stringify(next));
      return next;
    });
  };
  const [tableForm, setTableForm] = useState({
    name: "",
    game_type: "poker" as "poker" | "belote" | "rami" | "ludo" | "domino",
    max_players: 4,
    is_private: true,
  });
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [registeringTourney, setRegisteringTourney] = useState<string | null>(null);
  const [tourneyMsg, setTourneyMsg] = useState<string | null>(null);

  useEffect(() => {
    getTournaments(accessToken || "")
      .then((res) => setTournaments(res.results || []))
      .catch(() => undefined);
  }, [accessToken]);

  const handleRegisterTournament = async (tId: string) => {
    if (!accessToken) {
      navigate("/auth?next=/lobby");
      return;
    }
    setRegisteringTourney(tId);
    try {
      const res = await registerTournament(accessToken, tId);
      haptics.winCelebration();
      setTourneyMsg("Félicitations ! Vous êtes inscrit au tournoi.");
      setTournaments((prev) =>
        prev.map((item) => (item.id === tId ? res.tournament : item)),
      );
    } catch (err: unknown) {
      setTourneyMsg(err instanceof Error ? err.message : "Erreur lors de l'inscription.");
    } finally {
      setRegisteringTourney(null);
    }
  };

  useEffect(() => {
    if (urlGameType && ["poker", "belote", "rami", "ludo", "domino"].includes(urlGameType)) {
      setFilter(urlGameType);
      setTableForm((current) => ({ ...current, game_type: urlGameType as typeof current.game_type }));
    }
  }, [urlGameType]);

  useEffect(() => {
    setLoading(true);
    if (filter === "tournaments") {
      getTournaments(accessToken || "")
        .then((res) => setTournaments(res.results || []))
        .catch((reason: Error) => setError(reason.message))
        .finally(() => setLoading(false));
      return;
    }
    getTables(filter === "all" ? "Tous" : filter)
      .then((payload) => setTables(payload.results))
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [filter, accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    const refresh = () =>
      Promise.all([
        sendMatchmakingHeartbeat(accessToken, matchmakingGame),
        getMatchmakingStatus(accessToken, matchmakingGame),
      ])
        .then(([, status]) =>
          setMatchStatus({
            human_online: status.human_online,
            estimated_wait_seconds: status.estimated_wait_seconds,
            ticket: status.ticket,
          }),
        )
        .catch(() => undefined);
    void refresh();
    const timer = window.setInterval(refresh, 15000);
    return () => window.clearInterval(timer);
  }, [accessToken, matchmakingGame]);

  useEffect(() => {
    if (!accessToken || matchStatus.ticket?.status !== "queued") return;
    const timer = window.setInterval(() => {
      void getMatchmakingStatus(accessToken, matchmakingGame)
        .then((status) => {
          setMatchStatus({
            human_online: status.human_online,
            estimated_wait_seconds: status.estimated_wait_seconds,
            ticket: status.ticket,
          });
          if (status.ticket?.status === "matched" && status.ticket.table_code)
            void trackEvent("human_match_found", {
              game_type: status.ticket.game_type,
              metadata: { table_code: status.ticket.table_code },
            });
          if (status.ticket?.status === "matched" && status.ticket.table_code)
            navigate(
              `/game/${status.ticket.game_type}/${status.ticket.table_code}`,
            );
        })
        .catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [accessToken, matchStatus.ticket?.status, matchmakingGame, navigate]);

  useEffect(() => {
    const ticket = matchStatus.ticket;
    if (!ticket || ticket.status !== "queued") {
      setWaitingSeconds(0);
      return;
    }
    const updateWaiting = () => {
      const elapsed = Math.max(
        0,
        Math.floor((Date.now() - Date.parse(ticket.created_at)) / 1000),
      );
      setWaitingSeconds(elapsed);
      if (elapsed >= ticket.timeout_seconds) {
        setTimedOut((current) => {
          if (!current)
            void trackEvent("matchmaking_timeout", {
              game_type: matchmakingGame,
            });
          return true;
        });
      }
    };
    updateWaiting();
    const timer = window.setInterval(updateWaiting, 1000);
    return () => window.clearInterval(timer);
  }, [matchStatus.ticket, matchmakingGame]);

  const findHuman = async () => {
    if (!accessToken) {
      navigate("/auth");
      return;
    }
    setMatchError("");
    setTimedOut(false);
    setWaitingSeconds(0);
    try {
      const result = await queueMatch(accessToken, matchmakingGame);
      setMatchStatus((current) => ({ ...current, ticket: result.ticket }));
      void trackEvent("matchmaking_started", {
        game_type: matchmakingGame,
        metadata: { source: "lobby" },
      });
      if (result.ticket.status === "matched" && result.ticket.table_code) {
        void trackEvent("human_match_found", {
          game_type: result.ticket.game_type,
          metadata: { table_code: result.ticket.table_code },
        });
        navigate(
          `/game/${result.ticket.game_type}/${result.ticket.table_code}`,
        );
      }
    } catch (reason) {
      setMatchError(reason instanceof Error ? reason.message : t("app.error"));
    }
  };

  const cancelSearch = async () => {
    if (!accessToken || !matchStatus.ticket) return;
    try {
      await cancelMatch(accessToken, matchStatus.ticket.ticket_id);
      setMatchStatus((current) => ({ ...current, ticket: null }));
      setTimedOut(false);
      setWaitingSeconds(0);
      void trackEvent("matchmaking_cancelled", { game_type: matchmakingGame });
    } catch (reason) {
      setMatchError(reason instanceof Error ? reason.message : t("app.error"));
    }
  };

  const shown = tables.filter((table) => {
    const matchesQuery = table.name.toLowerCase().includes(query.toLowerCase());
    if (!matchesQuery) return false;
    if (stakeFilter === "all") return true;
    if (stakeFilter === "0") {
      return (
        table.stakes.toLowerCase().includes("gratuit") ||
        table.stakes.includes("0") ||
        table.mode === "DEMO_AI" ||
        table.mode === "SIMULATION_SOLO"
      );
    }
    const cleanStake = table.stakes.replace(/\s+/g, "");
    return cleanStake.includes(stakeFilter);
  });

  const shownTournaments = useMemo(() => {
    return tournaments.filter((tItem) => {
      const matchesQuery = tItem.name.toLowerCase().includes(query.toLowerCase());
      if (!matchesQuery) return false;
      if (stakeFilter === "all") return true;
      if (stakeFilter === "0") return tItem.buy_in === 0;
      return String(tItem.buy_in).includes(stakeFilter);
    });
  }, [tournaments, query, stakeFilter]);
  const guestName = useGameStore((state) => state.guestName);
  const setGuestMode = useGameStore((state) => state.setGuestMode);
  const setSession = useGameStore((state) => state.setSession);
  const launchSimulation = async (gameType: "poker" | "belote" | "rami" | "ludo" | "domino") => {
    let token = accessToken;
    if (!token) {
      // Allow any anonymous user to play vs bots as guest — same as HomePage/PlayHub
      try {
        const auth = await createGuestToken(guestName || "Invité Lobby");
        setSession(auth.access, auth.refresh);
        setGuestMode(auth.user.display_name, auth.wallet.balance);
        token = auth.access;
      } catch {
        navigate("/auth");
        return;
      }
    }
    setStartingSimulation(gameType);
    setMatchError("");
    const botCount = lobbyBotCounts[gameType] ?? (gameType === "rami" ? 1 : 3);
    const idempotencyKey = `lobby-${gameType}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      const session = await startBotSimulation(
        token,
        gameType,
        "balanced",
        idempotencyKey,
        botCount,
      );
      void trackEvent("bot_simulation_started", {
        mode: session.mode,
        game_type: gameType,
        metadata: { session_id: session.session_id, source: "lobby" },
      });
      navigate(
        `/game/${session.game_type}/${session.table_code}?mode=demo_ai&session=${session.session_id}&table_id=${session.table_id}${session.admission_token ? `&admission_token=${session.admission_token}` : ""}`,
      );
    } catch (reason) {
      setMatchError(
        reason instanceof Error ? reason.message : t("simulationUnavailable"),
      );
    } finally {
      setStartingSimulation(null);
    }
  };
  const join = async (table: GameTable) => {
    let token = accessToken;
    if (!token) {
      try {
        const auth = await createGuestToken(guestName || "Invité");
        setSession(auth.access, auth.refresh);
        setGuestMode(auth.user.display_name, auth.wallet.balance);
        token = auth.access;
      } catch {
        navigate("/auth");
        return;
      }
    }
    setJoining(table.id);
    try {
      const result = await joinTable(table.id, token);
      setTables((current) =>
        current.map((item) => (item.id === table.id ? result.table : item)),
      );
      navigate(
        `/game/${result.table.game_type}/${result.table.table_code}?table_id=${result.table.id}${result.admission_token ? `&admission_token=${result.admission_token}` : ""}`,
      );
      void trackEvent("table_joined", {
        game_type: result.table.game_type,
        metadata: { table_code: result.table.table_code },
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Impossible de rejoindre la table.",
      );
    } finally {
      setJoining(null);
    }
  };

  const submitTable = async () => {
    if (!accessToken) {
      navigate("/auth");
      return;
    }
    setCreatingTable(true);
    setError("");
    try {
      const table = await createTable(accessToken, {
        ...tableForm,
        name: tableForm.name.trim() || t("createTable.defaultName"),
      });
      setShowCreateTable(false);
      navigate(`/game/${table.game_type}/${table.table_code}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("app.error"));
    } finally {
      setCreatingTable(false);
    }
  };

  const counts = useMemo(() => {
    return {
      all: tables.length,
      poker: tables.filter((t) => t.game_type === "poker").length,
      belote: tables.filter((t) => t.game_type === "belote").length,
      rami: tables.filter((t) => t.game_type === "rami").length,
      ludo: tables.filter((t) => t.game_type === "ludo").length,
      domino: tables.filter((t) => t.game_type === "domino").length,
      tournaments: tournaments.length,
    };
  }, [tables, tournaments]);

  return (
    <div className="page-stack lobby-redesign">
      {/* 1. Header & Hero Spotlight Awwwards-grade */}
      <div className="lobby-hero-spotlight">
        <div className="lobby-spotlight-top">
          <div className="lobby-live-badge">
            <i />
            <span>
              {matchStatus.human_online > 0
                ? `${matchStatus.human_online} Joueurs en direct`
                : "Tables en direct"}
            </span>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className="button button-small button-gold"
              onClick={() => {
                if (!accessToken) navigate("/auth");
                else setShowCreateTable(true);
              }}
              style={{ fontSize: "12px" }}
            >
              <Plus size={15} /> {t("games.create")}
            </button>
          </div>
        </div>

        <div className="lobby-spotlight-grid">
          {/* Carte Matchmaking 1-Clic */}
          <div className="lobby-fast-play-card">
            <div>
              <span className="eyebrow gold" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <Zap size={13} /> {t("lobby.fastPlayTitle")}
              </span>
              <h2>
                Partie Éclair <em>Instant</em>
              </h2>
              <p>Rejoignez instantanément une table active sans attendre.</p>
            </div>

            {/* Sélecteur de jeu direct */}
            <div className="fast-game-pills">
              {(["poker", "belote", "rami", "ludo", "domino"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`fast-game-pill ${matchmakingGame === g ? "active" : ""}`}
                  onClick={() => {
                    setFilter(g);
                    setTableForm((prev) => ({ ...prev, game_type: g }));
                  }}
                >
                  <span>{g === "poker" ? "♠" : g === "belote" ? "♥" : g === "rami" ? "♦" : g === "ludo" ? "🎲" : "🁓"}</span>
                  <span>{g === "ludo" ? "Ludo" : g === "domino" ? "Domino" : t(`games.${g}`)}</span>
                </button>
              ))}
            </div>

            {matchStatus.ticket?.status === "queued" ? (
              <button
                className="button button-gold lobby-fast-cta"
                type="button"
                onClick={() => void cancelSearch()}
              >
                <Loader2 size={16} className="spin" /> Annuler la recherche ({waitingSeconds}s)
              </button>
            ) : (
              <button
                className="button button-gold lobby-fast-cta"
                type="button"
                onClick={() => void findHuman()}
              >
                <Zap size={16} /> Rejoindre une table ({t(`games.${matchmakingGame}`)})
              </button>
            )}

            {timedOut && matchStatus.ticket?.status === "queued" && (
              <p style={{ fontSize: "12px", color: "var(--gold)", marginTop: "8px", textAlign: "center" }}>
                Recherche prolongée. Vous pouvez patienter ou lancer une simulation solo avec IA ci-contre.
              </p>
            )}

            {matchError && (
              <div
                style={{
                  marginTop: "10px",
                  fontSize: "12px",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  color: "#fca5a5",
                }}
              >
                {matchError}
              </div>
            )}
          </div>

          {/* Carte Entraînement Solo (IA) */}
          <div className="lobby-practice-card">
            <div>
              <div className="lobby-practice-title">
                <Bot size={16} style={{ color: "var(--gold)" }} />
                <span>Entraînement Solo (IA)</span>
              </div>
              <p style={{ fontSize: "12px", color: "var(--muted)", margin: "4px 0 0" }}>
                Pratiquez immédiatement contre des bots déclarés sans mise réelle.
              </p>
            </div>

            <BotCountSelector
              gameType={matchmakingGame}
              value={lobbyBotCounts[matchmakingGame] ?? (matchmakingGame === "rami" ? 1 : 3)}
              onChange={(v) => setLobbyBotCount(matchmakingGame, v)}
              disabled={startingSimulation === matchmakingGame}
            />

            <button
              type="button"
              className="button button-secondary button-small"
              onClick={() => void launchSimulation(matchmakingGame)}
              disabled={startingSimulation === matchmakingGame}
              style={{ width: "100%", justifyContent: "center" }}
            >
              <Sparkles size={14} />
              {startingSimulation === matchmakingGame ? t("startingSimulation") : "Lancer la démo IA"}
            </button>
          </div>
        </div>
      </div>

      {/* 2. Category Navigation Ribbon (Awwwards Style) */}
      <div className="lobby-category-ribbon">
        {[
          { key: "all", label: "Toutes les tables", icon: "★", count: counts.all },
          { key: "poker", label: "Poker Texas Hold'em", icon: "♠", count: counts.poker },
          { key: "belote", label: "Belote Malagasy", icon: "♥", count: counts.belote },
          { key: "rami", label: "Rami MDG", icon: "♦", count: counts.rami },
          { key: "ludo", label: "Ludo Mada", icon: "🎲", count: counts.ludo },
          { key: "domino", label: "Domino Double-Six", icon: "🁓", count: counts.domino },
          { key: "tournaments", label: "Tournois & Sit & Go", icon: "🏆", count: counts.tournaments },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`lobby-cat-tab ${filter === tab.key ? "active" : ""}`}
            onClick={() => setFilter(tab.key)}
          >
            <span style={{ color: "var(--gold)" }}>{tab.icon}</span>
            <span>{tab.label}</span>
            <span className="lobby-cat-count">{tab.count}</span>
          </button>
        ))}
      </div>

      {/* 3. Unified Search & Stakes Bar */}
      <div className="lobby-search-filter-bar">
        <div className="lobby-search-input-wrap">
          <Search size={16} />
          <input
            placeholder="Rechercher par nom de table ou de club..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              style={{ border: 0, background: "none", color: "var(--muted)", cursor: "pointer", fontSize: "16px" }}
            >
              ×
            </button>
          )}
        </div>

        {/* Stake Chips Scroll */}
        <div className="stake-chips-scroll" style={{ margin: 0, flex: "none" }}>
          {[
            { key: "all", label: "Toutes les mises" },
            { key: "0", label: "Gratuit / Démo" },
            { key: "200", label: "200 Ar" },
            { key: "500", label: "500 Ar" },
            { key: "1000", label: "1 000 Ar" },
            { key: "2000", label: "2 000 Ar" },
            { key: "5000", label: "5 000 Ar" },
            { key: "10000", label: "10 000 Ar+" },
          ].map((chip) => (
            <button
              key={chip.key}
              type="button"
              className={`stake-chip ${stakeFilter === chip.key ? "active" : ""}`}
              onClick={() => setStakeFilter(chip.key)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Spatial Casino Table Cards Grid */}
      {filter === "tournaments" ? (
        <div className="tournaments-lobby-section">
          {tourneyMsg && (
            <div
              style={{
                marginBottom: "20px",
                padding: "14px 18px",
                background: "rgba(211, 176, 107, 0.15)",
                border: "1px solid rgba(211, 176, 107, 0.4)",
                borderRadius: "12px",
                color: "var(--gold)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Trophy size={18} />
                <span style={{ fontWeight: 500 }}>{tourneyMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setTourneyMsg(null)}
                style={{
                  background: "none",
                  border: 0,
                  color: "var(--gold)",
                  cursor: "pointer",
                  fontSize: "18px",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          )}

          {loading ? (
            <div className="lobby-cards-grid">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="casino-table-card" style={{ minHeight: "220px", opacity: 0.6 }}>
                  <div className="skeleton-line short" style={{ height: "24px", marginBottom: "14px" }} />
                  <div className="skeleton-line" style={{ height: "40px", marginBottom: "14px" }} />
                  <div className="skeleton-line" style={{ height: "40px" }} />
                </div>
              ))}
            </div>
          ) : shownTournaments.length === 0 ? (
            <div className="empty-note" style={{ padding: "40px 20px", textAlign: "center", borderRadius: "14px" }}>
              <Trophy size={40} style={{ color: "var(--gold)", marginBottom: "12px" }} />
              <p style={{ fontSize: "16px", color: "var(--text)", margin: "0 0 8px", fontWeight: 600 }}>
                Aucun tournoi disponible pour ce filtre.
              </p>
              <span style={{ fontSize: "13px", color: "var(--muted)" }}>
                Les tournois Sit & Go démarrent dès que la table est complète. Revenez vite !
              </span>
            </div>
          ) : (
            <div className="lobby-cards-grid">
              {shownTournaments.map((tItem) => {
                const fillPercent = Math.min(100, Math.round((tItem.registered_count / tItem.max_players) * 100));
                const isFull = tItem.registered_count >= tItem.max_players;

                return (
                  <div key={tItem.id} className="casino-table-card tournament-card">
                    <div className="table-card-header">
                      <div className="table-card-title-group">
                        <div
                          className="table-card-symbol"
                          style={{
                            background: "rgba(211, 176, 107, 0.15)",
                            color: "var(--gold)",
                            border: "1px solid rgba(211, 176, 107, 0.3)",
                          }}
                        >
                          <Trophy size={18} />
                        </div>
                        <div>
                          <h3>{tItem.name}</h3>
                          <span>
                            {tItem.format === "sit_and_go" ? "⚡ Sit & Go Turbo" : "🏆 Tournoi MTT"} · {tItem.game_type.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      <span className={`table-card-live-pill ${tItem.status === "running" ? "running" : "waiting"}`}>
                        <i />
                        <span>{tItem.status === "running" ? "En cours" : "Inscriptions"}</span>
                      </span>
                    </div>

                    <div className="table-card-body">
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "10px",
                          margin: "12px 0",
                          background: "rgba(255,255,255,0.03)",
                          padding: "12px",
                          borderRadius: "10px",
                        }}
                      >
                        <div>
                          <span style={{ fontSize: "11px", color: "var(--muted)", display: "block" }}>Buy-in</span>
                          <strong style={{ fontSize: "14px", color: "#fff" }}>
                            {tItem.buy_in === 0 ? "Gratuit (Freeroll)" : `${tItem.buy_in.toLocaleString("fr-FR")} Ar`}
                          </strong>
                        </div>
                        <div>
                          <span style={{ fontSize: "11px", color: "var(--muted)", display: "block" }}>Prize Pool Garanti</span>
                          <strong style={{ fontSize: "14px", color: "var(--gold)" }}>
                            {tItem.prize_pool.toLocaleString("fr-FR")} Ar
                          </strong>
                        </div>
                        <div>
                          <span style={{ fontSize: "11px", color: "var(--muted)", display: "block" }}>Tapis de départ</span>
                          <span style={{ fontSize: "13px", color: "#fff", fontWeight: 600 }}>
                            {tItem.starting_chips.toLocaleString("fr-FR")} jetons
                          </span>
                        </div>
                        <div>
                          <span style={{ fontSize: "11px", color: "var(--muted)", display: "block" }}>Niveau des blinds</span>
                          <span
                            style={{
                              fontSize: "13px",
                              color: "#fff",
                              fontWeight: 600,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <Timer size={13} /> {tItem.blind_interval_minutes} min
                          </span>
                        </div>
                      </div>

                      {/* Jauge de remplissage */}
                      <div style={{ marginTop: "10px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "6px" }}>
                          <span style={{ color: "var(--muted)" }}>Joueurs inscrits</span>
                          <span style={{ color: "#fff", fontWeight: 600 }}>
                            {tItem.registered_count} / {tItem.max_players} ({fillPercent}%)
                          </span>
                        </div>
                        <div
                          style={{
                            width: "100%",
                            height: "6px",
                            background: "rgba(255,255,255,0.08)",
                            borderRadius: "4px",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${fillPercent}%`,
                              height: "100%",
                              background: fillPercent >= 100 ? "var(--accent)" : "var(--gold)",
                              borderRadius: "4px",
                              transition: "width 0.4s ease",
                            }}
                          />
                        </div>
                      </div>

                      {/* Payout distribution preview */}
                      {tItem.prizes && tItem.prizes.length > 0 && (
                        <div style={{ marginTop: "12px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          {tItem.prizes.map((pz) => (
                            <span
                              key={pz.place}
                              style={{
                                fontSize: "10px",
                                padding: "2px 8px",
                                background: "rgba(211, 176, 107, 0.1)",
                                border: "1px solid rgba(211, 176, 107, 0.25)",
                                borderRadius: "8px",
                                color: "var(--gold)",
                                fontWeight: 600,
                              }}
                            >
                              {pz.place === 1 ? "🥇 1er" : pz.place === 2 ? "🥈 2e" : "🥉 3e"} : {pz.amount.toLocaleString("fr-FR")} Ar ({pz.percent}%)
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="table-card-footer">
                      {tItem.registered ? (
                        <div
                          style={{
                            width: "100%",
                            padding: "10px",
                            textAlign: "center",
                            background: "rgba(34, 197, 94, 0.15)",
                            border: "1px solid rgba(34, 197, 94, 0.35)",
                            borderRadius: "8px",
                            color: "#4ade80",
                            fontWeight: 600,
                            fontSize: "13px",
                          }}
                        >
                          ✓ Vous êtes inscrit
                        </div>
                      ) : isFull ? (
                        <button
                          type="button"
                          className="button button-secondary table-card-join-btn"
                          disabled
                        >
                          Tournoi Complet
                        </button>
                      ) : accessToken ? (
                        <button
                          type="button"
                          className="button button-gold table-card-join-btn"
                          onClick={() => void handleRegisterTournament(tItem.id)}
                          disabled={registeringTourney === tItem.id}
                        >
                          {registeringTourney === tItem.id ? (
                            <>
                              <Loader2 size={16} className="spin" /> Inscription...
                            </>
                          ) : (
                            <>
                              S'inscrire ({tItem.buy_in === 0 ? "Gratuit" : `${tItem.buy_in.toLocaleString("fr-FR")} Ar`}) <ArrowUpRight size={16} />
                            </>
                          )}
                        </button>
                      ) : (
                        <Link to="/auth" className="button button-gold table-card-join-btn">
                          Se connecter pour jouer <ArrowUpRight size={16} />
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : loading ? (
        <div className="lobby-cards-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="casino-table-card" style={{ minHeight: "200px", opacity: 0.6 }}>
              <div className="skeleton-line short" style={{ height: "20px", marginBottom: "14px" }} />
              <div className="skeleton-line" style={{ height: "36px", marginBottom: "14px" }} />
              <div className="skeleton-line" style={{ height: "36px" }} />
            </div>
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="empty-note" style={{ padding: "40px 20px", textAlign: "center", borderRadius: "14px" }}>
          <p style={{ fontSize: "15px", color: "var(--text)", margin: "0 0 8px", fontWeight: 600 }}>
            {t("lobby.empty")}
          </p>
          <span style={{ fontSize: "13px", color: "var(--muted)" }}>
            Aucune table ne correspond à vos critères. Modifiez vos filtres ou créez la vôtre !
          </span>
          <div style={{ marginTop: "16px" }}>
            <button
              type="button"
              className="button button-gold button-small"
              onClick={() => {
                if (!accessToken) navigate("/auth");
                else setShowCreateTable(true);
              }}
            >
              <Plus size={15} /> {t("games.create")}
            </button>
          </div>
        </div>
      ) : (
        <div className="lobby-cards-grid">
          {shown.map((table) => {
            const live = table.status === "running";
            const sym = table.game_type === "poker" ? "♠" : table.game_type === "belote" ? "♥" : table.game_type === "rami" ? "♦" : table.game_type === "ludo" ? "🎲" : "🁓";
            const isFull = table.player_count >= table.max_players;

            return (
              <div key={table.id} className={`casino-table-card game-${table.game_type}`}>
                <div className="table-card-header">
                  <div className="table-card-title-group">
                    <div className={`table-card-symbol sym-${table.game_type}`}>
                      {sym}
                    </div>
                    <div>
                      <h3>{table.name}</h3>
                      <span>
                        {t(`games.${table.game_type}`)} · {table.max_players} Joueurs
                      </span>
                    </div>
                  </div>

                  <span className={`table-card-live-pill ${live ? "running" : "waiting"}`}>
                    <i />
                    <span>{live ? "En cours" : "Ouverte"}</span>
                  </span>
                </div>

                <div className="table-card-body">
                  <div className="table-seats-row">
                    <span style={{ fontSize: "12px", color: "var(--muted)" }}>Sièges :</span>
                    <strong style={{ fontSize: "12px", color: "#fff" }}>
                      {table.player_count} / {table.max_players} places
                    </strong>
                  </div>

                  {/* Matrice de points visuels des sièges */}
                  <div className="table-seats-dots">
                    {Array.from({ length: table.max_players }).map((_, sIdx) => (
                      <span
                        key={sIdx}
                        className={`seat-dot ${sIdx < table.player_count ? "occupied" : ""}`}
                        title={sIdx < table.player_count ? "Siège occupé" : "Siège libre"}
                      />
                    ))}
                  </div>

                  <div className="table-stakes-row">
                    <span style={{ color: "var(--muted)" }}>Enjeux :</span>
                    <span className="table-stakes-val">{table.stakes || "Gratuit"}</span>
                  </div>

                  {table.club_name && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--gold)", flexWrap: "wrap" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <Users size={12} /> Club : {table.club_name}
                      </span>
                      {table.club_is_certified && (
                        <span
                          title="Club Certifié MDG"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "3px",
                            padding: "1px 6px",
                            background: "rgba(211, 176, 107, 0.2)",
                            border: "1px solid rgba(211, 176, 107, 0.4)",
                            borderRadius: "10px",
                            fontSize: "10px",
                            color: "var(--gold)",
                            fontWeight: 600,
                          }}
                        >
                          <ShieldCheck size={11} strokeWidth={2.4} /> Certifié
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="table-card-footer">
                  {accessToken ? (
                    <button
                      type="button"
                      className={`button ${live || isFull ? "button-secondary" : "button-gold"} table-card-join-btn`}
                      onClick={() => join(table)}
                      disabled={joining === table.id || table.status === "finished" || isFull}
                    >
                      {joining === table.id ? (
                        <>
                          <Loader2 size={16} className="spin" /> Connexion...
                        </>
                      ) : isFull ? (
                        "Table complète"
                      ) : live ? (
                        <>
                          Rejoindre la partie <ArrowUpRight size={16} />
                        </>
                      ) : (
                        <>
                          Prendre place <ArrowUpRight size={16} />
                        </>
                      )}
                    </button>
                  ) : (
                    <Link to="/auth" className="button button-gold table-card-join-btn">
                      Se connecter pour jouer <ArrowUpRight size={16} />
                    </Link>
                  )}

                  <div className="table-card-secondary-row">
                    <Link
                      to={`/game/${table.game_type}/${table.table_code}?mode=spectator`}
                      style={{ color: "var(--muted)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px" }}
                    >
                      <Users size={12} /> Mode spectateur
                    </Link>

                    <button
                      type="button"
                      onClick={() => void launchSimulation(table.game_type)}
                      disabled={startingSimulation !== null}
                      style={{ border: 0, background: "none", color: "var(--muted)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px" }}
                    >
                      <Sparkles size={12} /> Démo IA
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Créer une table */}
      {showCreateTable && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="create-table-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-table-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">{t("createTable.eyebrow")}</span>
                <h2 id="create-table-title">{t("createTable.title")}</h2>
              </div>
              <button
                className="icon-button"
                aria-label={t("createTable.close")}
                onClick={() => setShowCreateTable(false)}
              >
                ×
              </button>
            </div>
            <p className="modal-intro">{t("createTable.body")}</p>
            <label className="field-label" htmlFor="table-name">
              {t("createTable.name")}
            </label>
            <input
              id="table-name"
              className="text-input"
              value={tableForm.name}
              placeholder={t("createTable.namePlaceholder")}
              onChange={(event) =>
                setTableForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
            <label className="field-label" htmlFor="table-game">
              {t("createTable.game")}
            </label>
            <select
              id="table-game"
              className="text-input"
              value={tableForm.game_type}
              onChange={(event) =>
                setTableForm((current) => ({
                  ...current,
                  game_type: event.target.value as typeof current.game_type,
                }))
              }
            >
              <option value="poker">{t("games.poker")}</option>
              <option value="belote">{t("games.belote")}</option>
              <option value="rami">{t("games.rami")}</option>
              <option value="ludo">Ludo Malagasy</option>
              <option value="domino">Domino Double-Six</option>
            </select>
            <label className="field-label" htmlFor="table-players">
              {t("createTable.players")}
            </label>
            <select
              id="table-players"
              className="text-input"
              value={tableForm.max_players}
              onChange={(event) =>
                setTableForm((current) => ({
                  ...current,
                  max_players: Number(event.target.value),
                }))
              }
            >
              {[2, 4, 6, 9].map((players) => (
                <option value={players} key={players}>
                  {players}
                </option>
              ))}
            </select>
            <label className="private-toggle">
              <input
                type="checkbox"
                checked={tableForm.is_private}
                onChange={(event) =>
                  setTableForm((current) => ({
                    ...current,
                    is_private: event.target.checked,
                  }))
                }
              />
              <span>
                <strong>{t("createTable.private")}</strong>
                <small>{t("createTable.privateHint")}</small>
              </span>
            </label>
            <div className="modal-actions">
              <button
                className="button button-outline"
                onClick={() => setShowCreateTable(false)}
              >
                {t("createTable.cancel")}
              </button>
              <button
                className="button button-gold"
                disabled={creatingTable}
                onClick={() => void submitTable()}
              >
                {creatingTable
                  ? t("createTable.creating")
                  : t("createTable.submit")}
              </button>
            </div>
          </section>
        </div>
      )}

      {error && (
        <div className="empty-note" style={{ color: "var(--red)" }}>
          <span>{error}</span>
        </div>
      )}

      <div className="empty-note" style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "center" }}>
        <Lock size={15} />
        <span>{t("lobby.privateHint")}</span>
      </div>
    </div>
  );
}
