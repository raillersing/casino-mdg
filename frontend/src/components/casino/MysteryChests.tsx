import { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, RefreshCw, Eye, Volume2, VolumeX, Trophy } from "lucide-react";
import { casinoAudio } from "@utils/casinoAudio";
import { type InstantPlay } from "@services/testGames";

interface MysteryChestsProps {
  cost: number;
  maxPrize: number;
  onPlay: () => Promise<InstantPlay | null>;
  disabled?: boolean;
  onWin: (play: InstantPlay) => void;
}

const SYMBOL_MAP: Record<string, { label: string; icon: string; prizeText: string; tier: string }> = {
  zebu: { label: "Zébu d'Or", icon: "🐂", prizeText: "Jackpot 500 SIM", tier: "jackpot" },
  baobab: { label: "Baobab Royal", icon: "🌴", prizeText: "150 SIM", tier: "high" },
  vanille: { label: "Vanille Bourbon", icon: "🌸", prizeText: "50 SIM", tier: "mid" },
};

const TIER_ORDER: Record<string, number> = { jackpot: 3, high: 2, mid: 1 };

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
  const [isDealing, setIsDealing] = useState(false);
  const [isRevealingAll, setIsRevealingAll] = useState(false);
  const [dealingIndex, setDealingIndex] = useState(-1);
  const [gameStarted, setGameStarted] = useState(false);
  const [winningSymbol, setWinningSymbol] = useState<string | null>(null);
  const [finalRevealed, setFinalRevealed] = useState(false);
  const [soundMuted, setSoundMuted] = useState(false);

  const timeoutRefs = useRef<number[]>([]);
  const currentPlayRef = useRef<InstantPlay | null>(null);
  currentPlayRef.current = currentPlay;

  const clearAllTimeouts = useCallback(() => {
    timeoutRefs.current.forEach((id) => clearTimeout(id));
    timeoutRefs.current = [];
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("mdg-poker-sound");
    if (saved === "off") setSoundMuted(true);
  }, []);

  useEffect(() => {
    return () => clearAllTimeouts();
  }, [clearAllTimeouts]);

  const toggleSound = () => {
    const next = !soundMuted;
    setSoundMuted(next);
    localStorage.setItem("mdg-poker-sound", next ? "off" : "on");
  };

  const startNewRound = async () => {
    if (isPlaying || isDealing || isRevealingAll || disabled) return;

    clearAllTimeouts();
    setIsPlaying(true);
    setIsDealing(false);
    setDealingIndex(-1);
    setOpenedChests(Array(9).fill(false));
    setSymbols(Array(9).fill(""));
    setCurrentPlay(null);
    currentPlayRef.current = null;
    setWinningSymbol(null);
    setFinalRevealed(false);

    try {
      const result = await onPlay();
      if (!result) {
        setIsPlaying(false);
        return;
      }
      setCurrentPlay(result);
      currentPlayRef.current = result;
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

      // Dealing animation: reveal chests one by one as "placed" before playable
      setSymbols(defaultSymbols);
      setIsPlaying(false);
      setIsDealing(true);
      setGameStarted(true);
      defaultSymbols.forEach((_, i) => {
        const id = window.setTimeout(() => {
          setDealingIndex(i);
          if (i === 8) {
            const doneId = window.setTimeout(() => {
              setIsDealing(false);
              setDealingIndex(-1);
            }, 450);
            timeoutRefs.current.push(doneId);
          }
        }, i * 70);
        timeoutRefs.current.push(id);
      });
    } catch {
      setIsPlaying(false);
      setIsDealing(false);
    }
  };

  const evaluateWin = useCallback(
    (opened: boolean[], syms: string[], play: InstantPlay | null) => {
      const counts: Record<string, number> = {};
      opened.forEach((isOpen, idx) => {
        if (isOpen && syms[idx]) {
          counts[syms[idx]] = (counts[syms[idx]] || 0) + 1;
        }
      });

      // Find best tier among symbols with >=3 occurrences
      let bestSym: string | null = null;
      let bestTier = -1;
      for (const [sym, count] of Object.entries(counts)) {
        if (count >= 3) {
          const tier = TIER_ORDER[SYMBOL_MAP[sym]?.tier || ""] ?? 0;
          if (tier > bestTier) {
            bestTier = tier;
            bestSym = sym;
          }
        }
      }

      if (bestSym) {
        setWinningSymbol(bestSym);
        // Only celebrate if backend actually awarded a prize (prevents false visual wins)
        const shouldCelebrate = play && play.prize > 0;
        const prizeTierOk = !play || !play.prize || checkPrizeMatchesSymbol(play.prize, bestSym);
        if (shouldCelebrate && prizeTierOk) {
          const winId = window.setTimeout(() => {
            const current = currentPlayRef.current;
            if (current) onWin(current);
          }, 250);
          timeoutRefs.current.push(winId);
        }
      }
    },
    [onWin],
  );

  const checkPrizeMatchesSymbol = (prize: number, sym: string) => {
    if (prize >= 500) return sym === "zebu";
    if (prize >= 150) return sym === "baobab" || sym === "zebu";
    if (prize > 0) return sym === "vanille" || sym === "baobab" || sym === "zebu";
    return false;
  };

  const openChest = (index: number) => {
    if (!gameStarted || isPlaying || isDealing || isRevealingAll || openedChests[index]) return;

    casinoAudio.playChestCrack();
    // Functional update to avoid stale closure
    setOpenedChests((prev) => {
      const next = [...prev];
      next[index] = true;
      // Delay win check to let flip animation half-way
      const id = window.setTimeout(() => {
        casinoAudio.playChestOpen();
        evaluateWin(next, symbols, currentPlayRef.current);
        // If this was the last chest, mark final
        if (next.every(Boolean)) {
          setFinalRevealed(true);
          // Re-evaluate final win once all revealed to ensure correct highlight
          evaluateWin(next, symbols, currentPlayRef.current);
        }
      }, 220);
      timeoutRefs.current.push(id);
      return next;
    });
  };

  const revealAll = () => {
    if (!gameStarted || isPlaying || isDealing || isRevealingAll) return;
    if (openedChests.every(Boolean)) return;

    setIsRevealingAll(true);
    const alreadyOpened = [...openedChests];
    const pendingIndices = alreadyOpened.map((o, i) => (!o ? i : -1)).filter((i) => i !== -1);

    pendingIndices.forEach((chestIdx, seq) => {
      const id = window.setTimeout(() => {
        setOpenedChests((prev) => {
          const next = [...prev];
          next[chestIdx] = true;
          // Throttled sound — not every chest at full volume stack
          if (seq % 2 === 0) casinoAudio.playChestOpen();
          else {
            // softer tick for intermediate
            casinoAudio.playChestCrack();
          }
          if (seq === pendingIndices.length - 1) {
            const finalId = window.setTimeout(() => {
              setIsRevealingAll(false);
              setFinalRevealed(true);
              evaluateWin(next, symbols, currentPlayRef.current);
            }, 320);
            timeoutRefs.current.push(finalId);
          }
          return next;
        });
      }, seq * 160);
      timeoutRefs.current.push(id);
    });

    // Fallback: if already all opened somehow
    if (pendingIndices.length === 0) setIsRevealingAll(false);
  };

  // Live count of revealed symbols
  const symbolTally = {
    zebu: 0,
    baobab: 0,
    vanille: 0,
  };
  openedChests.forEach((isOpen, i) => {
    if (isOpen && symbols[i]) {
      const sym = symbols[i] as "zebu" | "baobab" | "vanille";
      if (symbolTally[sym] !== undefined) symbolTally[sym]++;
    }
  });

  const openedCount = openedChests.filter(Boolean).length;
  const isFinished = finalRevealed || openedChests.every(Boolean);

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

      {/* Live Symbol Discovery Tracker */}
      {gameStarted && (
        <div className="chests-tracker-row">
          <div className={`tracker-badge ${symbolTally.zebu === 2 ? "suspense" : symbolTally.zebu >= 3 ? "won" : ""}`}>
            <span>🐂 Zébu</span>
            <strong>{symbolTally.zebu} / 3</strong>
          </div>
          <div className={`tracker-badge ${symbolTally.baobab === 2 ? "suspense" : symbolTally.baobab >= 3 ? "won" : ""}`}>
            <span>🌴 Baobab</span>
            <strong>{symbolTally.baobab} / 3</strong>
          </div>
          <div className={`tracker-badge ${symbolTally.vanille === 2 ? "suspense" : symbolTally.vanille >= 3 ? "won" : ""}`}>
            <span>🌸 Vanille</span>
            <strong>{symbolTally.vanille} / 3</strong>
          </div>
        </div>
      )}

      {/* 3x3 Chests Grid with 3D Flip */}
      <div className={`chests-grid-container ${isDealing ? "dealing" : ""} ${isRevealingAll ? "revealing-all" : ""}`}>
        {Array.from({ length: 9 }).map((_, index) => {
          const isOpened = openedChests[index];
          const symbolKey = symbols[index] || "baobab";
          const symbolMeta = SYMBOL_MAP[symbolKey] || SYMBOL_MAP.baobab;
          const isWinnerCell = isOpened && winningSymbol === symbolKey && (isFinished || openedCount >= 3);
          const isDealingThis = isDealing && index <= dealingIndex;

          return (
            <div
              key={index}
              className={`chest-flip-card ${isOpened ? "flipped" : ""} ${isWinnerCell ? "winner-cell" : ""} ${isDealingThis ? "dealing-in" : ""} ${!gameStarted || isDealing ? "locked-card" : ""}`}
              onClick={() => openChest(index)}
              style={isDealing ? { animationDelay: `${index * 70}ms` } : undefined}
            >
              <div className="chest-flip-inner">
                <div className={`chest-card-front ${!gameStarted || isDealing ? "locked" : ""}`}>
                  <span className="chest-box-icon">🎁</span>
                  <span className="chest-box-number">COFFRE #{index + 1}</span>
                </div>

                <div className={`chest-card-back ${isWinnerCell ? "winner-glow" : ""}`}>
                  <span className="chest-symbol-icon">{symbolMeta.icon}</span>
                  <span className="chest-symbol-name">{symbolMeta.label}</span>
                  {isWinnerCell && <span className="chest-win-star">★</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Final result banner when board complete */}
      {gameStarted && isFinished && (
        <div className={`chests-final-banner ${winningSymbol ? "win" : "lose"}`}>
          {winningSymbol ? (
            <>
              <Trophy size={18} /> Victoire ! {SYMBOL_MAP[winningSymbol]?.label} x3 — {SYMBOL_MAP[winningSymbol]?.prizeText}
            </>
          ) : (
            <>😢 Pas de triplet cette fois — retentez votre chance !</>
          )}
        </div>
      )}

      {/* Game controls */}
      <div className="chests-control-bar">
        {!gameStarted || isFinished ? (
          <div className="chests-start-row">
            <button
              type="button"
              className="button button-small button-outline"
              onClick={toggleSound}
              title={soundMuted ? "Activer les sons" : "Couper le son"}
            >
              {soundMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>

            <button
              type="button"
              className="button button-gold chests-start-btn"
              onClick={startNewRound}
              disabled={isPlaying || isDealing || isRevealingAll || disabled}
            >
              {isPlaying ? (
                <RefreshCw className="spin" size={18} />
              ) : isDealing ? (
                <RefreshCw className="spin" size={18} />
              ) : (
                <Sparkles size={18} />
              )}
              <span>
                {isPlaying
                  ? "DISTRIBUTION DU PLATEAU..."
                  : isDealing
                    ? "PLATEAU EN PRÉPARATION..."
                    : gameStarted
                      ? `NOUVELLE PARTIE · ${cost} SIM`
                      : `OUVRIR LES COFFRES · ${cost} SIM`}
              </span>
            </button>
          </div>
        ) : (
          <div className="chests-in-game-actions">
            <button
              type="button"
              className="button button-outline"
              onClick={revealAll}
              disabled={isRevealingAll || isDealing}
            >
              <Eye size={16} /> {isRevealingAll ? "RÉVÉLATION EN COURS..." : "Tout révéler d'un coup"}
            </button>
            <span className="chests-open-count">
              {openedCount} / 9 coffres ouverts
            </span>
          </div>
        )}
      </div>

      <div className="chests-legend">
        <div className="legend-item">
          <span>🐂 3x Zébu d'Or</span>
          <strong>Jackpot 500 SIM</strong>
        </div>
        <div className="legend-item">
          <span>🌴 3x Baobab Royal</span>
          <strong>150 SIM</strong>
        </div>
        <div className="legend-item">
          <span>🌸 3x Vanille Bourbon</span>
          <strong>50 SIM</strong>
        </div>
      </div>
    </div>
  );
}
