import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "../styles/gameplay-ux-v2.css";
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
import { ensureGuestSession } from "@services/auth";
import {
  createTableInvitation,
  acceptTableInvitation,
  inviteFriendToTable,
  getTableChat,
  sendTableMessage,
  type ChatMessage,
} from "@services/social";
import {
  getTables,
  joinTable,
  joinTableByCode,
  leaveTable as leaveTableApi,
  getTableAdmission,
  topUpTable,
  recordGameResult,
  startBotSimulation,
  type GameTable,
} from "@services/games";
import { getWalletBalance } from "@services/wallet";
import { useGameStore } from "@stores/gameStore";
import { useWebSocket } from "@hooks/useWebSocket";
import { trackEvent } from "@services/analytics";
import { TableExitModal } from "@components/game/TableExitModal";
import { WaitingRoom, type WaitingPlayer } from "@components/game/WaitingRoom";
import { isConfirmedConnection } from "@utils/playerPresence";
import { PlayerSeat, PlayingCard } from "@components/game/GameTablePrimitives";
import { GameStateSummary } from "@components/game/GameStateSummary";
import { GameSpecificControls } from "@components/game/GameSpecificControls";
import { AVATAR_COLORS, avatarColor } from "@utils/gameAvatar";
import {
  actionLabel,
  badgeForSeat,
  cardView,
  pokerPhaseLabel,
  tokenSubject,
} from "@utils/gamePresentation";
import { PokerBuyInModal } from "@components/game/PokerBuyInModal";
import { PokerTopUpModal } from "@components/game/PokerTopUpModal";
import { getSeatPosition } from "@utils/tableLayout";
import { TableSettingsModal } from "@components/game/TableSettingsModal";
import { TableEmoteWheel } from "@components/game/TableEmoteWheel";
import { SocialHubModal } from "@components/social/SocialHubModal";
import {
  HandReplayerModal,
  type ReplayableHand,
} from "@components/game/HandReplayerModal";
import { DominoTile } from "@components/game/DominoTile";
import { LudoBoard } from "@components/game/LudoBoard";
import { haptics } from "@utils/haptics";
import { webNotifications } from "@utils/notifications";

