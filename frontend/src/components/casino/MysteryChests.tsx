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

const SYMBOL_MAP: Record<string, { label: string; icon: string; color: string }> = {
  zebu: { label: "Zébu d'Or", icon: "🐂", color: "#ffd700" },
  baobab: { label: "Baobab Royal", icon: "🌴", color: "#68d391" },
  vanille: { label: "Vanille Bourbon", icon: "🌸", color: "#f687b3" },
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

  const startNewRound = async () => {
    if (isPlaying || disabled) return;

    setIsPlaying(true);
    setOpenedChests(Array(9).fill(false));
    setSymbols(Array(9).fill(""));
    setCurrentPlay(null);

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
          : [
              "baobab", "vanille", "zebu",
              "zebu", "baobab", "vanille",
              "vanille", "zebu", "baobab",
            ];
      setSymbols(defaultSymbols);
      setGameStarted(true);
      setIsPlaying(false);
    } catch {
      setIsPlaying(false);
    }
  };

  const openChest = (index: number) => {
    if (!gameStarted || openedChests[index] || isPlaying) return;

    const next = [...openedChests];
    next[index] = true;
    setOpenedChests(next);
    casinoAudio.playChestOpen();

    // If all or 6 chests opened, check win
    const openedCount = next.filter(Boolean).length;
    if (openedCount === 9 && currentPlay && currentPlay.prize > 0) {
      setTimeout(() => {
        onWin(currentPlay);
      }, 500);
    }
  };

  const revealAll = () => {
    if (!gameStarted || isPlaying) return;
    setOpenedChests(Array(9).fill(true));
    casinoAudio.playChestOpen();
    if (currentPlay && currentPlay.prize > 0) {
      setTimeout(() => {
        onWin(currentPlay);
      }, 500);
    }
  };

  return (
    <div className="mystery-chests-wrapper">
      <div className="chests-header">
        <span className="eyebrow gold">
          <Sparkles size={13} /> JEU À GRATTER & COFFRES MYSTÈRES
        </span>
        <h2>COFFRE MADA</h2>
        <p>Ouvrez les 9 coffres au trésor pour aligner 3 symboles identiques et gagner jusqu'à {maxPrize.toLocaleString("fr-FR")} SIM !</p>
      </div>

      {/* 3x3 Chests Grid */}
      <div className="chests-grid-container">
        {Array.from({ length: 9 }).map((_, index) => {
          const isOpened = openedChests[index];
          const symbolKey = symbols[index] || "baobab";
          const symbolMeta = SYMBOL_MAP[symbolKey] || SYMBOL_MAP.baobab;

          return (
            <button
              key={index}
              type="button"
              className={`chest-cell ${isOpened ? "chest-opened" : "chest-closed"} ${!gameStarted ? "chest-locked" : ""}`}
              onClick={() => openChest(index)}
              disabled={!gameStarted || isOpened || isPlaying}
            >
              {isOpened ? (
                <div className="chest-revealed-content">
                  <span className="chest-symbol-icon">{symbolMeta.icon}</span>
                  <span className="chest-symbol-name">{symbolMeta.label}</span>
                </div>
              ) : (
                <div className="chest-closed-content">
                  <span className="chest-box-icon">🎁</span>
                  <span className="chest-box-number">#{index + 1}</span>
                </div>
              )}
            </button>
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
                  ? `REJOUER · ${cost} SIM`
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
