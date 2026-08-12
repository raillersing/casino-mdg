import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  Copy,
  MessageCircle,
  Send,
  Settings2,
  Sparkles,
  Users,
} from "lucide-react";
import {
  createTableInvitation,
  getTableChat,
  sendTableMessage,
  type ChatMessage,
} from "@services/social";
import { getTables, joinTable, recordGameResult } from "@services/games";
import { useGameStore } from "@stores/gameStore";
import { useWebSocket } from "@hooks/useWebSocket";

export function GamePage() {
  const { t } = useTranslation();
  const { gameType, tableId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const demoAi = searchParams.get("mode") === "demo_ai";
  const spectator = searchParams.get("mode") === "spectator";
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [socialError, setSocialError] = useState("");
  const [invite, setInvite] = useState("");
  const [sequence, setSequence] = useState(0);
  const [gameConnectionError, setGameConnectionError] = useState("");
  const [connectionState, setConnectionState] = useState<
    "offline" | "connecting" | "connected"
  >("offline");
  const [playerCount, setPlayerCount] = useState(0);
  const [lastAction, setLastAction] = useState("");
  const [demoActionCount, setDemoActionCount] = useState(0);
  const [resultMessage, setResultMessage] = useState("");
  const [gameState, setGameState] = useState<Record<string, unknown> | null>(
    null,
  );
  const [resolvedTableId, setResolvedTableId] = useState("");
  const settled = useRef(false);
  const accessToken = useGameStore((state) => state.accessToken);
  const isPoker = gameType === "poker";
  const engineTableId = resolvedTableId || tableId || "";
  const socketUrl = `${import.meta.env.VITE_WS_URL || "ws://localhost:8080"}/ws`;
  const handleSocketMessage = useCallback(
    (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as {
          type?: string;
          action?: string;
          outcome?: "win" | "loss" | "draw";
          amount?: number;
          sequence?: number;
          payload?: unknown;
        };
        if (typeof payload.sequence === "number") setSequence(payload.sequence);
        if (payload.type === "state") {
          const state = payload.payload as
            | { players?: unknown; game_state?: Record<string, unknown> }
            | undefined;
          if (state && Array.isArray(state.players))
            setPlayerCount(state.players.length);
          if (state?.game_state) setGameState(state.game_state);
          setConnectionState("connected");
        }
        if (payload.type === "action") {
          setLastAction("action reçue");
        }
        const resultPayload = (
          payload.payload && typeof payload.payload === "object"
            ? payload.payload
            : {}
        ) as {
          outcome?: "win" | "loss" | "draw";
          amount?: number;
          signature?: string;
        };
        const outcome = payload.outcome || resultPayload.outcome;
        const amount = payload.amount ?? resultPayload.amount ?? 0;
        const signature = resultPayload.signature;
        if (
          (payload.type === "result" || payload.action === "result") &&
          outcome &&
          accessToken &&
          gameType &&
          engineTableId &&
          !settled.current
        ) {
          settled.current = true;
          setResultMessage(t("game.resultSaving"));
          void recordGameResult(
            accessToken,
            engineTableId,
            gameType,
            outcome,
            amount,
            signature,
          )
            .then((result) =>
              setResultMessage(
                result.transaction_id
                  ? t("game.winCredited", { transaction: result.transaction_id })
                  : t("game.resultSaved"),
              ),
            )
            .catch((error: Error) => {
              settled.current = false;
              setResultMessage(error.message);
            });
        }
        if (payload.type === "error")
          setGameConnectionError(
            typeof payload.payload === "string"
              ? payload.payload
          : t("game.tableConnectionError"),
          );
        if (payload.type === "state" || payload.type === "sync")
          setGameConnectionError("");
      } catch {
        setGameConnectionError(t("game.invalidTableResponse"));
      }
    },
    [accessToken, engineTableId, gameType, t],
  );
  const handleSocketOpen = useCallback(
    (socket: WebSocket) => {
      setConnectionState("connected");
      if (engineTableId)
        socket.send(
          JSON.stringify({
            type: "join",
            table_id: engineTableId,
            payload: { game_type: gameType || "poker", role: spectator ? "spectator" : "player" },
            sequence: 0,
            timestamp: new Date().toISOString(),
          }),
        );
    },
    [engineTableId, gameType, spectator],
  );
  const handleSocketClose = useCallback(
    () => setConnectionState("offline"),
    [],
  );
  const { send } = useWebSocket(socketUrl, {
    enabled: Boolean(engineTableId && accessToken && !demoAi),
    onOpen: handleSocketOpen,
    onClose: handleSocketClose,
    onMessage: handleSocketMessage,
  });

  useEffect(() => {
    if (demoAi) setConnectionState("connected");
    else if (tableId && accessToken) setConnectionState("connecting");
  }, [accessToken, demoAi, tableId]);

  useEffect(() => {
    if (!engineTableId || !accessToken) return;
    const heartbeat = window.setInterval(() => {
      send({
        type: "heartbeat",
        table_id: engineTableId,
        sequence,
        timestamp: new Date().toISOString(),
      });
    }, 15000);
    return () => window.clearInterval(heartbeat);
  }, [accessToken, engineTableId, send, sequence]);

  useEffect(() => {
    if (!tableId) return;
    getTables(gameType)
      .then(({ results }) => {
        const match = results.find(
          (table) => table.table_code === tableId || table.id === tableId,
        );
        if (match) {
          setResolvedTableId(match.id);
          if (accessToken && !demoAi) void joinTable(match.id, accessToken);
        } else setResolvedTableId(tableId);
      })
      .catch(() => setResolvedTableId(tableId));
  }, [accessToken, demoAi, gameType, tableId]);

  useEffect(() => {
    if (!tableId || !accessToken) return;
    getTableChat(tableId, accessToken)
      .then((payload) => setChat(payload.results))
      .catch((error: Error) => setSocialError(error.message));
  }, [accessToken, tableId]);

  const sendMessage = async () => {
    if (!tableId || !accessToken || !message.trim()) return;
    try {
      const sent = await sendTableMessage(tableId, message.trim(), accessToken);
      setChat((current) => [...current, sent]);
      setMessage("");
      setSocialError("");
    } catch (error) {
      setSocialError(error instanceof Error ? error.message : t("app.error"));
    }
  };

  const inviteFriend = async () => {
    if (!tableId || !accessToken) return;
    try {
      const result = await createTableInvitation(tableId, accessToken);
      const link = `${window.location.origin}/game/${gameType}/${tableId}?invite=${result.token}`;
      await navigator.clipboard?.writeText(link);
      setInvite(link);
      setSocialError("");
    } catch (error) {
      setSocialError(error instanceof Error ? error.message : t("app.error"));
    }
  };

  const sendGameAction = (action: string, actionPayload?: unknown) => {
    if (demoAi) {
      setConnectionState("connected");
      setLastAction(t("game.demoActionReceived"));
      setDemoActionCount((count) => count + 1);
      return;
    }
    if (spectator) {
      setGameConnectionError(t("spectatorReadOnly"));
      return;
    }
    if (!tableId || !accessToken) {
      setGameConnectionError(t("auth.login"));
      return;
    }
    setGameConnectionError("");
    send({
      type: "action",
      table_id: engineTableId,
      action,
      sequence,
      payload:
        actionPayload ?? (action === "bet" ? { amount: 800 } : undefined),
      timestamp: new Date().toISOString(),
    });
  };

  const leaveTable = () => {
    if (engineTableId && accessToken && !demoAi && !spectator) {
      send({ type: "leave", table_id: engineTableId, sequence, timestamp: new Date().toISOString() });
    }
    navigate("/lobby");
  };

  return (
    <div className="game-room">
      <div className="game-room-head">
        <Link to="/lobby" className="back-link" onClick={(event) => { event.preventDefault(); leaveTable(); }}>
          <ChevronLeft size={17} /> {t("game.leaveTable")}
        </Link>
        <div>
          <strong>{t("game.tableName")}</strong>
          <span>
            <i />{" "}
            {connectionState === "connected"
              ? t("game.connected")
              : connectionState === "connecting"
                ? t("game.connecting")
                : t("game.offline")}{" "}
            · {isPoker ? t("games.poker") : t(`games.${gameType}`)}
          </span>
        </div>
        <button
          className="icon-button"
          onClick={inviteFriend}
          title={t("game.inviteFriend")}
        >
          <Users size={18} />
        </button>
      </div>
      {demoAi && <div className="demo-mode-banner"><div><strong><Sparkles size={15}/> {t("game.demoTitle")}</strong><span>{t("game.demoBody")}</span></div><Link to="/lobby" className="text-link">{t("game.findHumans")} <ChevronLeft size={14}/></Link></div>}
      {spectator && <div className="spectator-mode-banner"><div><strong>{t("spectatorTitle")}</strong><span>{t("spectatorBody")}</span></div><Link to="/lobby" className="text-link">{t("leaveSpectator")} <ChevronLeft size={14}/></Link></div>}
      {gameConnectionError && (
        <p className="form-error game-connection-error">
          {gameConnectionError}
        </p>
      )}
      {demoAi && <p className="secure-note game-sync-note">{t("game.demoProgress", { count: demoActionCount })}</p>}
      {connectionState === "connected" && !demoAi && (
        <p className="secure-note game-sync-note">
          {t("game.syncedPlayers", { count: playerCount })} · {t("game.sequence")} {sequence}
          {lastAction ? ` · ${lastAction}` : ""}
        </p>
      )}
      {resultMessage && (
        <p className="secure-note game-sync-note">{resultMessage}</p>
      )}
      {gameState && gameType !== "poker" && (
        <GameStateSummary gameType={gameType || ""} state={gameState} />
      )}
      <div className={`felt-table ${isPoker ? "felt-green" : "felt-blue"}`}>
        <div className="table-brand">
          MDG <small>GAME CLUB</small>
        </div>
        <PlayerSeat pos="top" name={demoAi ? "IA Démo · Tovo" : "Tovo"} chips="8 420" />
        <PlayerSeat pos="left" name={demoAi ? "IA Démo · Rija" : "Rija"} chips="12 100" />
        <PlayerSeat pos="right" name={demoAi ? "IA Démo · Saholy" : "Saholy"} chips="6 750" />
        <div className="pot">
            {t("game.pot")} <strong>2 400</strong>
        </div>
        <div className="community-cards">
          <PlayingCard value="A" suit="♠" />
          <PlayingCard value="K" suit="♥" red />
          <PlayingCard value="8" suit="♦" red />
          <PlayingCard value="7" suit="♣" />
          <PlayingCard value="?" suit="" hidden />
        </div>
        <div className="you-seat">
          <div className="you-avatar">M</div>
          <div>
            <strong>{t("game.you")}</strong>
            <span>12 450 jetons</span>
          </div>
        </div>
        <div className="hole-cards">
          <PlayingCard
            value="A"
            suit="♥"
            red
            selected={selected === "a"}
            onClick={() => setSelected("a")}
          />
          <PlayingCard
            value="J"
            suit="♣"
            selected={selected === "j"}
            onClick={() => setSelected("j")}
          />
        </div>
      </div>
      <div className="game-controls">
        <div className="turn-state">
          <span className="timer">00:18</span>
          <div>
            <strong>{t("game.yourTurnAction")}</strong>
            <span>{t("game.chooseAction")}</span>
          </div>
        </div>
        {spectator ? <div className="secure-note game-sync-note">{t("spectatorReadOnly")}</div> : isPoker ? (
          <div className="action-row">
            <button
              className="action-fold"
              onClick={() => sendGameAction("fold")}
            >
              {t("game.fold")}
            </button>
            <button
              className="action-check"
              onClick={() => sendGameAction("check")}
            >
              {t("game.check")}
            </button>
            <button
              className="action-bet"
              onClick={() => sendGameAction("bet")}
            >
              {t("game.bet")} <strong>800</strong>
            </button>
          </div>
        ) : (
          <GameSpecificControls
            gameType={gameType || ""}
            state={gameState}
            onAction={sendGameAction}
          />
        )}
      </div>
      <div className="game-bottom">
        <div className="chat-box">
          <div className="chat-head">
            <span>
              <MessageCircle size={15} /> {t("game.tableChat")}
            </span>
            <Users size={15} />
          </div>
          <div className="chat-messages">
            {chat.length ? (
              chat.map((item) => (
                <p key={item.id}>
                  <b>{item.author}</b> {item.body}
                </p>
              ))
            ) : (
              <p className="muted">{t("game.noMessages")}</p>
            )}
          </div>
          <div className="chat-input">
            <input
              placeholder={t("game.messagePlaceholder")}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void sendMessage();
              }}
            />
            <button onClick={() => void sendMessage()}>
              <Send size={15} />
            </button>
          </div>
          {socialError && <small className="form-error">{socialError}</small>}
          {invite && (
            <button
              className="text-link"
              onClick={() => void navigator.clipboard?.writeText(invite)}
            >
              <Copy size={14} /> {t("game.invitationCopied")}
            </button>
          )}
        </div>
        <div className="game-info">
          <div>
            <Settings2 size={16} />
            <span>{t("game.tableSettings")}</span>
          </div>
          <div>
            <span>{t("game.buyIn")}</span>
            <strong>10 000 jetons</strong>
          </div>
          <div>
            <span>{t("game.blinds")}</span>
            <strong>100 / 200</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
