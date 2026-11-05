import React from "react";
import { haptics } from "@utils/haptics";

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
  { name: "Rouge", primary: "#ef4444", light: "#fee2e2", border: "#b91c1c" },
  { name: "Vert", primary: "#10b981", light: "#d1fae5", border: "#047857" },
  { name: "Jaune", primary: "#f59e0b", light: "#fef3c7", border: "#b45309" },
  { name: "Bleu", primary: "#3b82f6", light: "#dbeafe", border: "#1d4ed8" },
];

// 52 Common Track Cells in clockwise order (15x15 board, cell = 20x20)
// Indices 0..51 correspond exactly to internal engine track indices
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
  [6, 0], // 5, 6, 7, 8, 9, 10
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
  [14, 6], // 18, 19, 20, 21, 22, 23
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
  [8, 14], // 31, 32, 33, 34, 35, 36
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
  [0, 8], // 44, 45, 46, 47, 48, 49
  // Left apex (turn-off to Red home path)
  [0, 7], // 50
  // Left arm returning to Red start
  [0, 6], // 51
];

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
  const [rollingAnim, setRollingAnim] = React.useState(false);
  const [displayRoll, setDisplayRoll] = React.useState<number>(
    lastRoll > 0 ? lastRoll : 1,
  );
  const prevRollRef = React.useRef(lastRoll);

  // When lastRoll changes from server and > 0, trigger tumbling dice animation
  React.useEffect(() => {
    if (lastRoll > 0 && lastRoll !== prevRollRef.current) {
      setRollingAnim(true);
      let count = 0;
      const interval = window.setInterval(() => {
        count++;
        setDisplayRoll(Math.floor(Math.random() * 6) + 1);
        if (count >= 7) {
          window.clearInterval(interval);
          setDisplayRoll(lastRoll);
          setRollingAnim(false);
        }
      }, 60);
      prevRollRef.current = lastRoll;
      return () => window.clearInterval(interval);
    } else if (lastRoll > 0) {
      setDisplayRoll(lastRoll);
    }
  }, [lastRoll]);

  const handleDiceClick = () => {
    if (isMyTurn && canRoll && !rollingAnim) {
      haptics.buttonTap();
      setRollingAnim(true);
      let count = 0;
      const interval = window.setInterval(() => {
        count++;
        setDisplayRoll(Math.floor(Math.random() * 6) + 1);
        if (count >= 6) {
          window.clearInterval(interval);
        }
      }, 60);
      onRollDice();
    }
  };

  // Compute offset when multiple pawns occupy the exact same square
  const getPawnPixelPosition = (
    playerColor: number,
    pawn: LudoPawn,
    allPlayers: LudoPlayer[],
  ): { cx: number; cy: number } => {
    let baseCx = 150;
    let baseCy = 150;

    if (pawn.state === "base") {
      const yardOffsets = [
        [40, 40],
        [80, 40],
        [40, 80],
        [80, 80],
      ];
      const baseCornerOffsets = [
        [0, 0], // 0: Red (top-left)
        [180, 0], // 1: Green (top-right)
        [180, 180], // 2: Yellow (bottom-right)
        [0, 180], // 3: Blue (bottom-left)
      ][playerColor] || [0, 0];
      const off = yardOffsets[pawn.id] || yardOffsets[0];
      baseCx = baseCornerOffsets[0] + off[0];
      baseCy = baseCornerOffsets[1] + off[1];
      return { cx: baseCx, cy: baseCy };
    }

    if (pawn.state === "home") {
      const homeCoord = HOME_TRIANGLE_COORDS[playerColor] || [150, 150];
      // Slight spread in home triangle
      const spread = (pawn.id - 1.5) * 4;
      return {
        cx: homeCoord[0] + (playerColor % 2 === 0 ? 0 : spread),
        cy: homeCoord[1] + (playerColor % 2 === 0 ? spread : 0),
      };
    }

    if (pawn.state === "track") {
      const pos = ((pawn.position % 52) + 52) % 52;
      const grid = TRACK_GRID_COORDS[pos] || [1, 6];
      baseCx = grid[0] * 20 + 10;
      baseCy = grid[1] * 20 + 10;
    } else if (pawn.state === "home_path") {
      const colorPaths =
        HOME_PATH_GRID_COORDS[playerColor] || HOME_PATH_GRID_COORDS[0];
      if (pawn.position >= 0 && pawn.position < colorPaths.length) {
        const grid = colorPaths[pawn.position];
        baseCx = grid[0] * 20 + 10;
        baseCy = grid[1] * 20 + 10;
      } else {
        // At or beyond 5: inside center home triangle
        const homeCoord = HOME_TRIANGLE_COORDS[playerColor] || [150, 150];
        baseCx = homeCoord[0];
        baseCy = homeCoord[1];
      }
    }

    // Overlap clustering offset for track & path
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
      const radius = 4.5;
      baseCx += Math.cos(angle) * radius;
      baseCy += Math.sin(angle) * radius;
    }

    return { cx: baseCx, cy: baseCy };
  };

  // Render animated 3D Dice with realistic face and pips
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
        className={`ludo-dice-box ${rollingAnim ? "is-rolling" : ""} ${canClickDice ? "can-roll-pulse" : ""}`}
        onClick={canClickDice ? handleDiceClick : undefined}
        title={canClickDice ? "Cliquez sur le dé pour lancer !" : `Dé : ${val}`}
        style={{
          cursor: canClickDice ? "pointer" : "default",
          touchAction: "manipulation",
        }}
      >
        {[0, 1, 2].map((r) =>
          [0, 1, 2].map((c) => {
            const hasPip = activePips.some(([pr, pc]) => pr === r && pc === c);
            const isOne = val === 1 && r === 1 && c === 1;
            const isSix = val === 6;
            return (
              <div
                key={`${r}-${c}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {hasPip && (
                  <div
                    className={`ludo-dice-pip ${isOne ? "is-one-center" : ""} ${isSix ? "is-six-pip" : ""}`}
                  />
                )}
              </div>
            );
          }),
        )}
      </div>
    );
  };

  return (
    <div
      className="ludo-arena"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "12px",
        margin: "0 auto",
        maxWidth: "460px",
        width: "100%",
      }}
    >
      {/* 15x15 Classical Ludo Board SVG */}
      <div
        className="ludo-board-wrapper"
        style={{
          width: "100%",
          maxWidth: "380px",
          aspectRatio: "1/1",
          background: "#ffffff",
          borderRadius: "18px",
          boxShadow: "0 14px 34px rgba(0,0,0,0.55), inset 0 0 0 4px #2b1d0c",
          position: "relative",
          overflow: "hidden",
          border: "5px solid #4a3319",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        <svg
          viewBox="0 0 300 300"
          style={{ width: "100%", height: "100%", display: "block" }}
        >
          {/* Background grid */}
          <rect x="0" y="0" width="300" height="300" fill="#fdfbf7" />
          {/* 4 Colored Yards */}
          {/* Red Yard (Top Left: 0..120 x 0..120) */}
          <rect x="0" y="0" width="120" height="120" fill="#ef4444" />
          <rect x="16" y="16" width="88" height="88" rx="12" fill="#ffffff" />
          {/* Green Yard (Top Right: 180..300 x 0..120) */}
          <rect x="180" y="0" width="120" height="120" fill="#10b981" />
          <rect x="196" y="16" width="88" height="88" rx="12" fill="#ffffff" />
          {/* Yellow Yard (Bottom Right: 180..300 x 180..300) */}
          <rect x="180" y="180" width="120" height="120" fill="#f59e0b" />
          <rect x="196" y="196" width="88" height="88" rx="12" fill="#ffffff" />
          {/* Blue Yard (Bottom Left: 0..120 x 180..300) */}
          <rect x="0" y="180" width="120" height="120" fill="#3b82f6" />
          <rect x="16" y="196" width="88" height="88" rx="12" fill="#ffffff" />
          {/* Central Home Victory Area (120..180 x 120..180) */}
          <polygon points="120,120 180,120 150,150" fill="#10b981" />{" "}
          {/* Green Top */}
          <polygon points="180,120 180,180 150,150" fill="#f59e0b" />{" "}
          {/* Yellow Right */}
          <polygon points="120,180 180,180 150,150" fill="#3b82f6" />{" "}
          {/* Blue Bottom */}
          <polygon points="120,120 120,180 150,150" fill="#ef4444" />{" "}
          {/* Red Left */}
          {/* Center Trophy Medallion */}
          <circle
            cx="150"
            cy="150"
            r="14"
            fill="#ffd700"
            stroke="#b45309"
            strokeWidth="1.5"
          />
          <text
            x="150"
            y="154.5"
            fontSize="12"
            textAnchor="middle"
            fill="#78350f"
            fontWeight="bold"
          >
            ★
          </text>
          {/* Colored Home Path Columns */}
          {/* Red Home Path (Cols 1 to 5, Row 7) */}
          {[1, 2, 3, 4, 5].map((col) => (
            <rect
              key={`red-hp-${col}`}
              x={col * 20}
              y={140}
              width="20"
              height="20"
              fill="#ef4444"
              stroke="#ffffff"
              strokeWidth="0.8"
            />
          ))}
          {/* Green Home Path (Rows 1 to 5, Col 7) */}
          {[1, 2, 3, 4, 5].map((row) => (
            <rect
              key={`green-hp-${row}`}
              x={140}
              y={row * 20}
              width="20"
              height="20"
              fill="#10b981"
              stroke="#ffffff"
              strokeWidth="0.8"
            />
          ))}
          {/* Yellow Home Path (Cols 9 to 13, Row 7) */}
          {[9, 10, 11, 12, 13].map((col) => (
            <rect
              key={`yellow-hp-${col}`}
              x={col * 20}
              y={140}
              width="20"
              height="20"
              fill="#f59e0b"
              stroke="#ffffff"
              strokeWidth="0.8"
            />
          ))}
          {/* Blue Home Path (Rows 9 to 13, Col 7) */}
          {[9, 10, 11, 12, 13].map((row) => (
            <rect
              key={`blue-hp-${row}`}
              x={140}
              y={row * 20}
              width="20"
              height="20"
              fill="#3b82f6"
              stroke="#ffffff"
              strokeWidth="0.8"
            />
          ))}
          {/* Start squares with star indicators */}
          {/* Red Start (Col 1, Row 6) */}
          <rect
            x={20}
            y={120}
            width="20"
            height="20"
            fill="#ef4444"
            stroke="#fff"
            strokeWidth="0.8"
          />
          <text
            x={30}
            y={135}
            fontSize="11"
            textAnchor="middle"
            fill="#fff"
            fontWeight="bold"
          >
            ★
          </text>
          {/* Green Start (Col 8, Row 1) */}
          <rect
            x={160}
            y={20}
            width="20"
            height="20"
            fill="#10b981"
            stroke="#fff"
            strokeWidth="0.8"
          />
          <text
            x={170}
            y={35}
            fontSize="11"
            textAnchor="middle"
            fill="#fff"
            fontWeight="bold"
          >
            ★
          </text>
          {/* Yellow Start (Col 13, Row 8) */}
          <rect
            x={260}
            y={160}
            width="20"
            height="20"
            fill="#f59e0b"
            stroke="#fff"
            strokeWidth="0.8"
          />
          <text
            x={270}
            y={175}
            fontSize="11"
            textAnchor="middle"
            fill="#fff"
            fontWeight="bold"
          >
            ★
          </text>
          {/* Blue Start (Col 6, Row 13) */}
          <rect
            x={120}
            y={260}
            width="20"
            height="20"
            fill="#3b82f6"
            stroke="#fff"
            strokeWidth="0.8"
          />
          <text
            x={130}
            y={275}
            fontSize="11"
            textAnchor="middle"
            fill="#fff"
            fontWeight="bold"
          >
            ★
          </text>
          {/* Grid lines on track */}
          <g stroke="#e2e8f0" strokeWidth="0.6" fill="none">
            {/* Top track lines */}
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <React.Fragment key={`top-${i}`}>
                <rect x={120} y={i * 20} width="20" height="20" />
                <rect x={160} y={i * 20} width="20" height="20" />
              </React.Fragment>
            ))}
            {/* Bottom track lines */}
            {[9, 10, 11, 12, 13, 14].map((i) => (
              <React.Fragment key={`bot-${i}`}>
                <rect x={120} y={i * 20} width="20" height="20" />
                <rect x={160} y={i * 20} width="20" height="20" />
              </React.Fragment>
            ))}
            {/* Left track lines */}
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <React.Fragment key={`left-${i}`}>
                <rect x={i * 20} y={120} width="20" height="20" />
                <rect x={i * 20} y={160} width="20" height="20" />
              </React.Fragment>
            ))}
            {/* Right track lines */}
            {[9, 10, 11, 12, 13, 14].map((i) => (
              <React.Fragment key={`right-${i}`}>
                <rect x={i * 20} y={120} width="20" height="20" />
                <rect x={i * 20} y={160} width="20" height="20" />
              </React.Fragment>
            ))}
          </g>
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
              r="12"
              fill={slot.color}
              opacity="0.22"
              stroke={slot.color}
              strokeWidth="1.5"
            />
          ))}
          {/* Render ALL Pawns on Board (Base, Track, Home Path & Central Home) */}
          {players.map((player) => {
            const camp = COLOR_CONFIG[player.color] || COLOR_CONFIG[0];
            const isMe = player.color === myColorIndex;

            return (player.pawns || []).map((pawn) => {
              const isSelectable =
                isMe && isMyTurn && canMove && validMoves.includes(pawn.id);
              const { cx, cy } = getPawnPixelPosition(
                player.color,
                pawn,
                players,
              );

              return (
                <g
                  key={`pawn-${player.color}-${pawn.id}`}
                  onClick={() => {
                    if (isSelectable) {
                      haptics.buttonTap();
                      onMovePawn(pawn.id);
                    }
                  }}
                  style={{
                    cursor: isSelectable ? "pointer" : "default",
                    touchAction: "manipulation",
                  }}
                >
                  {/* Pawn shadow */}
                  <ellipse
                    cx={cx}
                    cy={cy + 4}
                    rx="9"
                    ry="4"
                    fill="rgba(0,0,0,0.3)"
                  />

                  {/* Pulsing indicator ring for selectable movable pawn */}
                  {isSelectable && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r="14"
                      fill="none"
                      stroke="#22c55e"
                      strokeWidth="2.5"
                    >
                      <animate
                        attributeName="r"
                        values="11;16;11"
                        dur="1.1s"
                        repeatCount="indefinite"
                      />
                      <animate
                        attributeName="opacity"
                        values="1;0.4;1"
                        dur="1.1s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  )}

                  {/* Pawn Body Circle */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={pawn.state === "home" ? 8 : 10}
                    fill={camp.primary}
                    stroke="#ffffff"
                    strokeWidth={isSelectable ? "2.2" : "1.6"}
                    filter="drop-shadow(0px 2px 3px rgba(0,0,0,0.45))"
                  />

                  {/* Pawn Number Label (1 to 4) */}
                  <text
                    x={cx}
                    y={cy + 3.2}
                    fontSize={pawn.state === "home" ? "7.5" : "9"}
                    fontWeight="800"
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

      {/* Interactive Control & Dice Station */}
      <div
        className="ludo-control-station"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "14px",
          background:
            "linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.9) 100%)",
          padding: "10px 16px",
          borderRadius: "16px",
          border: "1.5px solid rgba(255, 215, 0, 0.35)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
          width: "100%",
          maxWidth: "380px",
          boxSizing: "border-box",
        }}
      >
        {renderDice()}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            flex: 1,
            minWidth: 0,
          }}
        >
          <div
            style={{ fontSize: "0.85rem", fontWeight: 700, color: "#ffd54f" }}
          >
            {lastRoll === 6
              ? "🎲 Six obtenu ! (Rejouez)"
              : lastRoll > 0
                ? `Dé : ${lastRoll}`
                : isMyTurn
                  ? "À vous de lancer !"
                  : "Prêt à jouer"}
          </div>

          {isMyTurn && canRoll && (
            <button
              type="button"
              className="button button-gold"
              onClick={handleDiceClick}
              style={{
                fontWeight: 800,
                padding: "8px 16px",
                fontSize: "0.92rem",
                boxShadow: "0 0 14px rgba(255, 215, 0, 0.4)",
                width: "100%",
              }}
            >
              🎲 Lancer le Dé
            </button>
          )}

          {isMyTurn && canMove && validMoves.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: "6px",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "#86efac",
                  fontWeight: 700,
                }}
              >
                Pion :
              </span>
              {validMoves.map((pId) => (
                <button
                  key={`mv-btn-${pId}`}
                  type="button"
                  className="button button-small"
                  onClick={() => {
                    haptics.buttonTap();
                    onMovePawn(pId);
                  }}
                  style={{
                    background: "#22c55e",
                    color: "#052e16",
                    fontWeight: 800,
                    padding: "4px 10px",
                    borderRadius: "8px",
                  }}
                >
                  #{pId + 1}
                </button>
              ))}
            </div>
          )}

          {!isMyTurn && (
            <div
              style={{
                fontSize: "0.78rem",
                color: "var(--muted)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              Tour du camp{" "}
              {COLOR_CONFIG[currentTurnIndex]?.name ||
                `Joueur ${currentTurnIndex + 1}`}
              …
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
