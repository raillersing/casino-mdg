import { useState, useRef, useEffect, useCallback } from "react";
import {
  Sparkles,
  Zap,
  HelpCircle,
  RefreshCw,
  Flame,
  Volume2,
  VolumeX,
  Play,
  Square,
} from "lucide-react";
import { casinoAudio } from "@utils/casinoAudio";
import { type InstantPlay } from "@services/testGames";

interface SlotMachineProps {
  cost: number;
  maxPrize: number;
  onSpin: () => Promise<InstantPlay | null>;
  disabled?: boolean;
  onWin: (play: InstantPlay) => void;
}

const SLOT_SYMBOLS = [
  { id: "seven", label: "7️⃣ Sept d'Or", icon: "7️⃣", multiplier: 50, tier: "jackpot" },
  { id: "diamond", label: "💎 Diamant Royal", icon: "💎", multiplier: 25, tier: "high" },
  { id: "baobab", label: "🌴 Baobab MDG", icon: "🌴", multiplier: 10, tier: "high" },
  { id: "bell", label: "🔔 Cloche d'Or", icon: "🔔", multiplier: 5, tier: "mid" },
  { id: "cherry", label: "🍒 Cerise", icon: "🍒", multiplier: 2, tier: "low" },
  { id: "lemon", label: "🍋 Citron", icon: "🍋", multiplier: 1, tier: "low" },
];

// Repeat symbols 6 times for ultra-smooth continuous strip scrolling
const REEL_STRIP = [
  ...SLOT_SYMBOLS,
  ...SLOT_SYMBOLS,
  ...SLOT_SYMBOLS,
  ...SLOT_SYMBOLS,
  ...SLOT_SYMBOLS,
  ...SLOT_SYMBOLS,
];

const ROW_HEIGHT = 80; // height of each visible row in px
const SYMBOL_COUNT = SLOT_SYMBOLS.length;

