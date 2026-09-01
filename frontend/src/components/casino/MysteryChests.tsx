import { useState } from "react";
import { Sparkles, RefreshCw, Eye } from "lucide-react";
import { casinoAudio } from "@utils/casinoAudio";
import { type InstantPlay } from "@services/testGames";

interface MysteryChestsProps {
  cost: number;
  maxPrize: number;
  onPlay: () => Promise<InstantPlay | null>;
  disabled?: boolean;
  onWin: (play: InstantPlay) => void;
}

const SYMBOL_MAP: Record<string, { label: string; icon: string; prizeText: string }> = {
  zebu: { label: "Zébu d'Or", icon: "🐂", prizeText: "Jackpot 500 SIM" },
  baobab: { label: "Baobab Royal", icon: "🌴", prizeText: "150 SIM" },
  vanille: { label: "Vanille Bourbon", icon: "🌸", prizeText: "50 SIM" },
};

export function MysteryChests({
  cost,
  maxPrize,
  onPlay,
  disabled = false,
  onWin,
}: MysteryChestsProps) {
  const [openedChests, setOpenedChests] = useState<boolean[]>(Array(9).fill(false));
  const [symbols, setSymbols] = useState<string[]>(Array(9).fill(""));
  const [currentPlay, setCurrentPlay] = useState<InstantPlay | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [winningSymbol, setWinningSymbol] = useState<string | null>(null);

  const startNewRound = async () => {
    if (isPlaying || disabled) return;

    setIsPlaying(true);
    setOpenedChests(Array(9).fill(false));
    setSymbols(Array(9).fill(""));
    setCurrentPlay(null);
    setWinningSymbol(null);

    try {
      const result = await onPlay();
      if (!result) {
        setIsPlaying(false);
        return;
      }
      setCurrentPlay(result);
      const serverSymbols = result.audit?.symbols || [];
      const defaultSymbols =
        serverSymbols.length === 9
          ? serverSymbols
          : result.prize >= 500
            ? ["zebu", "zebu", "zebu", "baobab", "vanille", "baobab", "vanille", "zebu", "vanille"]
            : result.prize >= 150
              ? ["baobab", "baobab", "baobab", "vanille", "zebu", "vanille", "zebu", "baobab", "vanille"]
              : result.prize > 0
                ? ["vanille", "vanille", "vanille", "baobab", "zebu", "baobab", "zebu", "baobab", "zebu"]
                : ["baobab", "vanille", "zebu", "zebu", "baobab", "vanille", "vanille", "zebu", "baobab"];

      setSymbols(defaultSymbols);
      setGameStarted(true);
      setIsPlaying(false);
    } catch {
      setIsPlaying(false);
    }
  };

  const checkWinningMatch = (opened: boolean[], syms: string[], play: InstantPlay | null) => {
    const counts: Record<string, number> = {};
    opened.forEach((isOpen, idx) => {
      if (isOpen && syms[idx]) {
        counts[syms[idx]] = (counts[syms[idx]] || 0) + 1;
      }
    });

    for (const [sym, count] of Object.entries(counts)) {
      if (count >= 3) {
        setWinningSymbol(sym);
        if (play && play.prize > 0) {
          setTimeout(() => {
            onWin(play);
          }, 450);
        }
        return;
      }
    }
  };

  const openChest = (index: number) => {
    if (!gameStarted || openedChests[index] || isPlaying) return;

    const next = [...openedChests];
    next[index] = true;
    setOpenedChests(next);
    casinoAudio.playChestOpen();

    checkWinningMatch(next, symbols, currentPlay);
  };

  const revealAll = () => {
    if (!gameStarted || isPlaying) return;

    // Staggered cascade reveal
    const next = [...openedChests];
    symbols.forEach((_, i) => {
      setTimeout(() => {
        next[i] = true;
        setOpenedChests([...next]);
        casinoAudio.playChestOpen();
        if (i === 8) {
          checkWinningMatch(next, symbols, currentPlay);
        }
      }, i * 70);
    });
  };

  return (
    <div className="mystery-chests-wrapper">
      <div className="chests-header">
        <span className="eyebrow gold">
          <Sparkles size={13} /> JEU À GRATTER & COFFRES MYSTÈRES
        </span>
        <h2>COFFRE MADA</h2>
        <p>
          Ouvrez les 9 coffres au trésor pour aligner 3 symboles identiques et gagner jusqu'à{" "}
          {maxPrize.toLocaleString("fr-FR")} SIM !
        </p>
      </div>

      {/* 3x3 Chests Grid with 3D Flip */}
      <div className="chests-grid-container">
        {Array.from({ length: 9 }).map((_, index) => {
          const isOpened = openedChests[index];
          const symbolKey = symbols[index] || "baobab";
          const symbolMeta = SYMBOL_MAP[symbolKey] || SYMBOL_MAP.baobab;
          const isWinnerCell = isOpened && winningSymbol === symbolKey;

          return (
            <div
              key={index}
              className={`chest-flip-card ${isOpened ? "flipped" : ""} ${isWinnerCell ? "winner-cell" : ""}`}
              onClick={() => openChest(index)}
            >
              <div className="chest-flip-inner">
                {/* Front: Closed Chest */}
                <div className={`chest-card-front ${!gameStarted ? "locked" : ""}`}>
                  <span className="chest-box-icon">🎁</span>
                  <span className="chest-box-number">#{index + 1}</span>
                </div>

                {/* Back: Revealed Symbol */}
                <div className={`chest-card-back ${isWinnerCell ? "winner-glow" : ""}`}>
                  <span className="chest-symbol-icon">{symbolMeta.icon}</span>
                  <span className="chest-symbol-name">{symbolMeta.label}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Game controls */}
      <div className="chests-control-bar">
        {!gameStarted || openedChests.every(Boolean) ? (
          <button
            type="button"
            className="button button-gold chests-start-btn"
            onClick={startNewRound}
            disabled={isPlaying || disabled}
          >
            {isPlaying ? (
              <RefreshCw className="spin" size={18} />
            ) : (
              <Sparkles size={18} />
            )}
            <span>
              {isPlaying
                ? "DISTRIBUTION..."
                : gameStarted
                  ? `NOUVELLE PARTIE · ${cost} SIM`
                  : `OUVRIR LES COFFRES · ${cost} SIM`}
            </span>
          </button>
        ) : (
          <div className="chests-in-game-actions">
            <button
              type="button"
              className="button button-outline"
              onClick={revealAll}
            >
              <Eye size={16} /> Tout révéler
            </button>
            <span className="chests-open-count">
              {openedChests.filter(Boolean).length} / 9 coffres ouverts
            </span>
          </div>
        )}
      </div>

      {/* Symbol reference guide */}
      <div className="chests-legend">
        <div className="legend-item">
          <span>🐂 3x Zébu</span>
          <strong>Jackpot 500 SIM</strong>
        </div>
        <div className="legend-item">
          <span>🌴 3x Baobab</span>
          <strong>150 SIM</strong>
        </div>
        <div className="legend-item">
          <span>🌸 3x Vanille</span>
          <strong>50 SIM</strong>
        </div>
      </div>
    </div>
  );
}
