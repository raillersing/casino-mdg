import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  History,
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
import { TableExitModal } from "@components/game/TableExitModal";
import { TableSettingsModal } from "@components/game/TableSettingsModal";

const BOT_NAMES = [
  "Tovo", "Rija", "Saholy", "Lova", "Feno", "Koto", "Miary", "Tsiky",
  "Hery", "Soa", "Miora", "Faly", "Rado", "Nofy", "Vola", "Hanta",
];
const AVATAR_COLORS = [
  "#e57373", "#ba68c8", "#64b5f6", "#4db6ac", "#ffb74d", "#a1887f",
  "#90a4ae", "#f06292", "#7986cb", "#4dd0e1", "#81c784", "#fff176",
];
function botNameForSeat(index: number) {
  return BOT_NAMES[index % BOT_NAMES.length];
}
function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

type SoundKind =
  | "deal"
  | "chip"
  | "win"
  | "fold"
  | "all_in"
  | "your_turn"
  | "street_changed"
  | "card_played"
  | "take"
  | "pass"
  | "choose_trump"
  | "announce_belote"
  | "trick_win"
  | "new_hand"
  | "draw"
  | "discard"
  | "meld"
  | "knock"
  | "game_over";

function playSound(kind: SoundKind) {
  if (typeof window === "undefined" || !(window as unknown as Record<string, unknown>).AudioContext) return;
  if (localStorage.getItem("mdg-poker-sound") === "off") return;

  const Ctx = (window as unknown as Record<string, unknown>).AudioContext as typeof AudioContext;
  const ctx = new Ctx();
  if (ctx.state === "suspended") void ctx.resume();

  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.15;
  masterGain.connect(ctx.destination);

  const envelope = (g: GainNode, attack: number, sustain: number, decay: number) => {
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(sustain, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
  };

  switch (kind) {
    case "deal": {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.08);
      envelope(gain, 0.01, 0.08, 0.1);
      osc.connect(gain).connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.12);
      break;
    }
    case "chip": {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.06);
      envelope(gain, 0.005, 0.12, 0.1);
      osc.connect(gain).connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.12);
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(440, now);
      envelope(gain2, 0.005, 0.06, 0.08);
      osc2.connect(gain2).connect(masterGain);
      osc2.start(now);
      osc2.stop(now + 0.1);
      break;
    }
    case "win": {
      const notes = [523, 659, 784];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.06);
        envelope(gain, 0.02, 0.1, 0.35);
        osc.connect(gain).connect(masterGain);
        osc.start(now + idx * 0.06);
        osc.stop(now + idx * 0.06 + 0.4);
      });
      break;
    }
    case "fold": {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.15);
      envelope(gain, 0.02, 0.08, 0.2);
      osc.connect(gain).connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.22);
      break;
    }
    case "all_in": {
      const notes = [400, 500, 600];
      notes.forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 2, now + 0.25);
        envelope(gain, 0.05, 0.08, 0.3);
        osc.connect(gain).connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.32);
      });
      break;
    }
    case "your_turn": {
      [880, 1100].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + i * 0.08);
        envelope(gain, 0.01, 0.1, 0.15);
        osc.connect(gain).connect(masterGain);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.18);
      });
      break;
    }
    case "street_changed": {
      const bufferSize = ctx.sampleRate * 0.15;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(800, now);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
      noise.connect(filter).connect(gain).connect(masterGain);
      noise.start(now);
      noise.stop(now + 0.15);
      break;
    }
    case "card_played": {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.04);
      envelope(gain, 0.005, 0.1, 0.08);
      osc.connect(gain).connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.1);
      break;
    }
    case "take": {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(500, now);
      osc.frequency.exponentialRampToValueAtTime(700, now + 0.06);
      envelope(gain, 0.005, 0.1, 0.1);
      osc.connect(gain).connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.12);
      break;
    }
    case "pass": {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(250, now);
      envelope(gain, 0.01, 0.08, 0.1);
      osc.connect(gain).connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.12);
      break;
    }
    case "choose_trump": {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(523, now);
      osc.frequency.exponentialRampToValueAtTime(784, now + 0.1);
      envelope(gain, 0.01, 0.1, 0.15);
      osc.connect(gain).connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.18);
      break;
    }
    case "announce_belote": {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1047, now);
      envelope(gain, 0.02, 0.12, 0.6);
      osc.connect(gain).connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.65);
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1319, now + 0.05);
      envelope(gain2, 0.02, 0.06, 0.5);
      osc2.connect(gain2).connect(masterGain);
      osc2.start(now + 0.05);
      osc2.stop(now + 0.55);
      break;
    }
    case "trick_win": {
      [660, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + i * 0.05);
        envelope(gain, 0.01, 0.1, 0.15);
        osc.connect(gain).connect(masterGain);
        osc.start(now + i * 0.05);
        osc.stop(now + i * 0.05 + 0.18);
      });
      break;
    }
    case "new_hand": {
      // Card-shuffle friction noise
      const bufferSize = ctx.sampleRate * 0.35;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        const decay = Math.pow(1 - i / bufferSize, 1.5);
        data[i] = (Math.random() * 2 - 1) * decay;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(900, now);
      filter.frequency.exponentialRampToValueAtTime(400, now + 0.35);
      filter.Q.setValueAtTime(1.2, now);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      noise.connect(filter).connect(gain).connect(masterGain);
      noise.start(now);
      noise.stop(now + 0.37);
      // Light card-deal "clicks" layered on top
      [0.18, 0.26, 0.32].forEach((t, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(600 + i * 120, now + t);
        g.gain.setValueAtTime(0.0001, now + t);
        g.gain.exponentialRampToValueAtTime(0.04, now + t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.06);
        osc.connect(g).connect(masterGain);
        osc.start(now + t);
        osc.stop(now + t + 0.07);
      });
      break;
    }
    case "draw": {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(500, now + 0.08);
      envelope(gain, 0.01, 0.08, 0.12);
      osc.connect(gain).connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.14);
      break;
    }
    case "discard": {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(200, now);
      envelope(gain, 0.005, 0.1, 0.08);
      osc.connect(gain).connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.1);
      break;
    }
    case "meld": {
      [523, 659, 784, 1047].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + i * 0.06);
        envelope(gain, 0.01, 0.08, 0.18);
        osc.connect(gain).connect(masterGain);
        osc.start(now + i * 0.06);
        osc.stop(now + i * 0.06 + 0.2);
      });
      break;
    }
    case "knock": {
      const bufferSize = ctx.sampleRate * 0.08;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(600, now);
      filter.Q.setValueAtTime(5, now);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      noise.connect(filter).connect(gain).connect(masterGain);
      noise.start(now);
      noise.stop(now + 0.1);
      break;
    }
    case "game_over": {
      [523, 659, 784, 1047, 1319].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = i % 2 === 0 ? "sine" : "triangle";
        osc.frequency.setValueAtTime(freq, now + i * 0.04);
        envelope(gain, 0.02, 0.08, 0.4);
        osc.connect(gain).connect(masterGain);
        osc.start(now + i * 0.04);
        osc.stop(now + i * 0.04 + 0.45);
      });
      break;
    }
  }

  window.setTimeout(() => {
    if (ctx.state !== "closed") void ctx.close();
  }, 1500);
}

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
    "offline" | "connecting" | "reconnecting" | "connected" | "closed"
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
  const [handDealing, setHandDealing] = useState(false);
  const [potPulse, setPotPulse] = useState(0);
  const [chipBursts, setChipBursts] = useState(0);
  const [turnSeconds, setTurnSeconds] = useState(18);
  const [showdownRanks, setShowdownRanks] = useState<Record<string, string>>(
    {},
  );
  const [payouts, setPayouts] = useState<Record<string, number>>({});
  const [bestCards, setBestCards] = useState<Record<string, Array<{ rank: number; suit: number }>>>({});
  const [potAwarded, setPotAwarded] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(
    () => localStorage.getItem("mdg-poker-sound") !== "off",
  );
  const [motionEnabled, setMotionEnabled] = useState(
    () => localStorage.getItem("mdg-poker-motion") !== "off",
  );
  const [fourColorDeck, setFourColorDeck] = useState(
    () => localStorage.getItem("mdg-poker-4color") === "on",
  );
  const [showHandStrength, setShowHandStrength] = useState(
    () => localStorage.getItem("mdg-poker-handstrength") !== "off",
  );
  const [muteChat, setMuteChat] = useState(
    () => localStorage.getItem("mdg-poker-mutechat") === "on",
  );
  const [showExitModal, setShowExitModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isSittingOut, setIsSittingOut] = useState(false);
  const [leaveAfterHand, setLeaveAfterHand] = useState(false);
  const [preAction, setPreAction] = useState<
    "check_fold" | "auto_check" | "call_any" | "fold_any" | null
  >(null);
  const [emote, setEmote] = useState("");
  const [tablePlayers, setTablePlayers] = useState<
    Array<Record<string, unknown>>
  >([]);
  const [resultMessage, setResultMessage] = useState("");
  const [gameState, setGameState] = useState<Record<string, unknown> | null>(
    null,
  );
  const [gameOver, setGameOver] = useState(false);
  const [selectedRamiCards, setSelectedRamiCards] = useState<Set<string>>(new Set());
  const [pokerLevel, setPokerLevel] = useState(0);
  const [handsPlayed, setHandsPlayed] = useState(0);
  const [nextHandCountdown, setNextHandCountdown] = useState(0);
  const [handHistory, setHandHistory] = useState<
    Array<{
      handNumber: number;
      winners: string[];
      pot: number;
      ranks: Record<string, string>;
    }>
  >([]);
  const [showHandHistory, setShowHandHistory] = useState(false);
  const [botChats, setBotChats] = useState<
    Record<string, { text: string; emote: string; ts: number }>
  >({});
  const [thinkingSeats, setThinkingSeats] = useState<Record<string, boolean>>({});
  const [showRebuy, setShowRebuy] = useState(false);
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
  const wasMyTurnRef = useRef(false);
  const prevBeloteTrickLenRef = useRef(0);
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
  const seatPlayers = statePlayers
    .filter((player) => String(player.id || "") !== userId)
    .slice()
    .sort((left, right) => Number(left.seat ?? 0) - Number(right.seat ?? 0));
  const currentPlayerIndex = Number(gameState?.current ?? -1);
  const isMyTurn =
    Boolean(gameState) &&
    currentPlayerIndex >= 0 &&
    String(
      gameState?.current_player_id ||
        statePlayers[currentPlayerIndex]?.id ||
        "",
    ) === userId;
  const myPokerPlayer = statePlayers.find(
    (player) => String(player.id || "") === userId,
  );
  const highestBet = statePlayers.reduce(
    (highest, player) => Math.max(highest, Number(player.bet || 0)),
    0,
  );
  const myBet = Number(myPokerPlayer?.bet || 0);
  const toCall = Number(
    myPokerPlayer?.to_call ??
      gameState?.to_call ??
      Math.max(0, highestBet - myBet),
  );
  const facingBet = toCall > 0;
  const minRaiseTo = Number(
    gameState?.min_raise_to ?? Math.max(100, myBet + 100),
  );
  const maxRaiseTo = Number(
    gameState?.max_raise_to ?? myBet + Number(myPokerPlayer?.stack || 0),
  );
  const allowedActions = Array.isArray(gameState?.allowed_actions)
    ? (gameState.allowed_actions as string[])
    : [];
  const communityCards = Array.isArray(gameState?.community)
    ? (gameState.community as Array<{ rank: number; suit: number }>)
    : [];
  const holeCards = Array.isArray(myPokerPlayer?.cards)
    ? (myPokerPlayer.cards as Array<{ rank: number; suit: number }>)
    : [];
  const renderedHoleCards = holeCards.slice(0, visibleHoleCardCount);
  // Belote / Rami specific state
  const myHand = Array.isArray(myPokerPlayer?.hand)
    ? (myPokerPlayer.hand as Array<{ rank: number; suit: number }>)
    : [];
  const beloteTrick = Array.isArray(gameState?.trick)
    ? (gameState.trick as Array<{ rank: number; suit: number }>)
    : [];
  const beloteTrump = String(gameState?.trump ?? "");
  const beloteTeamPoints = Array.isArray(gameState?.team_points)
    ? (gameState.team_points as [number, number])
    : [0, 0];
  const beloteCumulative = Array.isArray(gameState?.cumulative_scores)
    ? (gameState.cumulative_scores as [number, number])
    : [0, 0];
  const ramiDiscard = Array.isArray(gameState?.discard)
    ? (gameState.discard as Array<{ rank: number; suit: number }>)
    : [];
  const ramiFinished = Boolean(gameState?.finished);
  const pokerWinners = Array.isArray(gameState?.winners)
    ? (gameState.winners as string[])
    : [];
  const isPokerShowdown = isPoker && gameState?.phase === "showdown";
  const isUncontestedWin =
    isPokerShowdown && gameState?.finish_reason === "uncontested";
  const isSessionFinished = isPoker && gameState?.session_finished === true;
  const renderedCommunityCards = communityCards.slice(0, visibleCommunityCount);
  const cardKey = (card: { rank: number; suit: number }) => `${card.rank}-${card.suit}`;
  const winningCardKeys = useMemo(() => {
    const set = new Set<string>();
    for (const winnerId of pokerWinners) {
      const cards = bestCards[winnerId] || [];
      for (const card of cards) {
        set.add(cardKey(card));
      }
    }
    return set;
  }, [pokerWinners, bestCards]);
  const currentPlayerId = String(
    gameState?.current_player_id || statePlayers[currentPlayerIndex]?.id || "",
  );
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
      if (!soundEnabled) return;
      const map: Record<string, SoundKind> = {
        deal: "deal",
        chip: "chip",
        win: "win",
      };
      playSound(map[kind]);
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
            | {
                players?: unknown;
                game_state?: Record<string, unknown>;
                poker_level?: number;
                hands_played?: number;
                small_blind?: number;
                big_blind?: number;
              }
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
          if (typeof state?.poker_level === "number") {
            setPokerLevel(state.poker_level);
          }
          if (typeof state?.hands_played === "number") {
            setHandsPlayed(state.hands_played);
          }
          if (state?.game_state) {
            const phase = String(state.game_state.phase || "");
            // Detect belote trick completion (4 cards -> new empty trick)
            const nextTrick = Array.isArray(state.game_state.trick)
              ? (state.game_state.trick as unknown[])
              : [];
            if (
              gameType === "belote" &&
              prevBeloteTrickLenRef.current === 4 &&
              nextTrick.length === 0
            ) {
              playSound("trick_win");
            }
            prevBeloteTrickLenRef.current = nextTrick.length;
            setGameState(state.game_state);
            // Auto-redeal when belote round is finished or everyone passed
            if (
              (phase === "all_passed" || phase === "finished") &&
              gameType === "belote"
            ) {
              window.setTimeout(() => {
                setGameOver(false);
                sendGameAction("new_hand");
              }, 800);
            }
            // Auto-redeal when rami game is finished
            if (
              gameType === "rami" &&
              state.game_state.finished === true
            ) {
              window.setTimeout(() => {
                setGameOver(false);
                sendGameAction("new_hand");
              }, 1200);
            }
            if (phase === "showdown") {
              setShowdownRanks(
                (state.game_state.hand_ranks as Record<string, string>) || {},
              );
              setPayouts(
                (state.game_state.payouts as Record<string, number>) || {},
              );
              setBestCards(
                (state.game_state.best_cards as Record<string, Array<{ rank: number; suit: number }>>) || {},
              );
            }
            if (
              phase === "preflop" &&
              previousPokerPhase.current === "showdown"
            ) {
              setShowdownRanks({});
              setPayouts({});
              setBestCards({});
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
          if (action === "showdown" || action === "uncontested_win") {
            setShowdownRanks(details.hand_ranks || {});
            setPayouts(details.payouts || {});
            setBestCards(
              (details as Record<string, unknown>).best_cards as Record<string, Array<{ rank: number; suit: number }>> || {},
            );
            setPotAwarded(false);
            window.setTimeout(() => setPotAwarded(true), 900);
          }
          if (action === "new_hand") {
            setShowdownRanks({});
            setPayouts({});
            setBestCards({});
            setPotAwarded(false);
            setNextHandCountdown(0);
            setGameOver(false);
            if (motionEnabled) {
              setHandDealing(true);
              window.setTimeout(() => setHandDealing(false), 1200);
            }
          }
          if (action === "hand_summary") {
            const summary = payload.payload as {
              winners?: Record<string, { payout: number; rank: string }>;
              pot?: number;
              finish_reason?: string;
              hand_ranks?: Record<string, string>;
            };
            const winners = Object.keys(summary.winners || {});
            const ranks = summary.hand_ranks || {};
            setHandHistory((current) => [
              ...current.slice(-19),
              {
                handNumber: current.length + 1,
                winners,
                pot: summary.pot || 0,
                ranks,
              },
            ]);
            // Start countdown for next hand (server auto-starts in 5s)
            setNextHandCountdown(5);
            const countdown = window.setInterval(() => {
              setNextHandCountdown((c) => {
                if (c <= 1) {
                  window.clearInterval(countdown);
                  return 0;
                }
                return c - 1;
              });
            }, 1000);
          }
          if (action === "thinking") {
            setThinkingPlayer(payload.player_id || "");
            setThinkingSeats((prev) => ({ ...prev, [payload.player_id || ""]: true }));
          } else if (action === "bot_chat") {
            const bc = payload.payload as { text?: string; emote?: string };
            setBotChats((prev) => ({
              ...prev,
              [payload.player_id || ""]: {
                text: bc.text || "",
                emote: bc.emote || "",
                ts: Date.now(),
              },
            }));
            window.setTimeout(() => {
              setBotChats((prev) => {
                const next = { ...prev };
                delete next[payload.player_id || ""];
                return next;
              });
            }, 2500);
          } else {
            setThinkingPlayer("");
            setThinkingSeats((prev) => {
              const next = { ...prev };
              delete next[payload.player_id || ""];
              return next;
            });
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
            if (["bet", "raise", "call"].includes(action)) {
              setPotPulse((value) => value + 1);
              setChipBursts((value) => value + 1);
              playFeedback("chip");
            }
            if (action === "all_in") {
              setPotPulse((value) => value + 1);
              setChipBursts((value) => value + 1);
              playSound("all_in");
            }
            if (action === "fold") playSound("fold");
            if (action === "street_changed") playSound("street_changed");
            if (action === "showdown" || action === "uncontested_win")
              playFeedback("win");
            if (action === "play_card") playSound("card_played");
            if (action === "take") playSound("take");
            if (action === "pass") playSound("pass");
            if (action === "choose_trump") playSound("choose_trump");
            if (action === "announce_belote") playSound("announce_belote");
            if (action === "draw") playSound("draw");
            if (action === "discard") playSound("discard");
            if (action === "meld") playSound("meld");
            if (action === "knock") playSound("knock");
            if (action === "new_hand") playSound("new_hand");
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
        if (payload.type === "error") {
          const errorMsg = typeof payload.payload === "string" ? payload.payload : t("game.tableConnectionError");
          setGameConnectionError(errorMsg);
          if (errorMsg === "game_over") {
            setGameOver(true);
          }
        }
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
    const deadline = gameState?.action_deadline
      ? new Date(String(gameState.action_deadline)).getTime()
      : 0;
    const remaining = deadline
      ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      : isMyTurn
        ? 18
        : 12;
    setTurnSeconds(remaining);
    if (!isMyTurn || !gameState || isPokerShowdown) return;
    const timer = window.setInterval(() => {
      setTurnSeconds(
        deadline
          ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
          : (seconds) => (seconds <= 1 ? 0 : seconds - 1),
      );
    }, 1000);
    return () => window.clearInterval(timer);
  }, [gameState, isMyTurn, isPokerShowdown, currentPlayerId]);

  useEffect(() => {
    if (!isPoker || !gameState) return;
    setWager((current) => Math.min(maxRaiseTo, Math.max(minRaiseTo, current)));
  }, [gameState, isPoker, maxRaiseTo, minRaiseTo]);

  useEffect(() => {
    if (isMyTurn && !wasMyTurnRef.current) {
      playSound("your_turn");
    }
    wasMyTurnRef.current = isMyTurn;
  }, [isMyTurn]);

  useEffect(() => {
    if (gameOver) playSound("game_over");
  }, [gameOver]);

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
    (state: "connecting" | "connected" | "reconnecting" | "closed" | "offline") => {
      setConnectionState(state);
    },
    [],
  );
  const { ws, send, latency } = useWebSocket(socketUrl, {
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

  // Show rebuy button when short-stacked
  useEffect(() => {
    const stack = Number(myPokerPlayer?.stack ?? 0);
    setShowRebuy(stack > 0 && stack < 2000);
  }, [myPokerPlayer?.stack]);

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

  const hasActiveHand = Boolean(
    isPoker && holeCards.length > 0 && gameState?.phase !== "showdown" && !pokerWinners.length,
  );

  return (
    <div
      className={`game-room${handDealing ? " hand-dealing" : ""}${fourColorDeck ? " four-color-deck" : ""}`}
    >
      <div className="game-room-head">
        <button
          type="button"
          className="back-link"
          style={{ background: "transparent", border: "none", cursor: "pointer" }}
          onClick={() => setShowExitModal(true)}
        >
          <ChevronLeft size={17} /> {t("game.leaveTable")}
        </button>
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
        {isPoker && (
          <button
            className="icon-button"
            onClick={() => setShowHandHistory((s) => !s)}
            title="Historique des mains"
            aria-label="Historique des mains"
          >
            <History size={18} />
          </button>
        )}
        <button
          className="icon-button"
          onClick={inviteFriend}
          title={t("game.inviteFriend")}
          aria-label={t("game.inviteFriend")}
        >
          <Users size={18} />
        </button>
        <button
          className="icon-button"
          onClick={() => setShowSettingsModal(true)}
          title="Réglages de la table"
          aria-label="Réglages de la table"
        >
          <Settings2 size={18} />
        </button>
      </div>
      {isSittingOut && (
        <div className="sit-out-floating-banner">
          <strong>⏸️ Mode Pause (Sit-Out) Actif</strong>
          <p>Vous conservez votre place. Vos mains sont passées automatiquement.</p>
          <button
            type="button"
            className="primary-button"
            onClick={() => setIsSittingOut(false)}
            style={{ padding: "8px 24px", fontSize: "0.95rem", fontWeight: 700 }}
          >
            ▶️ Reprendre ma place (I'm Back)
          </button>
        </div>
      )}
      {leaveAfterHand && (
        <div
          style={{
            position: "absolute",
            top: "54px",
            right: "16px",
            background: "rgba(212, 163, 89, 0.18)",
            border: "1px solid var(--gold)",
            color: "var(--gold)",
            padding: "5px 12px",
            borderRadius: "20px",
            fontSize: "0.78rem",
            fontWeight: 600,
            zIndex: 40,
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <span>⏳ Quitter à la fin de cette main</span>
          <button
            type="button"
            style={{ background: "transparent", border: "none", color: "var(--gold)", cursor: "pointer", padding: "0 2px", fontWeight: "bold" }}
            onClick={() => setLeaveAfterHand(false)}
            title="Annuler le départ programmé"
          >
            ✕
          </button>
        </div>
      )}
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
        <p className="secure-note game-sync-note" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>
            {t("game.syncedPlayers", { count: playerCount })} · {t("game.sequence")} {sequence}
            {lastAction ? ` · ${lastAction}` : ""}
          </span>
          {latency !== null && (
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: latency < 150 ? "var(--green)" : latency < 350 ? "var(--gold)" : "var(--red)",
              }}
            >
              ● {latency} ms
            </span>
          )}
        </p>
      )}
      {connectionState === "reconnecting" && (
        <p className="secure-note game-sync-note" style={{ color: "var(--gold)" }}>
          🔄 {t("game.reconnecting")} (Réseau Madagascar 3G/4G optimisé)...
        </p>
      )}
      {connectionState === "offline" && (
        <p className="secure-note game-sync-note" style={{ color: "var(--red)" }}>
          ⚠️ Réseau interrompu · En attente de reconnexion automatique...
        </p>
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
            Niveau {pokerLevel + 1} · {String(gameState.small_blind ?? 50)} /{" "}
            {String(gameState.big_blind ?? 100)}
          </span>
          <span>Pot {String(gameState.pot ?? 0)}</span>
          <span>À suivre {Math.max(0, highestBet - myBet)}</span>
          <span>Mains {handsPlayed}</span>
        </div>
      )}
      {showHandHistory && isPoker && (
        <div className="hand-history-panel">
          <strong>Historique des mains</strong>
          {handHistory.length === 0 && (
            <span className="empty-history">Aucune main jouée pour l’instant.</span>
          )}
          <ul>
            {handHistory
              .slice()
              .reverse()
              .map((h, i) => (
                <li key={i}>
                  <span>Main #{h.handNumber}</span>
                  <span>
                    Gagnant(s): {h.winners.length ? h.winners.join(", ") : "—"}
                  </span>
                  <span>Pot: {h.pot}</span>
                  <span>
                    {Object.entries(h.ranks)
                      .map(([pid, rank]) => `${pid}: ${rank}`)
                      .join(" · ")}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}
      {isPokerShowdown && (
        <div className="showdown-overlay">
          <div className="showdown-overlay-inner">
            <div className="showdown-title">
              {isUncontestedWin ? t("game.winner") : t("game.showdown")}
            </div>

            {/* Board final */}
            <div className="showdown-board-wrap">
              {communityCards.map((card, index) => {
                const isWinning = winningCardKeys.has(cardKey(card));
                return (
                  <div
                    key={`showdown-board-${index}`}
                    className={`showdown-card-wrap ${isWinning ? "winning-card" : "dimmed-card"}`}
                  >
                    <PlayingCard {...cardView(card)} />
                  </div>
                );
              })}
            </div>

            {/* Tous les joueurs encore en lice */}
            <div className="showdown-players">
              {statePlayers
                .filter((p) => !Boolean(p.folded))
                .map((player) => {
                  const pid = String(player.id || "");
                  const isWinner = pokerWinners.includes(pid);
                  const rank = showdownRanks[pid] || "";
                  const payout = payouts[pid] || 0;
                  const playerCards = Array.isArray(player.cards)
                    ? (player.cards as Array<{ rank: number; suit: number }>)
                    : [];
                  const pName = nameForPlayer(pid);
                  return (
                    <div
                      key={`showdown-player-${pid}`}
                      className={`showdown-player-row ${isWinner ? "showdown-winner-row" : ""}`}
                    >
                      <div className="showdown-player-info">
                        <div
                          className="showdown-player-avatar"
                          style={{ background: avatarColor(pName) }}
                        >
                          {pName[0]}
                        </div>
                        <div className="showdown-player-meta">
                          <strong>{pName}</strong>
                          {rank ? (
                            <span className="showdown-player-rank">{rank}</span>
                          ) : isUncontestedWin ? (
                            <span className="showdown-player-rank">
                              {t("game.handComplete")}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="showdown-player-cards">
                        {playerCards.length > 0 ? (
                          playerCards.map((card, idx) => {
                            const isWinning = winningCardKeys.has(cardKey(card));
                            return (
                              <div
                                key={`showdown-hole-${idx}`}
                                className={`showdown-card-wrap ${isWinning ? "winning-card" : "dimmed-card"}`}
                              >
                                <PlayingCard {...cardView(card)} />
                              </div>
                            );
                          })
                        ) : (
                          <span className="muted">
                            {isUncontestedWin
                              ? "—"
                              : t("game.revealedCards")}
                          </span>
                        )}
                      </div>
                      {payout > 0 && (
                        <span className="showdown-player-payout">
                          +{payout}
                        </span>
                      )}
                    </div>
                  );
                })}
            </div>

            {/* Pot total */}
            <div className="showdown-pot">
              {t("game.pot")}{" "}
              <strong>{String(gameState?.pot ?? 0)}</strong>
            </div>

            {!isSessionFinished && !spectator && (
              <button
                className="showdown-next-btn"
                onClick={() => {
                  settled.current = false;
                  sendGameAction("new_hand");
                }}
                disabled={nextHandCountdown > 0}
              >
                {nextHandCountdown > 0
                  ? `Nouvelle main dans ${nextHandCountdown}s`
                  : t("game.newHand")}
              </button>
            )}
            {isSessionFinished && (
              <span className="secure-note game-sync-note">
                Session terminée
              </span>
            )}
          </div>
          <div className="showdown-confetti">
            {Array.from({ length: 12 }).map((_, i) => (
              <span
                key={i}
                style={{
                  left: `${5 + (i * 8)}%`,
                  animationDelay: `${i * 0.2}s`,
                  background: AVATAR_COLORS[i % AVATAR_COLORS.length],
                }}
              />
            ))}
          </div>
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
      <div className={`felt-table ${isPoker ? "felt-poker" : gameType === "rami" ? "felt-rami" : "felt-belote"}`}>
        <div className="table-brand">
          MDG <small>GAME CLUB</small>
        </div>
        {seatPlayers.map((player, index) => {
          const total = seatPlayers.length;
          const angle =
            total <= 3
              ? [Math.PI / 2, (Math.PI * 5) / 4, (Math.PI * 7) / 4][index] ??
                Math.PI / 2
              : Math.PI - (index / Math.max(1, total - 1)) * Math.PI;
          const style: React.CSSProperties =
            total <= 3
              ? {}
              : {
                  position: "absolute",
                  left: `${50 + 42 * Math.cos(angle)}%`,
                  top: `${48 + 38 * Math.sin(angle)}%`,
                  transform: "translate(-50%, -50%)",
                };
          const opponentInfo = isPoker
            ? String(player?.stack ?? "8 420")
            : gameType === "belote"
              ? `${player?.hand_count ?? 0} cartes · Équipe ${Number(player?.team ?? 0) + 1}`
              : `${player?.hand_count ?? 0} cartes · Score : ${Number(player?.score ?? 0)}`;
          return (
            <PlayerSeat
              key={String(player.id || index)}
              pos={total <= 3 ? ["top", "left", "right"][index] ?? "top" : "dynamic"}
              name={String(
                player?.name ||
                  nameForPlayer(String(player?.id || "")) ||
                  (demoAi ? botNameForSeat(index) : botNameForSeat(index)),
              )}
              chips={opponentInfo}
              bet={isPoker ? Number(player?.bet || 0) : 0}
              active={currentPlayerId === String(player?.id || "")}
              folded={isPoker ? Boolean(player?.folded) : false}
              action={
                lastAction && lastActionPlayer === String(player?.id || "")
                  ? lastAction
                  : ""
              }
              badge={badgeForSeat(player, gameState)}
              thinking={Boolean(thinkingSeats[String(player?.id || "")])}
              botChat={botChats[String(player?.id || "")]}
              seatStyle={style}
              hasCards={isPoker && !Boolean(player?.folded)}
            />
          );
        })}
        {isPoker && (
          <>
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
          </>
        )}
        {gameType === "belote" && (
          <>
            {String(gameState?.phase || "") === "bidding" ? (
              <div className="belote-trick-area">
                <div className="belote-trick-label">
                  <span className="belote-trump">
                    {Number(gameState?.bidding_round ?? 1) === 2 ? t("game.secondTour") + " — " : ""}
                    Atout proposé : {["♣","♦","♥","♠"][Number(gameState?.proposed_trump ?? -1)] || "?"}
                  </span>
                </div>
                <div className="belote-trick-label" style={{ marginTop: 8 }}>
                  {Array.isArray(gameState?.passed) && (gameState?.passed as boolean[]).map((passed, index) => (
                    <span key={`pass-${index}`} style={{ opacity: passed ? 0.4 : 1 }}>
                      {passed ? "✓ Passé" : "En attente…"} (Joueur {index + 1})
                    </span>
                  ))}
                </div>
              </div>
            ) : String(gameState?.phase || "") === "all_passed" ? (
              <div className="belote-trick-area">
                <div className="belote-trick-label">
                  <span className="belote-trump">{t("game.allPassed")} — {t("game.redeal")}</span>
                </div>
              </div>
            ) : (
              <>
                <div className="belote-trick-area">
                  <div className="belote-trick-label">
                    {beloteTrump !== "" && (
                      <span className="belote-trump">Atout : {["♣","♦","♥","♠"][Number(beloteTrump)] || "?"}</span>
                    )}
                    <span>Pli {beloteTrick.length}/4</span>
                    {Array.isArray(gameState?.belote_announced) && (gameState?.belote_announced as boolean[]).some(Boolean) && (
                      <span className="belote-trump" style={{ marginLeft: 8 }}>🔔 Belote !</span>
                    )}
                    {Array.isArray(gameState?.rebelote_declared) && (gameState?.rebelote_declared as boolean[]).some(Boolean) && (
                      <span className="belote-trump" style={{ marginLeft: 8 }}>🔔🔔 Rebelote !</span>
                    )}
                  </div>
                  <div className="belote-trick">
                    {beloteTrick.map((card, index) => (
                      <PlayingCard
                        key={`trick-${index}`}
                        {...cardView(card)}
                      />
                    ))}
                    {Array.from({ length: Math.max(0, 4 - beloteTrick.length) }).map((_, index) => (
                      <PlayingCard key={`trick-empty-${index}`} value="?" suit="" hidden />
                    ))}
                  </div>
                </div>
                <div className="belote-score">
                  <span>Équipe 1 : {beloteTeamPoints[0]} (total {beloteCumulative[0]})</span>
                  <span>Équipe 2 : {beloteTeamPoints[1]} (total {beloteCumulative[1]})</span>
                </div>
                {gameOver && (
                  <div className="belote-game-over">
                    <div>🏆 {t("game.gameOver")} — {beloteCumulative[0] > beloteCumulative[1] ? t("game.team") + " 1" : t("game.team") + " 2"} {t("game.wins")}</div>
                    <button
                      className="button button-gold button-small"
                      onClick={() => {
                        setGameOver(false);
                        sendGameAction("new_hand");
                      }}
                      style={{ marginTop: 8 }}
                    >
                      {t("demoReplay")}
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
        {gameType === "rami" && (
          <>
            <div className="rami-discard-area">
              <div className="rami-discard-label">Défausse</div>
              <div className="rami-discard">
                {ramiDiscard.length > 0 ? (
                  <PlayingCard {...cardView(ramiDiscard[ramiDiscard.length - 1])} />
                ) : (
                  <PlayingCard value="?" suit="" hidden />
                )}
              </div>
            </div>
            {ramiFinished && (
              <div className="rami-finished">
                {Number(gameState?.knocked_by ?? -1) >= 0 ? (
                  <>
                    {t("game.knock")} — {Boolean(gameState?.gin) ? t("game.gin") : ""}
                  </>
                ) : (
                  "Partie terminée"
                )}
              </div>
            )}
            <div className="rami-melds-area">
              {Array.isArray(gameState?.players) && (gameState?.players as Array<Record<string, unknown>>).map((p, idx) => {
                const melds = p.melds as Array<Array<{ suit: number; rank: number }>> | undefined;
                if (!melds || melds.length === 0) return null;
                return (
                  <div key={`melds-${idx}`} className="rami-player-melds">
                    <div className="rami-meld-label">{String(p.name || p.id || `Joueur ${idx + 1}`)} — Melds</div>
                    {melds.map((meld, mIdx) => (
                      <div key={`meld-${mIdx}`} className="rami-meld">
                        {meld.map((card, cIdx) => (
                          <PlayingCard key={`meld-card-${cIdx}`} {...cardView(card)} />
                        ))}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </>
        )}
        {emote && <div className="table-emote">{emote}</div>}
        {isPoker && pots.length > 1 && (
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
            {isPoker && (
              <span>{String(myPokerPlayer?.stack ?? 10000)} jetons</span>
            )}
            {gameType === "belote" && (
              <span>{myHand.length} cartes · Équipe {Number(myPokerPlayer?.team ?? 0) + 1}</span>
            )}
            {gameType === "rami" && (
              <span>{myHand.length} cartes · Score : {Number(myPokerPlayer?.score ?? 0)}</span>
            )}
          </div>
          {isPoker && showRebuy && (
            <button
              className="rebuy-btn"
              onClick={() => {
                sendGameAction("rebuy", { amount: 5000 });
                setShowRebuy(false);
              }}
            >
              + Recharger
            </button>
          )}
          {isPoker && myBet > 0 && (
            <span className="you-bet-chip">{myBet}</span>
          )}
        </div>
        <div className={`hole-cards ${gameType !== "poker" ? "hole-cards-many" : ""}`}>
          {isPoker && (
            <>
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
            </>
          )}
          {gameType !== "poker" && (
            <>
              {myHand.length > 0 ? (
                myHand.map((card, index) => {
                  const cardKey = `${card.suit}-${card.rank}`;
                  const isSelected = selectedRamiCards.has(cardKey);
                  if (gameType === "rami" && isMyTurn) {
                    return (
                      <div
                        key={`hand-${card.suit}-${card.rank}-${index}`}
                        className={`rami-card-selectable ${isSelected ? "rami-card-selected" : ""}`}
                        onClick={() => {
                          setSelectedRamiCards((prev) => {
                            const next = new Set(prev);
                            if (next.has(cardKey)) next.delete(cardKey);
                            else next.add(cardKey);
                            return next;
                          });
                        }}
                      >
                        <PlayingCard {...cardView(card)} />
                      </div>
                    );
                  }
                  return (
                    <PlayingCard
                      key={`hand-${card.suit}-${card.rank}-${index}`}
                      {...cardView(card)}
                    />
                  );
                })
              ) : (
                <>
                  <PlayingCard key="hole-0" value="?" suit="" hidden />
                  <PlayingCard key="hole-1" value="?" suit="" hidden />
                </>
              )}
            </>
          )}
          {showHandStrength && isPoker && holeCards.length >= 2 && (
            <div className="hand-strength-pill">
              📊 {showdownRanks[userId] || (holeCards[0]?.rank === holeCards[1]?.rank ? `Paire de ${cardView(holeCards[0]).value}` : `${cardView(holeCards[0]).value} - ${cardView(holeCards[1]).value}`)}
            </div>
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
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "8px" }}>
            {isMyTurn ? (
              <>
                <div className="action-row">
                  <button
                    className="action-fold"
                    onClick={() => {
                      playSound("fold");
                      sendGameAction("fold");
                    }}
                    disabled={
                      !isMyTurn ||
                      (allowedActions.length > 0 && !allowedActions.includes("fold"))
                    }
                  >
                    {t("game.fold")}
                  </button>
                  <button
                    className="action-check"
                    onClick={() => {
                      playSound("chip");
                      sendGameAction(facingBet ? "call" : "check");
                    }}
                    disabled={
                      !isMyTurn ||
                      (allowedActions.length > 0 &&
                        !allowedActions.includes(facingBet ? "call" : "check"))
                    }
                  >
                    {facingBet ? `Suivre ${toCall.toLocaleString("fr-FR")}` : t("game.check")}
                  </button>
                  <button
                    className="action-bet"
                    onClick={() => {
                      playSound("chip");
                      sendGameAction(facingBet ? "raise" : "bet", {
                        amount: Math.max(wager - myBet, 1),
                      });
                    }}
                    disabled={
                      !isMyTurn ||
                      (allowedActions.length > 0 &&
                        !allowedActions.some(
                          (action) => action === (facingBet ? "raise" : "bet"),
                        ))
                    }
                  >
                    {facingBet ? "Relancer à" : t("game.bet")}{" "}
                    <strong>{wager.toLocaleString("fr-FR")}</strong>
                  </button>
                  <label className="wager-control">
                    <span>Mise</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <button
                        type="button"
                        className="bet-stepper-btn"
                        onClick={() => setWager((w) => Math.max(minRaiseTo, w - 100))}
                        disabled={!isMyTurn || wager <= minRaiseTo}
                        title="-100"
                      >
                        -
                      </button>
                      <input
                        type="range"
                        min={Math.max(1, minRaiseTo)}
                        max={Math.max(Math.max(1, minRaiseTo), maxRaiseTo)}
                        step={100}
                        value={wager}
                        disabled={!isMyTurn}
                        onChange={(event) => setWager(Number(event.target.value))}
                      />
                      <button
                        type="button"
                        className="bet-stepper-btn"
                        onClick={() => setWager((w) => Math.min(maxRaiseTo, w + 100))}
                        disabled={!isMyTurn || wager >= maxRaiseTo}
                        title="+100"
                      >
                        +
                      </button>
                    </div>
                    <output>{wager.toLocaleString("fr-FR")}</output>
                  </label>
                </div>
                {/* Raccourcis de mise rapides (Bet sizing shortcuts) */}
                <div className="bet-shortcuts-container">
                  <button
                    type="button"
                    className="bet-shortcut-button"
                    onClick={() => setWager(minRaiseTo)}
                  >
                    Min
                  </button>
                  <button
                    type="button"
                    className="bet-shortcut-button"
                    onClick={() => {
                      const pot = Number(gameState?.pot || 0);
                      setWager(Math.min(maxRaiseTo, Math.max(minRaiseTo, myBet + Math.round(pot * 0.33))));
                    }}
                  >
                    1/3 Pot
                  </button>
                  <button
                    type="button"
                    className="bet-shortcut-button"
                    onClick={() => {
                      const pot = Number(gameState?.pot || 0);
                      setWager(Math.min(maxRaiseTo, Math.max(minRaiseTo, myBet + Math.round(pot * 0.5))));
                    }}
                  >
                    1/2 Pot
                  </button>
                  <button
                    type="button"
                    className="bet-shortcut-button"
                    onClick={() => {
                      const pot = Number(gameState?.pot || 0);
                      setWager(Math.min(maxRaiseTo, Math.max(minRaiseTo, myBet + Math.round(pot * 0.67))));
                    }}
                  >
                    2/3 Pot
                  </button>
                  <button
                    type="button"
                    className="bet-shortcut-button"
                    onClick={() => {
                      const pot = Number(gameState?.pot || 0);
                      setWager(Math.min(maxRaiseTo, Math.max(minRaiseTo, myBet + Math.round(pot * 0.75))));
                    }}
                  >
                    3/4 Pot
                  </button>
                  <button
                    type="button"
                    className="bet-shortcut-button"
                    onClick={() => {
                      const pot = Number(gameState?.pot || 0);
                      setWager(Math.min(maxRaiseTo, Math.max(minRaiseTo, myBet + pot)));
                    }}
                  >
                    Pot
                  </button>
                  <button
                    type="button"
                    className="bet-shortcut-button all-in"
                    onClick={() => setWager(maxRaiseTo)}
                  >
                    Tapis (Max)
                  </button>
                </div>
              </>
            ) : !isPokerShowdown && gameState?.phase !== "showdown" ? (
              /* Actions anticipées (Pre-actions) */
              <div className="pre-actions-container">
                <span style={{ fontSize: "0.75rem", color: "var(--muted)", marginRight: "4px" }}>
                  ⚡ Actions anticipées :
                </span>
                <label className={`pre-action-item ${preAction === "check_fold" ? "active" : ""}`}>
                  <input
                    type="checkbox"
                    checked={preAction === "check_fold"}
                    onChange={(e) => setPreAction(e.target.checked ? "check_fold" : null)}
                  />
                  Check / Fold
                </label>
                <label className={`pre-action-item ${preAction === "auto_check" ? "active" : ""}`}>
                  <input
                    type="checkbox"
                    checked={preAction === "auto_check"}
                    onChange={(e) => setPreAction(e.target.checked ? "auto_check" : null)}
                  />
                  Auto-Check
                </label>
                <label className={`pre-action-item ${preAction === "call_any" ? "active" : ""}`}>
                  <input
                    type="checkbox"
                    checked={preAction === "call_any"}
                    onChange={(e) => setPreAction(e.target.checked ? "call_any" : null)}
                  />
                  Suivre (Call)
                </label>
                <label className={`pre-action-item ${preAction === "fold_any" ? "active" : ""}`}>
                  <input
                    type="checkbox"
                    checked={preAction === "fold_any"}
                    onChange={(e) => setPreAction(e.target.checked ? "fold_any" : null)}
                  />
                  Se coucher (Fold)
                </label>
              </div>
            ) : null}
          </div>
        ) : (
          <GameSpecificControls
            gameType={gameType || ""}
            phase={String(gameState?.phase || "")}
            hand={myHand}
            onAction={sendGameAction}
            enabled={isMyTurn}
            selectedCards={selectedRamiCards}
            onClearSelection={() => setSelectedRamiCards(new Set())}
            state={gameState || {}}
            statePlayers={statePlayers}
            userId={userId}
          />
        )}
      </div>
      <div className="table-feel-toolbar" aria-label="Réglages de la table">
        {isPoker && (
          <>
            <button type="button" onClick={() => sendEmote("Bien joué !")}>👏</button>
            <button type="button" onClick={() => sendEmote("Oups…")}>😅</button>
            <button type="button" onClick={() => sendEmote("Bluff ?")}>🧐</button>
          </>
        )}
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
          {isPoker && (
            <>
              <div>
                <span>{t("game.buyIn")}</span>
                <strong>10 000 jetons</strong>
              </div>
              <div>
                <span>{t("game.blinds")}</span>
                <strong>100 / 200</strong>
              </div>
            </>
          )}
          {gameType === "belote" && (
            <>
              <div>
                <span>Jeu</span>
                <strong>Belote Malgache</strong>
              </div>
              <div>
                <span>Joueurs</span>
                <strong>4 (équipes de 2)</strong>
              </div>
            </>
          )}
          {gameType === "rami" && (
            <>
              <div>
                <span>Jeu</span>
                <strong>Rami</strong>
              </div>
              <div>
                <span>Cartes</span>
                <strong>52 (7 en main)</strong>
              </div>
            </>
          )}
        </div>
        <Link
          to={`/support?mode=incident&game_type=${gameType || ""}&table_id=${engineTableId}`}
          className="text-link"
        >
          Signaler un problème
        </Link>
      </div>

      <TableExitModal
        isOpen={showExitModal}
        onClose={() => setShowExitModal(false)}
        onLeaveNow={() => {
          if (hasActiveHand) {
            playSound("fold");
            sendGameAction("fold");
          }
          leaveTable();
        }}
        onLeaveNextHand={() => setLeaveAfterHand((v) => !v)}
        onToggleSitOut={() => setIsSittingOut((v) => !v)}
        isSittingOut={isSittingOut}
        leaveAfterHand={leaveAfterHand}
        hasActiveHand={hasActiveHand}
        currentBet={myBet}
      />

      <TableSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        soundEnabled={soundEnabled}
        onToggleSound={(enabled) => updatePreference("sound", enabled)}
        fourColorDeck={fourColorDeck}
        onToggleFourColorDeck={(enabled) => {
          setFourColorDeck(enabled);
          localStorage.setItem("mdg-poker-4color", enabled ? "on" : "off");
        }}
        motionEnabled={motionEnabled}
        onToggleMotion={(enabled) => updatePreference("motion", enabled)}
        showHandStrength={showHandStrength}
        onToggleHandStrength={(enabled) => {
          setShowHandStrength(enabled);
          localStorage.setItem("mdg-poker-handstrength", enabled ? "on" : "off");
        }}
        muteChat={muteChat}
        onToggleMuteChat={(enabled) => {
          setMuteChat(enabled);
          localStorage.setItem("mdg-poker-mutechat", enabled ? "on" : "off");
        }}
      />
    </div>
  );
}

function PlayerSeat({
  pos,
  name,
  chips,
  bet = 0,
  active = false,
  folded = false,
  action = "",
  badge = "",
  thinking = false,
  botChat,
  seatStyle,
  hasCards = false,
}: {
  pos: string;
  name: string;
  chips: string;
  bet?: number;
  active?: boolean;
  folded?: boolean;
  action?: string;
  badge?: string;
  thinking?: boolean;
  botChat?: { text: string; emote: string };
  seatStyle?: React.CSSProperties;
  hasCards?: boolean;
}) {
  const avColor = avatarColor(name);
  return (
    <div
      className={`player-seat seat-${pos} ${active ? "active-seat" : ""} ${folded ? "folded-seat" : ""}`}
      style={seatStyle}
    >
      <div className="seat-avatar" style={{ background: avColor }}>{name[0]}</div>
      <div>
        <strong>{name}</strong>
        <span>{chips}</span>
      </div>
      {badge && (
        <i className={`seat-badge ${badge.includes("D") ? "seat-dealer" : badge.includes("BB") ? "seat-big-blind" : badge.includes("SB") ? "seat-small-blind" : ""}`}>
          {badge}
        </i>
      )}
      {action && <b className="seat-action-bubble">{action}</b>}
      {thinking && !botChat && <span className="seat-thinking-bubble">…</span>}
      {botChat && (
        <span className="seat-chat-bubble">
          {botChat.emote} {botChat.text}
        </span>
      )}
      {bet > 0 && (
        <span className="seat-bet-chip">
          {bet}
        </span>
      )}
      {hasCards && (
        <div className="seat-hole-cards">
          <span className="seat-card-back" />
          <span className="seat-card-back" />
        </div>
      )}
    </div>
  );
}

function badgeForSeat(
  player: Record<string, unknown> | undefined,
  state: Record<string, unknown> | null,
) {
  if (!player || !state) return "";
  const playerId = String(player.id || "");
  const badges: string[] = [];
  if (state.button_player_id != null) {
    if (playerId === String(state.button_player_id || "")) badges.push("D");
    if (playerId === String(state.small_blind_player_id || "")) badges.push("SB");
    if (playerId === String(state.big_blind_player_id || "")) badges.push("BB");
  }
  return badges.join(" · ");
}
function PlayingCard({
  value,
  suit,
  suitIndex,
  red,
  hidden,
  selected,
  onClick,
}: {
  value: string;
  suit: string;
  suitIndex?: number;
  red?: boolean;
  hidden?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const suitClass =
    suitIndex !== undefined
      ? ["suit-club", "suit-diamond", "suit-heart", "suit-spade"][suitIndex] || ""
      : "";
  return (
    <button
      onClick={onClick}
      className={`playing-card ${suitClass} ${red ? "red" : ""} ${hidden ? "hidden-card" : ""} ${selected ? "selected" : ""}`}
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
    suitIndex: card.suit,
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
        play_card: "Carte jouée",
        draw: "Pioche",
        discard: "Défausse",
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
    const phase = String(state.phase || "playing");
    const points = Array.isArray(state.team_points)
      ? state.team_points
      : [0, 0];
    const suits = ["♣", "♦", "♥", "♠"];
    const trumpNum = Number(state.trump ?? -1);
    const trumpLabel = trumpNum >= 0 && trumpNum < 4 ? suits[trumpNum] : "—";
    const proposedTrumpNum = Number(state.proposed_trump ?? -1);
    const proposedTrumpLabel = proposedTrumpNum >= 0 && proposedTrumpNum < 4 ? suits[proposedTrumpNum] : "—";
    if (phase === "bidding") {
      const bidder = Number(state.bidder ?? -1);
      const bidderName = bidder >= 0 && Array.isArray(state.players)
        ? String((state.players as Array<Record<string, unknown>>)[bidder]?.name || "")
        : "";
      return (
        <div className="secure-note game-sync-note">
          <strong>{t("games.belote")}</strong> · {t("game.bidding")} · {t("game.proposedTrump")} :{" "}
          <span className="belote-trump">{proposedTrumpLabel}</span>
          {bidderName ? ` · ${t("game.bidder")} : ${bidderName}` : ""}
        </div>
      );
    }
    if (phase === "all_passed") {
      return (
        <div className="secure-note game-sync-note">
          <strong>{t("games.belote")}</strong> · {t("game.allPassed")} — {t("game.redeal")}
        </div>
      );
    }
    return (
      <div className="secure-note game-sync-note">
        <strong>{t("games.belote")}</strong> · {t("game.trump")} :{" "}
        <span className="belote-trump">{trumpLabel}</span> · {t("game.team")} 1 : {String(points[0])}{" "}
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
      {Number(state.knocked_by ?? -1) >= 0 && (
        <> · {t("game.knock")}{Boolean(state.gin) ? ` (${t("game.gin")})` : ""}</>
      )}
    </div>
  );
}

function GameSpecificControls({
  gameType,
  phase,
  hand,
  onAction,
  enabled,
  selectedCards,
  onClearSelection,
  state,
  statePlayers,
  userId,
}: {
  gameType: string;
  phase?: string;
  hand: Array<{ rank: number; suit: number }>;
  onAction: (action: string, payload?: unknown) => void;
  enabled: boolean;
  selectedCards?: Set<string>;
  onClearSelection?: () => void;
  state?: Record<string, unknown>;
  statePlayers?: Array<Record<string, unknown>>;
  userId?: string;
}) {
  const { t } = useTranslation();
  if (gameType === "belote") {
    const biddingRound = Number(state?.bidding_round ?? 1);
    // Bidding phase
    if (phase === "bidding") {
      if (biddingRound === 1) {
        return (
          <div className="action-row belote-controls">
            <button
              className="action-bet"
              disabled={!enabled}
              onClick={() => {
                playSound("take");
                onAction("take");
              }}
            >
              {t("game.take")}
            </button>
            <button
              className="action-fold"
              disabled={!enabled}
              onClick={() => {
                playSound("pass");
                onAction("pass");
              }}
            >
              {t("game.pass")}
            </button>
          </div>
        );
      }
      // Second round: choose any suit
      const suits = [
        { label: "♣", value: 0, color: "#4db6ac" },
        { label: "♦", value: 1, color: "#e57373" },
        { label: "♥", value: 2, color: "#ba68c8" },
        { label: "♠", value: 3, color: "#64b5f6" },
      ];
      return (
        <div className="action-row belote-controls">
          <span className="muted" style={{ marginRight: 8 }}>{t("game.chooseTrump")} :</span>
          {suits.map((suit) => (
            <button
              key={suit.value}
              className="action-check"
              disabled={!enabled}
              onClick={() => {
                playSound("choose_trump");
                onAction("choose_trump", { suit: suit.value });
              }}
              style={{ color: suit.color }}
            >
              {suit.label}
            </button>
          ))}
          <button
            className="action-fold"
            disabled={!enabled}
            onClick={() => {
              playSound("pass");
              onAction("pass");
            }}
          >
            {t("game.pass")}
          </button>
        </div>
      );
    }
    if (phase === "all_passed") {
      return (
        <div className="action-row belote-controls">
          <span className="muted">{t("game.allPassed")} — {t("game.redeal")}</span>
        </div>
      );
    }
    // Playing phase
    const beloteAnnounced = Array.isArray(state?.belote_announced)
      ? (state?.belote_announced as boolean[])
      : [];
    const myPlayerIndex = (statePlayers || []).findIndex((p) => String(p.id || "") === userId);
    const canAnnounceBelote = myPlayerIndex >= 0 && !beloteAnnounced[myPlayerIndex];
    return (
      <div className="action-row belote-controls">
        {canAnnounceBelote && (
          <button
            className="action-bet"
            disabled={!enabled}
            onClick={() => {
              playSound("announce_belote");
              onAction("announce_belote");
            }}
          >
            {t("game.announceBelote")}
          </button>
        )}
        {hand.length > 0 ? (
          hand.map((card) => (
            <button
              className="action-check"
              disabled={!enabled}
              key={`${card.suit}-${card.rank}`}
              onClick={() => {
                playSound("card_played");
                onAction("play_card", { card });
              }}
            >
              {t("game.play")} {cardView(card).value}{cardView(card).suit}
            </button>
          ))
        ) : (
          <span className="muted">{t("game.waiting")}</span>
        )}
      </div>
    );
  }
  return (
    <div className="action-row rami-controls">
      <button
        className="action-check"
        disabled={!enabled || hand.length > 7}
        onClick={() => {
          playSound("draw");
          onAction("draw");
        }}
      >
        {t("game.draw")}
      </button>
      <button
        className="action-fold"
        disabled={!enabled}
        onClick={() => {
          playSound("knock");
          onAction("knock");
        }}
      >
        {t("game.knock")}
      </button>
      {selectedCards && selectedCards.size > 0 && (
        <>
          <button
            className="action-bet"
            disabled={!enabled || selectedCards.size < 3}
            onClick={() => {
              const cards = hand.filter((c) => selectedCards.has(`${c.suit}-${c.rank}`));
              playSound("meld");
              onAction("meld", { cards });
              onClearSelection?.();
            }}
          >
            {t("game.meld")} ({selectedCards.size})
          </button>
          <button className="action-fold" onClick={() => onClearSelection?.()}>
            {t("game.cancel")}
          </button>
        </>
      )}
      {hand.length > 0 ? (
        hand.map((card) => (
          <button
            className="action-bet"
            disabled={!enabled}
            key={`${card.suit}-${card.rank}`}
            onClick={() => {
              playSound("discard");
              onAction("discard", { card });
            }}
          >
            {t("game.discardCard")} {cardView(card).value}{cardView(card).suit}
          </button>
        ))
      ) : (
        <span className="muted">{t("game.waiting")}</span>
      )}
    </div>
  );
}
