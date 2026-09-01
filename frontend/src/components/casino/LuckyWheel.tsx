import { useState, useRef } from "react";
import { Sparkles, Trophy, RefreshCw, CheckCircle2 } from "lucide-react";
import { casinoAudio } from "@utils/casinoAudio";
import { type InstantPlay } from "@services/testGames";

interface LuckyWheelProps {
  onSpin: () => Promise<InstantPlay | null>;
  disabled?: boolean;
  onWin: (play: InstantPlay) => void;
}

const SEGMENTS = [
  { label: "Pause (0 SIM)", prize: 0, color: "#2d3748", text: "#a0aec0", icon: "⏸️" },
  { label: "+50 SIM", prize: 50, color: "#3182ce", text: "#ffffff", icon: "💎" },
  { label: "+100 SIM", prize: 100, color: "#d69e2e", text: "#ffffff", icon: "🪙" },
  { label: "+50 SIM", prize: 50, color: "#319795", text: "#ffffff", icon: "💎" },
  { label: "Pause (0 SIM)", prize: 0, color: "#1a202c", text: "#718096", icon: "⏸️" },
  { label: "+250 SIM", prize: 250, color: "#805ad5", text: "#ffffff", icon: "👑" },
  { label: "+50 SIM", prize: 50, color: "#38a169", text: "#ffffff", icon: "💎" },
  { label: "JACKPOT 500", prize: 500, color: "#e53e3e", text: "#ffffff", icon: "🏆" },
];

export function LuckyWheel({ onSpin, disabled = false, onWin }: LuckyWheelProps) {
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [tickerActive, setTickerActive] = useState(false);
  const [wonSegment, setWonSegment] = useState<string | null>(null);

  const wheelRef = useRef<HTMLDivElement>(null);
  const currentRotRef = useRef(0);

  const handleSpin = async () => {
    if (spinning || disabled) return;

    setSpinning(true);
    setWonSegment(null);

    // Initial continuous spin speed
    let extraSpins = 5 + Math.floor(Math.random() * 3);
    const startRot = currentRotRef.current;

    try {
      const result = await onSpin();
      if (!result) {
        setSpinning(false);
        return;
      }

      // Find matching target segment index
      let targetIndex = SEGMENTS.findIndex(
        (s) => s.prize === result.prize && (result.prize === 0 ? s.prize === 0 : true),
      );
      if (targetIndex === -1) targetIndex = 0;

      // Segment angle is 360 / 8 = 45 degrees
      const segmentAngle = 360 / SEGMENTS.length;
      // Invert pointer at top (270 deg / -90 deg)
      const targetAngle = 360 - (targetIndex * segmentAngle + segmentAngle / 2);
      const totalRotation = startRot + extraSpins * 360 + (targetAngle - (startRot % 360));

      currentRotRef.current = totalRotation;
      setRotation(totalRotation);

      // Play tick sounds synced with speed
      const tickInterval = setInterval(() => {
        setTickerActive((v) => !v);
        casinoAudio.playWheelTick();
      }, 120);

      // Stop sounds towards end
      setTimeout(() => {
        clearInterval(tickInterval);
      }, 3500);

      setTimeout(() => {
        setSpinning(false);
        setWonSegment(SEGMENTS[targetIndex].label);
        if (result.prize > 0) {
          onWin(result);
        }
      }, 4200);
    } catch {
      setSpinning(false);
    }
  };

  return (
    <div className="lucky-wheel-wrapper">
      <div className="wheel-cabinet">
        <div className="wheel-header">
          <span className="eyebrow gold">
            <Sparkles size={13} /> BONUS QUOTIDIEN
          </span>
          <h2>ROUE DE LA FORTUNE MDG</h2>
          <p>Tournez la roue pour débloquer jusqu'à 500 crédits SIM !</p>
        </div>

        <div className="wheel-stage">
          {/* Top Fixed Needle / Ticker Pointer */}
          <div className={`wheel-ticker-needle ${tickerActive ? "tick-bump" : ""}`}>
            ▼
          </div>

          {/* Rotating Wheel Disc */}
          <div
            ref={wheelRef}
            className="wheel-disc"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: spinning ? "transform 4.2s cubic-bezier(0.15, 0.9, 0.25, 1)" : "none",
            }}
          >
            {/* 8 Slices using SVG pie generator */}
            <svg viewBox="0 0 300 300" className="wheel-svg">
              <defs>
                <filter id="gold-border" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#d4af37" />
                </filter>
              </defs>
              {SEGMENTS.map((seg, i) => {
                const angle = 360 / SEGMENTS.length;
                const startAngle = (i * angle - 90) * (Math.PI / 180);
                const endAngle = ((i + 1) * angle - 90) * (Math.PI / 180);
                const x1 = 150 + 145 * Math.cos(startAngle);
                const y1 = 150 + 145 * Math.sin(startAngle);
                const x2 = 150 + 145 * Math.cos(endAngle);
                const y2 = 150 + 145 * Math.sin(endAngle);
                const path = `M150,150 L${x1},${y1} A145,145 0 0,1 ${x2},${y2} Z`;

                const midAngle = (i * angle + angle / 2 - 90) * (Math.PI / 180);
                const textX = 150 + 95 * Math.cos(midAngle);
                const textY = 150 + 95 * Math.sin(midAngle);
                const rotationDeg = i * angle + angle / 2;

                return (
                  <g key={i}>
                    <path
                      d={path}
                      fill={seg.color}
                      stroke="#d4af37"
                      strokeWidth="2"
                    />
                    <text
                      x={textX}
                      y={textY}
                      fill={seg.text}
                      fontSize="11"
                      fontWeight="bold"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      transform={`rotate(${rotationDeg + 90}, ${textX}, ${textY})`}
                    >
                      {seg.icon} {seg.label.replace(" (0 SIM)", "")}
                    </text>
                  </g>
                );
              })}
              {/* Outer Golden Rim & Pins */}
              <circle cx="150" cy="150" r="147" fill="none" stroke="#d4af37" strokeWidth="6" />
              {SEGMENTS.map((_, i) => {
                const angle = (i * (360 / SEGMENTS.length) - 90) * (Math.PI / 180);
                const pinX = 150 + 145 * Math.cos(angle);
                const pinY = 150 + 145 * Math.sin(angle);
                return <circle key={`pin-${i}`} cx={pinX} cy={pinY} r="3.5" fill="#fff" stroke="#997a15" strokeWidth="1.5" />;
              })}
            </svg>

            {/* Center Golden Knob with Star */}
            <div className="wheel-center-hub">
              <Trophy size={20} className="wheel-hub-icon" />
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="wheel-actions">
          {wonSegment && (
            <div className="wheel-win-alert">
              <CheckCircle2 size={18} className="gold-icon" />
              <span>Résultat : <strong>{wonSegment}</strong></span>
            </div>
          )}
          <button
            type="button"
            className="button button-gold wheel-spin-btn"
            onClick={handleSpin}
            disabled={spinning || disabled}
          >
            {spinning ? (
              <RefreshCw className="spin" size={18} />
            ) : (
              <Sparkles size={18} />
            )}
            <span>{spinning ? "ROTATION EN COURS..." : "TOURNER LA ROUE (GRATUIT)"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
