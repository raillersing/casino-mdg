import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
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
  acceptTableInvitation,
  getTableChat,
  sendTableMessage,
  type ChatMessage,
} from "@services/social";
import { getTables, joinTable, recordGameResult } from "@services/games";
import { useGameStore } from "@stores/gameStore";
import { useWebSocket } from "@hooks/useWebSocket";
import { trackEvent } from "@services/analytics";

type TableAction = {
  id: string;
  playerId: string;
  action: string;
  amount?: number;
  phase?: string;
  potAfter?: number;
};

export function GamePage() {
  const { t } = useTranslation();
  const { gameType, tableId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const demoAi = searchParams.get("mode") === "demo_ai";
  const demoTableId = searchParams.get("table_id") || "";
  const spectator = searchParams.get("mode") === "spectator";
  const invitation = searchParams.get("invite");
  const [message, setMessage] = useState("");
  const [wager, setWager] = useState(800);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [socialError, setSocialError] = useState("");
  const [invitationState, setInvitationState] = useState("");
  const [invite, setInvite] = useState("");
  const [sequence, setSequence] = useState(0);
  const [gameConnectionError, setGameConnectionError] = useState("");
  const [connectionState, setConnectionState] = useState<
    "offline" | "connecting" | "reconnecting" | "connected"
  >("offline");
  const [playerCount, setPlayerCount] = useState(0);
  const [lastAction, setLastAction] = useState("");
  const [lastActionPlayer, setLastActionPlayer] = useState("");
  const [actionLog, setActionLog] = useState<TableAction[]>([]);
  const [showActionHistory, setShowActionHistory] = useState(false);
  const [thinkingPlayer, setThinkingPlayer] = useState("");
  const [visibleCommunityCount, setVisibleCommunityCount] = useState(0);
  const [visibleHoleCardCount, setVisibleHoleCardCount] = useState(0);
  const [dealPulse, setDealPulse] = useState(0);
  const [potPulse, setPotPulse] = useState(0);
  const [chipBursts, setChipBursts] = useState(0);
  const [turnSeconds, setTurnSeconds] = useState(18);
  const [showdownRanks, setShowdownRanks] = useState<Record<string, string>>(
    {},
  );
  const [payouts, setPayouts] = useState<Record<string, number>>({});
  const [potAwarded, setPotAwarded] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(
    () => localStorage.getItem("mdg-poker-sound") !== "off",
  );
  const [motionEnabled, setMotionEnabled] = useState(
    () => localStorage.getItem("mdg-poker-motion") !== "off",
  );
  const [emote, setEmote] = useState("");
  const [tablePlayers, setTablePlayers] = useState<
    Array<Record<string, unknown>>
  >([]);
  const [resultMessage, setResultMessage] = useState("");
  const [gameState, setGameState] = useState<Record<string, unknown> | null>(
    null,
  );
  const pots = Array.isArray(gameState?.pots)
    ? (gameState.pots as Array<{ amount?: number; eligible?: string[] }>)
    : [];
  const [resolvedTableId, setResolvedTableId] = useState("");
  const resolvedTableIdRef = useRef("");
  const sequenceRef = useRef(0);
  const previousPokerPhase = useRef<string | null>(null);
  const settled = useRef(false);
  const invitationHandled = useRef(false);
  const dealTimers = useRef<number[]>([]);
  const holeDealTimers = useRef<number[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const accessToken = useGameStore((state) => state.accessToken);
  const userId =
    useGameStore((state) => state.user?.id || "") || tokenSubject(accessToken);
  const isPoker = gameType === "poker";
  // A public table code must be resolved to the engine UUID before opening
  // the socket. Demo sessions already provide their engine table id.
  const engineTableId =
    demoTableId || resolvedTableId || (demoAi ? tableId : "") || "";
  const statePlayers =
    gameState && Array.isArray(gameState.players)
      ? (gameState.players as Array<Record<string, unknown>>)
      : [];
  const currentPlayerIndex = statePlayers.findIndex(
    (player) => String(player.id || "") === userId,
  );
  const isMyTurn =
    Boolean(gameState) &&
    currentPlayerIndex >= 0 &&
    Number(gameState?.current) === currentPlayerIndex;
  const myPokerPlayer = statePlayers.find(
    (player) => String(player.id || "") === userId,
  );
  const highestBet = statePlayers.reduce(
    (highest, player) => Math.max(highest, Number(player.bet || 0)),
    0,
  );
  const myBet = Number(myPokerPlayer?.bet || 0);
  const facingBet = highestBet > myBet;
  const communityCards = Array.isArray(gameState?.community)
    ? (gameState.community as Array<{ rank: number; suit: number }>)
    : [];
  const holeCards = Array.isArray(myPokerPlayer?.cards)
    ? (myPokerPlayer.cards as Array<{ rank: number; suit: number }>)
    : [];
  const renderedHoleCards = holeCards.slice(0, visibleHoleCardCount);
  const pokerWinners = Array.isArray(gameState?.winners)
    ? (gameState.winners as string[])
    : [];
  const revealedCards =
    gameState?.revealed_cards && typeof gameState.revealed_cards === "object"
      ? (gameState.revealed_cards as Record<
          string,
          Array<{ rank: number; suit: number }>
        >)
      : {};
  const revealedPlayers = Object.entries(revealedCards);
  const isPokerShowdown = isPoker && gameState?.phase === "showdown";
  const renderedCommunityCards = communityCards.slice(0, visibleCommunityCount);
  const winnerNames = pokerWinners.map((winnerId) => {
    const player = tablePlayers.find(
      (item) => String(item.id || "") === winnerId,
    );
    return String(
      player?.name || (winnerId === userId ? t("game.you") : winnerId),
    );
  });
  const currentPlayerId =
    currentPlayerIndex >= 0
      ? String(statePlayers[currentPlayerIndex]?.id || "")
      : "";
  const nameForPlayer = (playerId: string) => {
    const player = tablePlayers.find(
      (item) => String(item.id || "") === playerId,
    );
    return String(
      player?.name || (playerId === userId ? t("game.you") : playerId),
    );
  };
  const socketUrl =
    import.meta.env.VITE_WS_URL ||
    `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;

  const playFeedback = useCallback(
    (kind: "deal" | "chip" | "win") => {
      if (
        !soundEnabled ||
        typeof window === "undefined" ||
        !window.AudioContext
      )
        return;
      const context =
        audioContextRef.current ||
        (audioContextRef.current = new AudioContext());
      if (context.state === "suspended") void context.resume();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const frequencies = { deal: 520, chip: 180, win: 760 };
      oscillator.frequency.value = frequencies[kind];
      oscillator.type = kind === "chip" ? "triangle" : "sine";
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.035, context.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        context.currentTime + 0.13,
      );
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.14);
    },
    [soundEnabled],
  );

  const updatePreference = (key: "sound" | "motion", enabled: boolean) => {
    localStorage.setItem(`mdg-poker-${key}`, enabled ? "on" : "off");
    if (key === "sound") setSoundEnabled(enabled);
    else setMotionEnabled(enabled);
  };

  const sendEmote = (value: string) => {
    setEmote(value);
    window.setTimeout(() => setEmote(""), 1800);
  };

  useEffect(() => {
    if (!invitation || !accessToken || invitationHandled.current) return;
    invitationHandled.current = true;
    setInvitationState("Invitation en cours de validation…");
    void acceptTableInvitation(invitation, accessToken)
      .then((result) => {
        void trackEvent("invite_joined", {
          game_type: gameType,
          metadata: { table_id: result.table_id, created: result.created },
        });
        setInvitationState("Invitation acceptée. Vous rejoignez la table.");
        if (result.table_code && result.table_code !== tableId)
          navigate(`/game/${gameType}/${result.table_code}`);
      })
      .catch((error: Error) => setInvitationState(error.message));
  }, [accessToken, gameType, invitation, navigate, tableId]);
  const handleSocketMessage = useCallback(
    (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as {
          type?: string;
          action?: string;
          player_id?: string;
          outcome?: "win" | "loss" | "draw";
          amount?: number;
          sequence?: number;
          payload?: unknown;
        };
        if (typeof payload.sequence === "number") {
          sequenceRef.current = payload.sequence;
          setSequence(payload.sequence);
        }
        if (payload.type === "state") {
          const state = payload.payload as
            | { players?: unknown; game_state?: Record<string, unknown> }
            | undefined;
          const publicPlayers =
            state && Array.isArray(state.players)
              ? (state.players as Array<Record<string, unknown>>)
              : state?.players && typeof state.players === "object"
                ? Object.values(
                    state.players as Record<string, Record<string, unknown>>,
                  )
                : [];
          if (publicPlayers.length) {
            setPlayerCount(publicPlayers.length);
            setTablePlayers(publicPlayers);
          }
          if (state?.game_state) {
            const phase = String(state.game_state.phase || "");
            setGameState(state.game_state);
            if (phase === "showdown") {
              setShowdownRanks(
                (state.game_state.hand_ranks as Record<string, string>) || {},
              );
              setPayouts(
                (state.game_state.payouts as Record<string, number>) || {},
              );
            }
            if (
              phase === "preflop" &&
              previousPokerPhase.current === "showdown"
            ) {
              setShowdownRanks({});
              setPayouts({});
              setPotAwarded(false);
            }
            const nextHoleLength = Array.isArray(
              (
                state.game_state.players as
                  Array<Record<string, unknown>> | undefined
              )?.find((player) => String(player.id || "") === userId)?.cards,
            )
              ? (
                  (
                    state.game_state.players as Array<Record<string, unknown>>
                  ).find((player) => String(player.id || "") === userId)
                    ?.cards as unknown[]
                ).length
              : 0;
            if (
              previousPokerPhase.current === "showdown" &&
              phase === "preflop"
            ) {
              dealTimers.current.forEach((timer) => window.clearTimeout(timer));
              dealTimers.current = [];
              setVisibleCommunityCount(0);
              holeDealTimers.current.forEach((timer) =>
                window.clearTimeout(timer),
              );
              holeDealTimers.current = [];
              setVisibleHoleCardCount(0);
            } else if (previousPokerPhase.current === null) {
              setVisibleCommunityCount(0);
              setVisibleHoleCardCount(0);
              for (let index = 0; index < nextHoleLength; index += 1) {
                const timer = window.setTimeout(
                  () => {
                    setVisibleHoleCardCount(index + 1);
                  },
                  300 * (index + 1),
                );
                holeDealTimers.current.push(timer);
              }
            } else if (
              phase === "preflop" &&
              nextHoleLength > visibleHoleCardCount
            ) {
              holeDealTimers.current.forEach((timer) =>
                window.clearTimeout(timer),
              );
              holeDealTimers.current = [];
              setVisibleHoleCardCount(0);
              for (let index = 0; index < nextHoleLength; index += 1) {
                const timer = window.setTimeout(
                  () => {
                    setVisibleHoleCardCount(index + 1);
                  },
                  300 * (index + 1),
                );
                holeDealTimers.current.push(timer);
              }
            }
            if (phase !== "showdown") {
              settled.current = false;
              if (
                phase === "preflop" &&
                previousPokerPhase.current !== "preflop"
              ) {
                setActionLog([]);
                setShowActionHistory(false);
              }
            }
            previousPokerPhase.current = phase;
          }
          if (
            demoAi &&
            state?.game_state &&
            (state.game_state.finished === true ||
              state.game_state.phase === "showdown")
          )
            void trackEvent("bot_simulation_completed", {
              mode: "DEMO_AI",
              game_type: gameType,
            });
          setConnectionState("connected");
        }
        if (payload.type === "sync" && Array.isArray(payload.payload)) {
          const missed = payload.payload as Array<{
            action?: string;
            player_id?: string;
            sequence?: number;
            payload?: { amount?: number; phase?: string; pot_after?: number };
          }>;
          setActionLog((current) => {
            const existing = new Set(current.map((entry) => entry.id));
            const replayed = missed
              .filter(
                (event) => !["result", "thinking"].includes(event.action || ""),
              )
              .map((event) => ({
                id: `${event.sequence || Date.now()}-${event.player_id || "table"}`,
                playerId: event.player_id || "",
                action: event.action || "action",
                amount: event.payload?.amount,
                phase: event.payload?.phase,
                potAfter: event.payload?.pot_after,
              }))
              .filter((entry) => !existing.has(entry.id));
            return [...current, ...replayed].slice(-8);
          });
          setLastAction("Reprise de la table");
          setGameConnectionError("");
        }
        if (payload.type === "action") {
          const details = (
            payload.payload && typeof payload.payload === "object"
              ? payload.payload
              : {}
          ) as {
            action?: string;
            amount?: number;
            phase?: string;
            pot_after?: number;
            winners?: string[];
            pot?: number;
            community?: Array<{ rank: number; suit: number }>;
            hand_ranks?: Record<string, string>;
            payouts?: Record<string, number>;
          };
          const action = payload.action || details.action || "action";
          const presentationOnly = [
            "private_card_dealt",
            "hand_started",
            "dealer_button_moved",
            "blind_posted",
          ].includes(action);
          if (action === "private_card_dealt" && payload.player_id === userId) {
            const index = Number(
              (details as { index?: number }).index ?? visibleHoleCardCount,
            );
            setVisibleHoleCardCount((current) => Math.max(current, index + 1));
            setDealPulse((value) => value + 1);
            playFeedback("deal");
          }
          if (action === "showdown") {
            setShowdownRanks(details.hand_ranks || {});
            setPayouts(details.payouts || {});
            setPotAwarded(false);
            window.setTimeout(() => setPotAwarded(true), 900);
          }
          if (action === "new_hand") {
            setShowdownRanks({});
            setPayouts({});
            setPotAwarded(false);
          }
          if (action === "thinking") {
            setThinkingPlayer(payload.player_id || "");
          } else {
            setThinkingPlayer("");
            setLastAction(actionLabel(action));
            setLastActionPlayer(payload.player_id || "");
            if (action === "street_changed") {
              const dealtCount = Array.isArray(details.community)
                ? details.community.length
                : 0;
              const startCount = Math.min(visibleCommunityCount, dealtCount);
              dealTimers.current.forEach((timer) => window.clearTimeout(timer));
              dealTimers.current = [];
              setVisibleCommunityCount(startCount);
              setDealPulse((value) => value + 1);
              for (let index = startCount; index < dealtCount; index += 1) {
                const timer = window.setTimeout(
                  () => {
                    setVisibleCommunityCount(index + 1);
                  },
                  260 * (index - startCount + 1),
                );
                dealTimers.current.push(timer);
              }
            }
            if (["bet", "raise", "call", "all_in"].includes(action)) {
              setPotPulse((value) => value + 1);
              setChipBursts((value) => value + 1);
              playFeedback("chip");
            }
            if (action === "showdown") playFeedback("win");
            if (action !== "result" && !presentationOnly) {
              setActionLog((current) => [
                ...current.slice(-7),
                {
                  id: `${payload.sequence || Date.now()}-${payload.player_id || "table"}`,
                  playerId: payload.player_id || "",
                  action,
                  amount: details.amount,
                  phase: details.phase,
                  potAfter: details.pot_after ?? details.pot,
                },
              ]);
            }
          }
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
          payload.player_id === userId &&
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
                  ? t("game.winCredited", {
                      transaction: result.transaction_id,
                    })
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
    [
      accessToken,
      demoAi,
      engineTableId,
      gameType,
      t,
      userId,
      visibleCommunityCount,
      visibleHoleCardCount,
      playFeedback,
    ],
  );

  useEffect(() => {
    return () => {
      dealTimers.current.forEach((timer) => window.clearTimeout(timer));
      holeDealTimers.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    setTurnSeconds(isMyTurn ? 18 : 12);
    if (!isMyTurn || !gameState || isPokerShowdown) return;
    const timer = window.setInterval(() => {
      setTurnSeconds((seconds) => (seconds <= 1 ? 0 : seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [gameState, isMyTurn, isPokerShowdown, currentPlayerId]);
  const handleSocketOpen = useCallback(
    (socket: WebSocket) => {
      setConnectionState("connected");
      if (engineTableId)
        socket.send(
          JSON.stringify({
            type: "join",
            table_id: engineTableId,
            payload: {
              game_type: gameType || "poker",
              role: spectator ? "spectator" : "player",
            },
            sequence: sequenceRef.current,
            timestamp: new Date().toISOString(),
          }),
        );
      if (engineTableId)
        socket.send(
          JSON.stringify({
            type: "sync",
            table_id: engineTableId,
            sequence: sequenceRef.current,
            timestamp: new Date().toISOString(),
          }),
        );
    },
    [engineTableId, gameType, spectator],
  );
  const handleConnectionStateChange = useCallback(
    (state: "connecting" | "connected" | "reconnecting" | "closed") => {
      setConnectionState(state === "closed" ? "offline" : state);
    },
    [],
  );
  const { ws, send } = useWebSocket(socketUrl, {
    enabled: Boolean(engineTableId && accessToken),
    onOpen: handleSocketOpen,
    onConnectionStateChange: handleConnectionStateChange,
    onMessage: handleSocketMessage,
  });

  useEffect(() => {
    if (tableId && accessToken) setConnectionState("connecting");
    else if (demoAi) setConnectionState("offline");
  }, [accessToken, demoAi, tableId]);

  useEffect(() => {
    if (demoAi)
      void trackEvent("demo_connected", {
        mode: "DEMO_AI",
        game_type: gameType,
      });
  }, [demoAi, gameType]);

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
    if (!tableId || demoTableId) return;
    getTables(gameType)
      .then(({ results }) => {
        const match = results.find(
          (table) => table.table_code === tableId || table.id === tableId,
        );
        if (match) {
          resolvedTableIdRef.current = match.id;
          setResolvedTableId(match.id);
          if (accessToken && !demoAi) void joinTable(match.id, accessToken);
        } else {
          resolvedTableIdRef.current = tableId;
          setResolvedTableId(tableId);
        }
      })
      .catch(() => {
        resolvedTableIdRef.current = tableId;
        setResolvedTableId(tableId);
      });
  }, [accessToken, demoAi, demoTableId, gameType, tableId]);

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
      void trackEvent("invite_sent", {
        game_type: gameType,
        metadata: { table_id: tableId },
      });
      setInvite(link);
      setSocialError("");
    } catch (error) {
      setSocialError(error instanceof Error ? error.message : t("app.error"));
    }
  };

  const sendGameAction = (action: string, actionPayload?: unknown) => {
    if (spectator) {
      setGameConnectionError(t("spectatorReadOnly"));
      return;
    }
    if (!tableId || !accessToken) {
      setGameConnectionError(t("auth.login"));
      return;
    }
    setGameConnectionError("");
    const eventId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    send({
      type: "action",
      table_id: engineTableId,
      action,
      event_id: eventId,
      sequence,
      payload:
        actionPayload ?? (action === "bet" ? { amount: 800 } : undefined),
      timestamp: new Date().toISOString(),
    });
  };

  const leaveTable = () => {
    const leaveTableId = resolvedTableIdRef.current || engineTableId;
    if (leaveTableId && !demoAi && !spectator) {
      const leaveMessage = {
        type: "leave",
        table_id: leaveTableId,
        sequence,
        timestamp: new Date().toISOString(),
      };
      const serialized = JSON.stringify(leaveMessage);
      send(leaveMessage);
      const flushLeave = (attempt = 0) => {
        if (ws.current?.readyState === WebSocket.OPEN) {
          ws.current.send(serialized);
          return;
        }
        if (attempt < 4) window.setTimeout(() => flushLeave(attempt + 1), 25);
      };
      flushLeave();
    }
    window.setTimeout(() => navigate("/lobby"), 150);
  };

  return (
    <div className="game-room">
      <div className="game-room-head">
        <Link
          to="/lobby"
          className="back-link"
          onClick={(event) => {
            event.preventDefault();
            leaveTable();
          }}
        >
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
          aria-label={t("game.inviteFriend")}
        >
          <Users size={18} />
        </button>
      </div>
      {demoAi && (
        <div className="demo-mode-banner">
          <div>
            <strong>
              <Sparkles size={15} /> {t("game.demoTitle")}
            </strong>
            <span>{t("game.demoBody")}</span>
          </div>
          <Link to="/lobby" className="text-link">
            {t("game.findHumans")} <ChevronLeft size={14} />
          </Link>
        </div>
      )}
      {spectator && (
        <div className="spectator-mode-banner">
          <div>
            <strong>{t("spectatorTitle")}</strong>
            <span>{t("spectatorBody")}</span>
          </div>
          <Link to="/lobby" className="text-link">
            {t("leaveSpectator")} <ChevronLeft size={14} />
          </Link>
        </div>
      )}
      {gameConnectionError && (
        <p className="form-error game-connection-error">
          {gameConnectionError}
        </p>
      )}
      {invitation && !accessToken && (
        <p className="secure-note game-sync-note">
          Connectez-vous pour accepter cette invitation.{" "}
          <Link
            to={`/auth?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`}
            className="text-link"
          >
            Se connecter
          </Link>
        </p>
      )}
      {invitationState && (
        <p className="secure-note game-sync-note">{invitationState}</p>
      )}
      {connectionState === "connected" && (
        <p className="secure-note game-sync-note">
          {t("game.syncedPlayers", { count: playerCount })} ·{" "}
          {t("game.sequence")} {sequence}
          {lastAction ? ` · ${lastAction}` : ""}
        </p>
      )}
      {connectionState === "reconnecting" && (
        <p className="secure-note game-sync-note">{t("game.reconnecting")}</p>
      )}
      {resultMessage && (
        <p className="secure-note game-sync-note">{resultMessage}</p>
      )}
      {gameState && gameType === "poker" && (
        <div className="poker-status-strip">
          <span>Texas Hold’em</span>
          <strong>
            {pokerPhaseLabel(String(gameState.phase || "preflop"))}
          </strong>
          <span>
            Blinds {String(gameState.small_blind ?? 50)} /{" "}
            {String(gameState.big_blind ?? 100)}
          </span>
          <span>Pot {String(gameState.pot ?? 0)}</span>
          <span>À suivre {Math.max(0, highestBet - myBet)}</span>
        </div>
      )}
      {isPokerShowdown && (
        <div className="showdown-panel">
          <div>
            <span className="showdown-kicker">{t("game.showdown")}</span>
            <strong>
              {winnerNames.length
                ? `${t("game.winner")}: ${winnerNames.join(" · ")}`
                : t("game.handComplete")}
            </strong>
            <span>
              {t("game.revealedCards")} · Pot {String(gameState?.pot ?? 0)}
            </span>
            <div className="showdown-board" aria-label={t("game.finalBoard")}>
              <strong>{t("game.finalBoard")}</strong>
              <div className="showdown-cards">
                {communityCards.map((card, index) => (
                  <PlayingCard
                    key={`showdown-board-${index}`}
                    {...cardView(card)}
                  />
                ))}
              </div>
            </div>
            <div className="showdown-hands">
              {revealedPlayers.map(([playerId, cards]) => (
                <div className="showdown-hand" key={playerId}>
                  <strong>
                    {nameForPlayer(playerId)}
                    {showdownRanks[playerId]
                      ? ` · ${showdownRanks[playerId]}`
                      : ""}
                  </strong>
                  <div className="showdown-cards">
                    {cards.map((card, index) => (
                      <PlayingCard
                        key={`${playerId}-${index}`}
                        {...cardView(card)}
                      />
                    ))}
                  </div>
                  {payouts[playerId] ? (
                    <span className="showdown-payout">
                      +{payouts[playerId]} jetons
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
          {!spectator && (
            <button
              className="action-bet"
              onClick={() => {
                settled.current = false;
                sendGameAction("new_hand");
              }}
            >
              {t("game.newHand")}
            </button>
          )}
        </div>
      )}
      {isPoker && (
        <div className="poker-live-panel">
          <div className="poker-turn-banner">
            <span className={thinkingPlayer ? "thinking-dot" : "turn-dot"} />
            <strong>
              {thinkingPlayer
                ? `${nameForPlayer(thinkingPlayer)} réfléchit…`
                : isMyTurn
                  ? t("game.yourTurnAction")
                  : currentPlayerId
                    ? `${nameForPlayer(currentPlayerId)} joue`
                    : t("game.waiting")}
            </strong>
          </div>
          <div className="action-log" aria-live="polite">
            {actionLog.length ? (
              actionLog
                .slice()
                .reverse()
                .map((entry) => (
                  <div className="action-log-row" key={entry.id}>
                    <span>
                      {entry.playerId ? nameForPlayer(entry.playerId) : "Table"}
                    </span>
                    <strong>{actionLabel(entry.action, entry.phase)}</strong>
                    {entry.amount ? <em>{entry.amount}</em> : null}
                    {entry.potAfter ? (
                      <small>pot {entry.potAfter}</small>
                    ) : null}
                  </div>
                ))
            ) : (
              <span className="action-log-empty">
                {t("game.waitingForActions")}
              </span>
            )}
          </div>
          <button
            type="button"
            className="history-toggle"
            onClick={() => setShowActionHistory((open) => !open)}
            aria-expanded={showActionHistory}
          >
            {showActionHistory ? t("game.hideHistory") : t("game.viewHistory")}
            <span>{actionLog.length}</span>
          </button>
          {showActionHistory && (
            <div
              className="action-history"
              aria-label={t("game.actionHistory")}
            >
              <div className="action-history-head">
                <strong>{t("game.actionHistory")}</strong>
                <span>
                  {t("game.handActions", { count: actionLog.length })}
                </span>
              </div>
              {actionLog.length ? (
                actionLog
                  .slice()
                  .reverse()
                  .map((entry) => (
                    <div
                      className="action-history-row"
                      key={`history-${entry.id}`}
                    >
                      <span>
                        {entry.playerId
                          ? nameForPlayer(entry.playerId)
                          : "Table"}
                      </span>
                      <strong>{actionLabel(entry.action, entry.phase)}</strong>
                      {entry.amount ? <em>{entry.amount}</em> : null}
                      {entry.potAfter ? (
                        <small>pot {entry.potAfter}</small>
                      ) : null}
                    </div>
                  ))
              ) : (
                <span className="action-log-empty">
                  {t("game.waitingForActions")}
                </span>
              )}
            </div>
          )}
        </div>
      )}
      {gameState && gameType !== "poker" && (
        <GameStateSummary gameType={gameType || ""} state={gameState} />
      )}
      <div className={`felt-table ${isPoker ? "felt-green" : "felt-blue"}`}>
        <div className="table-brand">
          MDG <small>GAME CLUB</small>
        </div>
        <PlayerSeat
          pos="top"
          name={String(
            tablePlayers[0]?.name || (demoAi ? "IA Démo · Tovo" : "Tovo"),
          )}
          chips={String(tablePlayers[0]?.stack || "8 420")}
          active={currentPlayerId === String(tablePlayers[0]?.id || "")}
          folded={Boolean(tablePlayers[0]?.folded)}
          action={
            lastAction && lastActionPlayer === String(tablePlayers[0]?.id || "")
              ? lastAction
              : ""
          }
          badge={badgeForSeat(tablePlayers[0], 0, gameState)}
        />
        <PlayerSeat
          pos="left"
          name={String(
            tablePlayers[1]?.name || (demoAi ? "IA Démo · Rija" : "Rija"),
          )}
          chips={String(tablePlayers[1]?.stack || "12 100")}
          active={currentPlayerId === String(tablePlayers[1]?.id || "")}
          folded={Boolean(tablePlayers[1]?.folded)}
          action={
            lastAction && lastActionPlayer === String(tablePlayers[1]?.id || "")
              ? lastAction
              : ""
          }
          badge={badgeForSeat(tablePlayers[1], 1, gameState)}
        />
        <PlayerSeat
          pos="right"
          name={String(
            tablePlayers[2]?.name || (demoAi ? "IA Démo · Saholy" : "Saholy"),
          )}
          chips={String(tablePlayers[2]?.stack || "6 750")}
          active={currentPlayerId === String(tablePlayers[2]?.id || "")}
          folded={Boolean(tablePlayers[2]?.folded)}
          action={
            lastAction && lastActionPlayer === String(tablePlayers[2]?.id || "")
              ? lastAction
              : ""
          }
          badge={badgeForSeat(tablePlayers[2], 2, gameState)}
        />
        <div
          className={`pot ${potPulse ? "pot-pulse" : ""} ${potAwarded ? "pot-awarded" : ""}`}
          key={`pot-${potPulse}-${potAwarded}`}
        >
          {t("game.pot")} <strong>{String(gameState?.pot ?? 0)}</strong>
          {chipBursts > 0 && (
            <span className="chip-burst" key={chipBursts} aria-hidden="true">
              ● ● ●
            </span>
          )}
        </div>
        <div
          className={`community-cards ${dealPulse && motionEnabled ? "community-dealing" : ""}`}
          key={`deal-${dealPulse}`}
        >
          {(renderedCommunityCards.length
            ? renderedCommunityCards
            : [null, null, null, null, null]
          )
            .concat(
              Array.from(
                { length: Math.max(0, 5 - renderedCommunityCards.length) },
                () => null,
              ),
            )
            .slice(0, 5)
            .map((card, index) =>
              card ? (
                <PlayingCard
                  key={`${card.suit}-${card.rank}-${index}`}
                  {...cardView(card)}
                />
              ) : (
                <PlayingCard key={`empty-${index}`} value="?" suit="" hidden />
              ),
            )}
        </div>
        {emote && <div className="table-emote">{emote}</div>}
        {pots.length > 1 && (
          <div className="side-pots" aria-label="Pots de la table">
            {pots.map((pot, index) => (
              <span key={`pot-${index}`}>
                Pot {index + 1} · {pot.amount ?? 0}
              </span>
            ))}
          </div>
        )}
        <div className="you-seat">
          <div className="you-avatar">M</div>
          <div>
            <strong>{t("game.you")}</strong>
            <span>{String(myPokerPlayer?.stack ?? 10000)} jetons</span>
          </div>
        </div>
        <div className="hole-cards">
          {(renderedHoleCards.length
            ? renderedHoleCards
            : [
                { rank: 0, suit: 0 },
                { rank: 0, suit: 0 },
              ]
          ).map((card, index) =>
            card.rank ? (
              <PlayingCard
                key={`${card.suit}-${card.rank}`}
                {...cardView(card)}
              />
            ) : (
              <PlayingCard key={`hole-${index}`} value="?" suit="" hidden />
            ),
          )}
        </div>
      </div>
      <div className="game-controls">
        <div className="turn-state">
          <span className={`timer ${turnSeconds <= 5 ? "timer-warning" : ""}`}>
            00:{String(turnSeconds).padStart(2, "0")}
          </span>
          <div>
            <strong>
              {isMyTurn ? t("game.yourTurnAction") : "Tour des bots"}
            </strong>
            <span>{t("game.chooseAction")}</span>
          </div>
        </div>
        {spectator ? (
          <div className="secure-note game-sync-note">
            {t("spectatorReadOnly")}
          </div>
        ) : isPoker ? (
          <div className="action-row">
            <button
              className="action-fold"
              onClick={() => sendGameAction("fold")}
              disabled={!isMyTurn}
            >
              {t("game.fold")}
            </button>
            <button
              className="action-check"
              onClick={() => sendGameAction(facingBet ? "call" : "check")}
              disabled={!isMyTurn}
            >
              {facingBet ? "Suivre" : t("game.check")}
            </button>
            <button
              className="action-bet"
              onClick={() => sendGameAction("bet", { amount: wager })}
              disabled={!isMyTurn}
            >
              {t("game.bet")} <strong>{wager}</strong>
            </button>
            <label className="wager-control">
              <span>Mise</span>
              <input
                type="range"
                min={100}
                max={5000}
                step={100}
                value={wager}
                disabled={!isMyTurn}
                onChange={(event) => setWager(Number(event.target.value))}
              />
              <output>{wager}</output>
            </label>
          </div>
        ) : (
          <GameSpecificControls
            gameType={gameType || ""}
            state={gameState}
            onAction={sendGameAction}
            enabled={isMyTurn}
          />
        )}
      </div>
      {isPoker && (
        <div className="table-feel-toolbar" aria-label="Réglages de la table">
          <button type="button" onClick={() => sendEmote("Bien joué !")}>
            👏
          </button>
          <button type="button" onClick={() => sendEmote("Oups…")}>
            😅
          </button>
          <button type="button" onClick={() => sendEmote("Bluff ?")}>
            🧐
          </button>
          <button
            type="button"
            onClick={() => updatePreference("sound", !soundEnabled)}
          >
            {soundEnabled ? "🔊" : "🔇"}
          </button>
          <button
            type="button"
            onClick={() => updatePreference("motion", !motionEnabled)}
          >
            {motionEnabled ? "✨" : "◌"}
          </button>
        </div>
      )}
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
            <button
              type="button"
              onClick={() => void sendMessage()}
              aria-label={t("game.sendMessage")}
            >
              <Send size={15} />
            </button>
          </div>
          {socialError && <small className="form-error">{socialError}</small>}
          {invite && (
            <button
              className="text-link"
              onClick={() => void navigator.clipboard?.writeText(invite)}
              aria-label={t("game.copyInvitation")}
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
        <Link
          to={`/support?mode=incident&game_type=${gameType || ""}&table_id=${engineTableId}`}
          className="text-link"
        >
          Signaler un problème
        </Link>
      </div>
    </div>
  );
}
function PlayerSeat({
  pos,
  name,
  chips,
  active = false,
  folded = false,
  action = "",
  badge = "",
}: {
  pos: string;
  name: string;
  chips: string;
  active?: boolean;
  folded?: boolean;
  action?: string;
  badge?: string;
}) {
  return (
    <div
      className={`player-seat seat-${pos} ${active ? "active-seat" : ""} ${folded ? "folded-seat" : ""}`}
    >
      <div className="seat-avatar">{name[0]}</div>
      <div>
        <strong>{name}</strong>
        <span>{chips}</span>
      </div>
      {badge && <i className="seat-badge">{badge}</i>}
      {action && <b className="seat-action-bubble">{action}</b>}
    </div>
  );
}

function badgeForSeat(
  player: Record<string, unknown> | undefined,
  index: number,
  state: Record<string, unknown> | null,
) {
  if (!player || !state) return "";
  const button = Number(state.button ?? -1);
  if (index === button) return "D";
  const count = Array.isArray(state.players) ? state.players.length : 0;
  if (count === 2) {
    if (index === (button + 1) % count) return "SB";
    if (index === button) return "BB";
  } else {
    if (index === (button + 1) % count) return "SB";
    if (index === (button + 2) % count) return "BB";
  }
  return "";
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

function cardView(card: { rank: number; suit: number }) {
  const suits = ["♣", "♦", "♥", "♠"];
  const ranks: Record<number, string> = {
    2: "2",
    3: "3",
    4: "4",
    5: "5",
    6: "6",
    7: "7",
    8: "8",
    9: "9",
    10: "10",
    11: "J",
    12: "Q",
    13: "K",
    14: "A",
  };
  return {
    value: ranks[card.rank] || "?",
    suit: suits[card.suit] || "",
    red: card.suit === 1 || card.suit === 2,
  };
}

function tokenSubject(token: string | null) {
  if (!token) return "";
  try {
    const payload = JSON.parse(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    ) as { sub?: string };
    return payload.sub || "";
  } catch {
    return "";
  }
}

function pokerPhaseLabel(phase: string) {
  return (
    (
      {
        preflop: "Préflop",
        flop: "Flop",
        turn: "Turn",
        river: "River",
        showdown: "Showdown",
      } as Record<string, string>
    )[phase] || phase
  );
}

function actionLabel(action: string, phase?: string) {
  if (action === "street_changed") {
    return phase === "showdown"
      ? "Showdown"
      : `${pokerPhaseLabel(phase || "")} distribué`;
  }
  return (
    (
      {
        fold: "Se couche",
        check: "Check",
        call: "Suit",
        bet: "Mise",
        raise: "Relance",
        all_in: "Tapis",
        new_hand: "Nouvelle main",
        showdown: "Showdown",
      } as Record<string, string>
    )[action] || action
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
        <strong>{t("games.belote")}</strong> · {t("game.trump")} :{" "}
        {String(state.trump ?? "—")} · {t("game.team")} 1 : {String(points[0])}{" "}
        · {t("game.team")} 2 : {String(points[1])} · {t("game.trick")} :{" "}
        {Array.isArray(state.trick) ? state.trick.length : 0}/4
      </div>
    );
  }
  return (
    <div className="secure-note game-sync-note">
      <strong>{t("games.rami")}</strong> · {t("game.activePlayer")} :{" "}
      {String(state.current ?? "—")} ·{t("game.discard")} :{" "}
      {Array.isArray(state.discard) ? state.discard.length : 0} ·
      {t("lobby.players")} : {players.length}
    </div>
  );
}

function GameSpecificControls({
  gameType,
  state,
  onAction,
  enabled,
}: {
  gameType: string;
  state: Record<string, unknown> | null;
  onAction: (action: string, payload?: unknown) => void;
  enabled: boolean;
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
            disabled={!enabled}
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
      <button
        className="action-check"
        disabled={!enabled}
        onClick={() => onAction("draw")}
      >
        {t("game.draw")}
      </button>
      {currentHand.map((card) => (
        <button
          className="action-bet"
          disabled={!enabled}
          key={`${card.suit}-${card.rank}`}
          onClick={() => onAction("discard", { card })}
        >
          {t("game.discardCard")} {card.rank}
        </button>
      ))}
    </div>
  );
}