function PlayerSeat({
  pos,
  name,
  chips,
}: {
  pos: string;
  name: string;
  chips: string;
}) {
  return (
    <div className={`player-seat seat-${pos}`}>
      <div className="seat-avatar">{name[0]}</div>
      <div>
        <strong>{name}</strong>
        <span>{chips}</span>
      </div>
    </div>
  );
}
function PlayingCard({
  value,
  suit,
  red,
  hidden,
  selected,
  onClick,
}: {
  value: string;
  suit: string;
  red?: boolean;
  hidden?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`playing-card ${red ? "red" : ""} ${hidden ? "hidden-card" : ""} ${selected ? "selected" : ""}`}
    >
      <span>{hidden ? "?" : value}</span>
      <b>{hidden ? "✦" : suit}</b>
    </button>
  );
}

function GameStateSummary({
  gameType,
  state,
}: {
  gameType: string;
  state: Record<string, unknown>;
}) {
  const { t } = useTranslation();
  const players = Array.isArray(state.players) ? state.players : [];
  if (gameType === "belote") {
    const points = Array.isArray(state.team_points)
      ? state.team_points
      : [0, 0];
    return (
      <div className="secure-note game-sync-note">
        <strong>{t("games.belote")}</strong> · {t("game.trump")} : {String(state.trump ?? "—")} · {t("game.team")} 1 : {String(points[0])} · {t("game.team")} 2 : {String(points[1])} · {t("game.trick")} :{" "}
        {Array.isArray(state.trick) ? state.trick.length : 0}/4
      </div>
    );
  }
  return (
    <div className="secure-note game-sync-note">
      <strong>{t("games.rami")}</strong> · {t("game.activePlayer")} : {String(state.current ?? "—")} ·
      {t("game.discard")} : {Array.isArray(state.discard) ? state.discard.length : 0} ·
      {t("lobby.players")} : {players.length}
    </div>
  );
}

function GameSpecificControls({
  gameType,
  state,
  onAction,
}: {
  gameType: string;
  state: Record<string, unknown> | null;
  onAction: (action: string, payload?: unknown) => void;
}) {
  const { t } = useTranslation();
  const players =
    state && Array.isArray(state.players)
      ? (state.players as Array<Record<string, unknown>>)
      : [];
  const currentHand = (players.find((player) => Array.isArray(player.hand))
    ?.hand || []) as Array<{ suit: number; rank: number }>;
  if (gameType === "belote")
    return (
      <div className="action-row">
        {currentHand.map((card) => (
          <button
            className="action-check"
            key={`${card.suit}-${card.rank}`}
            onClick={() => onAction("play_card", { card })}
          >
            {t("game.play")} {card.rank}♣
          </button>
        ))}
      </div>
    );
  return (
    <div className="action-row">
      <button className="action-check" onClick={() => onAction("draw")}>
        {t("game.draw")}
      </button>
      {currentHand.map((card) => (
        <button
          className="action-bet"
          key={`${card.suit}-${card.rank}`}
          onClick={() => onAction("discard", { card })}
        >
          {t("game.discardCard")} {card.rank}
        </button>
      ))}
    </div>
  );
}
