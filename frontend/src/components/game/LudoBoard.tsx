import React, { useEffect, useRef, useState } from "react";
import { haptics } from "@utils/haptics";
import { casinoAudio } from "@utils/casinoAudio";
import { Sparkles, Zap } from "lucide-react";

export interface LudoPawn {
  id: number;
  state: "base" | "track" | "home_path" | "home";
  position: number;
}

export interface LudoPlayer {
  id: string;
  name?: string;
  color: number; // 0: Red, 1: Green, 2: Yellow, 3: Blue
  pawns: LudoPawn[];
  score: number;
}

export interface LudoBoardProps {
  players: LudoPlayer[];
  currentTurnIndex: number;
  lastRoll: number;
  canRoll: boolean;
  canMove: boolean;
  validMoves: number[];
  isMyTurn: boolean;
  myColorIndex: number;
  onRollDice: () => void;
  onMovePawn: (pawnId: number) => void;
}

const COLOR_CONFIG = [
  {
    name: "Rouge",
    primary: "#ef4444",
    light: "#fee2e2",
    dark: "#b91c1c",
    gradient: "linear-gradient(135deg, #f87171 0%, #dc2626 100%)",
    glow: "rgba(239, 68, 68, 0.4)",
  },
  {
    name: "Vert",
    primary: "#10b981",
    light: "#d1fae5",
    dark: "#047857",
    gradient: "linear-gradient(135deg, #34d399 0%, #059669 100%)",
    glow: "rgba(16, 185, 129, 0.4)",
  },
  {
    name: "Jaune",
    primary: "#f59e0b",
    light: "#fef3c7",
    dark: "#b45309",
    gradient: "linear-gradient(135deg, #fbbf24 0%, #d97706 100%)",
    glow: "rgba(245, 158, 11, 0.4)",
  },
  {
    name: "Bleu",
    primary: "#3b82f6",
    light: "#dbeafe",
    dark: "#1d4ed8",
    gradient: "linear-gradient(135deg, #60a5fa 0%, #2563eb 100%)",
    glow: "rgba(59, 130, 246, 0.4)",
  },
];

// 52 Common Track Cells in clockwise order (15x15 board, cell = 20x20)
const TRACK_GRID_COORDS: [number, number][] = [
  // Red arm top row (moving right towards center)
  [1, 6],
  [2, 6],
  [3, 6],
  [4, 6],
  [5, 6], // 0 (Red start), 1, 2, 3, 4
  // Turning up into top arm
  [6, 5],
  [6, 4],
  [6, 3],
  [6, 2],
  [6, 1],
  [6, 0], // 5, 6, 7, 8 (Star), 9, 10
  // Top apex
  [7, 0], // 11
  // Top arm moving down
  [8, 0],
  [8, 1],
  [8, 2],
  [8, 3],
  [8, 4],
  [8, 5], // 12, 13 (Green start), 14, 15, 16, 17
  // Turning right into right arm
  [9, 6],
  [10, 6],
  [11, 6],
  [12, 6],
  [13, 6],
  [14, 6], // 18, 19, 20, 21 (Star), 22, 23
  // Right apex
  [14, 7], // 24
  // Right arm moving left
  [14, 8],
  [13, 8],
  [12, 8],
  [11, 8],
  [10, 8],
  [9, 8], // 25, 26 (Yellow start), 27, 28, 29, 30
  // Turning down into bottom arm
  [8, 9],
  [8, 10],
  [8, 11],
  [8, 12],
  [8, 13],
  [8, 14], // 31, 32, 33, 34 (Star), 35, 36
  // Bottom apex
  [7, 14], // 37
  // Bottom arm moving up
  [6, 14],
  [6, 13],
  [6, 12],
  [6, 11],
  [6, 10],
  [6, 9], // 38, 39 (Blue start), 40, 41, 42, 43
  // Turning left into left arm
  [5, 8],
  [4, 8],
  [3, 8],
  [2, 8],
  [1, 8],
  [0, 8], // 44, 45, 46, 47 (Star), 48, 49
  // Left apex (turn-off to Red home path)
  [0, 7], // 50
  // Left arm returning to Red start
  [0, 6], // 51
];

// 8 Safe Squares (4 Starts + 4 Arm Stars)
const SAFE_SQUARES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

