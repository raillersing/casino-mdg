import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  AlertCircle,
  ChevronLeft,
  Copy,
  History,
  Loader2,
  MessageCircle,
  MessageSquareOff,
  Send,
  Settings2,
  Smile,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
  RotateCw,
  X,
} from "lucide-react";
import { NetworkQualityBadge } from "@components/ui/NetworkQualityBadge";
import { createGuestToken } from "@services/auth";
import {
  createTableInvitation,
  acceptTableInvitation,
  getTableChat,
  sendTableMessage,
  type ChatMessage,
} from "@services/social";
import { getTables, joinTable, recordGameResult, startBotSimulation } from "@services/games";
import { useGameStore } from "@stores/gameStore";
import { useWebSocket } from "@hooks/useWebSocket";
import { trackEvent } from "@services/analytics";
import { TableExitModal } from "@components/game/TableExitModal";
import { getSeatPosition } from "@utils/tableLayout";
import { TableSettingsModal } from "@components/game/TableSettingsModal";
import { HandReplayerModal, type ReplayableHand } from "@components/game/HandReplayerModal";
import { DominoTile } from "@components/game/DominoTile";
import { LudoBoard } from "@components/game/LudoBoard";
import { haptics } from "@utils/haptics";
import { webNotifications } from "@utils/notifications";

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
  | "domino_snap"
  | "domino_draw"
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
      osc.frequency.setValueAtTime(450, now);
      osc.frequency.exponentialRampToValueAtTime(900, now + 0.08);
      envelope(gain, 0.01, 0.12, 0.12);
      osc.connect(gain).connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.14);
      break;
    }
    case "domino_snap": {
      // Solid heavy ivory/resin domino clack on table
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "triangle";
      osc1.frequency.setValueAtTime(860, now);
      osc1.frequency.exponentialRampToValueAtTime(320, now + 0.05);
      envelope(gain1, 0.002, 0.18, 0.06);
      osc1.connect(gain1).connect(masterGain);
      osc1.start(now);
      osc1.stop(now + 0.08);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(260, now);
      osc2.frequency.exponentialRampToValueAtTime(140, now + 0.08);
      envelope(gain2, 0.003, 0.15, 0.09);
      osc2.connect(gain2).connect(masterGain);
      osc2.start(now);
      osc2.stop(now + 0.11);
      break;
    }
    case "domino_draw": {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(380, now);
      osc.frequency.exponentialRampToValueAtTime(620, now + 0.08);
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
      // Snappy card slap on felt
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(750, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.045);
      envelope(gain, 0.003, 0.16, 0.07);
      osc.connect(gain).connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.09);
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
  const [admissionToken, setAdmissionToken] = useState<string>(
    () => searchParams.get("admission_token") || "",
  );
  const [message, setMessage] = useState("");
  const [wager, setWager] = useState(800);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [showChatDrawer, setShowChatDrawer] = useState(false);
  const [showQuickReactions, setShowQuickReactions] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [playerChats, setPlayerChats] = useState<Record<string, { text: string; expiresAt: number }>>({});
  const [socialError, setSocialError] = useState("");

  const showSpeechBubble = useCallback((author: string, text: string) => {
    setPlayerChats((prev) => ({
      ...prev,
      [author]: { text, expiresAt: Date.now() + 4500 },
    }));
    setShowChatDrawer((isOpen) => {
      if (!isOpen) {
        setUnreadChatCount((c) => c + 1);
      }
      return isOpen;
    });
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setPlayerChats((prev) => {
        let changed = false;
        const next: Record<string, { text: string; expiresAt: number }> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (v.expiresAt > now) {
            next[k] = v;
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);
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
  const [showStatsBar, setShowStatsBar] = useState(
    () => localStorage.getItem("mdg-poker-showstats") === "on",
  );
  const [muteChat, setMuteChat] = useState(
    () => localStorage.getItem("mdg-poker-mutechat") === "on",
  );
  const [hapticsEnabled, setHapticsEnabledState] = useState<boolean>(() => haptics.isEnabled());
  const [isLandscapeMode, setIsLandscapeMode] = useState<boolean>(
    () => localStorage.getItem("mdg-table-landscape") === "on",
  );
  const [dataSaverEnabled, setDataSaverEnabled] = useState<boolean>(
    () => localStorage.getItem("mdg-data-saver") === "on",
  );
  const [showExitModal, setShowExitModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showHandReplayer, setShowHandReplayer] = useState(false);
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
  const [handHistory, setHandHistory] = useState<ReplayableHand[]>([]);

  const toggleLandscapeMode = async () => {
    haptics.buttonTap();
    const next = !isLandscapeMode;
    setIsLandscapeMode(next);
    localStorage.setItem("mdg-table-landscape", next ? "on" : "off");
    try {
      if (next) {
        if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
          await document.documentElement.requestFullscreen().catch(() => {});
        }
        if (window.screen?.orientation && "lock" in window.screen.orientation) {
          await (window.screen.orientation as unknown as { lock: (mode: string) => Promise<void> }).lock("landscape").catch(() => {});
        }
      } else {
        if (document.fullscreenElement && document.exitFullscreen) {
          await document.exitFullscreen().catch(() => {});
        }
        if (window.screen?.orientation && "unlock" in window.screen.orientation) {
          (window.screen.orientation as unknown as { unlock: () => void }).unlock();
        }
      }
    } catch {
      // Ignored: CSS rotation fallback handles it
    }
  };

  const updateHaptics = (enabled: boolean) => {
    setHapticsEnabledState(enabled);
    haptics.setEnabled(enabled);
    if (enabled) haptics.buttonTap();
  };

  const updateDataSaver = (enabled: boolean) => {
    setDataSaverEnabled(enabled);
    localStorage.setItem("mdg-data-saver", enabled ? "on" : "off");
    haptics.buttonTap();
  };

  const [pushNotifsEnabled, setPushNotifsEnabled] = useState<boolean>(() => {
    return localStorage.getItem("mdg-push-notifs") !== "off" && webNotifications.getPermission() === "granted";
  });
  const updatePushNotifs = (enabled: boolean) => {
    setPushNotifsEnabled(enabled);
    localStorage.setItem("mdg-push-notifs", enabled ? "on" : "off");
    haptics.buttonTap();
  };
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
  const sendGameActionRef = useRef<((action: string, actionPayload?: unknown) => void) | null>(null);
  const accessToken = useGameStore((state) => state.accessToken);
  const setSession = useGameStore((state) => state.setSession);
  const setGuestMode = useGameStore((state) => state.setGuestMode);
  const user = useGameStore((state) => state.user);
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
  const isSeated = Boolean(
    myPokerPlayer ||
      statePlayers.some((player) => String(player.id || "") === userId),
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
  const pokerWinners = useMemo(
    () => (Array.isArray(gameState?.winners) ? (gameState.winners as string[]) : []),
    [gameState?.winners],
  );
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
                sendGameActionRef.current?.("new_hand");
              }, 800);
            }
            // Auto-redeal when rami game is finished
            if (
              gameType === "rami" &&
              state.game_state.finished === true
            ) {
              window.setTimeout(() => {
                setGameOver(false);
                sendGameActionRef.current?.("new_hand");
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
            // New hand → reset mise to table minimum (200) so 2000 doesn't stick
            if (gameType === "poker") setWager(200);
            if (motionEnabled) {
              setHandDealing(true);
              haptics.cardDeal();
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
            const boardStrings = communityCards.map((c) => `${cardView(c).value}${cardView(c).suit}`);
            const boardFinal = boardStrings.length ? boardStrings : ["A♠", "K♥", "Q♦", "J♣", "10♠"];
            setHandHistory((current) => [
              ...current.slice(-19),
              {
                handNumber: current.length + 1,
                winners,
                pot: summary.pot || 0,
                ranks,
                communityCards: boardFinal,
                holeCards: holeCards.map((c) => `${cardView(c).value}${cardView(c).suit}`),
                commitmentHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                serverSeed: `s_seed_${Date.now().toString(16)}`,
                clientSeed: `c_seed_${userId || "player"}`,
                deckSignature: boardFinal.join(","),
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
              // Reset wager to street minimum so 2000 doesn't stick to next tour
              if (gameType === "poker") {
                const streetMin = Number((details as { min_raise_to?: number }).min_raise_to ?? 0);
                if (streetMin > 0) setWager(streetMin);
                else if (details.community) setWager(200);
              }
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
            if (action === "roll_dice" || action === "move_pawn") playSound("chip");
            if (action === "play_tile") playSound("card_played");
            if (action === "draw_tile") playSound("draw");
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
          // Clear thinking overlay if bot action was rejected (e.g., illegal check)
          setThinkingPlayer("");
          setThinkingSeats({});
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
      motionEnabled,
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

  // Reset wager to table minimum at each new street/hand so 2000 doesn't stick
  const prevPhaseRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isPoker || !gameState) return;
    const phase = String(gameState.phase || "");
    const prev = prevPhaseRef.current;
    if (prev !== null && prev !== phase) {
      // street changed or new hand: reset to min for this street
      const resetTo = Number(gameState.min_raise_to ?? gameState.big_blind ?? minRaiseTo ?? 200);
      setWager(Math.min(maxRaiseTo, Math.max(resetTo, Number(gameState.small_blind || 100) * 2)));
    } else {
      setWager((current) => Math.min(maxRaiseTo, Math.max(minRaiseTo, current)));
    }
    prevPhaseRef.current = phase;
  }, [gameState, isPoker, maxRaiseTo, minRaiseTo]);

  useEffect(() => {
    if (isMyTurn && !wasMyTurnRef.current) {
      playSound("your_turn");
      haptics.actionTurnAlert();
      if (pushNotifsEnabled) {
        webNotifications.notifyTurn(`${gameType ? gameType.toUpperCase() : "Poker"} (Table ${tableId || ""})`);
      }
    }
    wasMyTurnRef.current = isMyTurn;
  }, [isMyTurn, pushNotifsEnabled, gameType, tableId]);

  useEffect(() => {
    if (gameOver) playSound("game_over");
  }, [gameOver]);

  useEffect(() => {
    if (pokerWinners.length > 0 && userId && pokerWinners.includes(userId)) {
      haptics.winCelebration();
    }
  }, [pokerWinners, userId]);

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
    enabled: Boolean(engineTableId && (admissionToken || accessToken)),
    token: admissionToken || accessToken || undefined,
    onOpen: handleSocketOpen,
    onConnectionStateChange: handleConnectionStateChange,
    onMessage: handleSocketMessage,
  });

  useEffect(() => {
    if (!accessToken && !admissionToken) {
      void createGuestToken("Joueur")
        .then((auth) => {
          setSession(auth.access, auth.refresh);
          setGuestMode(auth.user.display_name, auth.wallet.balance);
        })
        .catch((err) => {
          console.warn("Guest auto-login failed:", err);
        });
    }
  }, [accessToken, admissionToken, setGuestMode, setSession]);

  useEffect(() => {
    if (tableId && (admissionToken || accessToken)) setConnectionState("connecting");
    else if (demoAi && !engineTableId) setConnectionState("offline");
  }, [accessToken, admissionToken, demoAi, engineTableId, tableId]);

  useEffect(() => {
    if (demoAi)
      void trackEvent("demo_connected", {
        mode: "DEMO_AI",
        game_type: gameType,
      });
  }, [demoAi, gameType]);

  useEffect(() => {
    if (!engineTableId || (!admissionToken && !accessToken)) return;
    const heartbeat = window.setInterval(() => {
      send({
        type: "heartbeat",
        table_id: engineTableId,
        sequence,
        timestamp: new Date().toISOString(),
      });
    }, 15000);
    return () => window.clearInterval(heartbeat);
  }, [accessToken, admissionToken, engineTableId, send, sequence]);

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
          if (accessToken && !demoAi) {
            void joinTable(match.id, accessToken).then((res) => {
              if (res?.admission_token) {
                setAdmissionToken(res.admission_token);
              }
            });
          }
        } else if (demoAi && accessToken) {
          const bots = gameType === "poker" ? 8 : (gameType === "rami" ? 1 : 3);
          void startBotSimulation(
            accessToken,
            (gameType as "poker" | "belote" | "rami" | "ludo" | "domino") || "poker",
            "balanced",
            `auto-sim-${Date.now()}`,
            bots,
          ).then((session) => {
            if (session?.table_id) {
              resolvedTableIdRef.current = session.table_id;
              setResolvedTableId(session.table_id);
              if (session.admission_token) {
                setAdmissionToken(session.admission_token);
              }
            }
          });
        } else {
          resolvedTableIdRef.current = tableId;
          setResolvedTableId(tableId);
        }
      })
      .catch(() => {
        if (demoAi && accessToken) {
          const bots = gameType === "poker" ? 8 : (gameType === "rami" ? 1 : 3);
          void startBotSimulation(
            accessToken,
            (gameType as "poker" | "belote" | "rami" | "ludo" | "domino") || "poker",
            "balanced",
            `auto-sim-${Date.now()}`,
            bots,
          ).then((session) => {
            if (session?.table_id) {
              resolvedTableIdRef.current = session.table_id;
              setResolvedTableId(session.table_id);
              if (session.admission_token) {
                setAdmissionToken(session.admission_token);
              }
            }
          });
        } else {
          resolvedTableIdRef.current = tableId;
          setResolvedTableId(tableId);
        }
      });
  }, [accessToken, demoAi, demoTableId, gameType, tableId]);

  // Show rebuy button when short-stacked
  useEffect(() => {
    const stack = Number(myPokerPlayer?.stack ?? 0);
    setShowRebuy(stack > 0 && stack < 2000);
  }, [myPokerPlayer?.stack]);

  useEffect(() => {
    if (!tableId || !accessToken) return;
    let active = true;
    const fetchChat = () => {
      getTableChat(tableId, accessToken)
        .then((payload) => {
          if (!active) return;
          setChat((prev) => {
            if (prev.length < payload.results.length) {
              const incoming = payload.results.slice(prev.length);
              incoming.forEach((msg) => {
                if (msg.author !== (user?.displayName || userId)) {
                  showSpeechBubble(msg.author, msg.body);
                }
              });
            }
            return payload.results;
          });
        })
        .catch(() => {});
    };
    fetchChat();
    const interval = setInterval(fetchChat, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [accessToken, tableId, user?.displayName, userId, showSpeechBubble]);

  const sendMessage = async () => {
    if (!tableId || !accessToken || !message.trim()) return;
    try {
      const sent = await sendTableMessage(tableId, message.trim(), accessToken);
      setChat((current) => [...current, sent]);
      showSpeechBubble(sent.author, sent.body);
      showSpeechBubble(userId, sent.body);
      if (user?.displayName) showSpeechBubble(user.displayName, sent.body);
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

  const sendQuickPhrase = async (phrase: string) => {
    sendEmote(phrase);
    if (!tableId || !accessToken) return;
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([30]);
    }
    try {
      const sent = await sendTableMessage(tableId, phrase, accessToken);
      setChat((current) => [...current, sent]);
      showSpeechBubble(sent.author, sent.body);
      showSpeechBubble(userId, sent.body);
      if (user?.displayName) showSpeechBubble(user.displayName, sent.body);
      setSocialError("");
    } catch (error) {
      setSocialError(error instanceof Error ? error.message : t("app.error"));
    }
  };

  const shareWhatsApp = async () => {
    if (!tableId || !accessToken) return;
    try {
      const result = await createTableInvitation(tableId, accessToken);
      const safeGame = gameType || "poker";
      const link = `${window.location.origin}/game/${safeGame}/${tableId}?invite=${result.token}`;
      const msg = encodeURIComponent(`Avia hilalao ${safeGame.toUpperCase()} amiko amin'ny MDG Game Club ! Tsindrio eto : ${link}`);
      window.open(`https://api.whatsapp.com/send?text=${msg}`, "_blank");
      void trackEvent("invite_sent", {
        game_type: safeGame,
        metadata: { table_id: tableId, channel: "whatsapp" },
      });
      setInvite(link);
      setSocialError("");
    } catch (error) {
      setSocialError(error instanceof Error ? error.message : t("app.error"));
    }
  };

  const sendGameAction = (action: string, actionPayload?: unknown) => {
    if (action === "fold") {
      haptics.fold();
    } else if (action === "bet" || action === "raise") {
      haptics.betPlaced();
    } else {
      haptics.buttonTap();
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
  sendGameActionRef.current = sendGameAction;

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
      className={`game-room${handDealing ? " hand-dealing" : ""}${fourColorDeck ? " four-color-deck" : ""}${isLandscapeMode ? " table-landscape-forced" : ""}${dataSaverEnabled ? " data-saver-mode" : ""}`}
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
            onClick={() => setShowHandReplayer(true)}
            title="Replayer de la main & Équité"
            aria-label="Replayer de la main & Équité"
          >
            <History size={18} />
          </button>
        )}
        <button
          className={`icon-button ${isLandscapeMode ? "active" : ""}`}
          onClick={toggleLandscapeMode}
          title={isLandscapeMode ? "Mode Portrait" : "Basculer en Mode Paysage Plein Écran"}
          aria-label="Mode Paysage"
          style={{ color: isLandscapeMode ? "var(--gold)" : undefined }}
        >
          <RotateCw size={18} />
        </button>
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
          <NetworkQualityBadge overrideLatency={latency} compact />
        </p>
      )}
      {connectionState === "reconnecting" && (
        <p className="secure-note game-sync-note" style={{ color: "var(--gold)", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
          <Loader2 size={14} className="spin" />
          <span>{t("game.reconnecting")} · Place réservée 30s (Tolérance 3G / JIRAMA)...</span>
        </p>
      )}
      {connectionState === "offline" && (
        <p className="secure-note game-sync-note" style={{ color: "var(--red)", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
          <AlertCircle size={14} />
          <span>Réseau interrompu · Vos jetons et votre place restent protégés...</span>
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
                .filter((p) => !p.folded)
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
      {/* 1. Authentic Poker Felt Table (Reserved strictly for Poker) */}
      {isPoker && (
        <div
          className={`felt-table felt-poker ${seatPlayers.length >= 6 ? "table-9max" : seatPlayers.length >= 4 ? "table-6max" : ""}`}
        >
          <div className="table-brand">
            MDG <small>POKER CLUB</small>
          </div>
          {seatPlayers.map((player, index) => {
            const total = seatPlayers.length;
            const pos = getSeatPosition(index, total, isSeated);
            const style: React.CSSProperties = {
              position: "absolute",
              left: pos.left,
              top: pos.top,
              transform: "translate(-50%, -50%)",
            };
            const opponentInfo = String(player?.stack ?? "8 420");
            return (
              <PlayerSeat
                key={String(player.id || index)}
                pos="dynamic"
                name={String(
                  player?.name ||
                    nameForPlayer(String(player?.id || "")) ||
                    botNameForSeat(index),
                )}
                chips={opponentInfo}
                bet={Number(player?.bet || 0)}
                active={currentPlayerId === String(player?.id || "")}
                folded={Boolean(player?.folded)}
                action={
                  lastAction && lastActionPlayer === String(player?.id || "")
                    ? lastAction
                    : ""
                }
                badge={badgeForSeat(player, gameState)}
                thinking={Boolean(thinkingSeats[String(player?.id || "")])}
                botChat={botChats[String(player?.id || "")]}
                playerChat={
                  playerChats[String(player?.id || "")]?.text ||
                  playerChats[String(player?.name || "")]?.text ||
                  null
                }
                seatStyle={style}
                hasCards={!player?.folded}
                stats={(() => {
                  const pid = String(player?.id || "");
                  const tp = (tablePlayers as unknown as Array<Record<string, unknown>>)?.find((p: Record<string, unknown>) => String(p.id) === pid) as Record<string, unknown> | undefined;
                  const prof = String((tp as Record<string, unknown>)?.BotProfile || (tp as Record<string, unknown>)?.botProfile || "");
                  const map: Record<string, string> = { fish: "VPIP 42% · PFR 8%", rock: "VPIP 12% · PFR 9%", maniac: "VPIP 38% · PFR 28%", shark: "VPIP 22% · PFR 18%", donkey: "VPIP 35% · PFR 12%", balanced: "VPIP 24% · PFR 14%" };
                  return prof ? map[prof] || map.balanced : "VPIP 24% · PFR 14%";
                })()}
              />
            );
          })}
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
            {showRebuy && (
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
            {myBet > 0 && (
              <span className="you-bet-chip">{myBet}</span>
            )}
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
      )}

      {/* 2. Modern Ludo Arena Stage (Zero Poker Oval, Tailor-made for 4-Player Ludo) */}
      {gameType === "ludo" && (
        <div className="ludo-arena-stage">
          <div className="ludo-stage-header">
            <div className="ludo-stage-title">
              <span>🎲</span>
              <span>Ludo Malagasy · Arena 4 Joueurs</span>
            </div>
            <div className={`ludo-turn-indicator-pill ${isMyTurn ? "is-my-turn" : ""}`}>
              <span
                className="ludo-pulse-dot"
                style={{
                  backgroundColor: isMyTurn
                    ? "#10b981"
                    : ["#e53935", "#43a047", "#fbc02d", "#1e88e5"][Number(gameState?.current ?? 0)] || "#ffd700",
                }}
              />
              <span>
                {isMyTurn
                  ? "🟢 C'est à vous de jouer !"
                  : `Au tour de ${nameForPlayer(String(statePlayers[Number(gameState?.current ?? 0)]?.id || ""))} (${["Rouge", "Vert", "Jaune", "Bleu"][Number(gameState?.current ?? 0)] || "Joueur"})`}
              </span>
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <span style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.7)" }}>
                Dernier dé : <strong style={{ color: "#ffd700", fontSize: "1.05rem" }}>{Number(gameState?.last_roll ?? 0) > 0 ? Number(gameState?.last_roll) : "—"}</strong>
              </span>
            </div>
          </div>

          <div className="ludo-arena-layout">
            {/* 4 Corner Player Pods */}
            {[
              { camp: 0, name: "Rouge", class: "pod-red", hex: "#e53935" },
              { camp: 1, name: "Vert", class: "pod-green", hex: "#43a047" },
              { camp: 3, name: "Bleu", class: "pod-blue", hex: "#1e88e5" },
              { camp: 2, name: "Jaune", class: "pod-yellow", hex: "#fbc02d" },
            ].map((c) => {
              const player = statePlayers.find((p) => Number(p.color ?? 0) === c.camp) || statePlayers[c.camp];
              const isTheirTurn = Number(gameState?.current ?? 0) === c.camp;
              const isMe = String(player?.id || "") === userId;
              const pawns = Array.isArray(player?.pawns)
                ? (player.pawns as Array<{ id: number; state: string; position: number }>)
                : [];
              const yardCount = pawns.filter((p) => p.state === "base").length;
              const homeCount = pawns.filter((p) => p.state === "home").length;
              const trackCount = pawns.length - yardCount - homeCount;

              return (
                <div
                  key={`ludo-pod-${c.camp}`}
                  className={`ludo-player-pod ${c.class} ${isTheirTurn ? "active-turn" : ""}`}
                >
                  <div className="ludo-pod-header">
                    <div className="ludo-pod-avatar" style={{ backgroundColor: c.hex }}>
                      {isMe ? "M" : String(player?.name || c.name)[0].toUpperCase()}
                    </div>
                    <div className="ludo-pod-identity">
                      <span className="ludo-pod-name">
                        {isMe ? `${t("game.you")} (${c.name})` : String(player?.name || `Camp ${c.name}`)}
                      </span>
                      <span className="ludo-pod-tag" style={{ color: c.hex }}>
                        {isMe ? "Vous" : demoAi ? "Bot IA" : "Joueur"} · Camp {c.name}
                      </span>
                    </div>
                  </div>
                  <div className="ludo-pod-pawns">
                    <div className="ludo-pod-pawn-chip" title="En Yard">
                      <span style={{ opacity: 0.7 }}>Yard</span>
                      <span style={{ color: c.hex }}>{yardCount}</span>
                    </div>
                    <div className="ludo-pod-pawn-chip" title="En Piste">
                      <span style={{ opacity: 0.7 }}>Piste</span>
                      <span style={{ color: "#60a5fa" }}>{trackCount}</span>
                    </div>
                    <div className="ludo-pod-pawn-chip" title="Arrivé">
                      <span style={{ opacity: 0.7 }}>But</span>
                      <span style={{ color: "#ffd700" }}>{homeCount} 🏆</span>
                    </div>
                    <div className="ludo-pod-pawn-chip" title="Score">
                      <span style={{ opacity: 0.7 }}>Pts</span>
                      <span>{Number(player?.score ?? 0)}</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Central Interactive Vector Board */}
            <div className="ludo-board-wrapper">
              <LudoBoard
                players={statePlayers.map((p) => ({
                  id: String(p.id || ""),
                  name: String(p.name || ""),
                  color: Number(p.color ?? 0),
                  pawns: Array.isArray(p.pawns) ? (p.pawns as Array<{ id: number; state: "base" | "track" | "home_path" | "home"; position: number }>) : [],
                  score: Number(p.score ?? 0),
                }))}
                currentTurnIndex={Number(gameState?.current ?? 0)}
                lastRoll={Number(gameState?.last_roll ?? 0)}
                canRoll={Boolean(gameState?.can_roll ?? true)}
                canMove={Boolean(gameState?.can_move ?? false)}
                validMoves={Array.isArray(gameState?.valid_moves) ? (gameState.valid_moves as number[]) : []}
                isMyTurn={isMyTurn}
                myColorIndex={Number(myPokerPlayer?.color ?? 0)}
                onRollDice={() => {
                  playSound("chip");
                  send({
                    type: "action",
                    table_id: engineTableId,
                    action: "roll_dice",
                    sequence,
                    timestamp: new Date().toISOString(),
                  });
                }}
                onMovePawn={(pId) => {
                  playSound("chip");
                  send({
                    type: "action",
                    table_id: engineTableId,
                    action: "move_pawn",
                    payload: { pawn_id: pId },
                    sequence,
                    timestamp: new Date().toISOString(),
                  });
                }}
              />
            </div>
          </div>

          {/* Quick Interactive Actions */}
          <div className="ludo-arena-quick-actions">
            {isMyTurn && Boolean(gameState?.can_roll ?? true) && (
              <button
                type="button"
                className="ludo-roll-dice-btn"
                onClick={() => {
                  playSound("chip");
                  send({
                    type: "action",
                    table_id: engineTableId,
                    action: "roll_dice",
                    sequence,
                    timestamp: new Date().toISOString(),
                  });
                }}
              >
                🎲 {t("game.rollDice") || "Lancer le Dé"}
              </button>
            )}

            {isMyTurn && Boolean(gameState?.can_move) && Array.isArray(gameState?.valid_moves) && (gameState.valid_moves as number[]).length > 0 && (
              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.85rem", color: "#ffd700", fontWeight: 700 }}>
                  Dé: {Number(gameState?.last_roll ?? 0)} — Déplacez un pion :
                </span>
                {(gameState.valid_moves as number[]).map((pId) => (
                  <button
                    key={`quick-pawn-${pId}`}
                    type="button"
                    className="button button-gold button-small"
                    onClick={() => {
                      playSound("chip");
                      send({
                        type: "action",
                        table_id: engineTableId,
                        action: "move_pawn",
                        payload: { pawn_id: pId },
                        sequence,
                        timestamp: new Date().toISOString(),
                      });
                    }}
                    style={{ padding: "8px 14px", fontWeight: 700 }}
                  >
                    ♟️ Avancer Pion #{pId + 1}
                  </button>
                ))}
              </div>
            )}

            {!isMyTurn && (
              <span style={{ fontSize: "0.85rem", color: "rgba(255, 255, 255, 0.6)" }}>
                ⏳ Tour de l'adversaire ({nameForPlayer(String(statePlayers[Number(gameState?.current ?? 0)]?.id || ""))})…
              </span>
            )}
          </div>
          {emote && <div className="table-emote">{emote}</div>}
        </div>
      )}

      {/* 3. Modern Domino Arena Stage (Malagasy Rosewood Lounge, Emerald Runner, Wooden Rack) */}
      {gameType === "domino" && (() => {
        const myTiles = Array.isArray(myPokerPlayer?.hand)
          ? (myPokerPlayer.hand as Array<{ left: number; right: number }>)
          : [];
        const leftEnd = Number(gameState?.left_end ?? -1);
        const rightEnd = Number(gameState?.right_end ?? -1);
        const boardEmpty = leftEnd === -1 && rightEnd === -1;
        const boneyardCount = Number(gameState?.boneyard_count ?? 0);
        const canPlayLeft = (t: { left: number; right: number }) => boardEmpty || t.left === leftEnd || t.right === leftEnd;
        const canPlayRight = (t: { left: number; right: number }) => boardEmpty || t.left === rightEnd || t.right === rightEnd;
        const hasPlayable = myTiles.some((t) => canPlayLeft(t) || canPlayRight(t));

        return (
          <div className="domino-arena-stage">
            {/* Header / HUD */}
            <div className="domino-stage-header">
              <div className="domino-stage-title">
                <span>🁓</span>
                <span>Domino Double-Six · Salon Prestige</span>
              </div>
              <div
                className={`domino-end-indicator ${isMyTurn ? "is-my-turn" : ""}`}
                style={{
                  background: isMyTurn ? "rgba(16, 185, 129, 0.25)" : "rgba(0,0,0,0.45)",
                  borderColor: isMyTurn ? "#10b981" : "rgba(255,255,255,0.15)",
                  color: isMyTurn ? "#6ee7b7" : "#fff",
                }}
              >
                <span>{isMyTurn ? "🟢 Votre tour · Choisissez un domino à poser" : `⏳ Au tour de ${nameForPlayer(currentPlayerId)}`}</span>
              </div>
              {/* 3D Boneyard (Talon) Stack */}
              <div
                className={`domino-boneyard-pile ${isMyTurn && !hasPlayable && boneyardCount > 0 ? "can-draw" : ""}`}
                onClick={() => {
                  if (isMyTurn && !hasPlayable && boneyardCount > 0) {
                    playSound("domino_draw");
                    sendGameAction("draw_tile");
                  }
                }}
                title={isMyTurn && !hasPlayable && boneyardCount > 0 ? "Cliquez pour piocher un domino !" : `Talon : ${boneyardCount} dominos`}
              >
                <div className="domino-tiles-stack-art">
                  <div className="boneyard-tile-layer boneyard-layer-1" />
                  <div className="boneyard-tile-layer boneyard-layer-2" />
                  <div className="boneyard-tile-layer boneyard-layer-3" />
                </div>
                <span style={{ fontSize: "0.78rem", fontWeight: 800, color: "#ffd700" }}>
                  Talon ({boneyardCount})
                </span>
                {isMyTurn && !hasPlayable && boneyardCount > 0 && (
                  <span style={{ fontSize: "0.68rem", color: "#10b981", fontWeight: 700 }}>
                    📥 Piocher !
                  </span>
                )}
              </div>
            </div>

            {/* Opponents Row with Standing Mini-Racks */}
            <div className="domino-opponents-row">
              {seatPlayers.map((player, idx) => {
                const isTheirTurn = currentPlayerId === String(player.id || "");
                const count = Number(player.tile_count ?? (Array.isArray(player.hand) ? player.hand.length : 7));
                return (
                  <div key={String(player.id || idx)} className={`domino-opponent-card ${isTheirTurn ? "active-turn" : ""}`}>
                    <div className="domino-opponent-avatar" style={{ backgroundColor: avatarColor(String(player.name || `P${idx}`)) }}>
                      {String(player.name || `P`)[0].toUpperCase()}
                    </div>
                    <div className="domino-opponent-info">
                      <span className="domino-opponent-name">{String(player.name || `Joueur ${idx + 1}`)}</span>
                      <div className="domino-mini-rack" title={`${count} dominos cachés`}>
                        {Array.from({ length: Math.min(count, 7) }).map((_, i) => (
                          <div key={i} className="domino-face-down-mini" />
                        ))}
                        {count > 7 && <span style={{ fontSize: "10px", color: "#ffd700", marginLeft: "2px" }}>+{count - 7}</span>}
                      </div>
                    </div>
                    {isTheirTurn && (
                      <span style={{ fontSize: "11px", color: "#ffd700", marginLeft: "auto", fontWeight: 700 }}>
                        Réfléchit…
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Center Velvet Runner with Played Dominoes Chain */}
            <div className="domino-center-mat">
              <div className="domino-ends-bar">
                <span className="domino-end-indicator">
                  ◀ Bout Gauche : <strong>{leftEnd >= 0 ? leftEnd : "Libre"}</strong>
                </span>
                <span className="domino-end-indicator">
                  Bout Droit : <strong>{rightEnd >= 0 ? rightEnd : "Libre"}</strong> ▶
                </span>
              </div>

              <div className="domino-chain-scrollable">
                {Array.isArray(gameState?.board) && (gameState.board as Array<{ left: number; right: number }>).length > 0 ? (
                  (gameState.board as Array<{ left: number; right: number }>).map((tile, tIdx, arr) => {
                    const isLatest = tIdx === 0 || tIdx === arr.length - 1;
                    return (
                      <div
                        key={`domino-chain-tile-${tIdx}`}
                        className={isLatest ? "domino-snap-anim" : ""}
                      >
                        <DominoTile
                          left={tile.left}
                          right={tile.right}
                          orientation={tile.left === tile.right ? "vertical" : "horizontal"}
                          size="medium"
                        />
                      </div>
                    );
                  })
                ) : (
                  <div style={{ color: "rgba(255, 255, 255, 0.65)", fontSize: "0.95rem", margin: "auto", textAlign: "center", padding: "20px" }}>
                    ✨ Table ouverte en Palissandre. Le premier joueur ouvre la ligne avec son domino !
                  </div>
                )}
              </div>

              {Boolean(gameState?.blocked) && (
                <div style={{ background: "rgba(239, 68, 68, 0.25)", border: "1px solid #ef4444", borderRadius: "12px", padding: "8px 16px", textAlign: "center", fontSize: "0.9rem", color: "#fca5a5" }}>
                  🔒 <strong>Partie Fermée (Gasy) !</strong> Gagnant au décompte des points minimaux : {String(gameState?.winner || "Adversaire")}
                </div>
              )}
            </div>

            {/* Malagasy Rosewood Rack (Player's Domino Hand) */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
              <div style={{ fontSize: "0.8rem", color: "#d4af37", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                🪵 Votre Chevalet (Dominos en main)
              </div>
              <div className="domino-rack-wooden">
                {myTiles.map((t, idx) => {
                  const mLeft = canPlayLeft(t);
                  const mRight = canPlayRight(t);
                  const isPlayable = isMyTurn && (mLeft || mRight);

                  return (
                    <div
                      key={`domino-my-tile-${idx}`}
                      className={`domino-rack-tile-wrapper ${isPlayable ? "domino-rack-playable-tile" : ""}`}
                    >
                      <DominoTile
                        left={t.left}
                        right={t.right}
                        orientation="vertical"
                        size="medium"
                        isPlayable={isPlayable}
                        onClick={() => {
                          if (!isPlayable) return;
                          playSound("domino_snap");
                          const side = mLeft ? "left" : "right";
                          sendGameAction("play_tile", { tile: t, side });
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            {emote && <div className="table-emote">{emote}</div>}
          </div>
        );
      })()}

      {/* 4. Modern Belote Arena Stage (Prestige Club Card Table, Square Layout, Trick Animations, Fanned Hand) */}
      {gameType === "belote" && (
        <div className="belote-arena-stage">
          {/* Scoreboard Marquee */}
          <div className="belote-scoreboard-marquee">
            <div className="belote-stage-title" style={{ color: "#ffd700", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>♠</span>
              <span>Belote Contrée Malagasy</span>
            </div>
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <span className="belote-team-score-badge team-us">
                Équipe 1 (Nous) : <strong>{beloteTeamPoints[0]} pts</strong> (Total {beloteCumulative[0]})
              </span>
              <span className="belote-team-score-badge">
                Équipe 2 (Eux) : <strong>{beloteTeamPoints[1]} pts</strong> (Total {beloteCumulative[1]})
              </span>
            </div>
            {beloteTrump !== "" && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", fontWeight: 700 }}>
                <span style={{ color: "rgba(255,255,255,0.7)" }}>Atout :</span>
                <span style={{ fontSize: "1.2rem", color: [1, 2].includes(Number(beloteTrump)) ? "#ef4444" : "#f3f4f6" }}>
                  {["♣", "♦", "♥", "♠"][Number(beloteTrump)] || "?"}
                </span>
              </div>
            )}
          </div>

          {/* Square Arena with 4 Players (North=Partner, West=Opp1, East=Opp2, South=Hero) */}
          <div className="belote-square-arena">
            {/* North: Partner */}
            <div className={`belote-seat-card belote-seat-north ${currentPlayerId === String(seatPlayers[1]?.id || "") ? "active-turn" : ""}`}>
              <div className="ludo-pod-avatar" style={{ backgroundColor: "#4db6ac" }}>P</div>
              <div className="ludo-pod-identity">
                <span className="ludo-pod-name">{String(seatPlayers[1]?.name || "Partenaire")}</span>
                <span style={{ fontSize: "0.7rem", color: "#4db6ac", fontWeight: 600 }}>Partenaire (Équipe 1) · {Number(seatPlayers[1]?.hand_count ?? 8)} cartes</span>
                <div className="belote-opponent-cards-mini">
                  {Array.from({ length: Math.min(Number(seatPlayers[1]?.hand_count ?? 8), 8) }).map((_, i) => (
                    <div key={i} className="belote-mini-card-back" />
                  ))}
                </div>
              </div>
            </div>

            {/* West: Left Opponent */}
            <div className={`belote-seat-card belote-seat-west ${currentPlayerId === String(seatPlayers[0]?.id || "") ? "active-turn" : ""}`}>
              <div className="ludo-pod-avatar" style={{ backgroundColor: "#e57373" }}>O</div>
              <div className="ludo-pod-identity">
                <span className="ludo-pod-name">{String(seatPlayers[0]?.name || "Adversaire Ouest")}</span>
                <span style={{ fontSize: "0.7rem", color: "#e57373", fontWeight: 600 }}>Adversaire · {Number(seatPlayers[0]?.hand_count ?? 8)} cartes</span>
                <div className="belote-opponent-cards-mini">
                  {Array.from({ length: Math.min(Number(seatPlayers[0]?.hand_count ?? 8), 8) }).map((_, i) => (
                    <div key={i} className="belote-mini-card-back" />
                  ))}
                </div>
              </div>
            </div>

            {/* Center Pli Mat */}
            <div className="belote-center-pli-mat">
              {beloteTrump !== "" && (
                <div className="belote-trump-gold-seal">
                  <span>Atout :</span>
                  <span style={{ fontSize: "1rem", color: [1, 2].includes(Number(beloteTrump)) ? "#ef4444" : "#ffd700" }}>
                    {["♣", "♦", "♥", "♠"][Number(beloteTrump)] || "?"}
                  </span>
                </div>
              )}

              <div className="belote-cross-pli">
                {/* North slot (Partenaire) */}
                <div className="belote-pli-slot belote-pli-north">
                  <span className="pli-slot-label">Partenaire</span>
                  {beloteTrick[2] ? (
                    <div className="card-played-north">
                      <PlayingCard {...cardView(beloteTrick[2])} />
                    </div>
                  ) : (
                    <div className="pli-slot-empty" />
                  )}
                </div>
                {/* West slot (Ouest) */}
                <div className="belote-pli-slot belote-pli-west">
                  <span className="pli-slot-label">Ouest</span>
                  {beloteTrick[1] ? (
                    <div className="card-played-west">
                      <PlayingCard {...cardView(beloteTrick[1])} />
                    </div>
                  ) : (
                    <div className="pli-slot-empty" />
                  )}
                </div>
                {/* East slot (Est) */}
                <div className="belote-pli-slot belote-pli-east">
                  <span className="pli-slot-label">Est</span>
                  {beloteTrick[3] ? (
                    <div className="card-played-east">
                      <PlayingCard {...cardView(beloteTrick[3])} />
                    </div>
                  ) : (
                    <div className="pli-slot-empty" />
                  )}
                </div>
                {/* South slot (Vous) */}
                <div className="belote-pli-slot belote-pli-south">
                  {beloteTrick[0] ? (
                    <div className="card-played-south">
                      <PlayingCard {...cardView(beloteTrick[0])} />
                    </div>
                  ) : (
                    <div className="pli-slot-empty" />
                  )}
                  <span className="pli-slot-label" style={{ color: "#ffd700", fontWeight: 800 }}>Vous</span>
                </div>
              </div>
            </div>

            {/* East: Right Opponent */}
            <div className={`belote-seat-card belote-seat-east ${currentPlayerId === String(seatPlayers[2]?.id || "") ? "active-turn" : ""}`}>
              <div className="ludo-pod-avatar" style={{ backgroundColor: "#ba68c8" }}>E</div>
              <div className="ludo-pod-identity">
                <span className="ludo-pod-name">{String(seatPlayers[2]?.name || "Adversaire Est")}</span>
                <span style={{ fontSize: "0.7rem", color: "#ba68c8", fontWeight: 600 }}>Adversaire · {Number(seatPlayers[2]?.hand_count ?? 8)} cartes</span>
                <div className="belote-opponent-cards-mini">
                  {Array.from({ length: Math.min(Number(seatPlayers[2]?.hand_count ?? 8), 8) }).map((_, i) => (
                    <div key={i} className="belote-mini-card-back" />
                  ))}
                </div>
              </div>
            </div>

            {/* South: You */}
            <div className={`belote-seat-card belote-seat-south ${isMyTurn ? "active-turn" : ""}`}>
              <div className="ludo-pod-avatar" style={{ backgroundColor: "#ffd700", color: "#111" }}>M</div>
              <div className="ludo-pod-identity">
                <span className="ludo-pod-name">{t("game.you")}</span>
                <span style={{ fontSize: "0.7rem", color: "#ffd700", fontWeight: 600 }}>Équipe 1 · {myHand.length} cartes en main</span>
              </div>
            </div>
          </div>

          {/* Bottom Hero Hand - Real Card Fan with Staggered Dealing Animation */}
          <div className="belote-cards-fan">
            {myHand.map((card, idx) => {
              const total = myHand.length;
              const offset = idx - (total - 1) / 2;
              const rot = offset * 4.5;
              const transY = Math.abs(offset) * 3;
              const delay = `${idx * 0.06}s`;

              return (
                <div
                  key={`belote-hand-${card.suit}-${card.rank}-${idx}`}
                  className={`belote-fan-card-wrapper ${dealPulse ? "dealing-anim" : ""}`}
                  style={
                    {
                      "--rot": `${rot}deg`,
                      "--delay": delay,
                      transform: `rotate(${rot}deg) translateY(${transY}px)`,
                      zIndex: idx + 1,
                    } as React.CSSProperties
                  }
                  onClick={() => {
                    if (!isMyTurn) return;
                    playSound("card_played");
                    sendGameAction("play_card", { card });
                  }}
                >
                  <PlayingCard {...cardView(card)} />
                </div>
              );
            })}
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
          {emote && <div className="table-emote">{emote}</div>}
        </div>
      )}

      {/* 5. Modern Rami Arena Stage */}
      {gameType === "rami" && (
        <div className="rami-arena-stage">
          <div className="ludo-stage-header">
            <div className="ludo-stage-title">
              <span>🂡</span>
              <span>Gin Rami Malagasy</span>
            </div>
            <div className="ludo-turn-indicator-pill">
              <span>{isMyTurn ? "🟢 Votre tour · Tirez ou défaussez" : `⏳ Tour de ${nameForPlayer(currentPlayerId)}`}</span>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "24px", margin: "20px 0" }}>
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
          </div>

          {ramiFinished && (
            <div className="rami-finished">
              {Number(gameState?.knocked_by ?? -1) >= 0 ? (
                <>
                  {t("game.knock")} — {gameState?.gin ? t("game.gin") : ""}
                </>
              ) : (
                "Partie terminée"
              )}
            </div>
          )}

          {/* Melds Area */}
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

          {/* Hero Hand */}
          <div className="hole-cards hole-cards-many">
            {myHand.map((card, index) => {
              const cardKey = `${card.suit}-${card.rank}`;
              const isSelected = selectedRamiCards.has(cardKey);
              return (
                <div
                  key={`rami-hand-${cardKey}-${index}`}
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
            })}
          </div>
          {emote && <div className="table-emote">{emote}</div>}
        </div>
      )}
      {/* Discreet Hand Analysis & Odds Ribbon (placed outside felt table, never hides players) */}
      {(isPoker || gameType === "belote" || gameType === "rami") && (
        <div className="hand-stats-ribbon-container">
          {showStatsBar ? (
            <div className="hand-stats-ribbon">
              <div className="hand-stats-pills">
                {isPoker && typeof gameState?.hand_rank === "string" && Boolean(gameState.hand_rank) && (
                  <>
                    <span className="hand-stats-pill hand-rank-pill">
                      <span className="pill-dot">🃏</span>
                      <strong>{String(gameState.hand_rank)}</strong>
                    </span>
                    {typeof gameState.hand_outs === "number" && (gameState.hand_outs as number) > 0 && (
                      <span className="hand-stats-pill hand-outs-pill">
                        🎯 <strong>{gameState.hand_outs} outs</strong> ({Number(gameState.hand_prob).toFixed(0)}%)
                      </span>
                    )}
                    {(() => {
                      const rank = String(gameState.hand_rank);
                      const map: Record<string, string> = {
                        "Quinte flush": "Équité ~92%",
                        "Carré": "Équité ~99%",
                        "Full": "Équité ~85%",
                        "Couleur": "Équité ~65%",
                        "Quinte": "Équité ~60%",
                        "Brelan": "Équité ~70%",
                        "Double paire": "Équité ~55%",
                        "Paire": "Équité ~55%",
                        "Carte haute": "Équité ~45%",
                      };
                      const eq = map[rank];
                      return eq ? (
                        <span className="hand-stats-pill hand-equity-pill">
                          📈 {eq}
                        </span>
                      ) : null;
                    })()}
                    {typeof gameState.pot === "number" && typeof gameState.to_call === "number" && (gameState.to_call as number) > 0 && (
                      <span className="hand-stats-pill hand-odds-pill">
                        💰 Pot {gameState.pot} · Suivre {gameState.to_call}
                      </span>
                    )}
                  </>
                )}
                {gameType === "belote" && typeof gameState?.trump === "string" && Boolean(gameState.trump) && (
                  <>
                    <span className="hand-stats-pill">
                      ♠ Atout : <strong>{String(gameState.trump)}</strong>
                    </span>
                    <span className="hand-stats-pill">
                      Équipe : <strong>{(gameState as unknown as { team_points?: [number, number] }).team_points?.join(" / ") ?? "0/0"}</strong>
                    </span>
                  </>
                )}
                {gameType === "rami" && (
                  <>
                    <span className="hand-stats-pill">
                      Score : <strong>{(myPokerPlayer as unknown as { score?: number })?.score ?? 0}</strong>
                    </span>
                    <span className="hand-stats-pill">
                      Main : <strong>{myHand.length} cartes</strong>
                    </span>
                  </>
                )}
              </div>
              <button
                type="button"
                className="hand-stats-close-btn"
                onClick={() => {
                  setShowStatsBar(false);
                  localStorage.setItem("mdg-poker-showstats", "off");
                }}
                title="Masquer le bandeau de stats (réactivable à tout moment)"
                aria-label="Masquer les stats"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="hand-stats-minimized">
              <button
                type="button"
                className="hand-stats-reopen-btn"
                onClick={() => {
                  setShowStatsBar(true);
                  localStorage.setItem("mdg-poker-showstats", "on");
                }}
              >
                📊 Cotes & Stats
              </button>
            </div>
          )}
        </div>
      )}
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
      {showQuickReactions && (
        <div className="table-quick-reactions-popover" role="dialog" aria-label="Réactions rapides">
          <div className="quick-emojis-bar">
            {["👏", "🔥", "👍", "😎", "🎯", "😱", "♠", "🎲"].map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="quick-reaction-btn emoji"
                onClick={() => {
                  void sendQuickPhrase(emoji);
                  setShowQuickReactions(false);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="quick-phrases-bar">
            {[
              "Tsara lalao !",
              "Misaotra !",
              "Alefa !",
              "Andraso kely...",
              "GG",
              "Revanche ?",
            ].map((phrase) => (
              <button
                key={phrase}
                type="button"
                className="quick-reaction-btn phrase"
                onClick={() => {
                  void sendQuickPhrase(phrase);
                  setShowQuickReactions(false);
                }}
              >
                {phrase}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="table-feel-toolbar" aria-label="Réglages de la table">
        <button
          type="button"
          className={`quick-chat-bubble-btn ${showQuickReactions ? "active" : ""}`}
          onClick={() => setShowQuickReactions((prev) => !prev)}
          title="Réactions et bulles de discussion"
          aria-label="Réactions et bulles de discussion"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            color: showQuickReactions ? "var(--gold)" : "var(--soft)",
            borderColor: showQuickReactions ? "var(--gold)" : "rgba(211, 176, 107, 0.22)",
            background: showQuickReactions ? "rgba(211, 176, 107, 0.18)" : undefined,
          }}
        >
          <Smile size={14} />
          <span style={{ fontSize: "11px", fontWeight: 600 }}>Réagir</span>
        </button>
        <button
          type="button"
          onClick={() => updatePreference("sound", !soundEnabled)}
          title={soundEnabled ? "Couper le son" : "Activer le son"}
          aria-label={soundEnabled ? "Couper le son" : "Activer le son"}
        >
          {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
        </button>
        <button
          type="button"
          onClick={() => updatePreference("motion", !motionEnabled)}
          title={motionEnabled ? "Animations actives" : "Animations réduites"}
          aria-label={motionEnabled ? "Animations actives" : "Animations réduites"}
        >
          <Sparkles size={14} style={{ opacity: motionEnabled ? 1 : 0.4 }} />
        </button>
        <button
          type="button"
          onClick={() => {
            setShowChatDrawer((prev) => !prev);
            setUnreadChatCount(0);
          }}
          title={showChatDrawer ? "Masquer le tchat" : "Ouvrir le tchat de la table"}
          aria-label={showChatDrawer ? "Masquer le tchat" : "Ouvrir le tchat de la table"}
          style={{ position: "relative" }}
        >
          <MessageCircle size={14} />
          {unreadChatCount > 0 && (
            <span
              style={{
                position: "absolute",
                top: "-4px",
                right: "-4px",
                background: "#ef5350",
                color: "#fff",
                borderRadius: "50%",
                fontSize: "9px",
                fontWeight: 700,
                width: "14px",
                height: "14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {unreadChatCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={toggleLandscapeMode}
          title={isLandscapeMode ? "Mode Portrait" : "Basculer en Mode Paysage"}
          aria-label="Mode Paysage"
          style={{
            color: isLandscapeMode ? "var(--gold)" : "var(--soft)",
            borderColor: isLandscapeMode ? "var(--gold)" : undefined,
            background: isLandscapeMode ? "rgba(211, 176, 107, 0.18)" : undefined,
          }}
        >
          <RotateCw size={14} />
        </button>
      </div>

      {/* Drawer rétractable de tchat de table */}
      {showChatDrawer && (
        <>
          <div
            className="chat-drawer-backdrop"
            onClick={() => setShowChatDrawer(false)}
          />
          <aside className="table-chat-drawer" role="dialog" aria-label="Tchat de la table">
            <div className="chat-drawer-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <MessageCircle size={16} style={{ color: "var(--gold)" }} />
                <strong>{t("game.tableChat")}</strong>
                {muteChat && (
                  <small style={{ color: "#ef5350", fontSize: "11px", display: "flex", alignItems: "center", gap: "3px" }}>
                    <MessageSquareOff size={12} /> Sourdine
                  </small>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => {
                    const next = !muteChat;
                    setMuteChat(next);
                    localStorage.setItem("mdg-poker-mutechat", next ? "on" : "off");
                  }}
                  title={muteChat ? "Activer le son du tchat" : "Mode silence"}
                  aria-label={muteChat ? "Activer le tchat" : "Mode silence"}
                >
                  {muteChat ? <MessageSquareOff size={15} style={{ color: "#ef5350" }} /> : <MessageCircle size={15} />}
                </button>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setShowChatDrawer(false)}
                  aria-label="Fermer le tchat"
                >
                  <X size={17} />
                </button>
              </div>
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

            {/* Phrases de courtoisie rapides (Zéro clavier virtuel) */}
            <div className="quick-phrases-strip" style={{ display: "flex", gap: "6px", overflowX: "auto", padding: "6px 0", scrollbarWidth: "none" }}>
              {[
                "Tsara lalao !",
                "Misaotra !",
                "May vola !",
                "Andraso kely...",
                "Alefa !",
              ].map((phrase) => (
                <button
                  key={phrase}
                  type="button"
                  className="button button-small button-outline"
                  style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "99px", flexShrink: 0, whiteSpace: "nowrap" }}
                  onClick={() => void sendQuickPhrase(phrase)}
                >
                  {phrase}
                </button>
              ))}
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

            <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
              <button
                type="button"
                className="button button-small button-secondary"
                style={{ flex: 1, fontSize: "11px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                onClick={() => void inviteFriend()}
              >
                <Copy size={13} /> {invite ? t("game.invitationCopied") : "Copier le lien"}
              </button>
              <button
                type="button"
                className="button button-small button-gold"
                style={{ flex: 1, fontSize: "11px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                onClick={() => void shareWhatsApp()}
              >
                <Send size={13} /> WhatsApp
              </button>
            </div>
          </aside>
        </>
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
          {/* Phrases de courtoisie rapides (Zéro clavier virtuel) */}
          <div className="quick-phrases-strip" style={{ display: "flex", gap: "6px", overflowX: "auto", padding: "6px 0", scrollbarWidth: "none" }}>
            {[
              "Tsara lalao !",
              "Misaotra !",
              "May vola !",
              "Andraso kely...",
              "Alefa !",
            ].map((phrase) => (
              <button
                key={phrase}
                type="button"
                className="button button-small button-outline"
                style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "99px", flexShrink: 0, whiteSpace: "nowrap" }}
                onClick={() => void sendQuickPhrase(phrase)}
              >
                {phrase}
              </button>
            ))}
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
          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <button
              type="button"
              className="button button-small button-secondary"
              style={{ flex: 1, fontSize: "11px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
              onClick={() => void inviteFriend()}
            >
              <Copy size={13} /> {invite ? t("game.invitationCopied") : "Copier le lien"}
            </button>
            <button
              type="button"
              className="button button-small button-gold"
              style={{ flex: 1, fontSize: "11px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
              onClick={() => void shareWhatsApp()}
            >
              <Send size={13} /> WhatsApp
            </button>
          </div>
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
          {gameType === "ludo" && (
            <>
              <div>
                <span>Jeu</span>
                <strong>Ludo Malagasy</strong>
              </div>
              <div>
                <span>Joueurs</span>
                <strong>2 à 4 joueurs</strong>
              </div>
            </>
          )}
          {gameType === "domino" && (
            <>
              <div>
                <span>Jeu</span>
                <strong>Domino Double-Six</strong>
              </div>
              <div>
                <span>Joueurs</span>
                <strong>2 à 4 joueurs</strong>
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
        muteChat={muteChat}
        onToggleMuteChat={(enabled) => {
          setMuteChat(enabled);
          localStorage.setItem("mdg-poker-mutechat", enabled ? "on" : "off");
        }}
        showStatsBar={showStatsBar}
        onToggleShowStatsBar={(enabled) => {
          setShowStatsBar(enabled);
          localStorage.setItem("mdg-poker-showstats", enabled ? "on" : "off");
        }}
        hapticsEnabled={hapticsEnabled}
        onToggleHaptics={updateHaptics}
        dataSaverEnabled={dataSaverEnabled}
        onToggleDataSaver={updateDataSaver}
        notificationsEnabled={pushNotifsEnabled}
        onToggleNotifications={updatePushNotifs}
      />

      <HandReplayerModal
        isOpen={showHandReplayer}
        onClose={() => setShowHandReplayer(false)}
        hands={handHistory}
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
  playerChat,
  seatStyle,
  hasCards = false,
  stats,
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
  playerChat?: string | null;
  seatStyle?: React.CSSProperties;
  hasCards?: boolean;
  stats?: string;
}) {
  const avColor = avatarColor(name);
  const activeBubble = playerChat || (botChat ? `${botChat.emote} ${botChat.text}` : null);
  return (
    <div
      className={`player-seat seat-${pos} ${active ? "active-seat" : ""} ${folded ? "folded-seat" : ""}`}
      style={seatStyle}
      title={stats ? `${name} — ${stats}` : name}
    >
      <div className="seat-avatar" style={{ background: avColor }}>{name[0]}</div>
      <div>
        <strong>{name}</strong>
        <span>{chips}</span>
        {stats && <small className="seat-stats">{stats}</small>}
      </div>
      {badge && (
        <i className={`seat-badge ${badge.includes("D") ? "seat-dealer" : badge.includes("BB") ? "seat-big-blind" : badge.includes("SB") ? "seat-small-blind" : ""}`}>
          {badge}
        </i>
      )}
      {action && <b className="seat-action-bubble">{action}</b>}
      {thinking && !activeBubble && <span className="seat-thinking-bubble">…</span>}
      {activeBubble && (
        <span className="seat-chat-bubble">
          {activeBubble}
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
  className = "",
  style,
}: {
  value: string;
  suit: string;
  suitIndex?: number;
  red?: boolean;
  hidden?: boolean;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const suitClass =
    suitIndex !== undefined
      ? ["suit-club", "suit-diamond", "suit-heart", "suit-spade"][suitIndex] || ""
      : "";
  const isRed = red || ["♦", "♥"].includes(suit) || suitIndex === 1 || suitIndex === 2;

  if (hidden) {
    return (
      <div
        className={`playing-card hidden-card card-deluxe ${className}`}
        onClick={onClick}
        style={style}
      >
        <div className="card-back-pattern">
          <span className="card-back-emblem">✦</span>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      className={`playing-card card-deluxe ${suitClass} ${isRed ? "card-red red" : "card-black"} ${selected ? "selected" : ""} ${className}`}
    >
      <div className="card-corner card-corner-tl">
        <span className="card-val">{value}</span>
        <span className="card-sym">{suit}</span>
      </div>
      <div className="card-center-suit">
        <span>{suit}</span>
      </div>
      <div className="card-corner card-corner-br">
        <span className="card-val">{value}</span>
        <span className="card-sym">{suit}</span>
      </div>
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
        all_in: "Tapis (All-in)",
        new_hand: "Nouvelle manche",
        hand_started: "Manche lancée",
        hand_summary: "Fin de manche",
        post_sb: "Petite blinde",
        post_bb: "Grosse blinde",
        showdown: "Abattage (Showdown)",
        play_card: "Carte jouée",
        draw: "Pioche",
        discard: "Défausse",
        roll_dice: "Lancer de dé",
        move_pawn: "Déplacement pion",
        play_tile: "Pose domino",
        draw_tile: "Pioche domino",
        pass: "Passe",
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
  if (gameType === "ludo") {
    const activePlayerIndex = Number(state.current ?? 0);
    const lastRoll = Number(state.last_roll ?? 0);
    return (
      <div className="secure-note game-sync-note">
        <strong>🎲 Ludo Malagasy</strong> · Tour : Joueur {activePlayerIndex + 1}
        {lastRoll > 0 ? ` · Dé : ${lastRoll}` : ""} · Joueurs : {players.length}
      </div>
    );
  }
  if (gameType === "domino") {
    const left = Number(state.left_end ?? -1);
    const right = Number(state.right_end ?? -1);
    const boneyardCount = Number(state.boneyard_count ?? 0);
    return (
      <div className="secure-note game-sync-note">
        <strong>🁓 Domino Double-Six</strong> · Ligne : [{left >= 0 ? left : "—"} | {right >= 0 ? right : "—"}]
        · Talon restant : {boneyardCount} · Joueurs : {players.length}
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
        <> · {t("game.knock")}{state.gin ? ` (${t("game.gin")})` : ""}</>
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

  if (gameType === "ludo") {
    const canRoll = Boolean(state?.can_roll ?? true);
    const canMove = Boolean(state?.can_move ?? false);
    const validMoves = Array.isArray(state?.valid_moves) ? (state.valid_moves as number[]) : [];
    const lastRoll = Number(state?.last_roll ?? 0);
    const myPlayerIndex = (statePlayers || []).findIndex((p) => String(p.id || "") === userId);
    const myPawns = myPlayerIndex >= 0 && Array.isArray((statePlayers?.[myPlayerIndex] as Record<string, unknown>)?.pawns)
      ? ((statePlayers?.[myPlayerIndex] as Record<string, unknown>).pawns as Array<{ id: number; state: string; position: number }>)
      : [];

    return (
      <div className="action-row ludo-controls" style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center", alignItems: "center" }}>
        {canRoll && (
          <button
            className="action-bet"
            disabled={!enabled}
            onClick={() => {
              playSound("chip");
              onAction("roll_dice");
            }}
            style={{ fontWeight: "bold", padding: "10px 20px", fontSize: "1rem" }}
          >
            🎲 {t("game.rollDice") || "Lancer le Dé"}
          </button>
        )}
        {canMove && validMoves.length > 0 && (
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <span className="muted" style={{ fontWeight: 600 }}>
              Dé: {lastRoll} — {t("game.choosePawn") || "Déplacer le pion"} :
            </span>
            {validMoves.map((pawnId) => {
              const pawn = myPawns.find((p) => p.id === pawnId);
              const pState = pawn?.state === "base" ? "Yard" : pawn?.state === "home_path" ? "Coulloir" : `Pos ${pawn?.position ?? 0}`;
              return (
                <button
                  key={pawnId}
                  className="action-check"
                  disabled={!enabled}
                  onClick={() => {
                    playSound("chip");
                    onAction("move_pawn", { pawn_id: pawnId });
                  }}
                >
                  ♟️ Pion #{pawnId + 1} ({pState})
                </button>
              );
            })}
          </div>
        )}
        {!canRoll && !canMove && (
          <span className="muted">{t("game.waitingOpponent") || "Tour de l'adversaire..."}</span>
        )}
      </div>
    );
  }

  if (gameType === "domino") {
    const myPlayer = (statePlayers || []).find((p) => String(p.id || "") === userId) as Record<string, unknown> | undefined;
    const dominoHand = Array.isArray(myPlayer?.hand) ? (myPlayer.hand as Array<{ left: number; right: number }>) : [];
    const leftEnd = Number(state?.left_end ?? -1);
    const rightEnd = Number(state?.right_end ?? -1);
    const boneyardCount = Array.isArray(state?.boneyard) ? (state.boneyard as unknown[]).length : Number(state?.boneyard_count ?? 0);
    const boardEmpty = leftEnd === -1 && rightEnd === -1;

    const canPlayTile = (t: { left: number; right: number }) => {
      if (boardEmpty) return true;
      return t.left === leftEnd || t.right === leftEnd || t.left === rightEnd || t.right === rightEnd;
    };

    const hasPlayable = dominoHand.some(canPlayTile);

    return (
      <div className="action-row domino-controls" style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "center" }}>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "center" }}>
          {dominoHand.length > 0 ? (
            dominoHand.map((t, idx) => {
              const playable = canPlayTile(t);
              const matchesLeft = boardEmpty || t.left === leftEnd || t.right === leftEnd;
              const matchesRight = boardEmpty || t.left === rightEnd || t.right === rightEnd;
              const matchesBoth = !boardEmpty && matchesLeft && matchesRight && leftEnd !== rightEnd;

              return (
                <div key={idx} style={{ display: "flex", gap: "2px" }}>
                  {matchesBoth ? (
                    <>
                      <button
                        className="action-check"
                        disabled={!enabled}
                        onClick={() => {
                          playSound("card_played");
                          onAction("play_tile", { tile: t, side: "left" });
                        }}
                        style={{ padding: "8px 10px", fontSize: "0.85rem" }}
                      >
                        ◀ [{t.left}|{t.right}]
                      </button>
                      <button
                        className="action-check"
                        disabled={!enabled}
                        onClick={() => {
                          playSound("card_played");
                          onAction("play_tile", { tile: t, side: "right" });
                        }}
                        style={{ padding: "8px 10px", fontSize: "0.85rem" }}
                      >
                        [{t.left}|{t.right}] ▶
                      </button>
                    </>
                  ) : (
                    <button
                      className="action-check"
                      disabled={!enabled || !playable}
                      onClick={() => {
                        playSound("card_played");
                        const side = matchesLeft ? "left" : "right";
                        onAction("play_tile", { tile: t, side });
                      }}
                      style={{
                        padding: "8px 12px",
                        fontWeight: "bold",
                        opacity: playable ? 1 : 0.45,
                        border: playable ? "1px solid #10b981" : "1px solid #4b5563",
                      }}
                    >
                      [{t.left} | {t.right}]
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <span className="muted">{t("game.noTiles") || "Aucun domino en main"}</span>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
          {boneyardCount > 0 && !hasPlayable && (
            <button
              className="action-bet"
              disabled={!enabled}
              onClick={() => {
                playSound("draw");
                onAction("draw_tile");
              }}
            >
              📥 {t("game.drawTile") || "Piocher dans le Talon"} ({boneyardCount})
            </button>
          )}
          {boneyardCount === 0 && !hasPlayable && (
            <button
              className="action-fold"
              disabled={!enabled}
              onClick={() => {
                playSound("pass");
                onAction("pass");
              }}
            >
              ⛔ {t("game.passDomino") || "Passer (Bouder)"}
            </button>
          )}
        </div>
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
