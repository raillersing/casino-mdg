import { useState, useRef, useEffect } from "react";
import { Sparkles, Trophy, RefreshCw, CheckCircle2 } from "lucide-react";
import { casinoAudio } from "@utils/casinoAudio";
import { type InstantPlay } from "@services/testGames";

interface LuckyWheelProps {
  onSpin: () => Promise<InstantPlay | null>;
  disabled?: boolean;
  onWin: (play: InstantPlay) => void;
}

export const WHEEL_SEGMENTS = [
  { label: "Pause (0 SIM)", prize: 0, color: "#1e293b", text: "#94a3b8", icon: "⏸️" },
  { label: "+50 SIM", prize: 50, color: "#2563eb", text: "#ffffff", icon: "💎" },
  { label: "+100 SIM", prize: 100, color: "#d97706", text: "#ffffff", icon: "🪙" },
  { label: "+50 SIM", prize: 50, color: "#0d9488", text: "#ffffff", icon: "💎" },
  { label: "Pause (0 SIM)", prize: 0, color: "#0f172a", text: "#64748b", icon: "⏸️" },
  { label: "+250 SIM", prize: 250, color: "#7c3aed", text: "#ffffff", icon: "👑" },
  { label: "+50 SIM", prize: 50, color: "#16a34a", text: "#ffffff", icon: "💎" },
  { label: "JACKPOT 500", prize: 500, color: "#dc2626", text: "#ffffff", icon: "🏆" },
];

export function LuckyWheel({ onSpin, disabled = false, onWin }: LuckyWheelProps) {
  const [spinning, setSpinning] = useState(false);
  const [currentAngle, setCurrentAngle] = useState(0);
  const [needleFlick, setNeedleFlick] = useState(false);
  const [wonSegment, setWonSegment] = useState<string | null>(null);

  const angleRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);

  const handleSpin = async () => {
    if (spinning || disabled) return;

    setSpinning(true);
    setWonSegment(null);

    const startAngle = angleRef.current;

    try {
      const result = await onSpin();
      if (!result) {
        setSpinning(false);
        return;
      }

      // Find matching target segment index
      let targetIndex = WHEEL_SEGMENTS.findIndex(
        (s) => s.prize === result.prize && (result.prize === 0 ? s.prize === 0 : true),
      );
      if (targetIndex === -1) targetIndex = 0;

      // Segment angle is 360 / 8 = 45 degrees
      const segmentAngle = 360 / WHEEL_SEGMENTS.length;
      // Target position at 12 o'clock pointer
      const targetAngle = 360 - (targetIndex * segmentAngle + segmentAngle / 2);
      const extraRotations = (5 + Math.floor(Math.random() * 2)) * 360;
      const delta = ((targetAngle - (startAngle % 360)) % 360 + 360) % 360;
      const endAngle = startAngle + extraRotations + delta;

      const duration = 4400; // ms
      const startTime = performance.now();
      let lastPegCrossed = Math.floor(startAngle / segmentAngle);

      const animate = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);

        // Quintic ease-out for ultra realistic friction decay
        const ease = 1 - Math.pow(1 - progress, 4);
        const animatedAngle = startAngle + (endAngle - startAngle) * ease;

        angleRef.current = animatedAngle;
        setCurrentAngle(animatedAngle);

        // Check if passed a peg (every 45 degrees)
        const currentPeg = Math.floor(animatedAngle / segmentAngle);
        if (currentPeg > lastPegCrossed) {
          lastPegCrossed = currentPeg;
          setNeedleFlick(true);
          casinoAudio.playWheelTick();
          setTimeout(() => setNeedleFlick(false), 35);
        }

        if (progress < 1) {
          animFrameRef.current = requestAnimationFrame(animate);
        } else {
          setSpinning(false);
          setWonSegment(WHEEL_SEGMENTS[targetIndex].label);
          if (result.prize > 0) {
            onWin(result);
          }
        }
      };

      animFrameRef.current = requestAnimationFrame(animate);
    } catch {
      setSpinning(false);
    }
  };

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

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
          {/* Top Fixed Needle Pointer */}
          <div className={`wheel-ticker-needle ${needleFlick ? "tick-bump" : ""}`}>
            ▼
          </div>

          {/* Rotating Wheel Disc */}
          <div
            className="wheel-disc"
            style={{
              transform: `rotate(${currentAngle}deg)`,
            }}
          >
            <svg viewBox="0 0 300 300" className="wheel-svg">
              <defs>
                <filter id="gold-shadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#d4af37" />
                </filter>
              </defs>
              {WHEEL_SEGMENTS.map((seg, i) => {
                const angle = 360 / WHEEL_SEGMENTS.length;
                const startA = (i * angle - 90) * (Math.PI / 180);
                const endA = ((i + 1) * angle - 90) * (Math.PI / 180);
                const x1 = 150 + 145 * Math.cos(startA);
                const y1 = 150 + 145 * Math.sin(startA);
                const x2 = 150 + 145 * Math.cos(endA);
                const y2 = 150 + 145 * Math.sin(endA);
                const path = `M150,150 L${x1},${y1} A145,145 0 0,1 ${x2},${y2} Z`;

                const midA = (i * angle + angle / 2 - 90) * (Math.PI / 180);
                const textX = 150 + 95 * Math.cos(midA);
                const textY = 150 + 95 * Math.sin(midA);
                const rotationDeg = i * angle + angle / 2;

                return (
                  <g key={i}>
                    <path
                      d={path}
                      fill={seg.color}
                      stroke="#d4af37"
                      strokeWidth="2.5"
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
              {WHEEL_SEGMENTS.map((_, i) => {
                const angle = (i * (360 / WHEEL_SEGMENTS.length) - 90) * (Math.PI / 180);
                const pinX = 150 + 145 * Math.cos(angle);
                const pinY = 150 + 145 * Math.sin(angle);
                return (
                  <circle
                    key={`pin-${i}`}
                    cx={pinX}
                    cy={pinY}
                    r="3.5"
                    fill="#fff"
                    stroke="#997a15"
                    strokeWidth="1.5"
                  />
                );
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
