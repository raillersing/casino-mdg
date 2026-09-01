import { useState, useEffect, useRef } from "react";
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

const SYMBOLS = [
  { id: "cherry", label: "Cerise", icon: "🍒", multiplier: "x2" },
  { id: "lemon", label: "Citron", icon: "🍋", multiplier: "x1" },
  { id: "bell", label: "Cloche d'Or", icon: "🔔", multiplier: "x5" },
  { id: "baobab", label: "Baobab MDG", icon: "🌴", multiplier: "x10" },
  { id: "diamond", label: "Diamant Royal", icon: "💎", multiplier: "x25" },
  { id: "seven", label: "Sept d'Or 777", icon: "7️⃣", multiplier: "x50" },
];

export function SlotMachine({
  cost,
  maxPrize,
  onSpin,
  disabled = false,
  onWin,
}: SlotMachineProps) {
  const [spinning, setSpinning] = useState(false);
  const [reels, setReels] = useState<string[]>(["seven", "seven", "seven"]);
  const [stoppedReels, setStoppedReels] = useState<boolean[]>([true, true, true]);
  const [leverPulled, setLeverPulled] = useState(false);
  const [winningLine, setWinningLine] = useState(false);
  const [showPaytable, setShowPaytable] = useState(false);
  const [lastWinText, setLastWinText] = useState<string>("");

  const spinIntervalRef = useRef<number | null>(null);

  const handlePullLever = async () => {
    if (spinning || disabled) return;

    setLeverPulled(true);
    setTimeout(() => setLeverPulled(false), 400);

    setSpinning(true);
    setWinningLine(false);
    setLastWinText("");
    setStoppedReels([false, false, false]);

    // Start spin audio loop
    casinoAudio.playSlotSpin();
    const spinSoundTimer = setInterval(() => {
      casinoAudio.playSlotSpin();
    }, 180);

    // Animate reels randomly while waiting for server
    spinIntervalRef.current = window.setInterval(() => {
      setReels([
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)].id,
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)].id,
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)].id,
      ]);
    }, 60);

    try {
      const result = await onSpin();
      clearInterval(spinSoundTimer);

      if (spinIntervalRef.current) {
        clearInterval(spinIntervalRef.current);
      }

      if (!result) {
        setSpinning(false);
        setStoppedReels([true, true, true]);
        return;
      }

      // Extract server decided symbols or construct matching outcome
      const serverSymbols = result.audit?.symbols || [];
      const targetReels =
        serverSymbols.length === 3
          ? serverSymbols
          : result.prize > 0
            ? ["seven", "seven", "seven"]
            : ["cherry", "bell", "lemon"];

      // Stop Reel 1 (after 600ms)
      setTimeout(() => {
        setReels((prev) => [targetReels[0], prev[1], prev[2]]);
        setStoppedReels([true, false, false]);
        casinoAudio.playSlotStop();
      }, 600);

      // Stop Reel 2 (after 1100ms)
      setTimeout(() => {
        setReels((prev) => [targetReels[0], targetReels[1], prev[2]]);
        setStoppedReels([true, true, false]);
        casinoAudio.playSlotStop();
      }, 1100);

      // Stop Reel 3 (after 1600ms)
      setTimeout(() => {
        setReels(targetReels);
        setStoppedReels([true, true, true]);
        setSpinning(false);
        casinoAudio.playSlotStop();

        if (result.prize > 0) {
          setWinningLine(true);
          setLastWinText(result.result_label);
          setTimeout(() => {
            onWin(result);
          }, 400);
        } else {
          setLastWinText("Rien cette fois ! Rejouez !");
        }
      }, 1600);
    } catch {
      clearInterval(spinSoundTimer);
      if (spinIntervalRef.current) clearInterval(spinIntervalRef.current);
      setSpinning(false);
      setStoppedReels([true, true, true]);
    }
  };

  useEffect(() => {
    return () => {
      if (spinIntervalRef.current) clearInterval(spinIntervalRef.current);
    };
  }, []);

  const getSymbolMeta = (id: string) => {
    return SYMBOLS.find((s) => s.id === id) || SYMBOLS[0];
  };

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
          <Sparkles size={20} className="gold-icon" />
          <h2>TRÉSOR ROYAL SLOTS</h2>
          <Sparkles size={20} className="gold-icon" />
        </div>
        <span className="slot-jackpot-tag">
          JACKPOT MAX : {maxPrize.toLocaleString("fr-FR")} SIM
        </span>
      </div>

      {/* Main Machine Cabinet */}
      <div className="slot-cabinet">
        {/* The 3 Physical Reels Window */}
        <div className={`slot-reels-window ${winningLine ? "winner-glow" : ""}`}>
          <div className="slot-payline-indicator left" />
          <div className="slot-payline-indicator right" />

          {/* Payline central guide */}
          <div className={`slot-center-payline ${winningLine ? "active" : ""}`} />

          <div className="slot-reels-track">
            {reels.map((symbolId, idx) => {
              const meta = getSymbolMeta(symbolId);
              const isStopping = !stoppedReels[idx];
              return (
                <div
                  key={idx}
                  className={`slot-reel-cylinder ${isStopping ? "reel-spinning" : ""}`}
                >
                  <div className="slot-symbol-card">
                    <span className="slot-symbol-emoji">{meta.icon}</span>
                    <span className="slot-symbol-name">{meta.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Side Lever (Mechanical pull) */}
        <div
          className={`slot-lever-container ${leverPulled ? "pulled" : ""}`}
          onClick={handlePullLever}
          title="Tirer le levier"
        >
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
              <RefreshCw className="spin" size={16} /> Rouleaux en action...
            </span>
          ) : lastWinText ? (
            <span className={`slot-msg-win ${winningLine ? "win-active" : ""}`}>
              {winningLine ? "✨ " : ""}{lastWinText}
            </span>
          ) : (
            <span>Tirez le levier ou appuyez sur SPIN !</span>
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
            <span>{spinning ? "EN COURS" : "TOURNER (SPIN)"}</span>
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
            {SYMBOLS.map((s) => (
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