// 5 Home Path squares per color (steps 0..4 towards center triangle)
const HOME_PATH_GRID_COORDS: [number, number][][] = [
  // 0: Red (cols 1..5, row 7)
  [
    [1, 7],
    [2, 7],
    [3, 7],
    [4, 7],
    [5, 7],
  ],
  // 1: Green (col 7, rows 1..5)
  [
    [7, 1],
    [7, 2],
    [7, 3],
    [7, 4],
    [7, 5],
  ],
  // 2: Yellow (cols 13..9, row 7)
  [
    [13, 7],
    [12, 7],
    [11, 7],
    [10, 7],
    [9, 7],
  ],
  // 3: Blue (col 7, rows 13..9)
  [
    [7, 13],
    [7, 12],
    [7, 11],
    [7, 10],
    [7, 9],
  ],
];

// Center victory triangle coordinates for each color
const HOME_TRIANGLE_COORDS: [number, number][] = [
  [135, 150], // Red: left triangle
  [150, 135], // Green: top triangle
  [165, 150], // Yellow: right triangle
  [150, 165], // Blue: bottom triangle
];

// Base Yard Slots (4 per camp)
const YARD_CORNER_OFFSETS = [
  [0, 0], // 0: Red (top-left)
  [180, 0], // 1: Green (top-right)
  [180, 180], // 2: Yellow (bottom-right)
  [0, 180], // 3: Blue (bottom-left)
];

const YARD_PIN_OFFSETS = [
  [40, 40],
  [80, 40],
  [40, 80],
  [80, 80],
];

interface AnimatedPawnPosition {
  cx: number;
  cy: number;
  hopY: number; // Parabolic jump height offset
  scale: number;
  isMoving: boolean;
}