const BOT_NAMES = [
  "Tovo",
  "Rija",
  "Saholy",
  "Lova",
  "Feno",
  "Koto",
  "Miary",
  "Tsiky",
  "Hery",
  "Soa",
  "Miora",
  "Faly",
  "Rado",
  "Nofy",
  "Vola",
  "Hanta",
];
function botNameForSeat(index: number) {
  return BOT_NAMES[index % BOT_NAMES.length];
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
  if (
    typeof window === "undefined" ||
    !(window as unknown as Record<string, unknown>).AudioContext
  )
    return;
  if (localStorage.getItem("mdg-poker-sound") === "off") return;

  const Ctx = (window as unknown as Record<string, unknown>)
    .AudioContext as typeof AudioContext;
  const ctx = new Ctx();
  if (ctx.state === "suspended") void ctx.resume();

  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.15;
  masterGain.connect(ctx.destination);

  const envelope = (
    g: GainNode,
    attack: number,
    sustain: number,
    decay: number,
  ) => {
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
  automatic?: boolean;
  roll?: number;
  id: string;
  playerId: string;
  action: string;
  amount?: number;
  phase?: string;
  potAfter?: number;
};

export function GamePage() {
  const { t, i18n } = useTranslation();
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
  const [showSocialModal, setShowSocialModal] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [playerChats, setPlayerChats] = useState<
    Record<string, { text: string; expiresAt: number }>
  >({});
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
  const [invitationBuyIn, setInvitationBuyIn] = useState<GameTable | null>(
    null,
  );
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
  const [bestCards, setBestCards] = useState<
    Record<string, Array<{ rank: number; suit: number }>>
  >({});
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
  const [hapticsEnabled, setHapticsEnabledState] = useState<boolean>(() =>
    haptics.isEnabled(),
  );
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
  const closedTableRef = useRef<string | null>(null);
  const observedEngineStateRef = useRef<string | null>(null);
  const [gameState, setGameState] = useState<Record<string, unknown> | null>(
    null,
  );
  const [gameOver, setGameOver] = useState(false);
  const [resultModalDismissed, setResultModalDismissed] = useState(false);
  const [selectedRamiCards, setSelectedRamiCards] = useState<Set<string>>(
    new Set(),
  );
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
        if (
          document.documentElement.requestFullscreen &&
          !document.fullscreenElement
        ) {
          await document.documentElement.requestFullscreen().catch(() => {});
        }
        if (window.screen?.orientation && "lock" in window.screen.orientation) {
          await (
            window.screen.orientation as unknown as {
              lock: (mode: string) => Promise<void>;
            }
          )
            .lock("landscape")
            .catch(() => {});
        }
      } else {
        if (document.fullscreenElement && document.exitFullscreen) {
          await document.exitFullscreen().catch(() => {});
        }
        if (
          window.screen?.orientation &&
          "unlock" in window.screen.orientation
        ) {
          (
            window.screen.orientation as unknown as { unlock: () => void }
          ).unlock();
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
    return (
      localStorage.getItem("mdg-push-notifs") !== "off" &&
      webNotifications.getPermission() === "granted"
    );
  });
  const updatePushNotifs = (enabled: boolean) => {
    setPushNotifsEnabled(enabled);
    localStorage.setItem("mdg-push-notifs", enabled ? "on" : "off");
    haptics.buttonTap();
  };
  const [botChats, setBotChats] = useState<
    Record<string, { text: string; emote: string; ts: number }>
  >({});
  const [thinkingSeats, setThinkingSeats] = useState<Record<string, boolean>>(
    {},
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
  const wasMyTurnRef = useRef(false);
  const prevBeloteTrickLenRef = useRef(0);
  const sendGameActionRef = useRef<
    ((action: string, actionPayload?: unknown) => void) | null
  >(null);
  const accessToken = useGameStore((state) => state.accessToken);
  const user = useGameStore((state) => state.user);
  const updateBalance = useGameStore((state) => state.updateBalance);
  const [tableMeta, setTableMeta] = useState<GameTable | null>(null);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [pendingTopUpNotice, setPendingTopUpNotice] = useState<string | null>(
    null,
  );
  const userId =
    useGameStore((state) => state.user?.id || "") ||
    tokenSubject(accessToken) ||
    tokenSubject(admissionToken);
  const isPoker = gameType === "poker";
  // A public table code must be resolved to the engine UUID before opening
  // the socket. Demo sessions already provide their engine table id.
  const engineTableId =
    demoTableId || resolvedTableId || (demoAi ? tableId : "") || "";
  const statePlayers = useMemo(() => {
    return gameState && Array.isArray(gameState.players)
      ? (gameState.players as Array<Record<string, unknown>>)
      : [];
  }, [gameState]);
  const waitingPlayers: WaitingPlayer[] = useMemo(() => {
    if (!statePlayers.length) return [];
    return statePlayers.map((p, idx) => ({
      id: String(p.id ?? ""),
      name: String(
        p.name ??
          p.display_name ??
          (p.is_bot ? botNameForSeat(idx) : `Joueur ${idx + 1}`),
      ),
      seat: typeof p.seat === "number" ? p.seat : idx,
      isCreator: Boolean(
        tableMeta?.created_by_id &&
        String(p.id) === String(tableMeta.created_by_id),
      ),
      isBot: Boolean(p.is_bot),
      isActive: isConfirmedConnection(p.is_active),
    }));
  }, [statePlayers, tableMeta?.created_by_id]);
  const isWaitingRoom = useMemo(() => {
    if (demoAi || closedTableRef.current) return false;
    if (!gameState) return true;
    if (gameState.status === "waiting" || gameState.started === false)
      return true;
    if (isPoker) {
      return !gameState.phase || gameState.phase === "";
    }
    if (gameType === "belote") {
      return !gameState.phase || gameState.phase === "";
    }
    if (gameType === "ludo") {
      return gameState.current === -1 && !gameState.last_roll;
    }
    if (gameType === "domino") {
      return gameState.current === -1 && !gameState.board;
    }
    if (gameType === "rami") {
      return gameState.current === -1 && gameState.discard === undefined;
    }
    return false;
  }, [demoAi, gameState, isPoker, gameType]);
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
    () =>
      Array.isArray(gameState?.winners) ? (gameState.winners as string[]) : [],
    [gameState?.winners],
  );
  const isPokerShowdown = isPoker && gameState?.phase === "showdown";
  const [showdownDismissed, setShowdownDismissed] = useState(false);
  useEffect(() => {
    if (!isPokerShowdown) setShowdownDismissed(false);
  }, [isPokerShowdown]);
  const isUncontestedWin =
    isPokerShowdown && gameState?.finish_reason === "uncontested";
  const isSessionFinished = isPoker && gameState?.session_finished === true;
  const renderedCommunityCards = communityCards.slice(0, visibleCommunityCount);
  const cardKey = (card: { rank: number; suit: number }) =>
    `${card.rank}-${card.suit}`;
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
  const nameForPlayer = useCallback(
    (playerId: string) => {
      const player = tablePlayers.find(
        (item) => String(item.id || "") === playerId,
      );
      return String(
        player?.name || (playerId === userId ? t("game.you") : playerId),
      );
    },
    [tablePlayers, userId, t],
  );

  const finishedInfo = (() => {
    if (!gameState) return null;

    // 1. DOMINO
    if (gameType === "domino" && Boolean(gameState.finished)) {
      const winnerId = String(gameState.winner || "");
      const isWinnerMe = winnerId === userId;
      const isBlocked = Boolean(gameState.blocked);
      const winnerName = nameForPlayer(winnerId);

      const scores = statePlayers.map((p, idx) => {
        const pId = String(p.id || "");
        const isWinner = pId === winnerId;
        const tiles = Array.isArray(p.hand)
          ? (p.hand as Array<{ left: number; right: number }>)
          : [];
        const pips = tiles.reduce((sum, t) => sum + (t.left + t.right), 0);
        return {
          id: pId,
          name: nameForPlayer(pId),
          isWinner,
          isMe: pId === userId,
          rank: isWinner ? 1 : idx + 2,
          scoreLabel: isBlocked
            ? `${pips} pts en main`
            : isWinner
              ? "0 pt (Domino !)"
              : `${pips} pts en main`,
          subtext: `${tiles.length} domino${tiles.length > 1 ? "s" : ""} restant${tiles.length > 1 ? "s" : ""}`,
        };
      });

      return {
        isFinished: true,
        gameType: "domino",
        title: isWinnerMe
          ? "🏆 Victoire Domino !"
          : "Partie de Domino Terminée",
        subtitle: isBlocked
          ? `Partie fermée (Gasy) ! ${winnerName} l'emporte avec le plus faible total de points.`
          : isWinnerMe
            ? "Félicitations ! Vous avez posé tous vos dominos en premier !"
            : `${winnerName} a posé tous ses dominos et remporte la partie !`,
        winnerName,
        isWinnerMe,
        scores,
        actionLabel: "Nouvelle partie de Domino",
      };
    }

    // 2. LUDO
    if (gameType === "ludo" && Boolean(gameState.finished)) {
      const winnerId = String(gameState.winner || "");
      const isWinnerMe = winnerId === userId;
      const winnerName = nameForPlayer(winnerId);

      const scores = statePlayers
        .map((p) => {
          const pId = String(p.id || "");
          const isWinner = pId === winnerId;
          const score = Number(p.score ?? 0);
          return {
            id: pId,
            name: nameForPlayer(pId),
            isWinner,
            isMe: pId === userId,
            scoreVal: score,
            scoreLabel: `${score} / 4 pions rentrés`,
            subtext: isWinner
              ? "🏆 Vainqueur à la Maison"
              : `${4 - score} pion(s) restant(s)`,
          };
        })
        .sort((a, b) => b.scoreVal - a.scoreVal)
        .map((p, idx) => ({ ...p, rank: idx + 1 }));

      return {
        isFinished: true,
        gameType: "ludo",
        title: isWinnerMe
          ? "🏆 Victoire Ludo Mada !"
          : "Partie de Ludo Terminée",
        subtitle: isWinnerMe
          ? "Magnifique ! Vous avez ramené vos 4 pions à la maison en premier !"
          : `${winnerName} a rentré tous ses 4 pions et remporte la partie !`,
        winnerName,
        isWinnerMe,
        scores,
        actionLabel: "Rejouer une partie de Ludo",
      };
    }

    // 3. BELOTE
    if (gameType === "belote") {
      const phase = String(gameState.phase || "");
      const isRoundFinished =
        phase === "finished" ||
        phase === "settled" ||
        phase === "settled_reported";
      const isMatchGameOver =
        gameOver || beloteCumulative[0] >= 501 || beloteCumulative[1] >= 501;

      if (isRoundFinished || isMatchGameOver) {
        const winningRoundTeam =
          beloteTeamPoints[0] > beloteTeamPoints[1] ? 0 : 1;
        const winningMatchTeam =
          beloteCumulative[0] > beloteCumulative[1] ? 0 : 1;
        const isMyTeamWinner =
          myPokerPlayer?.team ===
          (isMatchGameOver ? winningMatchTeam : winningRoundTeam);

        const scores = [
          {
            id: "team_1",
            name: "Équipe 1 (Nord & Sud)",
            isWinner:
              (isMatchGameOver ? winningMatchTeam : winningRoundTeam) === 0,
            isMe: myPokerPlayer?.team === 0,
            rank:
              (isMatchGameOver ? winningMatchTeam : winningRoundTeam) === 0
                ? 1
                : 2,
            scoreLabel: `Manche : ${beloteTeamPoints[0]} pts`,
            subtext: `Total Cumulé : ${beloteCumulative[0]} / 501 points`,
          },
          {
            id: "team_2",
            name: "Équipe 2 (Est & Ouest)",
            isWinner:
              (isMatchGameOver ? winningMatchTeam : winningRoundTeam) === 1,
            isMe: myPokerPlayer?.team === 1,
            rank:
              (isMatchGameOver ? winningMatchTeam : winningRoundTeam) === 1
                ? 1
                : 2,
            scoreLabel: `Manche : ${beloteTeamPoints[1]} pts`,
            subtext: `Total Cumulé : ${beloteCumulative[1]} / 501 points`,
          },
        ];

        return {
          isFinished: true,
          gameType: "belote",
          title: isMatchGameOver
            ? isMyTeamWinner
              ? "🏆 Victoire du Match de Belote !"
              : "Fin du Match de Belote"
            : "Manche de Belote Terminée",
          subtitle: isMatchGameOver
            ? `L'Équipe ${winningMatchTeam + 1} remporte la partie finale avec ${beloteCumulative[winningMatchTeam]} points !`
            : `Manche remportée par l'Équipe ${winningRoundTeam + 1} (${beloteTeamPoints[winningRoundTeam]} pts contre ${beloteTeamPoints[1 - winningRoundTeam]} pts).`,
          winnerName: `Équipe ${isMatchGameOver ? winningMatchTeam + 1 : winningRoundTeam + 1}`,
          isWinnerMe: isMyTeamWinner,
          scores,
          actionLabel: isMatchGameOver
            ? "Nouveau Match de Belote"
            : "Distribuer la manche suivante",
        };
      }
    }

    // 4. RAMI
    if (gameType === "rami" && Boolean(gameState.finished)) {
      const knockedByIndex = Number(gameState.knocked_by ?? -1);
      const isGin = Boolean(gameState.gin);
      const knockerPlayer = statePlayers[knockedByIndex];
      const winnerId = knockerPlayer ? String(knockerPlayer.id || "") : "";
      const isWinnerMe = winnerId === userId;
      const winnerName = nameForPlayer(winnerId);

      const scores = statePlayers.map((p, idx) => {
        const pId = String(p.id || "");
        const isWinner = idx === knockedByIndex;
        const deadwood = Number(p.score ?? 0);
        return {
          id: pId,
          name: nameForPlayer(pId),
          isWinner,
          isMe: pId === userId,
          rank: isWinner ? 1 : idx + 2,
          scoreLabel: isWinner
            ? isGin
              ? "0 pt (Grand Gin)"
              : "0 pt (Knock)"
            : `+${deadwood} pts de pénalité`,
          subtext: isWinner
            ? "Combinaisons validées"
            : "Cartes restantes non combinées",
        };
      });

      return {
        isFinished: true,
        gameType: "rami",
        title: isWinnerMe
          ? "🏆 Victoire Rami Malagasy !"
          : "Partie de Rami Terminée",
        subtitle: isGin
          ? `${winnerName} réalise un Grand Gin sans aucune carte résiduelle !`
          : `${winnerName} a fermé son jeu (Knock) et remporte la manche !`,
        winnerName,
        isWinnerMe,
        scores,
        actionLabel: "Nouvelle donne de Rami",
      };
    }

    return null;
  })();
  useEffect(() => {
    if (finishedInfo?.isFinished) {
      playSound("game_over");
      if (finishedInfo.isWinnerMe) {
        haptics.winCelebration();
      }
    }
  }, [finishedInfo?.isFinished, finishedInfo?.isWinnerMe]);
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

  const confirmInvitation = useCallback(
    async (buyIn?: number) => {
      if (!invitation || !accessToken) return;
      const result = await acceptTableInvitation(
        invitation,
        accessToken,
        buyIn,
      );
      if (!result.admission_token) throw new Error("Admission indisponible");
      setInvitationBuyIn(null);
      setInvitationState("Invitation acceptée.");
      setAdmissionToken(result.admission_token);
      if (result.table) setTableMeta(result.table);
      navigate(
        `/game/${result.table?.game_type || gameType}/${result.table_code || result.table_id}?table_id=${result.table_id}&admission_token=${encodeURIComponent(result.admission_token)}`,
        { replace: true },
      );
    },
    [invitation, accessToken, gameType, navigate],
  );
  useEffect(() => {
    if (!invitation || !accessToken || invitationHandled.current) return;
    invitationHandled.current = true;
    void acceptTableInvitation(invitation, accessToken, undefined, true)
      .then((result) => {
        if (
          result.table?.game_type === "poker" &&
          Number(result.table.stake_amount) > 0
        ) {
          setInvitationBuyIn(result.table);
        } else {
          void confirmInvitation().catch((error) =>
            setInvitationState(String(error)),
          );
        }
      })
      .catch((error) => setInvitationState(String(error)));
  }, [accessToken, invitation, confirmInvitation]);
  const handleSocketMessage = useCallback(
    (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as {
          type?: string;
          table_id?: string;
          action?: string;
          player_id?: string;
          outcome?: "win" | "loss" | "draw";
          amount?: number;
          sequence?: number;
          payload?: unknown;
        };
        if (
          closedTableRef.current === engineTableId &&
          ["state", "sync"].includes(payload.type || "")
        )
          return;
        if (typeof payload.sequence === "number") {
          sequenceRef.current = payload.sequence;
          setSequence(payload.sequence);
        }
        if (payload.type === "emote") {
          const em = payload.payload as
            { text?: string; emote?: string } | undefined;
          const pId = payload.player_id || "";
          const text = em?.text || em?.emote || "";
          if (text) {
            showSpeechBubble(pId, text);
          }
          return;
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
            // This event means an engine state was actually received, not
            // that a full game was started or completed. Count once per table.
            if (
              engineTableId &&
              observedEngineStateRef.current !== engineTableId
            ) {
              observedEngineStateRef.current = engineTableId;
              void trackEvent("engine_state_received", {
                game_type: gameType,
                mode: demoAi ? "DEMO_AI" : "HUMAN_MATCH",
                metadata: { source: "game_engine" },
              });
            }
            // Auto-redeal when belote everyone passed during bidding
            if (phase === "all_passed" && gameType === "belote") {
              window.setTimeout(() => {
                setGameOver(false);
                sendGameActionRef.current?.("new_hand");
              }, 1200);
            }
            if (
              phase === "bidding" ||
              phase === "preflop" ||
              phase === "playing"
            ) {
              setResultModalDismissed(false);
            }
            if (phase === "showdown") {
              setShowdownRanks(
                (state.game_state.hand_ranks as Record<string, string>) || {},
              );
              setPayouts(
                (state.game_state.payouts as Record<string, number>) || {},
              );
              setBestCards(
                (state.game_state.best_cards as Record<
                  string,
                  Array<{ rank: number; suit: number }>
                >) || {},
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
            payload?: {
              amount?: number;
              phase?: string;
              pot_after?: number;
              automatic?: boolean;
              roll?: number;
            };
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
                automatic: event.payload?.automatic,
                roll: event.payload?.roll,
                amount: event.payload?.amount,
                phase: event.payload?.phase,
                potAfter: event.payload?.pot_after,
              }))
              .filter((entry) => !existing.has(entry.id));
            return [...current, ...replayed].slice(
              gameType === "poker" ? -8 : -64,
            );
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
            automatic?: boolean;
            roll?: number;
            turn_passed?: boolean;
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
              ((details as Record<string, unknown>).best_cards as Record<
                string,
                Array<{ rank: number; suit: number }>
              >) || {},
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
            const boardStrings = (
              Array.isArray(gameState?.community)
                ? (gameState.community as Array<{ rank: number; suit: number }>)
                : []
            ).map((c) => `${cardView(c).value}${cardView(c).suit}`);
            const boardFinal = boardStrings.length
              ? boardStrings
              : ["A♠", "K♥", "Q♦", "J♣", "10♠"];
            setHandHistory((current) => [
              ...current.slice(-19),
              {
                handNumber: current.length + 1,
                winners,
                pot: summary.pot || 0,
                ranks,
                communityCards: boardFinal,
                holeCards: (Array.isArray(myPokerPlayer?.cards)
                  ? (myPokerPlayer.cards as Array<{
                      rank: number;
                      suit: number;
                    }>)
                  : []
                ).map((c) => `${cardView(c).value}${cardView(c).suit}`),
                commitmentHash:
                  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
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
            setThinkingSeats((prev) => ({
              ...prev,
              [payload.player_id || ""]: true,
            }));
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
            setLastAction(
              actionLabel(action) +
                (details.roll ? ` · ${details.roll}` : "") +
                (details.turn_passed ? ` · ${t("game.turnPassed")}` : "") +
                (details.automatic ? ` · ${t("game.automaticAction")}` : ""),
            );
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
                const streetMin = Number(
                  (details as { min_raise_to?: number }).min_raise_to ?? 0,
                );
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
            if (action === "roll_dice" || action === "move_pawn")
              playSound("chip");
            if (action === "play_tile") playSound("card_played");
            if (action === "draw_tile") playSound("draw");
            if (action !== "result" && !presentationOnly) {
              setActionLog((current) => [
                ...current.slice(gameType === "poker" ? -7 : -63),
                {
                  id: `${payload.sequence || Date.now()}-${payload.player_id || "table"}`,
                  playerId: payload.player_id || "",
                  action,
                  automatic: details.automatic,
                  roll: details.roll,
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
          currency?: string;
        };
        const outcome = payload.outcome || resultPayload.outcome;
        const amount = payload.amount ?? resultPayload.amount ?? 0;
        const signature = resultPayload.signature;
        if (
          payload.action === "result" &&
          payload.player_id === userId &&
          resultPayload.currency === "MGA" &&
          accessToken
        ) {
          setResultMessage("Règlement Ariary confirmé par le serveur.");
          void getWalletBalance(accessToken)
            .then((w) => updateBalance(w.mga_balance, w.mga_held_balance))
            .catch(() => undefined);
        }
        if (
          (payload.type === "result" || payload.action === "result") &&
          payload.player_id === userId &&
          outcome &&
          accessToken &&
          gameType &&
          engineTableId &&
          !settled.current &&
          resultPayload.currency !== "MGA"
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
          if (payload.payload === "table is closed") {
            if (payload.table_id && payload.table_id !== engineTableId) return;
            closedTableRef.current = engineTableId;
            setGameState(null);
            setGameConnectionError(t("game.tableClosed"));
            return;
          }
          const errorMsg =
            typeof payload.payload === "string"
              ? payload.payload
              : t("game.tableConnectionError");
          setGameConnectionError(errorMsg);
          // Clear thinking overlay if bot action was rejected (e.g., illegal check)
          setThinkingPlayer("");
          setThinkingSeats({});
          if (errorMsg === "game_over") {
            setGameOver(true);
          }
        }
        if (
          (payload.type === "state" || payload.type === "sync") &&
          !closedTableRef.current
        )
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
      gameState,
      myPokerPlayer,
      showSpeechBubble,
      updateBalance,
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
      const resetTo = Number(
        gameState.min_raise_to ?? gameState.big_blind ?? minRaiseTo ?? 200,
      );
      setWager(
        Math.min(
          maxRaiseTo,
          Math.max(resetTo, Number(gameState.small_blind || 100) * 2),
        ),
      );
    } else {
      setWager((current) =>
        Math.min(maxRaiseTo, Math.max(minRaiseTo, current)),
      );
    }
    prevPhaseRef.current = phase;
  }, [gameState, isPoker, maxRaiseTo, minRaiseTo]);

  useEffect(() => {
    if (isMyTurn && !wasMyTurnRef.current) {
      playSound("your_turn");
      haptics.actionTurnAlert();
      if (pushNotifsEnabled) {
        webNotifications.notifyTurn(
          `${gameType ? gameType.toUpperCase() : "Poker"} (Table ${tableId || ""})`,
        );
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
    (
      state: "connecting" | "connected" | "reconnecting" | "closed" | "offline",
    ) => {
      setConnectionState(state);
    },
    [],
  );
  const refreshedAdmission = useRef("");
  useEffect(() => {
    refreshedAdmission.current = "";
  }, [admissionToken, engineTableId]);
  const getConnectionToken = async () => {
    const ticket = refreshedAdmission.current || admissionToken;
    if (ticket) {
      try {
        const claims = JSON.parse(
          atob(ticket.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
        );
        if (!claims.exp || claims.exp > Date.now() / 1000 + 10) return ticket;
      } catch {
        return ticket;
      }
    }
    if (!accessToken || !engineTableId) throw new Error("Admission requise");
    const admission = await getTableAdmission(engineTableId, accessToken);
    refreshedAdmission.current = admission.admission_token;
    return admission.admission_token;
  };
  const { ws, send, latency } = useWebSocket(socketUrl, {
    enabled: Boolean(engineTableId && admissionToken),
    token: admissionToken || undefined,
    getConnectionToken,
    onOpen: handleSocketOpen,
    onConnectionStateChange: handleConnectionStateChange,
    onMessage: handleSocketMessage,
  });

  useEffect(() => {
    if (!accessToken) {
      void ensureGuestSession("Joueur")
        .catch((err) => {
          console.warn("Guest auto-login failed:", err);
        });
    }
  }, [accessToken]);

  useEffect(() => {
    if (tableId && (admissionToken || accessToken))
      setConnectionState("connecting");
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
    if (!tableId || invitation) return;
    if (demoAi) {
      if (demoTableId) {
        resolvedTableIdRef.current = demoTableId;
        setResolvedTableId(demoTableId);
      }
      if (demoTableId && admissionToken) {
        return;
      }
      if (accessToken && !admissionToken) {
        const bots = gameType === "poker" ? 8 : gameType === "rami" ? 1 : 3;
        void startBotSimulation(
          accessToken,
          (gameType as "poker" | "belote" | "rami" | "ludo" | "domino") ||
            "poker",
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
      }
      return;
    }
    getTables(gameType, accessToken || undefined)
      .then(({ results }) => {
        const match = results.find(
          (table) =>
            table.table_code === tableId ||
            table.id === tableId ||
            table.id === demoTableId ||
            table.access_code === tableId,
        );
        if (match) {
          setTableMeta(match);
          resolvedTableIdRef.current = match.id;
          setResolvedTableId(match.id);
          if (accessToken && !demoAi) {
            if (spectator) {
              void getTableAdmission(
                match.id,
                accessToken,
                match.access_code || undefined,
              )
                .then((admission) =>
                  setAdmissionToken(admission.admission_token),
                )
                .catch((error) => setGameConnectionError(String(error)));
              return;
            }
            if (
              match.game_type === "poker" &&
              Number(match.stake_amount) > 0 &&
              !match.joined &&
              !spectator
            ) {
              navigate(`/lobby/${gameType}?join=${match.id}`, {
                replace: true,
              });
              return;
            }
            void joinTable(
              match.id,
              accessToken,
              match.access_code || undefined,
            )
              .then((res) => {
                if (res?.table) setTableMeta(res.table);
                if (res?.admission_token) {
                  setAdmissionToken(res.admission_token);
                }
              })
              .catch(() => {
                void getTableAdmission(
                  match.id,
                  accessToken,
                  match.access_code || undefined,
                )
                  .then((adm) => {
                    if (adm?.admission_token) {
                      setAdmissionToken(adm.admission_token);
                    }
                  })
                  .catch(() => undefined);
              });
          }
        } else if (accessToken && !demoAi && tableId) {
          // Attempt direct join by code or table ID (for private rooms)
          void joinTableByCode(accessToken, tableId)
            .then((res) => {
              if (res?.table) {
                setTableMeta(res.table);
                resolvedTableIdRef.current = res.table.id;
                setResolvedTableId(res.table.id);
                if (res.admission_token) {
                  setAdmissionToken(res.admission_token);
                }
              }
            })
            .catch(() => {
              resolvedTableIdRef.current = tableId;
              setResolvedTableId(tableId);
            });
        } else if (demoAi && accessToken) {
          const bots = gameType === "poker" ? 8 : gameType === "rami" ? 1 : 3;
          void startBotSimulation(
            accessToken,
            (gameType as "poker" | "belote" | "rami" | "ludo" | "domino") ||
              "poker",
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
          const bots = gameType === "poker" ? 8 : gameType === "rami" ? 1 : 3;
          void startBotSimulation(
            accessToken,
            (gameType as "poker" | "belote" | "rami" | "ludo" | "domino") ||
              "poker",
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
  }, [
    accessToken,
    demoAi,
    demoTableId,
    gameType,
    tableId,
    navigate,
    spectator,
    invitation,
    admissionToken,
  ]);

  useEffect(() => {
    if (!engineTableId || !accessToken) return;
    let active = true;
    const fetchChat = () => {
      getTableChat(engineTableId, accessToken)
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
  }, [accessToken, engineTableId, user?.displayName, userId, showSpeechBubble]);

  const sendMessage = async () => {
    if (!tableId || !accessToken || !message.trim()) return;
    try {
      const sent = await sendTableMessage(
        engineTableId,
        message.trim(),
        accessToken,
      );
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
      const result = await createTableInvitation(engineTableId, accessToken);
      const link = `${window.location.origin}/game/${gameType}/${engineTableId}?invite=${result.token}`;
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

  const handleInviteFriendToTable = async (
    friendId: number,
    friendName: string,
  ) => {
    if (!tableId || !accessToken) return;
    try {
      const result = await inviteFriendToTable(friendId, tableId, accessToken);
      const link = `${window.location.origin}/game/${gameType}/${tableId}?invite=${result.token}`;
      setInvite(link);
      setShowSocialModal(false);
      setSocialError(
        i18n.language.startsWith("mg")
          ? `Nalefa tany amin'i ${friendName} ny fanasana !`
          : `Invitation envoyée à ${friendName} !`,
      );
    } catch (err) {
      setSocialError(err instanceof Error ? err.message : t("app.error"));
    }
  };

  const sendQuickPhrase = async (phrase: string) => {
    sendEmote(phrase);
    showSpeechBubble(userId, phrase);
    if (user?.displayName) showSpeechBubble(user.displayName, phrase);

    if (ws.current?.readyState === WebSocket.OPEN && engineTableId) {
      ws.current.send(
        JSON.stringify({
          type: "emote",
          table_id: engineTableId,
          payload: { text: phrase, emote: phrase },
          timestamp: new Date().toISOString(),
        }),
      );
    }

    if (!tableId || !accessToken) return;
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([30]);
    }
    try {
      const sent = await sendTableMessage(tableId, phrase, accessToken);
      setChat((current) => [...current, sent]);
      setSocialError("");
    } catch {
      // Non-blocking for live emote
    }
  };

  const shareWhatsApp = async () => {
    if (!tableId || !accessToken) return;
    try {
      const result = await createTableInvitation(tableId, accessToken);
      const safeGame = gameType || "poker";
      const link = `${window.location.origin}/game/${safeGame}/${tableId}?invite=${result.token}`;
      const msg = encodeURIComponent(
        `Avia hilalao ${safeGame.toUpperCase()} amiko amin'ny MDG Game Club ! Tsindrio eto : ${link}`,
      );
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
    if (!tableId || (!accessToken && !admissionToken)) {
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

  const topUpRequest = useRef<{ amount: number; key: string } | null>(null);
  const handleConfirmTopUp = async (amount: number) => {
    if (!accessToken || !engineTableId) return;
    if (!topUpRequest.current || topUpRequest.current.amount !== amount) {
      topUpRequest.current = { amount, key: crypto.randomUUID() };
    }
    await topUpTable(
      engineTableId,
      accessToken,
      amount,
      topUpRequest.current.key,
    );
    topUpRequest.current = null;
    void getWalletBalance(accessToken)
      .then((w) => updateBalance(w.mga_balance, w.mga_held_balance ?? 0))
      .catch(() => undefined);
    setPendingTopUpNotice(
      `+${amount.toLocaleString()} Ar réservés — ajout après cette main`,
    );
    window.setTimeout(() => setPendingTopUpNotice(null), 5000);
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

      // Libérer le siège et déclencher la fermeture automatique de la table dans Django
      if (accessToken) {
        void leaveTableApi(leaveTableId, accessToken)
          .then(() => {
            void getWalletBalance(accessToken)
              .then((w) =>
                updateBalance(w.mga_balance, w.mga_held_balance ?? 0),
              )
              .catch(() => undefined);
          })
          .catch(() => undefined);
      }
    }
    window.setTimeout(
      () => navigate(gameType ? `/lobby/${gameType}` : "/lobby"),
      150,
    );
  };

  const hasActiveHand = Boolean(
    isPoker &&
    holeCards.length > 0 &&
    gameState?.phase !== "showdown" &&
    !pokerWinners.length,
  );

  if (invitationBuyIn) {
    return (
      <div className="page-stack">
        <p>Choisissez votre tapis pour accepter l’invitation.</p>
        <PokerBuyInModal
          isOpen
          tableName={invitationBuyIn.name}
          minStake={invitationBuyIn.stake_amount || 0}
          availableBalance={user?.mgaBalance ?? 0}
          onClose={() => navigate(`/lobby/${gameType}`)}
          onConfirm={(amount) => {
            void confirmInvitation(amount).catch((error) =>
              setInvitationState(String(error)),
            );
          }}
        />
        <p role="alert">{invitationState}</p>
      </div>
    );
  }
  if (closedTableRef.current === engineTableId && engineTableId) {
    return (
      <section className="page-stack">
        <h1>Table terminée</h1>
        <p role="status">{t("game.tableClosed")}</p>
        <button
          className="button button-gold"
          onClick={() => navigate(`/lobby/${gameType}`)}
        >
          Retour aux tables
        </button>
      </section>
    );
  }
  if (isWaitingRoom) {
    return (
      <WaitingRoom
        tableId={engineTableId || tableId || ""}
        tableName={tableMeta?.name || `${gameType || "Partie"} entre amis`}
        tableCode={
          tableMeta?.access_code || tableMeta?.table_code || tableId || ""
        }
        gameType={gameType || "poker"}
        maxPlayers={
          tableMeta?.max_players ||
          (gameType === "belote" ? 4 : gameType === "poker" ? 6 : 4)
        }
        currentPlayers={waitingPlayers}
        currentUserId={userId}
        stakeAmount={tableMeta?.stake_amount || 0}
        turnDuration={tableMeta?.turn_duration || 30}
        isPrivate={tableMeta?.is_private}
        accessCode={tableMeta?.access_code}
        connectionError={gameConnectionError}
        onLeave={leaveTable}
      />
    );
  }

  return (
    <div
      className={`game-room game-ux-v2${handDealing ? " hand-dealing" : ""}${fourColorDeck ? " four-color-deck" : ""}${isLandscapeMode ? " table-landscape-forced" : ""}${dataSaverEnabled ? " data-saver-mode" : ""}`}
    >
      <div className="game-room-head">
        <button
          type="button"
          className="back-link"
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
          onClick={() => setShowExitModal(true)}
        >
          <ChevronLeft size={17} /> {t("game.leaveTable")}
        </button>
        <div>
          <strong>{tableMeta?.name || t("game.tableName")}</strong>
          <span>
            <i />{" "}
            {connectionState === "connected"
              ? t("game.connected")
              : connectionState === "connecting"
                ? t("game.connecting")
                : connectionState === "reconnecting"
                  ? t("game.reconnecting")
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
          title={
            isLandscapeMode
              ? "Mode Portrait"
              : "Basculer en Mode Paysage Plein Écran"
          }
          aria-label="Mode Paysage"
          style={{ color: isLandscapeMode ? "var(--gold)" : undefined }}
        >
          <RotateCw size={18} />
        </button>
        <button
          className="icon-button"
          onClick={() => setShowSocialModal(true)}
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
          <p>
            Vous conservez votre place. Vos mains sont passées automatiquement.
          </p>
          <button
            type="button"
            className="primary-button"
            onClick={() => setIsSittingOut(false)}
            style={{
              padding: "8px 24px",
              fontSize: "0.95rem",
              fontWeight: 700,
            }}
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
            style={{
              background: "transparent",
              border: "none",
              color: "var(--gold)",
              cursor: "pointer",
              padding: "0 2px",
              fontWeight: "bold",
            }}
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
        <p
          className="secure-note game-sync-note"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>
            {t("game.syncedPlayers", { count: playerCount })} ·{" "}
            {t("game.sequence")} {sequence}
            {lastAction ? ` · ${lastAction}` : ""}
          </span>
          <NetworkQualityBadge overrideLatency={latency} compact />
        </p>
      )}
      {gameType !== "poker" && actionLog.length > 0 && (
        <details className="board-action-history">
          <summary>{t("game.recentActions")}</summary>
          <ol>
            {actionLog.map((entry) => (
              <li key={entry.id}>
                {nameForPlayer(entry.playerId)} ·{" "}
                {actionLabel(entry.action, entry.phase)}
                {entry.roll ? ` · ${entry.roll}` : ""}
                {entry.automatic ? ` · ${t("game.automaticAction")}` : ""}
              </li>
            ))}
          </ol>
        </details>
      )}
      {connectionState === "reconnecting" && (
        <p
          className="secure-note game-sync-note"
          style={{
            color: "var(--gold)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
          }}
        >
          <Loader2 size={14} className="spin" />
          <span>
            {t("game.reconnecting")} · Place réservée 30s (Tolérance 3G /
            JIRAMA)...
          </span>
        </p>
      )}
      {connectionState === "offline" && (
        <p
          className="secure-note game-sync-note"
          style={{
            color: "var(--red)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
          }}
        >
          <AlertCircle size={14} />
          <span>
            Réseau interrompu · Vos jetons et votre place restent protégés...
          </span>
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
      {isPokerShowdown && !showdownDismissed && (
        <div className="showdown-overlay">
          <div className="showdown-overlay-inner">
            <button
              className="icon-button"
              type="button"
              onClick={() => setShowdownDismissed(true)}
              aria-label={t("game.closeResults")}
            >
              <X size={20} />
            </button>
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
              {(statePlayers.length > 0 ? statePlayers : tablePlayers)
                .filter((p) => !p.folded)
                .map((player) => {
                  const pid = String(player.id || "");
                  const isWinner = pokerWinners.includes(pid);
                  const rank = showdownRanks[pid] || "";
                  const payout = payouts[pid] || 0;
                  const revealed = (
                    gameState?.revealed_cards as
                      Record<string, unknown> | undefined
                  )?.[pid];
                  const rawCards = player.cards || revealed;
                  const playerCards = Array.isArray(rawCards)
                    ? (rawCards as Array<{ rank: number; suit: number }>)
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
                            const isWinning = winningCardKeys.has(
                              cardKey(card),
                            );
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
                            {isUncontestedWin ? "—" : t("game.revealedCards")}
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
              {t("game.pot")} <strong>{String(gameState?.pot ?? 0)}</strong>
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
                  left: `${5 + i * 8}%`,
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
          {pendingTopUpNotice && (
            <div
              style={{
                position: "absolute",
                top: "12px",
                left: "50%",
                transform: "translateX(-50%)",
                background: "rgba(112, 215, 173, 0.95)",
                color: "#0b1014",
                padding: "6px 16px",
                borderRadius: "20px",
                fontSize: "13px",
                fontWeight: 700,
                zIndex: 100,
                boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
              }}
            >
              {pendingTopUpNotice}
            </div>
          )}
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
                    <strong>
                      {actionLabel(entry.action, entry.phase)}
                      {entry.automatic ? ` · ${t("game.automaticAction")}` : ""}
                    </strong>
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
                      <strong>
                        {actionLabel(entry.action, entry.phase)}
                        {entry.automatic
                          ? ` · ${t("game.automaticAction")}`
                          : ""}
                      </strong>
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
                  const tp = (
                    tablePlayers as unknown as Array<Record<string, unknown>>
                  )?.find(
                    (p: Record<string, unknown>) => String(p.id) === pid,
                  ) as Record<string, unknown> | undefined;
                  const prof = String(
                    (tp as Record<string, unknown>)?.BotProfile ||
                      (tp as Record<string, unknown>)?.botProfile ||
                      "",
                  );
                  const map: Record<string, string> = {
                    fish: "VPIP 42% · PFR 8%",
                    rock: "VPIP 12% · PFR 9%",
                    maniac: "VPIP 38% · PFR 28%",
                    shark: "VPIP 22% · PFR 18%",
                    donkey: "VPIP 35% · PFR 12%",
                    balanced: "VPIP 24% · PFR 14%",
                  };
                  return prof
                    ? map[prof] || map.balanced
                    : "VPIP 24% · PFR 14%";
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
                  <PlayingCard
                    key={`empty-${index}`}
                    value="?"
                    suit=""
                    hidden
                  />
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
              <span>
                {Number(myPokerPlayer?.stack ?? 10000).toLocaleString()} Ar
                {Number(myPokerPlayer?.pending_top_up ?? 0) > 0 && (
                  <small
                    style={{
                      color: "#70d7ad",
                      marginLeft: "6px",
                      fontWeight: 700,
                    }}
                  >
                    (+{Number(myPokerPlayer?.pending_top_up).toLocaleString()}{" "}
                    Ar réservés)
                  </small>
                )}
              </span>
            </div>
            {isPoker && !spectator && Number(tableMeta?.stake_amount) > 0 && (
              <button
                type="button"
                className="rebuy-btn"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "4px 8px",
                  fontSize: "12px",
                  fontWeight: 600,
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
                onClick={() => setShowTopUpModal(true)}
              >
                + Ajouter des fonds
              </button>
            )}
            {myPokerPlayer?.waiting_for_hand === true && (
              <p role="status">
                Vous êtes assis. Vos cartes arrivent à la prochaine main.
              </p>
            )}
            {myBet > 0 && <span className="you-bet-chip">{myBet}</span>}
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
            <div
              className={`ludo-turn-indicator-pill ${finishedInfo ? "game-finished-pill" : isMyTurn ? "is-my-turn" : ""}`}
            >
              <span
                className="ludo-pulse-dot"
                style={{
                  backgroundColor: finishedInfo
                    ? "#ffd700"
                    : isMyTurn
                      ? "#10b981"
                      : ["#e53935", "#43a047", "#fbc02d", "#1e88e5"][
                          Number(gameState?.current ?? 0)
                        ] || "#ffd700",
                }}
              />
              <span>
                {finishedInfo
                  ? `🏁 ${finishedInfo.title} · Vainqueur : ${finishedInfo.winnerName}`
                  : isMyTurn
                    ? "🟢 C'est à vous de jouer !"
                    : `Au tour de ${nameForPlayer(String(statePlayers[Number(gameState?.current ?? 0)]?.id || ""))} (${["Rouge", "Vert", "Jaune", "Bleu"][Number(gameState?.current ?? 0)] || "Joueur"})`}
              </span>
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <span
                style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.7)" }}
              >
                Dernier dé :{" "}
                <strong style={{ color: "#ffd700", fontSize: "1.05rem" }}>
                  {Number(gameState?.last_roll ?? 0) > 0
                    ? Number(gameState?.last_roll)
                    : "—"}
                </strong>
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
              const player =
                statePlayers.find((p) => Number(p.color ?? 0) === c.camp) ||
                statePlayers[c.camp];
              const isTheirTurn = Number(gameState?.current ?? 0) === c.camp;
              const isMe = String(player?.id || "") === userId;
              const pawns = Array.isArray(player?.pawns)
                ? (player.pawns as Array<{
                    id: number;
                    state: string;
                    position: number;
                  }>)
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
                    <div
                      className="ludo-pod-avatar"
                      style={{ backgroundColor: c.hex }}
                    >
                      {isMe
                        ? "M"
                        : String(player?.name || c.name)[0].toUpperCase()}
                    </div>
                    <div className="ludo-pod-identity">
                      <span className="ludo-pod-name">
                        {isMe
                          ? `${t("game.you")} (${c.name})`
                          : String(player?.name || `Camp ${c.name}`)}
                      </span>
                      <span className="ludo-pod-tag" style={{ color: c.hex }}>
                        {isMe ? "Vous" : demoAi ? "Bot IA" : "Joueur"} · Camp{" "}
                        {c.name}
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
                  pawns: Array.isArray(p.pawns)
                    ? (p.pawns as Array<{
                        id: number;
                        state: "base" | "track" | "home_path" | "home";
                        position: number;
                      }>)
                    : [],
                  score: Number(p.score ?? 0),
                }))}
                currentTurnIndex={Number(gameState?.current ?? 0)}
                lastRoll={Number(
                  gameState?.last_result || gameState?.last_roll || 0,
                )}
                canRoll={Boolean(gameState?.can_roll ?? true)}
                canMove={Boolean(gameState?.can_move ?? false)}
                validMoves={
                  Array.isArray(gameState?.valid_moves)
                    ? (gameState.valid_moves as number[])
                    : []
                }
                isMyTurn={isMyTurn}
                myColorIndex={Number(myPokerPlayer?.color ?? 0)}
                onRollDice={() => {
                  sendGameAction("roll_dice");
                }}
                onMovePawn={(pId) => {
                  sendGameAction("move_pawn", { pawn_id: pId });
                }}
              />
            </div>
          </div>

          {/* Quick Interactive Actions */}
          <div className="ludo-arena-quick-actions">
            {finishedInfo ? (
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  alignItems: "center",
                  flexWrap: "wrap",
                  justifyContent: "center",
                }}
              >
                <span
                  style={{
                    fontSize: "0.95rem",
                    color: "#ffd700",
                    fontWeight: 700,
                  }}
                >
                  🏁 Partie terminée — Vainqueur : {finishedInfo.winnerName}
                </span>
                <button
                  type="button"
                  className="button button-gold button-small"
                  onClick={() => {
                    sendGameAction("new_hand");
                    setResultModalDismissed(false);
                  }}
                  style={{ padding: "8px 16px", fontWeight: 700 }}
                >
                  🎲 Rejouer une partie
                </button>
                <button
                  type="button"
                  className="button button-ghost button-small"
                  onClick={() => setResultModalDismissed(false)}
                  style={{ padding: "8px 14px" }}
                >
                  🏆 Tableau des scores
                </button>
              </div>
            ) : (
              <>
                {isMyTurn && Boolean(gameState?.can_roll ?? true) && (
                  <button
                    type="button"
                    className="ludo-roll-dice-btn"
                    onClick={() => {
                      sendGameAction("roll_dice");
                    }}
                  >
                    🎲 {t("game.rollDice") || "Lancer le Dé"}
                  </button>
                )}

                {isMyTurn &&
                  Boolean(gameState?.can_move) &&
                  Array.isArray(gameState?.valid_moves) &&
                  (gameState.valid_moves as number[]).length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.85rem",
                          color: "#ffd700",
                          fontWeight: 700,
                        }}
                      >
                        Dé: {Number(gameState?.last_roll ?? 0)} — Déplacez un
                        pion :
                      </span>
                      {(gameState.valid_moves as number[]).map((pId) => (
                        <button
                          key={`quick-pawn-${pId}`}
                          type="button"
                          className="button button-gold button-small"
                          onClick={() => {
                            sendGameAction("move_pawn", { pawn_id: pId });
                          }}
                          style={{ padding: "8px 14px", fontWeight: 700 }}
                        >
                          ♟️ Avancer Pion #{pId + 1}
                        </button>
                      ))}
                    </div>
                  )}

                {!isMyTurn && (
                  <span
                    style={{
                      fontSize: "0.85rem",
                      color: "rgba(255, 255, 255, 0.6)",
                    }}
                  >
                    ⏳ Tour de l'adversaire (
                    {nameForPlayer(
                      String(
                        statePlayers[Number(gameState?.current ?? 0)]?.id || "",
                      ),
                    )}
                    )…
                  </span>
                )}
              </>
            )}
          </div>

          {finishedInfo && (
            <div
              style={{
                display: "flex",
                gap: "10px",
                alignItems: "center",
                justifyContent: "center",
                margin: "14px 0",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                className="button button-gold"
                onClick={() => {
                  sendGameAction("new_hand");
                  setResultModalDismissed(false);
                }}
                style={{ padding: "10px 20px", fontWeight: 700 }}
              >
                🂡 Nouvelle donne de Rami
              </button>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setResultModalDismissed(false)}
                style={{ padding: "10px 16px" }}
              >
                🏆 Tableau des scores
              </button>
            </div>
          )}
          {emote && <div className="table-emote">{emote}</div>}
        </div>
      )}

      {/* 3. Modern Domino Arena Stage (Malagasy Rosewood Lounge, Emerald Runner, Wooden Rack) */}
      {gameType === "domino" &&
        (() => {
          const myTiles = Array.isArray(myPokerPlayer?.hand)
            ? (myPokerPlayer.hand as Array<{ left: number; right: number }>)
            : [];
          const leftEnd = Number(gameState?.left_end ?? -1);
          const rightEnd = Number(gameState?.right_end ?? -1);
          const boardEmpty = leftEnd === -1 && rightEnd === -1;
          const boneyardCount = Number(gameState?.boneyard_count ?? 0);
          const canPlayLeft = (t: { left: number; right: number }) =>
            boardEmpty || t.left === leftEnd || t.right === leftEnd;
          const canPlayRight = (t: { left: number; right: number }) =>
            boardEmpty || t.left === rightEnd || t.right === rightEnd;
          const hasPlayable = myTiles.some(
            (t) => canPlayLeft(t) || canPlayRight(t),
          );

          return (
            <div className="domino-arena-stage">
              {/* Header / HUD */}
              <div className="domino-stage-header">
                <div className="domino-stage-title">
                  <span>🁓</span>
                  <span>Domino Double-Six · Salon Prestige</span>
                </div>
                <div
                  className={`domino-end-indicator ${finishedInfo ? "game-finished-pill" : isMyTurn ? "is-my-turn" : ""}`}
                  style={{
                    background: finishedInfo
                      ? "linear-gradient(135deg, rgba(211, 176, 107, 0.25) 0%, rgba(16, 185, 129, 0.2) 100%)"
                      : isMyTurn
                        ? "rgba(16, 185, 129, 0.25)"
                        : "rgba(0,0,0,0.45)",
                    borderColor: finishedInfo
                      ? "#d3b06b"
                      : isMyTurn
                        ? "#10b981"
                        : "rgba(255,255,255,0.15)",
                    color: finishedInfo
                      ? "#ffd700"
                      : isMyTurn
                        ? "#6ee7b7"
                        : "#fff",
                  }}
                >
                  <span>
                    {finishedInfo
                      ? `🏁 ${finishedInfo.title} · Vainqueur : ${finishedInfo.winnerName}`
                      : isMyTurn
                        ? "🟢 Votre tour · Choisissez un domino à poser"
                        : `⏳ Au tour de ${nameForPlayer(currentPlayerId)}`}
                  </span>
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
                  title={
                    isMyTurn && !hasPlayable && boneyardCount > 0
                      ? "Cliquez pour piocher un domino !"
                      : `Talon : ${boneyardCount} dominos`
                  }
                >
                  <div className="domino-tiles-stack-art">
                    <div className="boneyard-tile-layer boneyard-layer-1" />
                    <div className="boneyard-tile-layer boneyard-layer-2" />
                    <div className="boneyard-tile-layer boneyard-layer-3" />
                  </div>
                  <span
                    style={{
                      fontSize: "0.78rem",
                      fontWeight: 800,
                      color: "#ffd700",
                    }}
                  >
                    Talon ({boneyardCount})
                  </span>
                  {isMyTurn && !hasPlayable && boneyardCount > 0 && (
                    <span
                      style={{
                        fontSize: "0.68rem",
                        color: "#10b981",
                        fontWeight: 700,
                      }}
                    >
                      📥 Piocher !
                    </span>
                  )}
                </div>
              </div>

              {/* Opponents Row with Standing Mini-Racks */}
              <div className="domino-opponents-row">
                {seatPlayers.map((player, idx) => {
                  const isTheirTurn =
                    currentPlayerId === String(player.id || "");
                  const count = Number(
                    player.tile_count ??
                      (Array.isArray(player.hand) ? player.hand.length : 7),
                  );
                  return (
                    <div
                      key={String(player.id || idx)}
                      className={`domino-opponent-card ${isTheirTurn ? "active-turn" : ""}`}
                    >
                      <div
                        className="domino-opponent-avatar"
                        style={{
                          backgroundColor: avatarColor(
                            String(player.name || `P${idx}`),
                          ),
                        }}
                      >
                        {String(player.name || `P`)[0].toUpperCase()}
                      </div>
                      <div className="domino-opponent-info">
                        <span className="domino-opponent-name">
                          {String(player.name || `Joueur ${idx + 1}`)}
                        </span>
                        <div
                          className="domino-mini-rack"
                          title={`${count} dominos cachés`}
                        >
                          {Array.from({ length: Math.min(count, 7) }).map(
                            (_, i) => (
                              <div key={i} className="domino-face-down-mini" />
                            ),
                          )}
                          {count > 7 && (
                            <span
                              style={{
                                fontSize: "10px",
                                color: "#ffd700",
                                marginLeft: "2px",
                              }}
                            >
                              +{count - 7}
                            </span>
                          )}
                        </div>
                      </div>
                      {isTheirTurn && (
                        <span
                          style={{
                            fontSize: "11px",
                            color: "#ffd700",
                            marginLeft: "auto",
                            fontWeight: 700,
                          }}
                        >
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
                    ◀ Bout Gauche :{" "}
                    <strong>{leftEnd >= 0 ? leftEnd : "Libre"}</strong>
                  </span>
                  <span className="domino-end-indicator">
                    Bout Droit :{" "}
                    <strong>{rightEnd >= 0 ? rightEnd : "Libre"}</strong> ▶
                  </span>
                </div>

                <div className="domino-chain-scrollable">
                  {Array.isArray(gameState?.board) &&
                  (gameState.board as Array<{ left: number; right: number }>)
                    .length > 0 ? (
                    (
                      gameState.board as Array<{ left: number; right: number }>
                    ).map((tile, tIdx, arr) => {
                      const isLatest = tIdx === 0 || tIdx === arr.length - 1;
                      return (
                        <div
                          key={`domino-chain-tile-${tIdx}`}
                          className={isLatest ? "domino-snap-anim" : ""}
                        >
                          <DominoTile
                            left={tile.left}
                            right={tile.right}
                            orientation={
                              tile.left === tile.right
                                ? "vertical"
                                : "horizontal"
                            }
                            size="medium"
                          />
                        </div>
                      );
                    })
                  ) : (
                    <div
                      style={{
                        color: "rgba(255, 255, 255, 0.65)",
                        fontSize: "0.95rem",
                        margin: "auto",
                        textAlign: "center",
                        padding: "20px",
                      }}
                    >
                      ✨ Table ouverte en Palissandre. Le premier joueur ouvre
                      la ligne avec son domino !
                    </div>
                  )}
                </div>

                {Boolean(gameState?.blocked) && (
                  <div
                    style={{
                      background: "rgba(239, 68, 68, 0.25)",
                      border: "1px solid #ef4444",
                      borderRadius: "12px",
                      padding: "8px 16px",
                      textAlign: "center",
                      fontSize: "0.9rem",
                      color: "#fca5a5",
                    }}
                  >
                    🔒 <strong>Partie Fermée (Gasy) !</strong> Gagnant au
                    décompte des points minimaux :{" "}
                    {String(gameState?.winner || "Adversaire")}
                  </div>
                )}
              </div>

              {/* Malagasy Rosewood Rack (Player's Domino Hand) */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <div
                  style={{
                    fontSize: "0.8rem",
                    color: "#d4af37",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
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

              {finishedInfo && (
                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "14px 0",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    className="button button-gold"
                    onClick={() => {
                      sendGameAction("new_hand");
                      setResultModalDismissed(false);
                    }}
                    style={{ padding: "10px 20px", fontWeight: 700 }}
                  >
                    🁓 Rejouer une partie de Domino
                  </button>
                  <button
                    type="button"
                    className="button button-ghost"
                    onClick={() => setResultModalDismissed(false)}
                    style={{ padding: "10px 16px" }}
                  >
                    🏆 Voir le décompte des points
                  </button>
                </div>
              )}
              {emote && <div className="table-emote">{emote}</div>}
            </div>
          );
        })()}

      {/* 4. Modern Belote Arena Stage (Prestige Club Card Table, Square Layout, Trick Animations, Fanned Hand) */}
      {gameType === "belote" && (
        <div className="belote-arena-stage">
          {/* Scoreboard Marquee */}
          <div className="belote-scoreboard-marquee">
            <div
              className="belote-stage-title"
              style={{
                color: "#ffd700",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span>♠</span>
              <span>Belote Contrée Malagasy</span>
            </div>
            <div
              className={`ludo-turn-indicator-pill ${finishedInfo ? "game-finished-pill" : isMyTurn ? "is-my-turn" : ""}`}
              style={{ margin: "0 auto" }}
            >
              <span>
                {finishedInfo
                  ? `🏁 ${finishedInfo.title} · ${finishedInfo.winnerName}`
                  : isMyTurn
                    ? "🟢 C'est à vous de jouer !"
                    : `⏳ Au tour de ${nameForPlayer(currentPlayerId)}`}
              </span>
            </div>
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <span className="belote-team-score-badge team-us">
                Équipe 1 (Nous) : <strong>{beloteTeamPoints[0]} pts</strong>{" "}
                (Total {beloteCumulative[0]})
              </span>
              <span className="belote-team-score-badge">
                Équipe 2 (Eux) : <strong>{beloteTeamPoints[1]} pts</strong>{" "}
                (Total {beloteCumulative[1]})
              </span>
            </div>
            {beloteTrump !== "" && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                }}
              >
                <span style={{ color: "rgba(255,255,255,0.7)" }}>Atout :</span>
                <span
                  style={{
                    fontSize: "1.2rem",
                    color: [1, 2].includes(Number(beloteTrump))
                      ? "#ef4444"
                      : "#f3f4f6",
                  }}
                >
                  {["♣", "♦", "♥", "♠"][Number(beloteTrump)] || "?"}
                </span>
              </div>
            )}
          </div>

          {/* Square Arena with 4 Players (North=Partner, West=Opp1, East=Opp2, South=Hero) */}
          <div className="belote-square-arena">
            {/* North: Partner */}
            <div
              className={`belote-seat-card belote-seat-north ${currentPlayerId === String(seatPlayers[1]?.id || "") ? "active-turn" : ""}`}
            >
              <div
                className="ludo-pod-avatar"
                style={{ backgroundColor: "#4db6ac" }}
              >
                P
              </div>
              <div className="ludo-pod-identity">
                <span className="ludo-pod-name">
                  {String(seatPlayers[1]?.name || "Partenaire")}
                </span>
                <span
                  style={{
                    fontSize: "0.7rem",
                    color: "#4db6ac",
                    fontWeight: 600,
                  }}
                >
                  Partenaire (Équipe 1) ·{" "}
                  {Number(seatPlayers[1]?.hand_count ?? 8)} cartes
                </span>
                <div className="belote-opponent-cards-mini">
                  {Array.from({
                    length: Math.min(
                      Number(seatPlayers[1]?.hand_count ?? 8),
                      8,
                    ),
                  }).map((_, i) => (
                    <div key={i} className="belote-mini-card-back" />
                  ))}
                </div>
              </div>
            </div>

            {/* West: Left Opponent */}
            <div
              className={`belote-seat-card belote-seat-west ${currentPlayerId === String(seatPlayers[0]?.id || "") ? "active-turn" : ""}`}
            >
              <div
                className="ludo-pod-avatar"
                style={{ backgroundColor: "#e57373" }}
              >
                O
              </div>
              <div className="ludo-pod-identity">
                <span className="ludo-pod-name">
                  {String(seatPlayers[0]?.name || "Adversaire Ouest")}
                </span>
                <span
                  style={{
                    fontSize: "0.7rem",
                    color: "#e57373",
                    fontWeight: 600,
                  }}
                >
                  Adversaire · {Number(seatPlayers[0]?.hand_count ?? 8)} cartes
                </span>
                <div className="belote-opponent-cards-mini">
                  {Array.from({
                    length: Math.min(
                      Number(seatPlayers[0]?.hand_count ?? 8),
                      8,
                    ),
                  }).map((_, i) => (
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
                  <span
                    style={{
                      fontSize: "1rem",
                      color: [1, 2].includes(Number(beloteTrump))
                        ? "#ef4444"
                        : "#ffd700",
                    }}
                  >
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
                  <span
                    className="pli-slot-label"
                    style={{ color: "#ffd700", fontWeight: 800 }}
                  >
                    Vous
                  </span>
                </div>
              </div>
            </div>

            {/* East: Right Opponent */}
            <div
              className={`belote-seat-card belote-seat-east ${currentPlayerId === String(seatPlayers[2]?.id || "") ? "active-turn" : ""}`}
            >
              <div
                className="ludo-pod-avatar"
                style={{ backgroundColor: "#ba68c8" }}
              >
                E
              </div>
              <div className="ludo-pod-identity">
                <span className="ludo-pod-name">
                  {String(seatPlayers[2]?.name || "Adversaire Est")}
                </span>
                <span
                  style={{
                    fontSize: "0.7rem",
                    color: "#ba68c8",
                    fontWeight: 600,
                  }}
                >
                  Adversaire · {Number(seatPlayers[2]?.hand_count ?? 8)} cartes
                </span>
                <div className="belote-opponent-cards-mini">
                  {Array.from({
                    length: Math.min(
                      Number(seatPlayers[2]?.hand_count ?? 8),
                      8,
                    ),
                  }).map((_, i) => (
                    <div key={i} className="belote-mini-card-back" />
                  ))}
                </div>
              </div>
            </div>

            {/* South: You */}
            <div
              className={`belote-seat-card belote-seat-south ${isMyTurn ? "active-turn" : ""}`}
            >
              <div
                className="ludo-pod-avatar"
                style={{ backgroundColor: "#ffd700", color: "#111" }}
              >
                M
              </div>
              <div className="ludo-pod-identity">
                <span className="ludo-pod-name">{t("game.you")}</span>
                <span
                  style={{
                    fontSize: "0.7rem",
                    color: "#ffd700",
                    fontWeight: 600,
                  }}
                >
                  Équipe 1 · {myHand.length} cartes en main
                </span>
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

          {finishedInfo && (
            <div
              style={{
                display: "flex",
                gap: "10px",
                alignItems: "center",
                justifyContent: "center",
                margin: "14px 0",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                className="button button-gold"
                onClick={() => {
                  setGameOver(false);
                  sendGameAction("new_hand");
                  setResultModalDismissed(false);
                }}
                style={{ padding: "10px 20px", fontWeight: 700 }}
              >
                🃏 {finishedInfo.actionLabel}
              </button>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setResultModalDismissed(false)}
                style={{ padding: "10px 16px" }}
              >
                🏆 Tableau des scores
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
            <div
              className={`ludo-turn-indicator-pill ${finishedInfo ? "game-finished-pill" : ""}`}
            >
              <span>
                {finishedInfo
                  ? `🏁 ${finishedInfo.title} · Vainqueur : ${finishedInfo.winnerName}`
                  : isMyTurn
                    ? "🟢 Votre tour · Tirez ou défaussez"
                    : `⏳ Tour de ${nameForPlayer(currentPlayerId)}`}
              </span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "24px",
              margin: "20px 0",
            }}
          >
            <div className="rami-discard-area">
              <div className="rami-discard-label">Défausse</div>
              <div className="rami-discard">
                {ramiDiscard.length > 0 ? (
                  <PlayingCard
                    {...cardView(ramiDiscard[ramiDiscard.length - 1])}
                  />
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
            {Array.isArray(gameState?.players) &&
              (gameState?.players as Array<Record<string, unknown>>).map(
                (p, idx) => {
                  const melds = p.melds as
                    Array<Array<{ suit: number; rank: number }>> | undefined;
                  if (!melds || melds.length === 0) return null;
                  return (
                    <div key={`melds-${idx}`} className="rami-player-melds">
                      <div className="rami-meld-label">
                        {String(p.name || p.id || `Joueur ${idx + 1}`)} — Melds
                      </div>
                      {melds.map((meld, mIdx) => (
                        <div key={`meld-${mIdx}`} className="rami-meld">
                          {meld.map((card, cIdx) => (
                            <PlayingCard
                              key={`meld-card-${cIdx}`}
                              {...cardView(card)}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  );
                },
              )}
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

          {finishedInfo && (
            <div
              style={{
                display: "flex",
                gap: "10px",
                alignItems: "center",
                justifyContent: "center",
                margin: "14px 0",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                className="button button-gold"
                onClick={() => {
                  sendGameAction("new_hand");
                  setResultModalDismissed(false);
                }}
                style={{ padding: "10px 20px", fontWeight: 700 }}
              >
                🂡 Nouvelle donne de Rami
              </button>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setResultModalDismissed(false)}
                style={{ padding: "10px 16px" }}
              >
                🏆 Tableau des scores
              </button>
            </div>
          )}
          {emote && <div className="table-emote">{emote}</div>}
        </div>
      )}
      {/* Discreet Hand Analysis & Odds Ribbon (placed outside felt table, never hides players) */}
      {(isPoker || gameType === "belote" || gameType === "rami") && (
        <div className="hand-stats-ribbon-container">
          {showStatsBar ? (
            <div className="hand-stats-ribbon">
              <div className="hand-stats-pills">
                {isPoker &&
                  typeof gameState?.hand_rank === "string" &&
                  Boolean(gameState.hand_rank) && (
                    <>
                      <span className="hand-stats-pill hand-rank-pill">
                        <span className="pill-dot">🃏</span>
                        <strong>{String(gameState.hand_rank)}</strong>
                      </span>
                      {typeof gameState.hand_outs === "number" &&
                        typeof gameState.hand_prob === "number" &&
                        (gameState.hand_outs as number) > 0 && (
                          <span className="hand-stats-pill hand-outs-pill">
                            🎯 <strong>{gameState.hand_outs} outs</strong> (
                            {Number(gameState.hand_prob).toFixed(0)}%)
                          </span>
                        )}
                      {/* Only engine-computed probabilities should be displayed. */}
                      {typeof gameState.pot === "number" &&
                        typeof gameState.to_call === "number" &&
                        (gameState.to_call as number) > 0 && (
                          <span className="hand-stats-pill hand-odds-pill">
                            💰 Pot {gameState.pot} · Suivre {gameState.to_call}
                          </span>
                        )}
                    </>
                  )}
                {gameType === "belote" &&
                  typeof gameState?.trump === "string" &&
                  Boolean(gameState.trump) && (
                    <>
                      <span className="hand-stats-pill">
                        ♠ Atout : <strong>{String(gameState.trump)}</strong>
                      </span>
                      <span className="hand-stats-pill">
                        Équipe :{" "}
                        <strong>
                          {(
                            gameState as unknown as {
                              team_points?: [number, number];
                            }
                          ).team_points?.join(" / ") ?? "0/0"}
                        </strong>
                      </span>
                    </>
                  )}
                {gameType === "rami" && (
                  <>
                    <span className="hand-stats-pill">
                      Score :{" "}
                      <strong>
                        {(myPokerPlayer as unknown as { score?: number })
                          ?.score ?? 0}
                      </strong>
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
              {isMyTurn
                ? t("game.yourTurnAction")
                : demoAi
                  ? "Tour du robot"
                  : "Tour de l’adversaire"}
            </strong>
            <span>{t("game.chooseAction")}</span>
          </div>
        </div>
        {spectator ? (
          <div className="secure-note game-sync-note">
            {t("spectatorReadOnly")}
          </div>
        ) : isPoker ? (
          <div
            style={{
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
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
                      (allowedActions.length > 0 &&
                        !allowedActions.includes("fold"))
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
                    {facingBet
                      ? `Suivre ${toCall.toLocaleString("fr-FR")}`
                      : t("game.check")}
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
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <button
                        type="button"
                        className="bet-stepper-btn"
                        onClick={() =>
                          setWager((w) => Math.max(minRaiseTo, w - 100))
                        }
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
                        onChange={(event) =>
                          setWager(Number(event.target.value))
                        }
                      />
                      <button
                        type="button"
                        className="bet-stepper-btn"
                        onClick={() =>
                          setWager((w) => Math.min(maxRaiseTo, w + 100))
                        }
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
                      setWager(
                        Math.min(
                          maxRaiseTo,
                          Math.max(minRaiseTo, myBet + Math.round(pot * 0.33)),
                        ),
                      );
                    }}
                  >
                    1/3 Pot
                  </button>
                  <button
                    type="button"
                    className="bet-shortcut-button"
                    onClick={() => {
                      const pot = Number(gameState?.pot || 0);
                      setWager(
                        Math.min(
                          maxRaiseTo,
                          Math.max(minRaiseTo, myBet + Math.round(pot * 0.5)),
                        ),
                      );
                    }}
                  >
                    1/2 Pot
                  </button>
                  <button
                    type="button"
                    className="bet-shortcut-button"
                    onClick={() => {
                      const pot = Number(gameState?.pot || 0);
                      setWager(
                        Math.min(
                          maxRaiseTo,
                          Math.max(minRaiseTo, myBet + Math.round(pot * 0.67)),
                        ),
                      );
                    }}
                  >
                    2/3 Pot
                  </button>
                  <button
                    type="button"
                    className="bet-shortcut-button"
                    onClick={() => {
                      const pot = Number(gameState?.pot || 0);
                      setWager(
                        Math.min(
                          maxRaiseTo,
                          Math.max(minRaiseTo, myBet + Math.round(pot * 0.75)),
                        ),
                      );
                    }}
                  >
                    3/4 Pot
                  </button>
                  <button
                    type="button"
                    className="bet-shortcut-button"
                    onClick={() => {
                      const pot = Number(gameState?.pot || 0);
                      setWager(
                        Math.min(maxRaiseTo, Math.max(minRaiseTo, myBet + pot)),
                      );
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
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--muted)",
                    marginRight: "4px",
                  }}
                >
                  ⚡ Actions anticipées :
                </span>
                <label
                  className={`pre-action-item ${preAction === "check_fold" ? "active" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={preAction === "check_fold"}
                    onChange={(e) =>
                      setPreAction(e.target.checked ? "check_fold" : null)
                    }
                  />
                  Check / Fold
                </label>
                <label
                  className={`pre-action-item ${preAction === "auto_check" ? "active" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={preAction === "auto_check"}
                    onChange={(e) =>
                      setPreAction(e.target.checked ? "auto_check" : null)
                    }
                  />
                  Auto-Check
                </label>
                <label
                  className={`pre-action-item ${preAction === "call_any" ? "active" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={preAction === "call_any"}
                    onChange={(e) =>
                      setPreAction(e.target.checked ? "call_any" : null)
                    }
                  />
                  Suivre (Call)
                </label>
                <label
                  className={`pre-action-item ${preAction === "fold_any" ? "active" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={preAction === "fold_any"}
                    onChange={(e) =>
                      setPreAction(e.target.checked ? "fold_any" : null)
                    }
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
            onSound={playSound}
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
        <TableEmoteWheel
          onSend={(phrase) => {
            void sendQuickPhrase(phrase);
          }}
          onClose={() => setShowQuickReactions(false)}
          cooldownSeconds={2.5}
        />
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
            borderColor: showQuickReactions
              ? "var(--gold)"
              : "rgba(211, 176, 107, 0.22)",
            background: showQuickReactions
              ? "rgba(211, 176, 107, 0.18)"
              : undefined,
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
          aria-label={
            motionEnabled ? "Animations actives" : "Animations réduites"
          }
        >
          <Sparkles size={14} style={{ opacity: motionEnabled ? 1 : 0.4 }} />
        </button>
        <button
          type="button"
          onClick={() => {
            setShowChatDrawer((prev) => !prev);
            setUnreadChatCount(0);
          }}
          title={
            showChatDrawer ? "Masquer le tchat" : "Ouvrir le tchat de la table"
          }
          aria-label={
            showChatDrawer ? "Masquer le tchat" : "Ouvrir le tchat de la table"
          }
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
            background: isLandscapeMode
              ? "rgba(211, 176, 107, 0.18)"
              : undefined,
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
          <aside
            className="table-chat-drawer"
            role="dialog"
            aria-label="Tchat de la table"
          >
            <div className="chat-drawer-header">
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <MessageCircle size={16} style={{ color: "var(--gold)" }} />
                <strong>{t("game.tableChat")}</strong>
                {muteChat && (
                  <small
                    style={{
                      color: "#ef5350",
                      fontSize: "11px",
                      display: "flex",
                      alignItems: "center",
                      gap: "3px",
                    }}
                  >
                    <MessageSquareOff size={12} /> Sourdine
                  </small>
                )}
              </div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "4px" }}
              >
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => {
                    const next = !muteChat;
                    setMuteChat(next);
                    localStorage.setItem(
                      "mdg-poker-mutechat",
                      next ? "on" : "off",
                    );
                  }}
                  title={muteChat ? "Activer le son du tchat" : "Mode silence"}
                  aria-label={muteChat ? "Activer le tchat" : "Mode silence"}
                >
                  {muteChat ? (
                    <MessageSquareOff size={15} style={{ color: "#ef5350" }} />
                  ) : (
                    <MessageCircle size={15} />
                  )}
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
            <div
              className="quick-phrases-strip"
              style={{
                display: "flex",
                gap: "6px",
                overflowX: "auto",
                padding: "6px 0",
                scrollbarWidth: "none",
              }}
            >
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
                  style={{
                    fontSize: "11px",
                    padding: "3px 8px",
                    borderRadius: "99px",
                    flexShrink: 0,
                    whiteSpace: "nowrap",
                  }}
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
                style={{
                  flex: 1,
                  fontSize: "11px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
                onClick={() => void inviteFriend()}
              >
                <Copy size={13} />{" "}
                {invite ? t("game.invitationCopied") : "Copier le lien"}
              </button>
              <button
                type="button"
                className="button button-small button-gold"
                style={{
                  flex: 1,
                  fontSize: "11px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
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
          <div
            className="quick-phrases-strip"
            style={{
              display: "flex",
              gap: "6px",
              overflowX: "auto",
              padding: "6px 0",
              scrollbarWidth: "none",
            }}
          >
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
                style={{
                  fontSize: "11px",
                  padding: "3px 8px",
                  borderRadius: "99px",
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
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
              style={{
                flex: 1,
                fontSize: "11px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
              onClick={() => void inviteFriend()}
            >
              <Copy size={13} />{" "}
              {invite ? t("game.invitationCopied") : "Copier le lien"}
            </button>
            <button
              type="button"
              className="button button-small button-gold"
              style={{
                flex: 1,
                fontSize: "11px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
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

      <SocialHubModal
        isOpen={showSocialModal}
        onClose={() => setShowSocialModal(false)}
        currentTableId={tableId}
        onInviteFriend={handleInviteFriendToTable}
      />

      {showTopUpModal && (
        <PokerTopUpModal
          isOpen={showTopUpModal}
          onClose={() => setShowTopUpModal(false)}
          onConfirmTopUp={handleConfirmTopUp}
          currentStack={Number(myPokerPlayer?.stack ?? 0)}
          availableBalance={user?.mgaBalance ?? 0}
          pendingTopUp={Number(myPokerPlayer?.pending_top_up ?? 0)}
        />
      )}

      {finishedInfo && !resultModalDismissed && (
        <div
          className="game-result-modal-backdrop"
          onClick={() => setResultModalDismissed(true)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="game-result-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="game-result-trophy">
              {finishedInfo.isWinnerMe ? "🏆" : "🎖️"}
            </div>
            <h2>{finishedInfo.title}</h2>
            <p className="result-subtitle">{finishedInfo.subtitle}</p>

            <div className="game-result-scores-list">
              {finishedInfo.scores.map((sc) => (
                <div
                  key={sc.id}
                  className={`game-result-score-item ${sc.isWinner ? "is-winner" : ""} ${sc.isMe ? "is-me" : ""}`}
                >
                  <div className="game-result-player-identity">
                    <span className="game-result-rank-badge">
                      {sc.rank === 1
                        ? "🥇"
                        : sc.rank === 2
                          ? "🥈"
                          : sc.rank === 3
                            ? "🥉"
                            : `#${sc.rank}`}
                    </span>
                    <div className="game-result-player-name">
                      {sc.name}{" "}
                      {sc.isMe && (
                        <span style={{ color: "#ffd700", fontSize: "11px" }}>
                          ({t("game.you")})
                        </span>
                      )}
                      {sc.subtext && <small>{sc.subtext}</small>}
                    </div>
                  </div>
                  <div className="game-result-score-val">{sc.scoreLabel}</div>
                </div>
              ))}
            </div>

            <div className="game-result-actions">
              <button
                type="button"
                className="button button-gold"
                onClick={() => {
                  setGameOver(false);
                  sendGameAction("new_hand");
                  setResultModalDismissed(false);
                }}
              >
                🔄 {finishedInfo.actionLabel || "Rejouer"}
              </button>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => navigate("/lobby")}
              >
                🚪 {t("game.backLobby") || "Salon"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
