import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import {
  ChevronLeft,
  Copy,
  MessageCircle,
  Send,
  Settings2,
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
          sequence?: number;
          payload?: unknown;
        };
        if (typeof payload.sequence === "number") setSequence(payload.sequence);
        if (payload.type === "state") {
          const state = payload.payload as { players?: unknown } | undefined;
          if (state && Array.isArray(state.players))
            setPlayerCount(state.players.length);
          setConnectionState("connected");
        }
        if (payload.type === "action") {
          setLastAction("action reçue");
          if (
            payload.action === "fold" &&
            accessToken &&
            gameType &&
            engineTableId &&
            !settled.current
          ) {
            settled.current = true;
            void recordGameResult(
              accessToken,
              engineTableId,
              gameType,
              "loss",
            ).catch(() => {
              settled.current = false;
            });
          }
        }
        if (payload.type === "error")
          setGameConnectionError(
            typeof payload.payload === "string"
              ? payload.payload
              : "Connexion à la table impossible.",
          );
        if (payload.type === "state" || payload.type === "sync")
          setGameConnectionError("");
      } catch {
        setGameConnectionError("Réponse de table invalide.");
      }
    },
    [accessToken, engineTableId, gameType],
  );
  const handleSocketOpen = useCallback(
    (socket: WebSocket) => {
      setConnectionState("connected");
      if (engineTableId)
        socket.send(
          JSON.stringify({
            type: "join",
            table_id: engineTableId,
            payload: { game_type: gameType || "poker" },
            sequence: 0,
            timestamp: new Date().toISOString(),
          }),
        );
    },
    [engineTableId, gameType],
  );
  const handleSocketClose = useCallback(
    () => setConnectionState("offline"),
    [],
  );
  const { send } = useWebSocket(socketUrl, {
    enabled: Boolean(engineTableId && accessToken),
    onOpen: handleSocketOpen,
    onClose: handleSocketClose,
    onMessage: handleSocketMessage,
  });

  useEffect(() => {
    if (tableId && accessToken) setConnectionState("connecting");
  }, [accessToken, tableId]);

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
          if (accessToken) void joinTable(match.id, accessToken);
        } else setResolvedTableId(tableId);
      })
      .catch(() => setResolvedTableId(tableId));
  }, [accessToken, gameType, tableId]);

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

  const sendGameAction = (action: "fold" | "check" | "bet") => {
    if (!tableId || !accessToken) {
      setGameConnectionError("Connectez-vous pour jouer.");
      return;
    }
    setGameConnectionError("");
    send({
      type: "action",
      table_id: tableId,
      action,
      sequence,
      payload: action === "bet" ? { amount: 800 } : undefined,
      timestamp: new Date().toISOString(),
    });
  };

  return (
    <div className="game-room">
      <div className="game-room-head">
        <Link to="/lobby" className="back-link">
          <ChevronLeft size={17} /> Quitter la table
        </Link>
        <div>
          <strong>Table Émeraude</strong>
          <span>
            <i />{" "}
            {connectionState === "connected"
              ? "Connecté"
              : connectionState === "connecting"
                ? "Connexion…"
                : "Hors ligne"}{" "}
            · {isPoker ? "Texas Hold’em" : gameType}
          </span>
        </div>
        <button
          className="icon-button"
          onClick={inviteFriend}
          title="Inviter un ami"
        >
          <Users size={18} />
        </button>
      </div>
      {gameConnectionError && (
        <p className="form-error game-connection-error">
          {gameConnectionError}
        </p>
      )}
      {connectionState === "connected" && (
        <p className="secure-note game-sync-note">
          {playerCount} joueur{playerCount > 1 ? "s" : ""} synchronisé
          {playerCount > 1 ? "s" : ""} · séquence {sequence}
          {lastAction ? ` · ${lastAction}` : ""}
        </p>
      )}
      <div className={`felt-table ${isPoker ? "felt-green" : "felt-blue"}`}>
        <div className="table-brand">
          MDG <small>GAME CLUB</small>
        </div>
        <PlayerSeat pos="top" name="Tovo" chips="8 420" />
        <PlayerSeat pos="left" name="Rija" chips="12 100" />
        <PlayerSeat pos="right" name="Saholy" chips="6 750" />
        <div className="pot">
          POT <strong>2 400</strong>
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
            <strong>Vous</strong>
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
            <strong>À vous de jouer</strong>
            <span>Choisissez votre action</span>
          </div>
        </div>
        <div className="action-row">
          <button
            className="action-fold"
            onClick={() => sendGameAction("fold")}
          >
            Se coucher
          </button>
          <button
            className="action-check"
            onClick={() => sendGameAction("check")}
          >
            Checker
          </button>
          <button className="action-bet" onClick={() => sendGameAction("bet")}>
            Miser <strong>800</strong>
          </button>
        </div>
      </div>
      <div className="game-bottom">
        <div className="chat-box">
          <div className="chat-head">
            <span>
              <MessageCircle size={15} /> Chat de table
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
              <p className="muted">Aucun message pour le moment.</p>
            )}
          </div>
          <div className="chat-input">
            <input
              placeholder="Écrire un message…"
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
              <Copy size={14} /> Lien d’invitation copié
            </button>
          )}
        </div>
        <div className="game-info">
          <div>
            <Settings2 size={16} />
            <span>Paramètres de table</span>
          </div>
          <div>
            <span>Buy-in</span>
            <strong>10 000 jetons</strong>
          </div>
          <div>
            <span>Blinds</span>
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
