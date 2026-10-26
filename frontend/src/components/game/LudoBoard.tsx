import React from "react";

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
  { name: "Rouge", primary: "#e53935", light: "#ffebee", border: "#b71c1c", yardPos: { top: 0, left: 0 } },
  { name: "Vert", primary: "#43a047", light: "#e8f5e9", border: "#1b5e20", yardPos: { top: 0, right: 0 } },
  { name: "Jaune", primary: "#fbc02d", light: "#fffde7", border: "#f57f17", yardPos: { bottom: 0, right: 0 } },
  { name: "Bleu", primary: "#1e88e5", light: "#e3f2fd", border: "#0d47a1", yardPos: { bottom: 0, left: 0 } },
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
  // Render animated 3D Dice
  const renderDice = () => {
    const pips: Record<number, number[][]> = {
      1: [[1, 1]],
      2: [[0, 0], [2, 2]],
      3: [[0, 0], [1, 1], [2, 2]],
      4: [[0, 0], [0, 2], [2, 0], [2, 2]],
      5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
      6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
    };

    const activePips = pips[lastRoll] || pips[1];

    return (
      <div
        className="ludo-dice-box"
        style={{
          width: "56px",
          height: "56px",
          borderRadius: "12px",
          background: "linear-gradient(145deg, #ffffff, #e6e6e6)",
          boxShadow: "0 6px 14px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.9)",
          border: "2px solid #ccc",
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gridTemplateRows: "repeat(3, 1fr)",
          padding: "6px",
          boxSizing: "border-box",
          position: "relative",
          userSelect: "none",
        }}
      >
        {[0, 1, 2].map((r) =>
          [0, 1, 2].map((c) => {
            const hasPip = lastRoll > 0 && activePips.some(([pr, pc]) => pr === r && pc === c);
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
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: lastRoll === 6 ? "#e53935" : "#111",
                      boxShadow: "inset 0 1px 1px rgba(0,0,0,0.6)",
                    }}
                  />
                )}
              </div>
            );
          })
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
        gap: "14px",
        margin: "10px auto",
        maxWidth: "460px",
        width: "100%",
      }}
    >
      {/* 15x15 SVG Classical Ludo Board */}
      <div
        className="ludo-board-wrapper"
        style={{
          width: "100%",
          maxWidth: "380px",
          aspectRatio: "1/1",
          background: "#ffffff",
          borderRadius: "16px",
          boxShadow: "0 12px 30px rgba(0,0,0,0.6), inset 0 0 0 4px #2b1d0c",
          position: "relative",
          overflow: "hidden",
          border: "6px solid #4a3319",
        }}
      >
        <svg
          viewBox="0 0 300 300"
          style={{ width: "100%", height: "100%", display: "block" }}
        >
          {/* Background grid */}
          <rect x="0" y="0" width="300" height="300" fill="#fdfcf8" />

          {/* 4 Colored Yards */}
          {/* Red Yard (Top Left: 0..120 x 0..120) */}
          <rect x="0" y="0" width="120" height="120" fill="#e53935" />
          <rect x="18" y="18" width="84" height="84" rx="10" fill="#ffffff" />
          {/* Green Yard (Top Right: 180..300 x 0..120) */}
          <rect x="180" y="0" width="120" height="120" fill="#43a047" />
          <rect x="198" y="18" width="84" height="84" rx="10" fill="#ffffff" />
          {/* Yellow Yard (Bottom Right: 180..300 x 180..300) */}
          <rect x="180" y="180" width="120" height="120" fill="#fbc02d" />
          <rect x="198" y="198" width="84" height="84" rx="10" fill="#ffffff" />
          {/* Blue Yard (Bottom Left: 0..120 x 180..300) */}
          <rect x="0" y="180" width="120" height="120" fill="#1e88e5" />
          <rect x="18" y="198" width="84" height="84" rx="10" fill="#ffffff" />

          {/* Home Central Area (120..180 x 120..180) */}
          <polygon points="120,120 180,120 150,150" fill="#43a047" /> {/* Green Top */}
          <polygon points="180,120 180,180 150,150" fill="#fbc02d" /> {/* Yellow Right */}
          <polygon points="120,180 180,180 150,150" fill="#1e88e5" /> {/* Blue Bottom */}
          <polygon points="120,120 120,180 150,150" fill="#e53935" /> {/* Red Left */}
          {/* Center Trophy */}
          <circle cx="150" cy="150" r="14" fill="#ffd700" stroke="#b8860b" strokeWidth="1.5" />
          <text x="150" y="154" fontSize="12" textAnchor="middle" fill="#5c3800" fontWeight="bold">★</text>

          {/* Home Path Columns */}
          {/* Red Home Path (Cols 1 to 5, Row 7) */}
          {[1, 2, 3, 4, 5].map((col) => (
            <rect key={`red-hp-${col}`} x={col * 20} y={140} width="20" height="20" fill="#e53935" stroke="#ffffff" strokeWidth="0.8" />
          ))}
          {/* Green Home Path (Rows 1 to 5, Col 7) */}
          {[1, 2, 3, 4, 5].map((row) => (
            <rect key={`green-hp-${row}`} x={140} y={row * 20} width="20" height="20" fill="#43a047" stroke="#ffffff" strokeWidth="0.8" />
          ))}
          {/* Yellow Home Path (Cols 9 to 13, Row 7) */}
          {[9, 10, 11, 12, 13].map((col) => (
            <rect key={`yellow-hp-${col}`} x={col * 20} y={140} width="20" height="20" fill="#fbc02d" stroke="#ffffff" strokeWidth="0.8" />
          ))}
          {/* Blue Home Path (Rows 9 to 13, Col 7) */}
          {[9, 10, 11, 12, 13].map((row) => (
            <rect key={`blue-hp-${row}`} x={140} y={row * 20} width="20" height="20" fill="#1e88e5" stroke="#ffffff" strokeWidth="0.8" />
          ))}

          {/* Start squares with star indicators */}
          {/* Red Start (Col 1, Row 6) */}
          <rect x={20} y={120} width="20" height="20" fill="#e53935" stroke="#fff" strokeWidth="0.8" />
          <text x={30} y={135} fontSize="11" textAnchor="middle" fill="#fff">★</text>
          {/* Green Start (Col 8, Row 1) */}
          <rect x={160} y={20} width="20" height="20" fill="#43a047" stroke="#fff" strokeWidth="0.8" />
          <text x={170} y={35} fontSize="11" textAnchor="middle" fill="#fff">★</text>
          {/* Yellow Start (Col 13, Row 8) */}
          <rect x={260} y={160} width="20" height="20" fill="#fbc02d" stroke="#fff" strokeWidth="0.8" />
          <text x={270} y={175} fontSize="11" textAnchor="middle" fill="#fff">★</text>
          {/* Blue Start (Col 6, Row 13) */}
          <rect x={120} y={260} width="20" height="20" fill="#1e88e5" stroke="#fff" strokeWidth="0.8" />
          <text x={130} y={275} fontSize="11" textAnchor="middle" fill="#fff">★</text>

          {/* Grid lines on track */}
          <g stroke="#ddd" strokeWidth="0.5" fill="none">
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
            { cx: 40, cy: 40, color: "#e53935" }, { cx: 80, cy: 40, color: "#e53935" },
            { cx: 40, cy: 80, color: "#e53935" }, { cx: 80, cy: 80, color: "#e53935" },
            { cx: 220, cy: 40, color: "#43a047" }, { cx: 260, cy: 40, color: "#43a047" },
            { cx: 220, cy: 80, color: "#43a047" }, { cx: 260, cy: 80, color: "#43a047" },
            { cx: 220, cy: 220, color: "#fbc02d" }, { cx: 260, cy: 220, color: "#fbc02d" },
            { cx: 220, cy: 260, color: "#fbc02d" }, { cx: 260, cy: 260, color: "#fbc02d" },
            { cx: 40, cy: 220, color: "#1e88e5" }, { cx: 80, cy: 220, color: "#1e88e5" },
            { cx: 40, cy: 260, color: "#1e88e5" }, { cx: 80, cy: 260, color: "#1e88e5" },
          ].map((slot, sIdx) => (
            <circle key={`slot-${sIdx}`} cx={slot.cx} cy={slot.cy} r="12" fill={slot.color} opacity="0.25" stroke={slot.color} strokeWidth="1.5" />
          ))}

          {/* Render Active Pawns on Board */}
          {players.map((player) => {
            const camp = COLOR_CONFIG[player.color] || COLOR_CONFIG[0];
            const isMe = player.color === myColorIndex;

            return (player.pawns || []).map((pawn) => {
              const isSelectable = isMe && isMyTurn && canMove && validMoves.includes(pawn.id);

              let cx = 0;
              let cy = 0;

              if (pawn.state === "base") {
                // Yard positions
                const yardOffsets = [
                  [40, 40], [80, 40],
                  [40, 80], [80, 80]
                ];
                const baseOffsets = [
                  [0, 0], [180, 0], [180, 180], [0, 180]
                ][player.color] || [0, 0];
                const off = yardOffsets[pawn.id] || yardOffsets[0];
                cx = baseOffsets[0] + off[0];
                cy = baseOffsets[1] + off[1];
              } else if (pawn.state === "home") {
                // Inside central triangle
                const homeDeltas = [
                  [135, 150], [150, 135], [165, 150], [150, 165]
                ][player.color] || [150, 150];
                cx = homeDeltas[0];
                cy = homeDeltas[1];
              } else {
                // Approximate coordinate mapping on track & home path
                cx = 150;
                cy = 150;
              }

              if (pawn.state !== "base" && pawn.state !== "home") {
                return null; // Drawn in summary / controls for exact responsiveness
              }

              return (
                <g
                  key={`pawn-${player.color}-${pawn.id}`}
                  onClick={() => {
                    if (isSelectable) onMovePawn(pawn.id);
                  }}
                  style={{ cursor: isSelectable ? "pointer" : "default" }}
                >
                  {/* Pawn shadow */}
                  <ellipse cx={cx} cy={cy + 4} rx="9" ry="5" fill="rgba(0,0,0,0.35)" />
                  {/* Pawn pulse circle if selectable */}
                  {isSelectable && (
                    <circle cx={cx} cy={cy} r="15" fill="none" stroke="#00e676" strokeWidth="2.5">
                      <animate attributeName="r" values="12;16;12" dur="1.2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="1;0.4;1" dur="1.2s" repeatCount="indefinite" />
                    </circle>
                  )}
                  {/* Pawn body */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r="10"
                    fill={camp.primary}
                    stroke="#ffffff"
                    strokeWidth="1.8"
                    filter="drop-shadow(0px 2px 2px rgba(0,0,0,0.4))"
                  />
                  {/* Pawn pip/number */}
                  <text
                    x={cx}
                    y={cy + 3.5}
                    fontSize="9"
                    fontWeight="bold"
                    fill="#ffffff"
                    textAnchor="middle"
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
          gap: "16px",
          background: "rgba(10, 20, 35, 0.85)",
          padding: "10px 18px",
          borderRadius: "16px",
          border: "1.5px solid rgba(255, 215, 0, 0.3)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}
      >
        {renderDice()}

        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#ffd54f" }}>
            {lastRoll === 6 ? "🎲 Six obtenu ! (Rejouez)" : lastRoll > 0 ? `Dé : ${lastRoll}` : "Prêt à lancer"}
          </div>

          {isMyTurn && canRoll && (
            <button
              type="button"
              className="button button-gold"
              onClick={onRollDice}
              style={{
                fontWeight: 800,
                padding: "8px 18px",
                fontSize: "0.95rem",
                boxShadow: "0 0 14px rgba(255, 215, 0, 0.45)",
              }}
            >
              🎲 Lancer le Dé
            </button>
          )}

          {isMyTurn && canMove && validMoves.length > 0 && (
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "#a5d6a7" }}>Choisissez :</span>
              {validMoves.map((pId) => (
                <button
                  key={`mv-btn-${pId}`}
                  type="button"
                  className="button button-small"
                  onClick={() => onMovePawn(pId)}
                  style={{
                    background: "#00e676",
                    color: "#052e16",
                    fontWeight: 800,
                    padding: "4px 10px",
                  }}
                >
                  Pion #{pId + 1}
                </button>
              ))}
            </div>
          )}

          {!isMyTurn && (
            <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
              Tour du camp {COLOR_CONFIG[currentTurnIndex]?.name || `Joueur ${currentTurnIndex + 1}`}…
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
