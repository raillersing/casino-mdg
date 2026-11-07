import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowUpRight,
  Bot,
  Compass,
  Eye,
  Lock,
  Plus,
  RotateCw,
  Search,
  Sparkles,
  Users,
  ShieldCheck,
  Loader2,
  Zap,
  Trophy,
  Timer,
  CheckCircle2,
  Sliders,
} from "lucide-react";
import {
  cancelMatch,
  createTable,
  getLiveStats,
  getMatchmakingStatus,
  getTables,
  joinTable,
  startBotSimulation,
  queueMatch,
  sendMatchmakingHeartbeat,
  type CreateTablePayload,
  type GameTable,
  type LiveStatsResponse,
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
import { CreateTableModal } from "@components/game/CreateTableModal";
import { JoinPrivateTableModal } from "@components/game/JoinPrivateTableModal";
import { LiveStatsTicker } from "@components/game/LiveStatsTicker";
import { haptics } from "@utils/haptics";

const GAME_SUITS: Record<
  string,
  { icon: string; color: string; label: string }
> = {
  poker: { icon: "♠", color: "#d3b06b", label: "Poker Texas Hold'em" },
  belote: { icon: "♥", color: "#ef4444", label: "Belote Malagasy" },
  rami: { icon: "♦", color: "#3b82f6", label: "Rami Malagasy" },
  ludo: { icon: "🎲", color: "#10b981", label: "Ludo Mada" },
  domino: { icon: "🁓", color: "#f59e0b", label: "Domino Double-Six" },
};

const QUICK_GAME_SPECS: Record<
  "belote" | "domino" | "ludo" | "rami" | "poker",
  {
    players: string;
    duration: string;
    rule: string;
    preset: {
      max_players: number;
      turn_duration: number;
      rules_config: Record<string, number>;
    };
  }
> = {
  belote: {
    players: "4 Joueurs",
    duration: "30s / tour",
    rule: "501 pts",
    preset: { max_players: 4, turn_duration: 30, rules_config: { target_score: 501 } },
  },
  domino: {
    players: "4 Joueurs",
    duration: "15s Blitz",
    rule: "Double-Six",
    preset: { max_players: 4, turn_duration: 15, rules_config: {} },
  },
  ludo: {
    players: "4 Joueurs",
    duration: "15s Blitz",
    rule: "Course 4 Pions",
    preset: { max_players: 4, turn_duration: 15, rules_config: {} },
  },
  rami: {
    players: "2 Joueurs",
    duration: "30s / tour",
    rule: "7 Cartes Knock",
    preset: { max_players: 2, turn_duration: 30, rules_config: {} },
  },
  poker: {
    players: "6 Joueurs",
    duration: "30s / tour",
    rule: "Blinds 25/50",
    preset: { max_players: 6, turn_duration: 30, rules_config: { small_blind: 25 } },
  },
};

export function LobbyPage() {
  const { t } = useTranslation();
  const { gameType: urlGameType } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryFilter = searchParams.get("filter");

  const [filter, setFilter] = useState(urlGameType || queryFilter || "all");
  const [stakeFilter, setStakeFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [tables, setTables] = useState<GameTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState<string | null>(null);
  const accessToken = useGameStore((state) => state.accessToken);
  const navigate = useNavigate();

  const matchmakingGame = (
    ["poker", "belote", "rami", "ludo", "domino"].includes(filter)
      ? filter
      : "belote"
  ) as "poker" | "belote" | "rami" | "ludo" | "domino";

  const [matchStatus, setMatchStatus] = useState<{
    human_online: number;
    estimated_wait_seconds: number;
    ticket: MatchmakingTicket | null;
  }>({ human_online: 0, estimated_wait_seconds: 20, ticket: null });

  const [matchError, setMatchError] = useState("");
  const [waitingSeconds, setWaitingSeconds] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const [showCreateTable, setShowCreateTable] = useState(false);
  const [createTableGame, setCreateTableGame] = useState<
    "belote" | "domino" | "ludo" | "rami" | "poker"
  >("belote");
  const [quickCreating, setQuickCreating] = useState<string | null>(null);
  const [showJoinPrivate, setShowJoinPrivate] = useState(false);
  const [liveStats, setLiveStats] = useState<LiveStatsResponse | null>(null);
  const [startingSimulation, setStartingSimulation] = useState<string | null>(
    null,
  );

  const [lobbyBotCounts, setLobbyBotCounts] = useState<Record<string, number>>(
    () => {
      try {
        const saved = JSON.parse(
          localStorage.getItem("mdg-bot-counts") || "{}",
        );
        return {
          poker: saved.poker ?? 3,
          belote: saved.belote ?? 3,
          rami: saved.rami ?? 1,
          ludo: saved.ludo ?? 3,
          domino: saved.domino ?? 3,
          ...saved,
        };
      } catch {
        return { poker: 3, belote: 3, rami: 1, ludo: 3, domino: 3 };
      }
    },
  );

  const setLobbyBotCount = (gameId: string, value: number) => {
    setLobbyBotCounts((prev) => {
      const next = { ...prev, [gameId]: value };
      localStorage.setItem("mdg-bot-counts", JSON.stringify(next));
      return next;
    });
  };

  const [mobileTab, setMobileTab] = useState<
    "tables" | "quick" | "tournaments"
  >("tables");

  useEffect(() => {
    const selected = urlGameType || queryFilter || "all";
    setFilter(
      [
        "all",
        "belote",
        "domino",
        "ludo",
        "rami",
        "poker",
        "tournaments",
      ].includes(selected)
        ? selected
        : "all",
    );
    const action = searchParams.get("action");
    if (!accessToken && (action === "join-private" || action === "create")) {
      navigate(
        `/auth?next=${encodeURIComponent(`/lobby?${searchParams.toString()}`)}`,
        { replace: true },
      );
      return;
    }
    if (searchParams.get("action") === "join-private" && accessToken)
      setShowJoinPrivate(true);
    if (searchParams.get("action") === "matchmaking") setMobileTab("quick");
    if (searchParams.get("action") === "create" && accessToken) {
      const gParam = searchParams.get("game_type");
      if (
        gParam &&
        ["belote", "domino", "ludo", "rami", "poker"].includes(gParam)
      ) {
        setCreateTableGame(
          gParam as "belote" | "domino" | "ludo" | "rami" | "poker",
        );
      }
      setShowCreateTable(true);
    }
  }, [urlGameType, queryFilter, searchParams, accessToken, navigate]);

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [registeringTourney, setRegisteringTourney] = useState<string | null>(
    null,
  );
  const [tourneyMsg, setTourneyMsg] = useState<string | null>(null);

  useEffect(() => {
    if (
      queryFilter &&
      ["poker", "belote", "rami", "ludo", "domino", "tournaments"].includes(
        queryFilter,
      )
    ) {
      setFilter(queryFilter);
    }
  }, [queryFilter]);

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
      setTourneyMsg(
        err instanceof Error ? err.message : "Erreur lors de l'inscription.",
      );
    } finally {
      setRegisteringTourney(null);
    }
  };

  useEffect(() => {
    if (
      urlGameType &&
      ["poker", "belote", "rami", "ludo", "domino"].includes(urlGameType)
    ) {
      setFilter(urlGameType);
    }
  }, [urlGameType]);

  const refreshData = useCallback(() => {
    setLoading(true);
    setError("");
    getLiveStats()
      .then(setLiveStats)
      .catch(() => undefined);
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
    let mounted = true;
    const fetchStats = () => {
      getLiveStats()
        .then((data) => {
          if (mounted) setLiveStats(data);
        })
        .catch(() => undefined);
    };
    fetchStats();
    const timer = window.setInterval(fetchStats, 15000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

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
          if (status.ticket?.status === "matched" && status.ticket.table_code) {
            void trackEvent("human_match_found", {
              game_type: status.ticket.game_type,
              metadata: { table_code: status.ticket.table_code },
            });
            navigate(
              `/game/${status.ticket.game_type}/${status.ticket.table_code}`,
            );
          }
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
      navigate("/auth?next=/lobby");
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

  const guestName = useGameStore((state) => state.guestName);
  const setGuestMode = useGameStore((state) => state.setGuestMode);
  const setSession = useGameStore((state) => state.setSession);

  const launchSimulation = async (
    gameType: "poker" | "belote" | "rami" | "ludo" | "domino",
  ) => {
    let token = accessToken;
    if (!token) {
      try {
        const auth = await createGuestToken(guestName || "Invité Salon");
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

  const quickGamesToShow = useMemo(() => {
    if (
      filter &&
      ["belote", "domino", "ludo", "rami", "poker"].includes(filter)
    ) {
      return [filter as "belote" | "domino" | "ludo" | "rami" | "poker"];
    }
    return ["belote", "domino", "ludo", "rami", "poker"] as const;
  }, [filter]);

  const handleQuickCreate = async (
    gameType: "belote" | "domino" | "ludo" | "rami" | "poker",
  ) => {
    let token = accessToken;
    if (!token) {
      try {
        const auth = await createGuestToken(guestName || "Invité Salon");
        setSession(auth.access, auth.refresh);
        setGuestMode(auth.user.display_name, auth.wallet.balance);
        token = auth.access;
      } catch {
        navigate("/auth?next=/lobby");
        return;
      }
    }
    setQuickCreating(gameType);
    setError("");
    try {
      const spec = QUICK_GAME_SPECS[gameType];
      const randomSuffix = Math.floor(100 + Math.random() * 900);
      const name = `${GAME_SUITS[gameType].label.split(" ")[0]} #${randomSuffix}`;
      const payload: CreateTablePayload = {
        idempotency_key: `quick-${gameType}-${Date.now()}-${randomSuffix}`,
        name,
        game_type: gameType,
        max_players: spec.preset.max_players,
        turn_duration: spec.preset.turn_duration,
        rules_config: spec.preset.rules_config,
        is_private: false,
        stake_amount: 0,
      };
      const table = await createTable(token, payload);
      haptics.buttonTap();
      navigate(
        `/game/${table.game_type}/${table.table_code}?table_id=${table.id}`,
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de créer la table instantanée.",
      );
    } finally {
      setQuickCreating(null);
    }
  };

  const counts = useMemo(() => {
    // Ne comptabiliser que les vraies tables humaines actives (non terminées, avec au moins 1 joueur)
    const validTables = tables.filter(
      (t) =>
        t.status !== "finished" &&
        t.mode !== "DEMO_AI" &&
        t.mode !== "SIMULATION_SOLO" &&
        (t.is_private || (t.player_count ?? 0) > 0),
    );
    return {
      all: validTables.length,
      belote: validTables.filter((t) => t.game_type === "belote").length,
      domino: validTables.filter((t) => t.game_type === "domino").length,
      ludo: validTables.filter((t) => t.game_type === "ludo").length,
      rami: validTables.filter((t) => t.game_type === "rami").length,
      poker: validTables.filter((t) => t.game_type === "poker").length,
      tournaments: tournaments.length,
    };
  }, [tables, tournaments]);

  const shown = tables.filter((table) => {
    // 1. Filtrer impérativement les tables terminées ou expirées
    if (table.status === "finished") return false;

    // 2. Filtrer les modes bots d'entraînement solo (ne doivent pas être dans les tables multijoueur)
    if (table.mode === "DEMO_AI" || table.mode === "SIMULATION_SOLO") return false;

    // 3. Une table publique doit avoir au moins 1 joueur actif
    if (!table.is_private && (table.player_count ?? 0) <= 0) return false;

    const matchesQuery = table.name.toLowerCase().includes(query.toLowerCase());
    if (!matchesQuery) return false;
    if (stakeFilter === "all") return true;
    if (stakeFilter === "0") {
      return (
        table.stakes.toLowerCase().includes("gratuit") ||
        table.stakes.includes("0")
      );
    }
    const cleanStake = table.stakes.replace(/\s+/g, "");
    return cleanStake.includes(stakeFilter);
  });

  const shownTournaments = useMemo(() => {
    return tournaments.filter((tItem) => {
      const matchesQuery = tItem.name
        .toLowerCase()
        .includes(query.toLowerCase());
      if (!matchesQuery) return false;
      if (stakeFilter === "all") return true;
      if (stakeFilter === "0") return tItem.buy_in === 0;
      return String(tItem.buy_in).includes(stakeFilter);
    });
  }, [tournaments, query, stakeFilter]);

  return (
    <div className="lobby-claude-shell">
      {/* 1. Header with Live Status & Action Buttons */}
      <div className="lobby-claude-head">
        <div className="lobby-claude-head-copy">
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "4px",
            }}
          >
            <span className="home-eyebrow">
              <Compass size={13} /> Multijoueur
            </span>
            <span className="lobby-live-badge">
              <i />
              <span>
                {matchStatus.human_online > 0
                  ? `${matchStatus.human_online} Joueurs connectés`
                  : "Tables de jeu"}
              </span>
            </span>
          </div>
          <h1>{t("discovery.lobbyTitle")}</h1>
          <p>
            Choisissez un jeu et une table disponible pour rejoindre une partie.
          </p>
        </div>

        <div className="lobby-claude-head-actions">
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={refreshData}
            title="Rafraîchir les tables"
          >
            <RotateCw size={14} className={loading ? "spin" : ""} /> Actualiser
          </button>
          <button
            type="button"
            className="button button-small"
            style={{
              background:
                "linear-gradient(135deg, rgba(168, 85, 247, 0.25), rgba(99, 102, 241, 0.25))",
              border: "1px solid rgba(168, 85, 247, 0.5)",
              color: "#c084fc",
              fontWeight: 600,
            }}
            onClick={() => {
              if (!accessToken) navigate("/auth?next=/lobby");
              else setShowJoinPrivate(true);
            }}
          >
            <Lock size={14} /> Rejoindre par Code
          </button>
          <button
            type="button"
            className="button button-gold button-small"
            onClick={() => {
              if (!accessToken) navigate("/auth?next=/lobby");
              else {
                setCreateTableGame(
                  ["belote", "domino", "ludo", "rami", "poker"].includes(filter)
                    ? (filter as "belote" | "domino" | "ludo" | "rami" | "poker")
                    : "belote",
                );
                setShowCreateTable(true);
              }
            }}
          >
            <Plus size={15} /> Créer une table
          </button>
        </div>
      </div>

      {/* Barre de Télémétrie Joueurs Réels & Tables en Cours */}
      <LiveStatsTicker
        activeGameFilter={filter}
        onSelectGame={(g) => {
          setFilter(g);
          setSearchParams({ filter: g });
        }}
      />

      {/* Mobile Segmented View Switcher */}
      <div className="mobile-lobby-tabs lobby-view-tabs">
        <button
          type="button"
          className={`mobile-lobby-tab ${mobileTab === "tables" ? "active" : ""}`}
          onClick={() => {
            haptics.tabChange();
            setMobileTab("tables");
            if (filter === "tournaments") setFilter("all");
          }}
        >
          <Compass size={15} />
          <span>Tables ({counts.all})</span>
        </button>

        <button
          type="button"
          className={`mobile-lobby-tab ${mobileTab === "quick" ? "active" : ""}`}
          onClick={() => {
            haptics.tabChange();
            setMobileTab("quick");
          }}
        >
          <Zap size={15} />
          <span>Partie Rapide</span>
        </button>

        <button
          type="button"
          className={`mobile-lobby-tab ${mobileTab === "tournaments" ? "active" : ""}`}
          onClick={() => {
            haptics.tabChange();
            setMobileTab("tournaments");
            setFilter("tournaments");
          }}
        >
          <Trophy size={15} />
          <span>Tournois ({counts.tournaments})</span>
        </button>
      </div>

      {/* 2. Control Deck: Instant Human Play & Solo Bot Practice */}
      <div className="lobby-control-deck" hidden={mobileTab !== "quick"}>
        {/* Volet 1: Partie Rapide Multijoueur */}
        <div className="lobby-deck-panel panel-primary">
          <div className="lobby-deck-head">
            <div className="lobby-deck-title">
              <Zap size={16} />
              <span>Trouver des adversaires</span>
            </div>
            <span
              style={{
                fontSize: "11px",
                color: "var(--gold)",
                fontWeight: 600,
              }}
            >
              En ligne
            </span>
          </div>

          <p style={{ margin: 0, fontSize: "12.5px", color: "var(--muted)" }}>
            Lancez une recherche de joueurs pour le jeu sélectionné.
          </p>

          <div className="lobby-deck-pills">
            {(["belote", "domino", "ludo", "rami", "poker"] as const).map(
              (g) => {
                const meta = GAME_SUITS[g];
                return (
                  <button
                    key={g}
                    type="button"
                    className={`lobby-deck-pill ${matchmakingGame === g ? "active" : ""}`}
                    onClick={() => {
                      setFilter(g);
                    }}
                  >
                    <span style={{ color: meta.color }}>{meta.icon}</span>
                    <span>{meta.label.split(" ")[0]}</span>
                  </button>
                );
              },
            )}
          </div>

          <div className="lobby-deck-status">
            <span>
              Attente estimée :{" "}
              <strong>~{matchStatus.estimated_wait_seconds || 15}s</strong>
            </span>
            <span>
              En ligne : <strong>{matchStatus.human_online} joueur(s)</strong>
            </span>
          </div>

          {matchStatus.ticket?.status === "queued" ? (
            <button
              className="button button-gold lobby-deck-cta"
              type="button"
              onClick={() => void cancelSearch()}
            >
              <Loader2 size={16} className="spin" /> Annuler la recherche (
              {waitingSeconds}s)
            </button>
          ) : (
            <button
              className="button button-gold lobby-deck-cta"
              type="button"
              onClick={() => void findHuman()}
            >
              <Zap size={16} /> Rejoindre une table (
              {GAME_SUITS[matchmakingGame]?.label.split(" ")[0]})
            </button>
          )}

          {timedOut && matchStatus.ticket?.status === "queued" && (
            <div
              style={{
                fontSize: "12px",
                color: "var(--gold)",
                textAlign: "center",
              }}
            >
              Recherche prolongée. Vous pouvez patienter ou vous entraîner avec
              l'IA ci-contre.
            </div>
          )}

          {matchError && (
            <div
              className="error-banner"
              style={{ margin: 0, fontSize: "12px", padding: "8px 12px" }}
            >
              {matchError}
            </div>
          )}
        </div>

        {/* Volet 2: Entraînement Solo (IA) */}
        <div className="lobby-deck-panel">
          <div className="lobby-deck-head">
            <div className="lobby-deck-title">
              <Bot size={16} />
              <span>Entraînement Solo & Découverte (IA)</span>
            </div>
            <span
              style={{ fontSize: "11px", color: "#10b981", fontWeight: 600 }}
            >
              100% Gratuit
            </span>
          </div>

          <p style={{ margin: 0, fontSize: "12.5px", color: "var(--muted)" }}>
            Pratiquez librement vos combinaisons et tactiques contre des bots
            déclarés et équitables.
          </p>

          <BotCountSelector
            gameType={matchmakingGame}
            value={
              lobbyBotCounts[matchmakingGame] ??
              (matchmakingGame === "rami" ? 1 : 3)
            }
            onChange={(v) => setLobbyBotCount(matchmakingGame, v)}
            disabled={startingSimulation === matchmakingGame}
          />

          <button
            type="button"
            className="button button-secondary lobby-deck-cta"
            onClick={() => void launchSimulation(matchmakingGame)}
            disabled={startingSimulation === matchmakingGame}
          >
            <Sparkles size={15} />
            {startingSimulation === matchmakingGame
              ? "Lancement de la simulation..."
              : `Démarrer contre les Bots (${GAME_SUITS[matchmakingGame]?.label.split(" ")[0]})`}
          </button>
        </div>
      </div>

      {/* 3. Category Navigation Ribbon */}
      <div className="lobby-category-ribbon">
        {[
          {
            key: "all",
            label: "Toutes les tables",
            icon: "★",
            count: counts.all,
            online: liveStats?.total_online_players,
          },
          {
            key: "belote",
            label: "Belote Malagasy",
            icon: "♥",
            count: counts.belote,
            online: liveStats?.games?.belote?.online_players,
          },
          {
            key: "domino",
            label: "Domino Double-Six",
            icon: "🁓",
            count: counts.domino,
            online: liveStats?.games?.domino?.online_players,
          },
          {
            key: "ludo",
            label: "Ludo Mada",
            icon: "🎲",
            count: counts.ludo,
            online: liveStats?.games?.ludo?.online_players,
          },
          {
            key: "rami",
            label: "Rami Malagasy",
            icon: "♦",
            count: counts.rami,
            online: liveStats?.games?.rami?.online_players,
          },
          {
            key: "poker",
            label: "Poker Texas Hold'em",
            icon: "♠",
            count: counts.poker,
            online: liveStats?.games?.poker?.online_players,
          },
          {
            key: "tournaments",
            label: "Tournois & Sit & Go",
            icon: "🏆",
            count: counts.tournaments,
            online: 0,
          },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`lobby-cat-tab ${filter === tab.key ? "active" : ""}`}
            aria-pressed={filter === tab.key}
            onClick={() => {
              setFilter(tab.key);
              setSearchParams({ filter: tab.key });
            }}
          >
            <span style={{ color: "var(--gold)" }}>{tab.icon}</span>
            <span>{tab.label}</span>
            <span className="lobby-cat-count">{tab.count}</span>
            {Boolean(tab.online && tab.online > 0) && (
              <span
                style={{
                  fontSize: "10px",
                  color: "#38bdf8",
                  marginLeft: "4px",
                  fontWeight: 600,
                }}
              >
                · {tab.online}👥
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 4. Unified Search & Stakes Bar */}
      <div className="lobby-search-filter-bar">
        <div className="lobby-search-input-wrap">
          <Search size={16} />
          <input
            aria-label="Rechercher une table"
            placeholder="Rechercher une table…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              aria-label="Effacer la recherche"
              onClick={() => setQuery("")}
              style={{
                border: 0,
                background: "none",
                color: "var(--muted)",
                cursor: "pointer",
                fontSize: "16px",
              }}
            >
              ×
            </button>
          )}
        </div>

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

      {/* Raccourcis de Création de Table par Jeu */}
      {filter !== "tournaments" && (
        <section className="lobby-quick-create-section">
          <div className="lobby-quick-create-header">
            <h3>
              <Sparkles size={16} />
              <span>
                {t(
                  "discovery.quickShortcuts",
                  "Raccourcis de création instantanée",
                )}
              </span>
            </h3>
            <button
              type="button"
              className="button button-gold button-small"
              onClick={() => {
                if (!accessToken) navigate("/auth?next=/lobby");
                else {
                  setCreateTableGame(
                    ["belote", "domino", "ludo", "rami", "poker"].includes(filter)
                      ? (filter as "belote" | "domino" | "ludo" | "rami" | "poker")
                      : "belote",
                  );
                  setShowCreateTable(true);
                }
              }}
            >
              <Plus size={14} /> {t("discovery.createCustom", "Table personnalisée")}
            </button>
          </div>

          <div className="lobby-quick-create-grid">
            {quickGamesToShow.map((gKey) => {
              const meta = GAME_SUITS[gKey];
              const isBusy = quickCreating === gKey;
              const badgeInfo = QUICK_GAME_SPECS[gKey];
              return (
                <div key={gKey} className="lobby-quick-card">
                  <div className="lobby-quick-card-top">
                    <div
                      className="lobby-quick-card-suit"
                      style={{ color: meta.color }}
                    >
                      {meta.icon}
                    </div>
                    <div className="lobby-quick-card-info">
                      <h4>{meta.label.split(" ")[0]}</h4>
                      <span>
                        {badgeInfo.players} · {badgeInfo.duration} · {badgeInfo.rule}
                      </span>
                    </div>
                  </div>

                  <div className="lobby-quick-card-actions">
                    <button
                      type="button"
                      className="button button-gold lobby-quick-instant-btn"
                      onClick={() => void handleQuickCreate(gKey)}
                      disabled={Boolean(quickCreating)}
                    >
                      {isBusy ? (
                        <Loader2 size={14} className="spin" />
                      ) : (
                        <Zap size={14} />
                      )}
                      <span>{isBusy ? "Création..." : "Créer & Jouer"}</span>
                    </button>
                    <button
                      type="button"
                      className="button button-secondary lobby-quick-tune-btn"
                      title={`Personnaliser ${meta.label}`}
                      aria-label={`Personnaliser ${meta.label}`}
                      onClick={() => {
                        setCreateTableGame(gKey);
                        setShowCreateTable(true);
                      }}
                    >
                      <Sliders size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          margin: "24px 0 14px",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 700 }}>
          {t("discovery.online", "Tables actives en attente de joueurs")}
        </h2>
        {filter !== "tournaments" && (
          <span style={{ fontSize: "12px", color: "var(--muted)" }}>
            {shown.length} table(s) ouverte(s)
          </span>
        )}
      </div>
      {/* 5. Main Content: Tournaments or Regular Table Cards Grid */}
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
              <div
                style={{ display: "flex", alignItems: "center", gap: "10px" }}
              >
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
                }}
              >
                ×
              </button>
            </div>
          )}

          {loading ? (
            <div className="lobby-cards-grid">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="casino-table-card"
                  style={{ minHeight: "220px", opacity: 0.6 }}
                >
                  <div
                    className="skeleton-line short"
                    style={{ height: "24px", marginBottom: "14px" }}
                  />
                  <div
                    className="skeleton-line"
                    style={{ height: "40px", marginBottom: "14px" }}
                  />
                  <div className="skeleton-line" style={{ height: "40px" }} />
                </div>
              ))}
            </div>
          ) : shownTournaments.length === 0 ? (
            <div
              className="empty-note"
              style={{
                padding: "40px 20px",
                textAlign: "center",
                borderRadius: "14px",
              }}
            >
              <Trophy
                size={40}
                style={{ color: "var(--gold)", marginBottom: "12px" }}
              />
              <p
                style={{
                  fontSize: "16px",
                  color: "var(--text)",
                  margin: "0 0 8px",
                  fontWeight: 600,
                }}
              >
                Aucun tournoi disponible pour ce filtre.
              </p>
              <span style={{ fontSize: "13px", color: "var(--muted)" }}>
                Les tournois Sit & Go démarrent dès que la table est complète.
                Revenez vite !
              </span>
            </div>
          ) : (
            <div className="lobby-cards-grid">
              {shownTournaments.map((tItem) => {
                const fillPercent = Math.min(
                  100,
                  Math.round(
                    (tItem.registered_count / tItem.max_players) * 100,
                  ),
                );
                const isFull = tItem.registered_count >= tItem.max_players;

                return (
                  <div
                    key={tItem.id}
                    className="casino-table-card tournament-card"
                  >
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
                            {tItem.format === "sit_and_go"
                              ? "⚡ Sit & Go Turbo"
                              : "🏆 Tournoi MTT"}{" "}
                            · {tItem.game_type.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`table-card-live-pill ${tItem.status === "running" ? "running" : "waiting"}`}
                      >
                        <i />
                        <span>
                          {tItem.status === "running"
                            ? "En cours"
                            : "Inscriptions"}
                        </span>
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
                          <span
                            style={{
                              fontSize: "11px",
                              color: "var(--muted)",
                              display: "block",
                            }}
                          >
                            Buy-in
                          </span>
                          <strong style={{ fontSize: "14px", color: "#fff" }}>
                            {tItem.buy_in === 0
                              ? "Gratuit (Freeroll)"
                              : `${tItem.buy_in.toLocaleString("fr-FR")} Ar`}
                          </strong>
                        </div>
                        <div>
                          <span
                            style={{
                              fontSize: "11px",
                              color: "var(--muted)",
                              display: "block",
                            }}
                          >
                            Prize Pool Garanti
                          </span>
                          <strong
                            style={{ fontSize: "14px", color: "var(--gold)" }}
                          >
                            {tItem.prize_pool.toLocaleString("fr-FR")} Ar
                          </strong>
                        </div>
                        <div>
                          <span
                            style={{
                              fontSize: "11px",
                              color: "var(--muted)",
                              display: "block",
                            }}
                          >
                            Tapis de départ
                          </span>
                          <span
                            style={{
                              fontSize: "13px",
                              color: "#fff",
                              fontWeight: 600,
                            }}
                          >
                            {tItem.starting_chips.toLocaleString("fr-FR")}{" "}
                            jetons
                          </span>
                        </div>
                        <div>
                          <span
                            style={{
                              fontSize: "11px",
                              color: "var(--muted)",
                              display: "block",
                            }}
                          >
                            Niveau des blinds
                          </span>
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
                            <Timer size={13} /> {tItem.blind_interval_minutes}{" "}
                            min
                          </span>
                        </div>
                      </div>

                      <div style={{ marginTop: "10px" }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "12px",
                            marginBottom: "6px",
                          }}
                        >
                          <span style={{ color: "var(--muted)" }}>
                            Joueurs inscrits
                          </span>
                          <span style={{ color: "#fff", fontWeight: 600 }}>
                            {tItem.registered_count} / {tItem.max_players} (
                            {fillPercent}%)
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
                              background:
                                fillPercent >= 100
                                  ? "var(--accent)"
                                  : "var(--gold)",
                              borderRadius: "4px",
                              transition: "width 0.4s ease",
                            }}
                          />
                        </div>
                      </div>
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
                          <CheckCircle2
                            size={15}
                            style={{
                              display: "inline-block",
                              verticalAlign: "middle",
                              marginRight: "6px",
                            }}
                          />
                          Vous êtes inscrit
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
                          onClick={() =>
                            void handleRegisterTournament(tItem.id)
                          }
                          disabled={registeringTourney === tItem.id}
                        >
                          {registeringTourney === tItem.id ? (
                            <>
                              <Loader2 size={16} className="spin" />{" "}
                              Inscription...
                            </>
                          ) : (
                            <>
                              S'inscrire (
                              {tItem.buy_in === 0
                                ? "Gratuit"
                                : `${tItem.buy_in.toLocaleString("fr-FR")} Ar`}
                              ) <ArrowUpRight size={16} />
                            </>
                          )}
                        </button>
                      ) : (
                        <Link
                          to="/auth?next=/lobby"
                          className="button button-gold table-card-join-btn"
                        >
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
            <div
              key={i}
              className="casino-table-card"
              style={{ minHeight: "200px", opacity: 0.6 }}
            >
              <div
                className="skeleton-line short"
                style={{ height: "20px", marginBottom: "14px" }}
              />
              <div
                className="skeleton-line"
                style={{ height: "36px", marginBottom: "14px" }}
              />
              <div className="skeleton-line" style={{ height: "36px" }} />
            </div>
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div
          className="empty-note lobby-empty-state"
          style={{
            padding: "48px 24px",
            textAlign: "center",
            borderRadius: "16px",
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px dashed rgba(255, 255, 255, 0.12)",
          }}
        >
          <div
            style={{
              width: "52px",
              height: "52px",
              borderRadius: "50%",
              background: "rgba(211, 176, 107, 0.12)",
              color: "var(--gold)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 14px",
            }}
          >
            <Compass size={26} />
          </div>
          <p
            style={{
              fontSize: "16px",
              color: "#fff",
              margin: "0 0 8px",
              fontWeight: 700,
            }}
          >
            {query || stakeFilter !== "all"
              ? "Aucune table ne correspond à vos filtres actuels."
              : "Aucune table ouverte pour le moment."}
          </p>
          <p
            style={{
              fontSize: "13.5px",
              color: "var(--muted)",
              margin: "0 auto 20px",
              maxWidth: "460px",
              lineHeight: 1.5,
            }}
          >
            {query || stakeFilter !== "all"
              ? "Essayez de modifier votre recherche ou vos critères de mise."
              : "Les tables s'ouvrent dès qu'un joueur en crée une. Créez votre table en quelques clics ou lancez une recherche matchmaking !"}
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            {query || stakeFilter !== "all" ? (
              <button
                type="button"
                className="button button-secondary button-small"
                onClick={() => {
                  setQuery("");
                  setStakeFilter("all");
                }}
              >
                Réinitialiser les filtres
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="button button-gold button-small"
                  onClick={() => {
                    if (!accessToken) navigate("/auth?next=/lobby");
                    else {
                      setCreateTableGame(
                        ["belote", "domino", "ludo", "rami", "poker"].includes(filter)
                          ? (filter as "belote" | "domino" | "ludo" | "rami" | "poker")
                          : "belote",
                      );
                      setShowCreateTable(true);
                    }
                  }}
                >
                  <Plus size={15} /> Créer une table
                </button>
                <button
                  type="button"
                  className="button button-secondary button-small"
                  onClick={() => void findHuman()}
                >
                  <Zap size={14} /> Matchmaking {GAME_SUITS[matchmakingGame]?.label.split(" ")[0]}
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="lobby-cards-grid">
          {shown.map((table) => {
            const live = table.status === "running";
            const meta = GAME_SUITS[table.game_type] ?? {
              icon: "♠",
              color: "var(--gold)",
              label: table.game_type,
            };
            const isFull = table.player_count >= table.max_players;

            return (
              <div
                key={table.id}
                className={`casino-table-card game-${table.game_type}`}
                style={{ borderTop: `3px solid ${meta.color}` }}
              >
                <div className="table-card-header">
                  <div className="table-card-title-group">
                    <div
                      className="table-card-symbol"
                      style={{
                        background: `${meta.color}1a`,
                        color: meta.color,
                        border: `1px solid ${meta.color}33`,
                      }}
                    >
                      {meta.icon}
                    </div>
                    <div>
                      <h3>{table.name}</h3>
                      <span>
                        {meta.label.split(" ")[0]} · {table.max_players} Joueurs
                      </span>
                    </div>
                  </div>

                  <span
                    className={`table-card-live-pill ${live ? "running" : "waiting"}`}
                  >
                    <i />
                    <span>{live ? "En cours" : t("discovery.open")}</span>
                  </span>
                </div>

                <div className="table-card-body">
                  <div className="table-seats-row">
                    <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                      Sièges :
                    </span>
                    <strong style={{ fontSize: "12px", color: "#fff" }}>
                      {table.player_count} / {table.max_players} places occupées
                    </strong>
                  </div>

                  <div className="table-seats-dots">
                    {Array.from({ length: table.max_players }).map(
                      (_, sIdx) => (
                        <span
                          key={sIdx}
                          className={`seat-dot ${sIdx < table.player_count ? "occupied" : ""}`}
                          title={
                            sIdx < table.player_count
                              ? "Siège occupé"
                              : "Siège libre"
                          }
                        />
                      ),
                    )}
                  </div>

                  <div className="table-stakes-row">
                    <span style={{ color: "var(--muted)" }}>Enjeux :</span>
                    <span className="table-stakes-val">
                      {table.stakes || "Gratuit"}
                    </span>
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: "11px",
                        color: "#38bdf8",
                        background: "rgba(56, 189, 248, 0.12)",
                        border: "1px solid rgba(56, 189, 248, 0.25)",
                        padding: "2px 7px",
                        borderRadius: "5px",
                        fontWeight: 600,
                      }}
                      title="Durée de réflexion par tour"
                    >
                      ⏱️ {table.turn_duration || 15}s
                    </span>
                  </div>

                  {table.is_private && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "4px 8px",
                        borderRadius: "6px",
                        background: "rgba(168, 85, 247, 0.12)",
                        border: "1px solid rgba(168, 85, 247, 0.3)",
                        fontSize: "11px",
                        color: "#c084fc",
                        marginTop: "6px",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <Lock size={12} /> Salle Privée
                      </span>
                      {table.access_code && (
                        <span
                          style={{
                            fontWeight: 700,
                            letterSpacing: "1px",
                            cursor: "pointer",
                            background: "rgba(168, 85, 247, 0.25)",
                            padding: "1px 6px",
                            borderRadius: "4px",
                          }}
                          title="Cliquer pour copier le code"
                          onClick={(e) => {
                            e.stopPropagation();
                            void navigator.clipboard.writeText(
                              table.access_code || "",
                            );
                            alert(`Code copié : ${table.access_code}`);
                          }}
                        >
                          Code: {table.access_code} 📋
                        </span>
                      )}
                    </div>
                  )}

                  {table.club_name && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "11px",
                        color: "var(--gold)",
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
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
                  <button
                    type="button"
                    className={`button ${live || isFull ? "button-secondary" : "button-gold"} table-card-join-btn`}
                    onClick={() => join(table)}
                    disabled={
                      joining === table.id ||
                      table.status === "finished" ||
                      isFull
                    }
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

                  <div className="table-card-secondary-row">
                    <Link
                      to={`/game/${table.game_type}/${table.table_code}?mode=spectator`}
                      style={{
                        color: "var(--muted)",
                        textDecoration: "none",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <Eye size={13} /> Mode spectateur
                    </Link>

                    <button
                      type="button"
                      onClick={() => void launchSimulation(table.game_type)}
                      disabled={startingSimulation !== null}
                      style={{
                        border: 0,
                        background: "none",
                        color: "var(--muted)",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <Bot size={13} /> Démo IA
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Riche de Création de Table */}
      <CreateTableModal
        initialGameType={createTableGame}
        isOpen={showCreateTable}
        onClose={() => setShowCreateTable(false)}
        onSubmit={async (payload: CreateTablePayload) => {
          if (!accessToken) {
            navigate("/auth?next=/lobby");
            throw new Error("AUTH_REQUIRED");
          }
          const table = await createTable(accessToken, payload);
          setShowCreateTable(false);
          navigate(`/game/${table.game_type}/${table.table_code}`);
          return table;
        }}
      />

      {/* Modal Rejoindre une Table Privée par Code */}
      <JoinPrivateTableModal
        isOpen={showJoinPrivate}
        accessToken={accessToken || ""}
        onClose={() => setShowJoinPrivate(false)}
        onJoined={(table) => {
          setShowJoinPrivate(false);
          navigate(`/game/${table.game_type}/${table.table_code}`);
        }}
      />

      {error && (
        <div className="empty-note" style={{ color: "var(--red)" }}>
          <span>{error}</span>
        </div>
      )}

      <div
        className="empty-note"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          justifyContent: "center",
        }}
      >
        <Lock size={15} />
        <span>
          Les tables privées ne sont accessibles qu'avec leur lien d'invitation
          ou code unique.
        </span>
      </div>
    </div>
  );
}
