import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  Lock,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Users,
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
import { useGameStore } from "@stores/gameStore";
import { useTranslation } from "react-i18next";
import { trackEvent } from "@services/analytics";

export function LobbyPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [tables, setTables] = useState<GameTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState<string | null>(null);
  const accessToken = useGameStore((state) => state.accessToken);
  const navigate = useNavigate();
  const matchmakingGame = (filter === "all" ? "poker" : filter) as
    "poker" | "belote" | "rami";
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
  const [startingSimulation, setStartingSimulation] = useState<string | null>(null);
  const [tableForm, setTableForm] = useState({
    name: "",
    game_type: "poker" as "poker" | "belote" | "rami",
    max_players: 4,
    is_private: true,
  });

  useEffect(() => {
    setLoading(true);
    getTables(filter === "all" ? "Tous" : filter)
      .then((payload) => setTables(payload.results))
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [filter]);

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

  const shown = tables.filter((table) =>
    table.name.toLowerCase().includes(query.toLowerCase()),
  );
  const demoTable = tables.find((table) => table.game_type === matchmakingGame);
  const launchSimulation = async (gameType: "poker" | "belote" | "rami") => {
    if (!accessToken) {
      navigate("/auth");
      return;
    }
    setStartingSimulation(gameType);
    setMatchError("");
    const idempotencyKey = `lobby-${gameType}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      const session = await startBotSimulation(
        accessToken,
        gameType,
        "balanced",
        idempotencyKey,
      );
      void trackEvent("bot_simulation_started", {
        mode: session.mode,
        game_type: gameType,
        metadata: { session_id: session.session_id, source: "lobby" },
      });
      navigate(
        `/game/${session.game_type}/${session.table_code}?mode=demo_ai&session=${session.session_id}&table_id=${session.table_id}`,
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
    if (!accessToken) return;
    setJoining(table.id);
    try {
      const result = await joinTable(table.id, accessToken);
      setTables((current) =>
        current.map((item) => (item.id === table.id ? result.table : item)),
      );
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

  return (
    <div className="page-stack">
      <div className="page-title-row">
        <div>
          <span className="eyebrow">{t("lobby.open")}</span>
          <h1>
            {t("lobby.title")} <em>{t("lobby.live")}</em>
          </h1>
          <p>{t("lobby.choose")}</p>
        </div>
        <div className="page-title-actions">
          <Link to="/games/test" className="button button-outline">
            <Sparkles size={16} /> {t("lobby.testGames")}
          </Link>
          <button
            className="button button-outline"
            onClick={() => void launchSimulation(matchmakingGame)}
            disabled={startingSimulation !== null}
          >
            <Sparkles size={16} />
            {startingSimulation === matchmakingGame
              ? t("startingSimulation")
              : t("tryDemo")}
          </button>
          <button
            className="button button-gold"
            onClick={() => {
              if (!accessToken) navigate("/auth");
              else setShowCreateTable(true);
            }}
          >
            <Plus size={17} /> {t("games.create")}
          </button>
        </div>
      </div>
      <div className="lobby-toolbar">
        <div className="tabs">
          {[
            { key: "all", label: t("lobby.all") },
            { key: "poker", label: t("games.poker") },
            { key: "belote", label: t("games.belote") },
            { key: "rami", label: t("games.rami") },
          ].map((item) => (
            <button
              className={filter === item.key ? "active" : ""}
              onClick={() => setFilter(item.key)}
              key={item.key}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="search-box">
          <Search size={17} />
          <input
            aria-label={t("lobby.search")}
            placeholder={t("lobby.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button className="filter-button">
          <SlidersHorizontal size={17} /> <span>{t("lobby.filters")}</span>
        </button>
      </div>
      <div className="live-strip">
        <div className="live-strip-icon">
          <Users size={18} />
        </div>
        <div>
          <strong>
            {accessToken
              ? t("humanOnline", { count: matchStatus.human_online })
              : t("lobby.online")}
          </strong>
          <span>
            {matchStatus.ticket?.status === "queued"
              ? timedOut
                ? t("matchmakingTimedOut", { seconds: waitingSeconds })
                : t("searchingHuman", {
                    seconds: waitingSeconds,
                    estimate: matchStatus.estimated_wait_seconds,
                  })
              : t("lobby.fillFast")}
          </span>
        </div>
        <div className="matchmaking-actions">
          {matchStatus.ticket?.status === "queued" ? (
            <button className="text-link" onClick={() => void cancelSearch()}>
              {t("cancelSearch")}
            </button>
          ) : (
            <button
              className="button button-small"
              onClick={() => void findHuman()}
            >
              {t("findHuman")}
            </button>
          )}
        </div>
      </div>
      {matchError && (
        <div className="empty-note">
          <span>{matchError}</span>
        </div>
      )}
      {timedOut && matchStatus.ticket?.status === "queued" && (
        <div className="matchmaking-timeout" role="status">
          <div>
            <strong>{t("matchmakingTimeoutTitle")}</strong>
            <span>{t("matchmakingTimeoutBody")}</span>
          </div>
          <div className="matchmaking-timeout-actions">
            <button
              className="button button-small"
              onClick={() => void cancelSearch()}
            >
              {t("cancelSearch")}
            </button>
            {demoTable ? (
              <button
                className="button button-outline button-small"
                onClick={() =>
                  void launchSimulation(demoTable.game_type)
                }
                disabled={startingSimulation !== null}
              >
                <Sparkles size={14} /> {t("tryDemo")}
              </button>
            ) : (
              <Link
                className="button button-outline button-small"
                to="/games/test"
                onClick={() =>
                  void trackEvent("bot_fallback_started", {
                    game_type: matchmakingGame,
                  })
                }
              >
                <Sparkles size={14} /> {t("tryDemo")}
              </Link>
            )}
          </div>
        </div>
      )}
      {error && (
        <div className="empty-note">
          <span>{error}</span>
        </div>
      )}
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
      <div className="table-list">
        {loading ? (
          <div className="empty-note">
            <span>{t("lobby.loading")}</span>
          </div>
        ) : shown.length === 0 ? (
          <div className="empty-note">
            <span>{t("lobby.empty")}</span>
          </div>
        ) : (
          shown.map((table, index) => {
            const live = table.status === "running";
            return (
              <div className="table-row" key={table.id}>
                <div className={`table-symbol symbol-${table.game_type}`}>
                  {table.game_type === "poker"
                    ? "♠"
                    : table.game_type === "belote"
                      ? "♥"
                      : "♦"}
                </div>
                <div className="table-main">
                  <div>
                    <strong>{table.name}</strong>
                    {index === 0 && (
                      <span className="hot-tag">{t("lobby.popular")}</span>
                    )}
                  </div>
                  <span>{t(`games.${table.game_type}`)}</span>
                </div>
                <div className="table-cell">
                  <small>{t("lobby.stakes")}</small>
                  <strong>{table.stakes}</strong>
                </div>
                <div className="table-cell">
                  <small>{t("lobby.players")}</small>
                  <strong>
                    {table.player_count} / {table.max_players}
                  </strong>
                </div>
                <div className="table-status">
                  <span className={live ? "status-live" : ""}>
                    <i />
                    {live ? t("lobby.running") : t("lobby.openTable")}
                  </span>
                </div>
                <div className="table-actions">
                  {accessToken ? (
                    <button
                      className="join-button"
                      onClick={() => join(table)}
                      disabled={
                        joining === table.id ||
                        table.status === "finished" ||
                        table.player_count >= table.max_players
                      }
                    >
                      {joining === table.id
                        ? t("lobby.connecting")
                        : live
                          ? t("lobby.watch")
                          : t("games.join")}{" "}
                      <ArrowUpRight size={16} />
                    </button>
                  ) : (
                    <Link to="/auth" className="join-button">
                      {t("nav.login")} <ArrowUpRight size={16} />
                    </Link>
                  )}
                  <div className="table-secondary-actions">
                    <Link
                      to={`/game/${table.game_type}/${table.table_code}?mode=spectator`}
                      className="demo-link"
                    >
                      <Users size={13} /> {t("lobby.spectate")}
                    </Link>
                    <button
                      type="button"
                      className="demo-link"
                      onClick={() => void launchSimulation(table.game_type)}
                      disabled={startingSimulation !== null}
                    >
                      <Sparkles size={13} /> {t("lobby.testGames")}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="empty-note">
        <Lock size={16} />
        <span>{t("lobby.privateHint")}</span>
      </div>
    </div>
  );
}
