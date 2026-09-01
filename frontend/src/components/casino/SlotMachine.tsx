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

export const SLOT_SYMBOLS = [
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
  const autoPlayRef = useRef(false);
  autoPlayRef.current = isAutoPlaying;

  const toggleSound = () => {
    const next = !soundMuted;
    setSoundMuted(next);
    localStorage.setItem("mdg-poker-sound", next ? "off" : "on");
  };

  const handlePullSpin = useCallback(async () => {
    if (spinning || disabled) return;

    setSpinning(true);
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
        if (spinSoundInterval.current) clearInterval(spinSoundInterval.current);
        setSpinning(false);
        setReelStates(["idle", "idle", "idle"]);
        setIsAutoPlaying(false);
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

      // Find indices in middle strip
      const s1 = SLOT_SYMBOLS.findIndex((s) => s.id === centerIds[0]);
      const s2 = SLOT_SYMBOLS.findIndex((s) => s.id === centerIds[1]);
      const s3 = SLOT_SYMBOLS.findIndex((s) => s.id === centerIds[2]);

      // Calculate target top-row index so that centerIds land exactly on middle row (offset + 1)
      // center row is (offset + 1) % 6, so offset = (centerIdx - 1 + 6) % 6
      const base1 = (s1 - 1 + 6) % 6;
      const base2 = (s2 - 1 + 6) % 6;
      const base3 = (s3 - 1 + 6) % 6;

      const targetOffset1 = 6 + base1;
      const targetOffset2 = 12 + base2;
      const targetOffset3 = 18 + base3;

      // Check if Reel 1 & 2 match on high/jackpot tier to trigger SUSPENSE ANTICIPATION!
      const isHighMatch =
        centerIds[0] === centerIds[1] &&
        (centerIds[0] === "seven" || centerIds[0] === "diamond" || centerIds[0] === "baobab");

      const t1 = turboMode ? 400 : 1200;
      const t2 = turboMode ? 800 : 2200;
      const t3 = turboMode ? 1200 : isHighMatch ? 4600 : 3400;

      // Reel 1 Stop
      setTimeout(() => {
        setReelStates((prev) => ["stopped", prev[1], prev[2]]);
        setReelOffsets((prev) => [targetOffset1, prev[1], prev[2]]);
        casinoAudio.playSlotStop(1.0);
      }, t1);

      // Reel 2 Stop
      setTimeout(() => {
        setReelStates((prev) => [prev[0], "stopped", prev[2]]);
        setReelOffsets((prev) => [prev[0], targetOffset2, prev[2]]);
        casinoAudio.playSlotStop(1.1);

        // Check if Reel 3 should enter slow-motion high-tension anticipation!
        if (isHighMatch && !turboMode) {
          setIsAnticipation(true);
          setReelStates((prev) => [prev[0], prev[1], "anticipation"]);
          casinoAudio.startAnticipation();

          // Heartbeat loop
          casinoAudio.playHeartbeat();
          heartbeatInterval.current = window.setInterval(() => {
            casinoAudio.playHeartbeat();
          }, 450);
        }
      }, t2);

      // Reel 3 Stop & Final Win Resolution
      setTimeout(() => {
        if (spinSoundInterval.current) clearInterval(spinSoundInterval.current);
        if (heartbeatInterval.current) clearInterval(heartbeatInterval.current);
        casinoAudio.stopAnticipation();

        setIsAnticipation(false);
        setReelStates(["idle", "idle", "idle"]);
        setReelOffsets([targetOffset1, targetOffset2, targetOffset3]);
        setSpinning(false);
        casinoAudio.playSlotStop(1.3);

        if (result.prize > 0) {
          // Highlight middle payline (payline 1)
          setWinningPaylines([1]);
          setLastWinText(result.result_label);
          setLastWinAmount(result.prize);
          casinoAudio.playPaylineWin(1);

          setTimeout(() => {
            onWin(result);
          }, 500);

          // Stop autoplay on big win
          if (result.prize >= cost * 5) {
            setIsAutoPlaying(false);
          }
        } else {
          setLastWinText("Rien cette fois. Retentez votre chance !");
        }

        // Handle auto-play continuation
        if (autoPlayRef.current) {
          setAutoSpinsLeft((prev) => {
            const next = prev - 1;
            if (next > 0) {
              setTimeout(() => {
                if (autoPlayRef.current) void handlePullSpin();
              }, 1200);
            } else {
              setIsAutoPlaying(false);
            }
            return Math.max(0, next);
          });
        }
      }, t3);
    } catch {
      if (spinSoundInterval.current) clearInterval(spinSoundInterval.current);
      if (heartbeatInterval.current) clearInterval(heartbeatInterval.current);
      casinoAudio.stopAnticipation();
      setSpinning(false);
      setIsAnticipation(false);
      setReelStates(["idle", "idle", "idle"]);
      setIsAutoPlaying(false);
    }
  }, [spinning, disabled, onSpin, turboMode, cost, onWin]);

  const startAutoPlay = (count: number) => {
    if (spinning || disabled) return;
    setAutoSpinsLeft(count);
    setIsAutoPlaying(true);
    void handlePullSpin();
  };

  const stopAutoPlay = () => {
    setIsAutoPlaying(false);
    setAutoSpinsLeft(0);
  };

  useEffect(() => {
    return () => {
      if (spinSoundInterval.current) clearInterval(spinSoundInterval.current);
      if (heartbeatInterval.current) clearInterval(heartbeatInterval.current);
      casinoAudio.stopAnticipation();
    };
  }, []);

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
          <span className="slot-paylines-tag">5 LIGNES DE PAIEMENT</span>
        </div>
      </div>

      {/* Main Machine Cabinet */}
      <div className="slot-cabinet">
        {/* Left Payline Number Markers */}
        <div className="slot-payline-gutter left">
          {[1, 2, 3, 4, 5].map((lineNum) => (
            <span
              key={lineNum}
              className={`payline-badge ${winningPaylines.includes(lineNum) ? "active" : ""}`}
            >
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
                      // Check if this specific symbol is in the winning center row
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
          {[1, 2, 3, 4, 5].map((lineNum) => (
            <span
              key={lineNum}
              className={`payline-badge ${winningPaylines.includes(lineNum) ? "active" : ""}`}
            >
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
        {/* Cost & Win Displays */}
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

        {/* Live Status Messaging */}
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

        {/* Main Spin & Auto Actions */}
        <div className="slot-actions-group">
          {/* Turbo toggle */}
          <button
            type="button"
            className={`button button-small ${turboMode ? "button-gold" : "button-outline"}`}
            onClick={() => setTurboMode((v) => !v)}
            title="Mode Turbo (Tirages ultra-rapides)"
          >
            <Zap size={15} /> {turboMode ? "TURBO ON" : "TURBO"}
          </button>

          {/* Sound toggle */}
          <button
            type="button"
            className="button button-small button-outline"
            onClick={toggleSound}
            title={soundMuted ? "Activer les sons" : "Couper le son"}
          >
            {soundMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>

          {/* Auto-play or Stop */}
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

          {/* Big Master Spin Button */}
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

      {/* Paytable & Rules Drawer */}
      <div className="slot-footer-bar">
        <button
          type="button"
          className="text-link"
          onClick={() => setShowPaytable((v) => !v)}
        >
          <HelpCircle size={15} />
          {showPaytable ? "Masquer les gains" : "Table des gains & Lignes de paiement"}
        </button>
      </div>

      {showPaytable && (
        <div className="slot-paytable-modal">
          <h4>🏆 Tableau des 5 Lignes de Paiement & Multiplicateurs</h4>
          <p className="paytable-hint">
            Les combinaisons s'évaluent sur 3 symboles alignés de gauche à droite sur les 5 lignes actives.
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
