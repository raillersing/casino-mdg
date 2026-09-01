import { useEffect, useState } from "react";
import { Sparkles, Trophy, X } from "lucide-react";
import { casinoAudio } from "@utils/casinoAudio";

interface BigWinModalProps {
  isOpen: boolean;
  onClose: () => void;
  prize: number;
  label: string;
  gameName: string;
}

export function BigWinModal({
  isOpen,
  onClose,
  prize,
  label,
  gameName,
}: BigWinModalProps) {
  const [displayPrize, setDisplayPrize] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setDisplayPrize(0);
      return;
    }
    if (prize >= 1000) {
      casinoAudio.playJackpot();
    } else {
      casinoAudio.playCoinWin();
    }

    const duration = 1200;
    const startTime = performance.now();

    const frame = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * prize);
      setDisplayPrize(current);
      if (progress < 1) {
        requestAnimationFrame(frame);
      }
    };
    const req = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(req);
  }, [isOpen, prize]);

  if (!isOpen) return null;

  const isJackpot = prize >= 1000;

  return (
    <div className="casino-modal-backdrop" onClick={onClose}>
      {/* Confetti particles */}
      <div className="confetti-container" aria-hidden="true">
        {Array.from({ length: 40 }).map((_, i) => (
          <div
            key={i}
            className="confetti-particle"
            style={{
              left: `${(i * 2.5) % 100}%`,
              animationDelay: `${(i * 0.08) % 1.5}s`,
              backgroundColor: [
                "#ffd700",
                "#ff4081",
                "#00e676",
                "#00e5ff",
                "#ff9100",
                "#e040fb",
              ][i % 6],
            }}
          />
        ))}
      </div>

      <div
        className={`casino-big-win-dialog ${isJackpot ? "jackpot-theme" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="casino-modal-close"
          onClick={onClose}
          aria-label="Fermer"
        >
          <X size={20} />
        </button>

        <div className="casino-win-header">
          <div className="casino-win-icon">
            {isJackpot ? <Trophy size={48} /> : <Sparkles size={48} />}
          </div>
          <span className="casino-win-subtitle">
            {isJackpot ? "🏆 MÉGA JACKPOT !" : "🎉 FÉLICITATIONS !"}
          </span>
          <h2 className="casino-win-label">{label}</h2>
        </div>

        <div className="casino-win-counter">
          <span className="casino-win-amount">
            +{displayPrize.toLocaleString("fr-FR")}
          </span>
          <span className="casino-win-currency">SIM</span>
        </div>

        <p className="casino-win-game">{gameName} · Gain instantané crédité</p>

        <button
          type="button"
          className="button button-gold casino-collect-btn"
          onClick={onClose}
        >
          🪙 ENCAISSER LE GAIN
        </button>
      </div>
    </div>
  );
}