export function SlotMachine({
  cost,
  maxPrize,
  onSpin,
  disabled = false,
  onWin,
}: SlotMachineProps) {
  const [spinning, setSpinning] = useState(false);
  const [turboMode, setTurboMode] = useState(false);
  const [soundMuted, setSoundMuted] = useState(false);
  const [autoSpinsLeft, setAutoSpinsLeft] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);

  // Each reel stores top row symbol offset (0..REEL_STRIP.length - 3)
  const [reelOffsets, setReelOffsets] = useState<number[]>([0, 0, 0]);
  const [reelStates, setReelStates] = useState<("idle" | "spinning" | "anticipation" | "stopped")[]>([
    "idle",
    "idle",
    "idle",
  ]);

  const [isAnticipation, setIsAnticipation] = useState(false);
  const [winningPaylines, setWinningPaylines] = useState<number[]>([]);
  const [showPaytable, setShowPaytable] = useState(false);
  const [lastWinText, setLastWinText] = useState<string>("");
  const [lastWinAmount, setLastWinAmount] = useState<number>(0);

  const spinSoundInterval = useRef<number | null>(null);
  const heartbeatInterval = useRef<number | null>(null);
  const timeoutRefs = useRef<number[]>([]);
  const spinningRef = useRef(false);
  const autoPlayRef = useRef(false);
  autoPlayRef.current = isAutoPlaying;
  spinningRef.current = spinning;

  const clearAllTimeouts = useCallback(() => {
    timeoutRefs.current.forEach((id) => clearTimeout(id));
    timeoutRefs.current = [];
  }, []);

  const clearIntervals = useCallback(() => {
    if (spinSoundInterval.current) {
      clearInterval(spinSoundInterval.current);
      spinSoundInterval.current = null;
    }
    if (heartbeatInterval.current) {
      clearInterval(heartbeatInterval.current);
      heartbeatInterval.current = null;
    }
    casinoAudio.stopAnticipation();
  }, []);

  const toggleSound = () => {
    const next = !soundMuted;
    setSoundMuted(next);
    localStorage.setItem("mdg-poker-sound", next ? "off" : "on");
  };

  useEffect(() => {
    const saved = localStorage.getItem("mdg-poker-sound");
    if (saved === "off") setSoundMuted(true);
  }, []);

  const handlePullSpin = useCallback(async () => {
    if (spinningRef.current || disabled) return;

    clearAllTimeouts();
    clearIntervals();

    setSpinning(true);
    spinningRef.current = true;
    setIsAnticipation(false);
    setWinningPaylines([]);
    setLastWinText("");
    setLastWinAmount(0);
    setReelStates(["spinning", "spinning", "spinning"]);

    // Sound spin loop
    casinoAudio.playSlotSpin();
    spinSoundInterval.current = window.setInterval(() => {
      casinoAudio.playSlotSpin();
    }, 170);

    try {
      const result = await onSpin();

      if (!result) {
        clearIntervals();
        clearAllTimeouts();
        setSpinning(false);
        spinningRef.current = false;
        setReelStates(["idle", "idle", "idle"]);
        setIsAutoPlaying(false);
        autoPlayRef.current = false;
        return;
      }

      // Determine server target symbols (for center row)
      const serverSymbols = result.audit?.symbols || [];
      const centerIds: string[] =
        serverSymbols.length === 3
          ? serverSymbols
          : result.prize > 0
            ? ["seven", "seven", "seven"]
            : ["cherry", "bell", "lemon"];

      // Find indices
      const s1 = SLOT_SYMBOLS.findIndex((s) => s.id === centerIds[0]);
      const s2 = SLOT_SYMBOLS.findIndex((s) => s.id === centerIds[1]);
      const s3 = SLOT_SYMBOLS.findIndex((s) => s.id === centerIds[2]);

      // Calculate target top-row index so that centerIds land exactly on middle row (offset + 1)
      const idx1 = s1 === -1 ? 0 : s1;
      const idx2 = s2 === -1 ? 1 : s2;
      const idx3 = s3 === -1 ? 2 : s3;
      const base1 = (idx1 - 1 + SYMBOL_COUNT) % SYMBOL_COUNT;
      const base2 = (idx2 - 1 + SYMBOL_COUNT) % SYMBOL_COUNT;
      const base3 = (idx3 - 1 + SYMBOL_COUNT) % SYMBOL_COUNT;

      // Spread across different repeats to ensure smooth CSS transition
      const targetOffset1 = SYMBOL_COUNT * 1 + base1;
      const targetOffset2 = SYMBOL_COUNT * 2 + base2;
      const targetOffset3 = SYMBOL_COUNT * 3 + base3;

      // Anticipation logic: any pair triggers suspense, high tier longer
      const isPairMatch = centerIds[0] === centerIds[1];
      const isHighPair =
        isPairMatch && (centerIds[0] === "seven" || centerIds[0] === "diamond" || centerIds[0] === "baobab");
      const shouldAnticipate = isPairMatch && !turboMode;

      const t1 = turboMode ? 400 : 1200;
      const t2 = turboMode ? 800 : 2200;
      const t3 = turboMode ? 1200 : isHighPair ? 4600 : isPairMatch ? 3800 : 3400;

      // Reel 1 Stop
      const id1 = window.setTimeout(() => {
        setReelStates((prev) => ["stopped", prev[1], prev[2]]);
        setReelOffsets((prev) => [targetOffset1, prev[1], prev[2]]);
        casinoAudio.playSlotStop(1.0);
      }, t1);
      timeoutRefs.current.push(id1);

      // Reel 2 Stop
      const id2 = window.setTimeout(() => {
        setReelStates((prev) => [prev[0], "stopped", prev[2]]);
        setReelOffsets((prev) => [prev[0], targetOffset2, prev[2]]);
        casinoAudio.playSlotStop(1.1);

        if (shouldAnticipate) {
          setIsAnticipation(true);
          setReelStates((prev) => [prev[0], prev[1], "anticipation"]);
          casinoAudio.startAnticipation();
          casinoAudio.playHeartbeat();
          heartbeatInterval.current = window.setInterval(() => {
            casinoAudio.playHeartbeat();
          }, 450);
        }
      }, t2);
      timeoutRefs.current.push(id2);

      // Reel 3 Stop & Final Win Resolution — keep spinning locked until CSS transition finishes
      const id3 = window.setTimeout(() => {
        // Don't clear heartbeat yet — let it ring through the settle for continuity
        if (spinSoundInterval.current) {
          clearInterval(spinSoundInterval.current);
          spinSoundInterval.current = null;
        }
        setReelOffsets([targetOffset1, targetOffset2, targetOffset3]);
        // Set reels to stopped (not idle) to keep transition active; keep anticipation glow during settle
        setReelStates(["stopped", "stopped", "stopped"]);
        casinoAudio.playSlotStop(1.3);

        // Show win feedback immediately as the reel begins to settle, not after a gap
        if (result.prize > 0) {
          setWinningPaylines([1]);
          setLastWinText(result.result_label);
          setLastWinAmount(result.prize);
        } else {
          setLastWinText("Rien cette fois. Retentez votre chance !");
        }

        // Wait for the 650ms CSS transform transition to fully settle before unlocking
        const settleId = window.setTimeout(() => {
          clearIntervals(); // now stop heartbeat/anticipation after the reel has landed
          setIsAnticipation(false);
          setReelStates(["idle", "idle", "idle"]);
          setSpinning(false);
          spinningRef.current = false;

          if (result.prize > 0) {
            casinoAudio.playPaylineWin(1);
            const winId = window.setTimeout(() => {
              onWin(result);
            }, 220);
            timeoutRefs.current.push(winId);

            if (result.prize >= cost * 5) {
              setIsAutoPlaying(false);
              autoPlayRef.current = false;
            }
          }

          // Auto-play continuation — only after full settle + win delay
          if (autoPlayRef.current) {
            setAutoSpinsLeft((prev) => {
              const next = prev - 1;
              if (next > 0) {
                const autoId = window.setTimeout(() => {
                  if (autoPlayRef.current && !spinningRef.current) void handlePullSpin();
                }, 900);
                timeoutRefs.current.push(autoId);
              } else {
                setIsAutoPlaying(false);
                autoPlayRef.current = false;
              }
              return Math.max(0, next);
            });
          }
        }, 680);
        timeoutRefs.current.push(settleId);
      }, t3);
      timeoutRefs.current.push(id3);
    } catch {
      clearIntervals();
      clearAllTimeouts();
      setSpinning(false);
      spinningRef.current = false;
      setIsAnticipation(false);
      setReelStates(["idle", "idle", "idle"]);
      setIsAutoPlaying(false);
      autoPlayRef.current = false;
    }
  }, [disabled, onSpin, turboMode, cost, onWin, clearAllTimeouts, clearIntervals]);

  const startAutoPlay = (count: number) => {
    if (spinningRef.current || disabled) return;
    setAutoSpinsLeft(count);
    setIsAutoPlaying(true);
    autoPlayRef.current = true;
    void handlePullSpin();
  };

  const stopAutoPlay = () => {
    setIsAutoPlaying(false);
    autoPlayRef.current = false;
    setAutoSpinsLeft(0);
    clearAllTimeouts();
    // keep current spin running but prevent next auto
  };

  useEffect(() => {
    return () => {
      clearAllTimeouts();
      clearIntervals();
    };
  }, [clearAllTimeouts, clearIntervals]);

  return (
    <div className={`slot-machine-wrapper ${isAnticipation ? "anticipation-mode" : ""}`}>
      {/* Anticipation Tension Vignette */}
      {isAnticipation && (
        <div className="anticipation-flame-overlay">
          <div className="anticipation-banner">
            <Flame size={20} className="flame-icon" />
            <span>SUSPENSE JACKPOT !</span>
            <Flame size={20} className="flame-icon" />
          </div>
        </div>
      )}

      {/* Top Neon Header with Flashing Bulbs */}
      <div className="slot-machine-header">
        <div className="slot-lights-row">
          {Array.from({ length: 14 }).map((_, i) => (
            <span
              key={i}
              className={`slot-light ${
                isAnticipation
                  ? "blink-wild"
                  : spinning
                    ? "blink-fast"
                    : i % 2 === 0
                      ? "on"
                      : "off"
              }`}
            />
          ))}
        </div>
        <div className="slot-title-banner">
          <Sparkles size={22} className="gold-icon pulse" />
          <h2>TRÉSOR ROYAL SLOTS</h2>
          <Sparkles size={22} className="gold-icon pulse" />
        </div>
        <div className="slot-header-tags">
          <span className="slot-jackpot-tag">
            JACKPOT 777 : {maxPrize.toLocaleString("fr-FR")} SIM (x50)
          </span>
          <span className="slot-paylines-tag">LIGNE CENTRALE ACTIVE</span>
        </div>
      </div>

      {/* Main Machine Cabinet */}
      <div className="slot-cabinet">
        {/* Left Payline Number Markers */}
        <div className="slot-payline-gutter left">
          {[1].map((lineNum) => (
            <span
              key={lineNum}
              className={`payline-badge ${winningPaylines.includes(lineNum) ? "active" : ""}`}
            >
              {lineNum}
            </span>
          ))}
          {/* Inactive paylines shown muted */}
          {[2, 3, 4, 5].map((lineNum) => (
            <span key={lineNum} className="payline-badge muted" title="Ligne inactive — seule la ligne centrale est évaluée">
              {lineNum}
            </span>
          ))}
        </div>

        {/* 3x3 Physical Reels Window (showing Top, Middle, Bottom rows) */}
        <div
          className={`slot-reels-window ${winningPaylines.length > 0 ? "winner-glow" : ""}`}
        >
          <div className="slot-glass-glare" />

          {/* Winning Payline Laser Indicator */}
          {winningPaylines.includes(1) && (
            <div className="slot-center-payline laser-active" />
          )}

          <div className="slot-reels-track grid-3x3">
            {[0, 1, 2].map((reelIdx) => {
              const state = reelStates[reelIdx];
              const offsetIndex = reelOffsets[reelIdx];
              const targetY = -offsetIndex * ROW_HEIGHT;
              const isAnticipatingThis = reelIdx === 2 && state === "anticipation";

              return (
                <div
                  key={reelIdx}
                  className={`slot-reel-frame ${
                    isAnticipatingThis ? "reel-anticipation-glow" : ""
                  }`}
                >
                  <div
                    className={`slot-reel-strip ${
                      state === "spinning" || state === "anticipation"
                        ? isAnticipatingThis
                          ? "reel-strip-anticipating"
                          : "reel-strip-spinning"
                        : "reel-strip-stopped"
                    }`}
                    style={{
                      transform:
                        state === "spinning" || state === "anticipation"
                          ? undefined
                          : `translateY(${targetY}px)`,
                    }}
                  >
                    {REEL_STRIP.map((sym, sIdx) => {
                      const isCenterRow = sIdx === offsetIndex + 1;
                      const isWinningSymbol =
                        isCenterRow && winningPaylines.includes(1) && lastWinAmount > 0;

                      return (
                        <div
                          key={sIdx}
                          className={`slot-symbol-row ${isWinningSymbol ? "symbol-win-highlight" : ""}`}
                        >
                          <span className="slot-symbol-emoji">{sym.icon}</span>
                          <span className="slot-symbol-name">{sym.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Payline Number Markers */}
        <div className="slot-payline-gutter right">
          {[1].map((lineNum) => (
            <span
              key={lineNum}
              className={`payline-badge ${winningPaylines.includes(lineNum) ? "active" : ""}`}
            >
              {lineNum}
            </span>
          ))}
          {[2, 3, 4, 5].map((lineNum) => (
            <span key={lineNum} className="payline-badge muted" title="Ligne inactive">
              {lineNum}
            </span>
          ))}
        </div>

        {/* Side Mechanical Lever */}
        <div
          className={`slot-lever-container ${spinning ? "pulled" : ""}`}
          onClick={() => void handlePullSpin()}
          title="Tirer le levier"
        >
          <div className="slot-lever-base" />
          <div className="slot-lever-stick" />
          <div className="slot-lever-knob" />
        </div>
      </div>

      {/* Control Dashboard & Live Counters */}
      <div className="slot-controls-bar">
        <div className="slot-metrics-group">
          <div className="slot-info-box">
            <span className="slot-info-title">MISE DU TOUR</span>
            <strong className="slot-info-value">{cost} SIM</strong>
          </div>
          <div className="slot-info-box win-box">
            <span className="slot-info-title">DERNIER GAIN</span>
            <strong className={`slot-info-value ${lastWinAmount > 0 ? "gold" : ""}`}>
              {lastWinAmount > 0 ? `+${lastWinAmount.toLocaleString("fr-FR")} SIM` : "0 SIM"}
            </strong>
          </div>
        </div>

        <div className="slot-status-message">
          {isAnticipation ? (
            <span className="slot-msg-anticipation">
              <Flame size={16} className="flame-icon" /> ROULEAU 3 EN SUSPENSE...
            </span>
          ) : spinning ? (
            <span className="slot-msg-spin">
              <RefreshCw className="spin" size={16} /> Rouleaux en action...
            </span>
          ) : lastWinText ? (
            <span className={`slot-msg-win ${winningPaylines.length > 0 ? "win-active" : ""}`}>
              {winningPaylines.length > 0 ? "✨ " : ""}
              {lastWinText}
            </span>
          ) : (
            <span>Prêt ! Cliquez sur TOURNER ou tirez le levier.</span>
          )}
        </div>

        <div className="slot-actions-group">
          <button
            type="button"
            className={`button button-small ${turboMode ? "button-gold" : "button-outline"}`}
            onClick={() => setTurboMode((v) => !v)}
            title="Mode Turbo (Tirages ultra-rapides)"
          >
            <Zap size={15} /> {turboMode ? "TURBO ON" : "TURBO"}
          </button>

          <button
            type="button"
            className="button button-small button-outline"
            onClick={toggleSound}
            title={soundMuted ? "Activer les sons" : "Couper le son"}
          >
            {soundMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>

          {isAutoPlaying ? (
            <button
              type="button"
              className="button button-danger slot-auto-btn"
              onClick={stopAutoPlay}
            >
              <Square size={16} /> STOP ({autoSpinsLeft})
            </button>
          ) : (
            <div className="slot-auto-selector">
              <button
                type="button"
                className="button button-outline slot-auto-btn"
                onClick={() => startAutoPlay(10)}
                disabled={spinning || disabled}
                title="Lancer 10 tours automatiques"
              >
                <Play size={14} /> AUTO 10
              </button>
            </div>
          )}

          <button
            type="button"
            className="button button-gold slot-spin-big-btn"
            onClick={() => void handlePullSpin()}
            disabled={spinning || disabled}
          >
            {spinning ? (
              <RefreshCw className="spin" size={20} />
            ) : (
              <Sparkles size={20} />
            )}
            <span>{spinning ? "EN COURS" : "TOURNER (SPIN)"}</span>
          </button>
        </div>
      </div>

      <div className="slot-footer-bar">
        <button
          type="button"
          className="text-link"
          onClick={() => setShowPaytable((v) => !v)}
        >
          <HelpCircle size={15} />
          {showPaytable ? "Masquer les gains" : "Table des gains · Ligne centrale"}
        </button>
      </div>

      {showPaytable && (
        <div className="slot-paytable-modal">
          <h4>🏆 Tableau des Gains — Ligne Centrale</h4>
          <p className="paytable-hint">
            Seule la ligne centrale (3 symboles alignés) est évaluée. Les lignes 2–5 sont décoratives dans cette version.
          </p>
          <div className="slot-paytable-grid">
            {SLOT_SYMBOLS.map((s) => (
              <div key={s.id} className="slot-paytable-item">
                <span className="sym-icon">
                  {s.icon} {s.icon} {s.icon}
                </span>
                <span className="sym-name">{s.label}</span>
                <strong className="sym-mult">x{s.multiplier}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