export const LudoBoard: React.FC<LudoBoardProps> = ({
  players,
  currentTurnIndex,
  lastRoll,
  canRoll,
  canMove,
  validMoves,
  isMyTurn,
  myColorIndex,
  onRollDice,
  onMovePawn,
}) => {
  // 3D Dice States
  const [rollingAnim, setRollingAnim] = useState(false);
  const [displayRoll, setDisplayRoll] = useState<number>(
    lastRoll > 0 ? lastRoll : 1,
  );
  const [diceRotation, setDiceRotation] = useState({ x: 0, y: 0, z: 0 });
  const [showSixCelebration, setShowSixCelebration] = useState(false);

  // Capture / Elimination Effect
  const [captureEvent, setCaptureEvent] = useState<{
    cx: number;
    cy: number;
    victimColor: number;
  } | null>(null);

  // Home Goal Particle Burst
  const [goalCelebration, setGoalCelebration] = useState<{
    color: number;
    cx: number;
    cy: number;
  } | null>(null);

  // Animated Positions for step-by-step hopping
  const [animatedPawns, setAnimatedPawns] = useState<
    Record<string, AnimatedPawnPosition>
  >({});

  const prevPlayersRef = useRef<LudoPlayer[]>(players);
  const prevRollRef = useRef(lastRoll);

  // Standard static pixel position helper
  const getStaticCoord = (
    playerColor: number,
    state: "base" | "track" | "home_path" | "home",
    pos: number,
    pawnId: number,
  ): { cx: number; cy: number } => {
    if (state === "base") {
      const corner = YARD_CORNER_OFFSETS[playerColor] || [0, 0];
      const pin = YARD_PIN_OFFSETS[pawnId] || YARD_PIN_OFFSETS[0];
      return { cx: corner[0] + pin[0], cy: corner[1] + pin[1] };
    }
    if (state === "home") {
      const homeCoord = HOME_TRIANGLE_COORDS[playerColor] || [150, 150];
      const spread = (pawnId - 1.5) * 4.5;
      return {
        cx: homeCoord[0] + (playerColor % 2 === 0 ? 0 : spread),
        cy: homeCoord[1] + (playerColor % 2 === 0 ? spread : 0),
      };
    }
    if (state === "track") {
      const norm = ((pos % 52) + 52) % 52;
      const grid = TRACK_GRID_COORDS[norm] || [1, 6];
      return { cx: grid[0] * 20 + 10, cy: grid[1] * 20 + 10 };
    }
    // home_path
    const colorPaths =
      HOME_PATH_GRID_COORDS[playerColor] || HOME_PATH_GRID_COORDS[0];
    if (pos >= 0 && pos < colorPaths.length) {
      const grid = colorPaths[pos];
      return { cx: grid[0] * 20 + 10, cy: grid[1] * 20 + 10 };
    }
    const homeCoord = HOME_TRIANGLE_COORDS[playerColor] || [150, 150];
    return { cx: homeCoord[0], cy: homeCoord[1] };
  };

  // Step-by-Step Path Hopping Animation on State Change
  useEffect(() => {
    const prevPlayers = prevPlayersRef.current;
    prevPlayersRef.current = players;

    players.forEach((player) => {
      const prevPlayer = prevPlayers.find((p) => p.color === player.color);
      (player.pawns || []).forEach((pawn) => {
        const pawnKey = `${player.color}-${pawn.id}`;
        const prevPawn = prevPlayer?.pawns.find((p) => p.id === pawn.id);

        const targetPos = getStaticCoord(
          player.color,
          pawn.state,
          pawn.position,
          pawn.id,
        );

        // Detect if pawn just moved
        if (
          prevPawn &&
          (prevPawn.state !== pawn.state || prevPawn.position !== pawn.position)
        ) {
          // Check for Goal entry
          if (pawn.state === "home" && prevPawn.state !== "home") {
            casinoAudio.playLudoHomeWin();
            haptics.winCelebration();
            setGoalCelebration({
              color: player.color,
              cx: targetPos.cx,
              cy: targetPos.cy,
            });
            setTimeout(() => setGoalCelebration(null), 2400);
          }

          // Check if captured (was on track, now in base)
          if (prevPawn.state === "track" && pawn.state === "base") {
            const hitPos = getStaticCoord(
              player.color,
              "track",
              prevPawn.position,
              pawn.id,
            );
            setCaptureEvent({
              cx: hitPos.cx,
              cy: hitPos.cy,
              victimColor: player.color,
            });
            casinoAudio.playLudoCapture();
            haptics.betPlaced();
            setTimeout(() => setCaptureEvent(null), 1800);
          }

          // Animate Hopping Sequence
          let hopCount = 0;
          const totalHops =
            pawn.state === "base" ? 1 : Math.max(1, lastRoll || 1);
          const hopInterval = window.setInterval(() => {
            hopCount++;
            casinoAudio.playLudoPawnHop();
            haptics.lightTick();

            setAnimatedPawns((prev) => ({
              ...prev,
              [pawnKey]: {
                cx: targetPos.cx,
                cy: targetPos.cy,
                hopY: -10, // Peak of hop
                scale: 1.25,
                isMoving: true,
              },
            }));

            setTimeout(() => {
              setAnimatedPawns((prev) => ({
                ...prev,
                [pawnKey]: {
                  cx: targetPos.cx,
                  cy: targetPos.cy,
                  hopY: 0, // Landing squash
                  scale: 0.95,
                  isMoving: false,
                },
              }));
            }, 60);

            if (hopCount >= totalHops) {
              window.clearInterval(hopInterval);
              setTimeout(() => {
                setAnimatedPawns((prev) => ({
                  ...prev,
                  [pawnKey]: {
                    cx: targetPos.cx,
                    cy: targetPos.cy,
                    hopY: 0,
                    scale: 1,
                    isMoving: false,
                  },
                }));
              }, 100);
            }
          }, 110);
        } else {
          // Sync static position
          setAnimatedPawns((prev) => ({
            ...prev,
            [pawnKey]: {
              cx: targetPos.cx,
              cy: targetPos.cy,
              hopY: 0,
              scale: 1,
              isMoving: false,
            },
          }));
        }
      });
    });
  }, [players, lastRoll]);

  // When lastRoll changes from server and > 0, trigger tumbling dice animation
  useEffect(() => {
    if (lastRoll > 0 && lastRoll !== prevRollRef.current) {
      setRollingAnim(true);
      casinoAudio.playLudoDiceRoll();

      let count = 0;
      const interval = window.setInterval(() => {
        count++;
        setDisplayRoll(Math.floor(Math.random() * 6) + 1);
        setDiceRotation({
          x: Math.floor(Math.random() * 360),
          y: Math.floor(Math.random() * 360),
          z: Math.floor(Math.random() * 360),
        });
        if (count >= 8) {
          window.clearInterval(interval);
          setDisplayRoll(lastRoll);
          setDiceRotation({ x: 0, y: 0, z: 0 });
          setRollingAnim(false);

          if (lastRoll === 6) {
            casinoAudio.playLudoSixCelebration();
            haptics.winCelebration();
            setShowSixCelebration(true);
            setTimeout(() => setShowSixCelebration(false), 2200);
          }
        }
      }, 55);

      prevRollRef.current = lastRoll;
      return () => window.clearInterval(interval);
    } else if (lastRoll > 0) {
      setDisplayRoll(lastRoll);
    }
  }, [lastRoll]);

  const handleDiceClick = () => {
    if (isMyTurn && canRoll && !rollingAnim) {
      haptics.buttonTap();
      casinoAudio.playLudoDiceRoll();
      setRollingAnim(true);
      let count = 0;
      const interval = window.setInterval(() => {
        count++;
        setDisplayRoll(Math.floor(Math.random() * 6) + 1);
        setDiceRotation({
          x: Math.floor(Math.random() * 360),
          y: Math.floor(Math.random() * 360),
          z: Math.floor(Math.random() * 360),
        });
        if (count >= 6) {
          window.clearInterval(interval);
        }
      }, 55);
      onRollDice();
    }
  };

  // Overlap clustering offset for track & path
  const getClusterOffset = (
    playerColor: number,
    pawn: LudoPawn,
    allPlayers: LudoPlayer[],
  ): { dx: number; dy: number } => {
    if (pawn.state !== "track" && pawn.state !== "home_path") {
      return { dx: 0, dy: 0 };
    }
    let clusterIndex = 0;
    let clusterSize = 0;
    allPlayers.forEach((p) => {
      (p.pawns || []).forEach((otherP) => {
        if (
          otherP.state === pawn.state &&
          otherP.position === pawn.position &&
          (pawn.state === "track" || p.color === playerColor)
        ) {
          if (p.color === playerColor && otherP.id === pawn.id) {
            clusterIndex = clusterSize;
          }
          clusterSize++;
        }
      });
    });

    if (clusterSize > 1) {
      const angle = (clusterIndex * 2 * Math.PI) / clusterSize;
      const radius = 4.8;
      return {
        dx: Math.cos(angle) * radius,
        dy: Math.sin(angle) * radius,
      };
    }
    return { dx: 0, dy: 0 };
  };

  // Render 3D Tumbling Realistic Ludo King Dice Cube
  const renderDice = () => {
    const pips: Record<number, number[][]> = {
      1: [[1, 1]],
      2: [
        [0, 0],
        [2, 2],
      ],
      3: [
        [0, 0],
        [1, 1],
        [2, 2],
      ],
      4: [
        [0, 0],
        [0, 2],
        [2, 0],
        [2, 2],
      ],
      5: [
        [0, 0],
        [0, 2],
        [1, 1],
        [2, 0],
        [2, 2],
      ],
      6: [
        [0, 0],
        [0, 2],
        [1, 0],
        [1, 2],
        [2, 0],
        [2, 2],
      ],
    };

    const val =
      displayRoll >= 1 && displayRoll <= 6
        ? displayRoll
        : lastRoll > 0
          ? lastRoll
          : 1;
    const activePips = pips[val] || pips[1];
    const canClickDice = isMyTurn && canRoll && !rollingAnim;

    return (
      <div
        className={`ludo-king-dice-wrapper ${canClickDice ? "can-roll-pulse" : ""}`}
        onClick={canClickDice ? handleDiceClick : undefined}
      >
        {/* Dice 3D Box */}
        <div
          className={`ludo-king-dice ${rollingAnim ? "is-tumbling" : ""}`}
          style={{
            transform: rollingAnim
              ? `rotateX(${diceRotation.x}deg) rotateY(${diceRotation.y}deg) scale(1.12)`
              : "none",
          }}
          title={
            canClickDice ? "Cliquez sur le dé pour lancer !" : `Dé : ${val}`
          }
        >
          {/* 3x3 Pip Matrix */}
          {[0, 1, 2].map((r) =>
            [0, 1, 2].map((c) => {
              const hasPip = activePips.some(
                ([pr, pc]) => pr === r && pc === c,
              );
              const isOne = val === 1 && r === 1 && c === 1;
              const isSix = val === 6;
              return (
                <div
                  key={`dice-pip-${r}-${c}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {hasPip && (
                    <div
                      className={`ludo-king-pip ${isOne ? "pip-one-center" : ""} ${isSix ? "pip-six" : ""}`}
                    />
                  )}
                </div>
              );
            }),
          )}
        </div>

        {/* Dynamic Shadow underneath */}
        <div
          className={`ludo-king-dice-shadow ${rollingAnim ? "shadow-tumbling" : ""}`}
        />
      </div>
    );
  };

  return (
    <div className="ludo-arena ludo-king-arena">
      {/* 1. Six Celebration Popup Banner */}
      {showSixCelebration && (
        <div className="ludo-king-six-burst-banner">
          <Sparkles size={20} className="spin" />
          <span>★ SIX ! REJOUEZ ! ★</span>
          <Sparkles size={20} className="spin" />
        </div>
      )}

      {/* 2. Capture Explosion Banner */}
      {captureEvent && (
        <div className="ludo-king-capture-banner">
          <Zap size={20} />
          <span>💥 ÉLIMINATION ! PION RENVOYÉ !</span>
        </div>
      )}

      {/* 3. Classical 15x15 Vector Board */}
      <div className="ludo-board-wrapper ludo-king-board-frame">
        <svg viewBox="0 0 300 300" className="ludo-king-svg">
          <defs>
            {/* Gradients for Yards */}
            <radialGradient id="redYardGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.05" />
            </radialGradient>
            <radialGradient id="greenYardGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.05" />
            </radialGradient>
            <radialGradient id="yellowYardGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.05" />
            </radialGradient>
            <radialGradient id="blueYardGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.05" />
            </radialGradient>

            {/* Gold Star Gradient */}
            <linearGradient
              id="goldStarGrad"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#fef08a" />
              <stop offset="50%" stopColor="#eab308" />
              <stop offset="100%" stopColor="#a16207" />
            </linearGradient>

            {/* Drop Shadow Filter for Board & Pawns */}
            <filter
              id="pawnShadow"
              x="-20%"
              y="-20%"
              width="150%"
              height="150%"
            >
              <feDropShadow
                dx="0"
                dy="2"
                stdDeviation="1.8"
                floodOpacity="0.45"
              />
            </filter>
            <filter id="goldGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Background grid */}
          <rect x="0" y="0" width="300" height="300" fill="#f8fafc" />

          {/* 4 Colored Yards with Luxury Bevel */}
          {/* Red Yard (Top Left: 0..120 x 0..120) */}
          <rect x="0" y="0" width="120" height="120" fill="#ef4444" />
          <rect
            x="14"
            y="14"
            width="92"
            height="92"
            rx="14"
            fill="#ffffff"
            filter="url(#pawnShadow)"
          />
          <rect
            x="18"
            y="18"
            width="84"
            height="84"
            rx="10"
            fill="url(#redYardGlow)"
          />

          {/* Green Yard (Top Right: 180..300 x 0..120) */}
          <rect x="180" y="0" width="120" height="120" fill="#10b981" />
          <rect
            x="194"
            y="14"
            width="92"
            height="92"
            rx="14"
            fill="#ffffff"
            filter="url(#pawnShadow)"
          />
          <rect
            x="198"
            y="18"
            width="84"
            height="84"
            rx="10"
            fill="url(#greenYardGlow)"
          />

          {/* Yellow Yard (Bottom Right: 180..300 x 180..300) */}
          <rect x="180" y="180" width="120" height="120" fill="#f59e0b" />
          <rect
            x="194"
            y="194"
            width="92"
            height="92"
            rx="14"
            fill="#ffffff"
            filter="url(#pawnShadow)"
          />
          <rect
            x="198"
            y="198"
            width="84"
            height="84"
            rx="10"
            fill="url(#yellowYardGlow)"
          />

          {/* Blue Yard (Bottom Left: 0..120 x 180..300) */}
          <rect x="0" y="180" width="120" height="120" fill="#3b82f6" />
          <rect
            x="14"
            y="194"
            width="92"
            height="92"
            rx="14"
            fill="#ffffff"
            filter="url(#pawnShadow)"
          />
          <rect
            x="18"
            y="198"
            width="84"
            height="84"
            rx="10"
            fill="url(#blueYardGlow)"
          />

          {/* Central Victory Triangle (120..180 x 120..180) */}
          <polygon
            points="120,120 180,120 150,150"
            fill="#10b981"
            stroke="#fff"
            strokeWidth="0.8"
          />
          <polygon
            points="180,120 180,180 150,150"
            fill="#f59e0b"
            stroke="#fff"
            strokeWidth="0.8"
          />
          <polygon
            points="120,180 180,180 150,150"
            fill="#3b82f6"
            stroke="#fff"
            strokeWidth="0.8"
          />
          <polygon
            points="120,120 120,180 150,150"
            fill="#ef4444"
            stroke="#fff"
            strokeWidth="0.8"
          />

          {/* Golden Center Medallion with Crown */}
          <circle
            cx="150"
            cy="150"
            r="16"
            fill="url(#goldStarGrad)"
            stroke="#78350f"
            strokeWidth="2"
            filter="url(#goldGlow)"
          />
          <text
            x="150"
            y="154.5"
            fontSize="13"
            textAnchor="middle"
            fill="#451a03"
            fontWeight="900"
          >
            👑
          </text>

          {/* Colored Home Paths with Forward Arrow Motifs */}
          {/* Red Home Path (Cols 1..5, Row 7) */}
          {[1, 2, 3, 4, 5].map((col) => (
            <g key={`red-hp-${col}`}>
              <rect
                x={col * 20}
                y={140}
                width="20"
                height="20"
                fill="#ef4444"
                stroke="#ffffff"
                strokeWidth="0.9"
              />
              <polygon
                points={`${col * 20 + 6},144 ${col * 20 + 14},150 ${col * 20 + 6},156`}
                fill="rgba(255,255,255,0.45)"
              />
            </g>
          ))}
          {/* Green Home Path (Rows 1..5, Col 7) */}
          {[1, 2, 3, 4, 5].map((row) => (
            <g key={`green-hp-${row}`}>
              <rect
                x={140}
                y={row * 20}
                width="20"
                height="20"
                fill="#10b981"
                stroke="#ffffff"
                strokeWidth="0.9"
              />
              <polygon
                points={`144,${row * 20 + 6} 150,${row * 20 + 14} 156,${row * 20 + 6}`}
                fill="rgba(255,255,255,0.45)"
              />
            </g>
          ))}
          {/* Yellow Home Path (Cols 9..13, Row 7) */}
          {[9, 10, 11, 12, 13].map((col) => (
            <g key={`yellow-hp-${col}`}>
              <rect
                x={col * 20}
                y={140}
                width="20"
                height="20"
                fill="#f59e0b"
                stroke="#ffffff"
                strokeWidth="0.9"
              />
              <polygon
                points={`${col * 20 + 14},144 ${col * 20 + 6},150 ${col * 20 + 14},156`}
                fill="rgba(255,255,255,0.45)"
              />
            </g>
          ))}
          {/* Blue Home Path (Rows 9..13, Col 7) */}
          {[9, 10, 11, 12, 13].map((row) => (
            <g key={`blue-hp-${row}`}>
              <rect
                x={140}
                y={row * 20}
                width="20"
                height="20"
                fill="#3b82f6"
                stroke="#ffffff"
                strokeWidth="0.9"
              />
              <polygon
                points={`144,${row * 20 + 14} 150,${row * 20 + 6} 156,${row * 20 + 14}`}
                fill="rgba(255,255,255,0.45)"
              />
            </g>
          ))}

          {/* Grid lines on track */}
          <g stroke="#cbd5e1" strokeWidth="0.6" fill="none">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <React.Fragment key={`grid-top-${i}`}>
                <rect x={120} y={i * 20} width="20" height="20" />
                <rect x={160} y={i * 20} width="20" height="20" />
              </React.Fragment>
            ))}
            {[9, 10, 11, 12, 13, 14].map((i) => (
              <React.Fragment key={`grid-bot-${i}`}>
                <rect x={120} y={i * 20} width="20" height="20" />
                <rect x={160} y={i * 20} width="20" height="20" />
              </React.Fragment>
            ))}
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <React.Fragment key={`grid-left-${i}`}>
                <rect x={i * 20} y={120} width="20" height="20" />
                <rect x={i * 20} y={160} width="20" height="20" />
              </React.Fragment>
            ))}
            {[9, 10, 11, 12, 13, 14].map((i) => (
              <React.Fragment key={`grid-right-${i}`}>
                <rect x={i * 20} y={120} width="20" height="20" />
                <rect x={i * 20} y={160} width="20" height="20" />
              </React.Fragment>
            ))}
          </g>

          {/* 8 Safe Squares (Starts + Arm Stars) with Golden Medallions */}
          {Array.from(SAFE_SQUARES).map((sqIdx) => {
            const [c, r] = TRACK_GRID_COORDS[sqIdx];
            const isStart =
              sqIdx === 0 || sqIdx === 13 || sqIdx === 26 || sqIdx === 39;
            const startColor =
              sqIdx === 0
                ? "#ef4444"
                : sqIdx === 13
                  ? "#10b981"
                  : sqIdx === 26
                    ? "#f59e0b"
                    : sqIdx === 39
                      ? "#3b82f6"
                      : "#ffffff";

            return (
              <g key={`safe-sq-${sqIdx}`}>
                {isStart ? (
                  <rect
                    x={c * 20}
                    y={r * 20}
                    width="20"
                    height="20"
                    fill={startColor}
                    stroke="#fff"
                    strokeWidth="1"
                  />
                ) : (
                  <rect
                    x={c * 20}
                    y={r * 20}
                    width="20"
                    height="20"
                    fill="#f1f5f9"
                    stroke="#cbd5e1"
                    strokeWidth="0.6"
                  />
                )}
                {/* Golden Star Emblem */}
                <circle
                  cx={c * 20 + 10}
                  cy={r * 20 + 10}
                  r="7.5"
                  fill="url(#goldStarGrad)"
                  stroke="#78350f"
                  strokeWidth="0.8"
                />
                <text
                  x={c * 20 + 10}
                  y={r * 20 + 13.2}
                  fontSize="8.5"
                  textAnchor="middle"
                  fill="#451a03"
                  fontWeight="900"
                >
                  ★
                </text>
              </g>
            );
          })}

          {/* Yard circular pawn slots (4 per camp) */}
          {[
            { cx: 40, cy: 40, color: "#ef4444" },
            { cx: 80, cy: 40, color: "#ef4444" },
            { cx: 40, cy: 80, color: "#ef4444" },
            { cx: 80, cy: 80, color: "#ef4444" },
            { cx: 220, cy: 40, color: "#10b981" },
            { cx: 260, cy: 40, color: "#10b981" },
            { cx: 220, cy: 80, color: "#10b981" },
            { cx: 260, cy: 80, color: "#10b981" },
            { cx: 220, cy: 220, color: "#f59e0b" },
            { cx: 260, cy: 220, color: "#f59e0b" },
            { cx: 220, cy: 260, color: "#f59e0b" },
            { cx: 260, cy: 260, color: "#f59e0b" },
            { cx: 40, cy: 220, color: "#3b82f6" },
            { cx: 80, cy: 220, color: "#3b82f6" },
            { cx: 40, cy: 260, color: "#3b82f6" },
            { cx: 80, cy: 260, color: "#3b82f6" },
          ].map((slot, sIdx) => (
            <circle
              key={`slot-${sIdx}`}
              cx={slot.cx}
              cy={slot.cy}
              r="13"
              fill={slot.color}
              opacity="0.18"
              stroke={slot.color}
              strokeWidth="2"
              strokeDasharray="3 2"
            />
          ))}

          {/* Capture Blast Animation */}
          {captureEvent && (
            <g className="ludo-king-blast-shockwave">
              <circle
                cx={captureEvent.cx}
                cy={captureEvent.cy}
                r="18"
                fill="none"
                stroke="#f59e0b"
                strokeWidth="3"
                opacity="0.8"
              >
                <animate
                  attributeName="r"
                  values="8;26"
                  dur="0.5s"
                  repeatCount="1"
                />
                <animate
                  attributeName="opacity"
                  values="0.9;0"
                  dur="0.5s"
                  repeatCount="1"
                />
              </circle>
              <text
                x={captureEvent.cx}
                y={captureEvent.cy - 12}
                fontSize="12"
                textAnchor="middle"
                fill="#f59e0b"
                fontWeight="900"
              >
                💥
              </text>
            </g>
          )}

          {/* Goal Entry Celebration */}
          {goalCelebration && (
            <g className="ludo-king-goal-burst">
              <circle
                cx={goalCelebration.cx}
                cy={goalCelebration.cy}
                r="22"
                fill="none"
                stroke="#ffd700"
                strokeWidth="3"
              >
                <animate
                  attributeName="r"
                  values="10;34"
                  dur="0.6s"
                  repeatCount="1"
                />
                <animate
                  attributeName="opacity"
                  values="1;0"
                  dur="0.6s"
                  repeatCount="1"
                />
              </circle>
              <text
                x={goalCelebration.cx}
                y={goalCelebration.cy - 14}
                fontSize="14"
                textAnchor="middle"
                fill="#ffd700"
                fontWeight="bold"
              >
                🏆 BUT !
              </text>
            </g>
          )}

          {/* RENDER ALL PAWNS WITH LUDO KING HOPPING & GLOW */}
          {players.map((player) => {
            const camp = COLOR_CONFIG[player.color] || COLOR_CONFIG[0];
            const isMe = player.color === myColorIndex;

            return (player.pawns || []).map((pawn) => {
              const pawnKey = `${player.color}-${pawn.id}`;
              const isSelectable =
                isMe && isMyTurn && canMove && validMoves.includes(pawn.id);
              const animPos = animatedPawns[pawnKey];
              const staticPos = getStaticCoord(
                player.color,
                pawn.state,
                pawn.position,
                pawn.id,
              );
              const clusterOffset = getClusterOffset(
                player.color,
                pawn,
                players,
              );

              const cx =
                (animPos ? animPos.cx : staticPos.cx) + clusterOffset.dx;
              const cy =
                (animPos ? animPos.cy : staticPos.cy) + clusterOffset.dy;
              const hopY = animPos?.hopY || 0;
              const scale = animPos?.scale || 1;

              return (
                <g
                  key={`pawn-${pawnKey}`}
                  onClick={() => {
                    if (isSelectable) {
                      haptics.buttonTap();
                      casinoAudio.playLudoPawnHop();
                      onMovePawn(pawn.id);
                    }
                  }}
                  style={{
                    cursor: isSelectable ? "pointer" : "default",
                    touchAction: "manipulation",
                  }}
                  transform={`translate(0, ${hopY}) scale(${scale})`}
                  transform-origin={`${cx} ${cy}`}
                >
                  {/* Realistic Pawn Shadow */}
                  <ellipse
                    cx={cx}
                    cy={cy + 4 - hopY * 0.4}
                    rx={hopY < 0 ? 6 : 9}
                    ry={hopY < 0 ? 2.5 : 4}
                    fill="rgba(0,0,0,0.32)"
                  />

                  {/* Ludo King Movable Bouncing Pulsing Aura */}
                  {isSelectable && (
                    <g>
                      <circle
                        cx={cx}
                        cy={cy}
                        r="14"
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth="2.8"
                        filter="url(#goldGlow)"
                      >
                        <animate
                          attributeName="r"
                          values="12;17;12"
                          dur="0.8s"
                          repeatCount="indefinite"
                        />
                        <animate
                          attributeName="opacity"
                          values="1;0.35;1"
                          dur="0.8s"
                          repeatCount="indefinite"
                        />
                      </circle>
                      {/* Downward indicator triangle */}
                      <polygon
                        points={`${cx},${cy - 14} ${cx - 4},${cy - 20} ${cx + 4},${cy - 20}`}
                        fill="#22c55e"
                      >
                        <animate
                          attributeName="transform"
                          type="translate"
                          values="0,0; 0,-3; 0,0"
                          dur="0.8s"
                          repeatCount="indefinite"
                        />
                      </polygon>
                    </g>
                  )}

                  {/* Pawn Base Body (Glossy 3D Cylinder / Pawn Head) */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={pawn.state === "home" ? 8 : 10.5}
                    fill={camp.primary}
                    stroke="#ffffff"
                    strokeWidth={isSelectable ? "2.4" : "1.8"}
                    filter="url(#pawnShadow)"
                  />

                  {/* Glossy highlight reflection (upper crescent) */}
                  <ellipse
                    cx={cx - 2.5}
                    cy={cy - 3}
                    rx="4.5"
                    ry="2.5"
                    fill="#ffffff"
                    opacity="0.45"
                  />

                  {/* Pawn Number / Icon */}
                  <text
                    x={cx}
                    y={cy + 3.2}
                    fontSize={pawn.state === "home" ? "7.5" : "9.5"}
                    fontWeight="900"
                    fill="#ffffff"
                    textAnchor="middle"
                    pointerEvents="none"
                  >
                    {pawn.id + 1}
                  </text>
                </g>
              );
            });
          })}
        </svg>
      </div>

      {/* 4. Interactive Control Station & 3D Dice Display */}
      <div className="ludo-control-station ludo-king-station">
        {renderDice()}

        <div className="ludo-king-station-body">
          <div className="ludo-king-station-status">
            {lastRoll === 6 ? (
              <span className="ludo-six-status">🎲 Six obtenu ! (Rejouez)</span>
            ) : lastRoll > 0 ? (
              <span>
                Dé : <strong>{lastRoll}</strong>
              </span>
            ) : isMyTurn ? (
              <span className="ludo-myturn-status">
                À vous de lancer le dé !
              </span>
            ) : (
              <span>Tour de jeu</span>
            )}
          </div>

          {/* Roll Button when it's player's turn */}
          {isMyTurn && canRoll && (
            <button
              type="button"
              className="button button-gold ludo-king-roll-cta"
              onClick={handleDiceClick}
              disabled={rollingAnim}
            >
              <Zap size={16} />
              <span>{rollingAnim ? "Lancement..." : "Lancer le Dé 🎲"}</span>
            </button>
          )}

          {/* Movable Pawn Chips */}
          {isMyTurn && canMove && validMoves.length > 0 && (
            <div className="ludo-king-pawn-chips">
              <span className="ludo-king-pawn-hint">Avancer pion :</span>
              {validMoves.map((pId) => (
                <button
                  key={`mv-btn-${pId}`}
                  type="button"
                  className="ludo-king-pawn-btn"
                  onClick={() => {
                    haptics.buttonTap();
                    casinoAudio.playLudoPawnHop();
                    onMovePawn(pId);
                  }}
                  title={`Avancer le pion #${pId + 1}`}
                >
                  #{pId + 1}
                </button>
              ))}
            </div>
          )}

          {!isMyTurn && (
            <div className="ludo-king-wait-text">
              Tour du camp{" "}
              <strong>
                {COLOR_CONFIG[currentTurnIndex]?.name ||
                  `Joueur ${currentTurnIndex + 1}`}
              </strong>
              …
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
