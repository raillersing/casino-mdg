import { useState, useRef, useEffect } from "react";
import { Sparkles, Zap, HelpCircle, RefreshCw } from "lucide-react";
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
  { id: "seven", label: "Sept d'Or 777", icon: "7️⃣", multiplier: "x50" },
  { id: "diamond", label: "Diamant Royal", icon: "💎", multiplier: "x25" },
  { id: "baobab", label: "Baobab MDG", icon: "🌴", multiplier: "x10" },
  { id: "bell", label: "Cloche d'Or", icon: "🔔", multiplier: "x5" },
  { id: "cherry", label: "Cerise", icon: "🍒", multiplier: "x2" },
  { id: "lemon", label: "Citron", icon: "🍋", multiplier: "x1" },
];

// Continuous strip with 4 repetitions of symbols for seamless rolling
const REEL_STRIP = [
  ...SLOT_SYMBOLS,
  ...SLOT_SYMBOLS,
  ...SLOT_SYMBOLS,
  ...SLOT_SYMBOLS,
];

const ITEM_HEIGHT = 100; // in px

export function SlotMachine({
  cost,
  maxPrize,
  onSpin,
  disabled = false,
  onWin,
}: SlotMachineProps) {
  const [spinning, setSpinning] = useState(false);
  // Each reel stores its current target index on REEL_STRIP
  const [reelOffsets, setReelOffsets] = useState<number[]>([0, 0, 0]);
  const [reelStates, setReelStates] = useState<("idle" | "spinning" | "stopping")[]>([
    "idle",
    "idle",
    "idle",
  ]);
  const [leverPulled, setLeverPulled] = useState(false);
  const [winningLine, setWinningLine] = useState(false);
  const [showPaytable, setShowPaytable] = useState(false);
  const [lastWinText, setLastWinText] = useState<string>("");

  const spinSoundInterval = useRef<number | null>(null);

  const handlePullLever = async () => {
    if (spinning || disabled) return;

    setLeverPulled(true);
    setTimeout(() => setLeverPulled(false), 450);

    setSpinning(true);
    setWinningLine(false);
    setLastWinText("");
    setReelStates(["spinning", "spinning", "spinning"]);

    // Sound loop
    casinoAudio.playSlotSpin();
    spinSoundInterval.current = window.setInterval(() => {
      casinoAudio.playSlotSpin();
    }, 180);

    try {
      const result = await onSpin();

      if (!result) {
        if (spinSoundInterval.current) clearInterval(spinSoundInterval.current);
        setSpinning(false);
        setReelStates(["idle", "idle", "idle"]);
        return;
      }

      // Determine target symbol ids for the 3 reels
      const serverSymbols = result.audit?.symbols || [];
      const targetIds: string[] =
        serverSymbols.length === 3
          ? serverSymbols
          : result.prize > 0
            ? ["seven", "seven", "seven"]
            : ["cherry", "bell", "lemon"];

      // Map to index in the 2nd/3rd block of REEL_STRIP to allow authentic scroll distance
      const targetIdx1 = 6 + Math.max(0, SLOT_SYMBOLS.findIndex((s) => s.id === targetIds[0]));
      const targetIdx2 = 12 + Math.max(0, SLOT_SYMBOLS.findIndex((s) => s.id === targetIds[1]));
      const targetIdx3 = 18 + Math.max(0, SLOT_SYMBOLS.findIndex((s) => s.id === targetIds[2]));

      // Stop Reel 1 at 800ms
      setTimeout(() => {
        setReelStates((prev) => ["stopping", prev[1], prev[2]]);
        setReelOffsets((prev) => [targetIdx1, prev[1], prev[2]]);
        casinoAudio.playSlotStop();
      }, 800);

      // Stop Reel 2 at 1400ms
      setTimeout(() => {
        setReelStates((prev) => [prev[0], "stopping", prev[2]]);
        setReelOffsets((prev) => [prev[0], targetIdx2, prev[2]]);
        casinoAudio.playSlotStop();
      }, 1400);

      // Stop Reel 3 at 2000ms
      setTimeout(() => {
        if (spinSoundInterval.current) clearInterval(spinSoundInterval.current);
        setReelStates(["idle", "idle", "idle"]);
        setReelOffsets([targetIdx1, targetIdx2, targetIdx3]);
        setSpinning(false);
        casinoAudio.playSlotStop();

        if (result.prize > 0) {
          setWinningLine(true);
          setLastWinText(result.result_label);
          setTimeout(() => {
            onWin(result);
          }, 350);
        } else {
          setLastWinText("Aucune combinaison. Retentez votre chance !");
        }
      }, 2000);
    } catch {
      if (spinSoundInterval.current) clearInterval(spinSoundInterval.current);
      setSpinning(false);
      setReelStates(["idle", "idle", "idle"]);
    }
  };

  useEffect(() => {
    return () => {
      if (spinSoundInterval.current) clearInterval(spinSoundInterval.current);
    };
  }, []);

  return (
    <div className="slot-machine-wrapper">
      {/* Top Neon Header */}
      <div className="slot-machine-header">
        <div className="slot-lights-row">
          {Array.from({ length: 14 }).map((_, i) => (
            <span
              key={i}
              className={`slot-light ${spinning ? "blink-fast" : i % 2 === 0 ? "on" : "off"}`}
            />
          ))}
        </div>
        <div className="slot-title-banner">
          <Sparkles size={22} className="gold-icon pulse" />
          <h2>TRÉSOR ROYAL SLOTS</h2>
          <Sparkles size={22} className="gold-icon pulse" />
        </div>
        <span className="slot-jackpot-tag">
          JACKPOT MAX : {maxPrize.toLocaleString("fr-FR")} SIM
        </span>
      </div>

      {/* Main Machine Cabinet */}
      <div className="slot-cabinet">
        {/* The 3 Physical Reels Window with Depth & Glass Reflection */}
        <div className={`slot-reels-window ${winningLine ? "winner-glow" : ""}`}>
          <div className="slot-glass-glare" />
          <div className="slot-payline-indicator left" />
          <div className="slot-payline-indicator right" />

          {/* Payline central guide */}
          <div className={`slot-center-payline ${winningLine ? "active" : ""}`} />

          <div className="slot-reels-track">
            {[0, 1, 2].map((reelIdx) => {
              const state = reelStates[reelIdx];
              const offsetIndex = reelOffsets[reelIdx];
              const targetY = -offsetIndex * ITEM_HEIGHT;

              return (
                <div key={reelIdx} className="slot-reel-frame">
                  <div
                    className={`slot-reel-strip ${state === "spinning" ? "reel-strip-spinning" : "reel-strip-stopped"}`}
                    style={{
                      transform: state === "spinning" ? undefined : `translateY(${targetY}px)`,
                    }}
                  >
                    {REEL_STRIP.map((sym, sIdx) => (
                      <div key={sIdx} className="slot-symbol-row">
                        <span className="slot-symbol-emoji">{sym.icon}</span>
                        <span className="slot-symbol-name">{sym.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Side Lever (Mechanical 3D pull) */}
        <div
          className={`slot-lever-container ${leverPulled ? "pulled" : ""}`}
          onClick={handlePullLever}
          title="Tirer le levier"
        >
          <div className="slot-lever-base" />
          <div className="slot-lever-stick" />
          <div className="slot-lever-knob" />
        </div>
      </div>

      {/* Control Dashboard */}
      <div className="slot-controls-bar">
        <div className="slot-info-box">
          <span className="slot-info-title">MISE DU TOUR</span>
          <strong className="slot-info-value">{cost} SIM</strong>
        </div>

        <div className="slot-status-message">
          {spinning ? (
            <span className="slot-msg-spin">
              <RefreshCw className="spin" size={16} /> Les rouleaux tournent...
            </span>
          ) : lastWinText ? (
            <span className={`slot-msg-win ${winningLine ? "win-active" : ""}`}>
              {winningLine ? "✨ " : ""}{lastWinText}
            </span>
          ) : (
            <span>Tirez le levier ou cliquez sur TOURNER !</span>
          )}
        </div>

        <div className="slot-actions-group">
          <button
            type="button"
            className="button button-gold slot-spin-big-btn"
            onClick={handlePullLever}
            disabled={spinning || disabled}
          >
            {spinning ? (
              <RefreshCw className="spin" size={20} />
            ) : (
              <Zap size={20} />
            )}
            <span>{spinning ? "ROTATION..." : "TOURNER (SPIN)"}</span>
          </button>
        </div>
      </div>

      {/* Paytable toggle */}
      <div className="slot-footer-bar">
        <button
          type="button"
          className="text-link"
          onClick={() => setShowPaytable((v) => !v)}
        >
          <HelpCircle size={15} />
          {showPaytable ? "Masquer les gains" : "Table des gains (Paytable)"}
        </button>
      </div>

      {showPaytable && (
        <div className="slot-paytable-modal">
          <h4>🏆 Tableau des combinaisons gagnantes</h4>
          <div className="slot-paytable-grid">
            {SLOT_SYMBOLS.map((s) => (
              <div key={s.id} className="slot-paytable-item">
                <span className="sym-icon">{s.icon} {s.icon} {s.icon}</span>
                <span className="sym-name">{s.label}</span>
                <strong className="sym-mult">{s.multiplier}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
