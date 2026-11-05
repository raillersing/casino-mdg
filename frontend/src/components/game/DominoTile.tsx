import React from "react";

export interface DominoTileProps {
  left: number;
  right: number;
  orientation?: "vertical" | "horizontal" | "cross";
  size?: "small" | "medium" | "large";
  isPlayable?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

function renderPips(value: number, size: "small" | "medium" | "large") {
  const dotSize = size === "small" ? 4 : size === "medium" ? 6 : 8;

  const hasTopLeft = [2, 3, 4, 5, 6].includes(value);
  const hasTopRight = [4, 5, 6].includes(value);
  const hasMidLeft = value === 6;
  const hasCenter = [1, 3, 5].includes(value);
  const hasMidRight = value === 6;
  const hasBotLeft = [4, 5, 6].includes(value);
  const hasBotRight = [2, 3, 4, 5, 6].includes(value);

  const dots = [
    { row: 0, col: 0, show: hasTopLeft },
    { row: 0, col: 1, show: false },
    { row: 0, col: 2, show: hasTopRight },
    { row: 1, col: 0, show: hasMidLeft },
    { row: 1, col: 1, show: hasCenter },
    { row: 1, col: 2, show: hasMidRight },
    { row: 2, col: 0, show: hasBotLeft },
    { row: 2, col: 1, show: false },
    { row: 2, col: 2, show: hasBotRight },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gridTemplateRows: "repeat(3, 1fr)",
        width: "100%",
        height: "100%",
        padding: size === "small" ? "2px" : "4px",
        boxSizing: "border-box",
        placeItems: "center",
      }}
    >
      {dots.map((d, idx) => (
        <div
          key={idx}
          style={{
            width: `${dotSize}px`,
            height: `${dotSize}px`,
            borderRadius: "50%",
            background: d.show
              ? "radial-gradient(circle at 35% 35%, #222, #000)"
              : "transparent",
            boxShadow: d.show
              ? "inset 0 1px 1px rgba(0,0,0,0.8), 0 0.5px 0.5px rgba(255,255,255,0.4)"
              : "none",
          }}
        />
      ))}
    </div>
  );
}

export const DominoTile: React.FC<DominoTileProps> = ({
  left,
  right,
  orientation = "vertical",
  size = "medium",
  isPlayable = false,
  disabled = false,
  hidden = false,
  onClick,
  className = "",
  style = {},
}) => {
  // Dimensions based on size and orientation
  const isHoriz = orientation === "horizontal" || orientation === "cross";
  const baseW = size === "small" ? 22 : size === "medium" ? 34 : 46;
  const baseH = size === "small" ? 44 : size === "medium" ? 68 : 92;

  const width = isHoriz ? baseH : baseW;
  const height = isHoriz ? baseW : baseH;

  const boneGradient =
    "linear-gradient(135deg, #ffffff 0%, #f4efe6 45%, #e8decb 100%)";
  const hiddenBack = "linear-gradient(135deg, #2b1d0c 0%, #170f06 100%)";

  return (
    <div
      className={`domino-tile-3d ${isPlayable ? "domino-playable" : ""} ${disabled ? "domino-disabled" : ""} ${className}`}
      onClick={!disabled && onClick ? onClick : undefined}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        borderRadius: size === "small" ? "4px" : "6px",
        background: hidden ? hiddenBack : boneGradient,
        border: hidden ? "1.5px solid #5a3e1b" : "1.5px solid #c9bea9",
        boxShadow: isPlayable
          ? "0 0 12px rgba(16, 185, 129, 0.65), 0 4px 8px rgba(0,0,0,0.45)"
          : "0 3px 6px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.9)",
        cursor: isPlayable && onClick ? "pointer" : "default",
        position: "relative",
        display: "flex",
        flexDirection: isHoriz ? "row" : "column",
        userSelect: "none",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
        transform: isPlayable ? "translateY(-4px)" : "translateY(0)",
        flexShrink: 0,
        ...style,
      }}
    >
      {hidden ? (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: 0.25,
            fontSize: size === "small" ? "0.6rem" : "0.9rem",
            color: "#e8decb",
          }}
        >
          🁢
        </div>
      ) : (
        <>
          {/* Half 1 */}
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {renderPips(left, size)}
          </div>

          {/* Center divider & brass pivot spinner */}
          <div
            style={{
              position: "relative",
              width: isHoriz ? "1.5px" : "100%",
              height: isHoriz ? "100%" : "1.5px",
              background: "#b8ab94",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* Brass pivot pin */}
            <div
              style={{
                position: "absolute",
                width: size === "small" ? "3px" : "5px",
                height: size === "small" ? "3px" : "5px",
                borderRadius: "50%",
                background:
                  "radial-gradient(circle at 35% 35%, #ffd700, #b8860b)",
                boxShadow: "0 0.5px 1px rgba(0,0,0,0.6)",
              }}
            />
          </div>

          {/* Half 2 */}
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {renderPips(right, size)}
          </div>
        </>
      )}
    </div>
  );
};
