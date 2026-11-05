import { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  Trophy,
  RefreshCw,
  CheckCircle2,
  Zap,
  Volume2,
  VolumeX,
} from "lucide-react";
import { casinoAudio } from "@utils/casinoAudio";
import { type InstantPlay } from "@services/testGames";

interface LuckyWheelProps {
  onSpin: () => Promise<InstantPlay | null>;
  disabled?: boolean;
  onWin: (play: InstantPlay) => void;
}

const WHEEL_SEGMENTS = [
  {
    label: "Pause (0 SIM)",
    prize: 0,
    color: "#1e293b",
    text: "#94a3b8",
    icon: "⏸️",
  },
  {
    label: "+50 SIM",
    prize: 50,
    color: "#2563eb",
    text: "#ffffff",
    icon: "💎",
  },
  {
    label: "+100 SIM",
    prize: 100,
    color: "#d97706",
    text: "#ffffff",
    icon: "🪙",
  },
  {
    label: "+50 SIM",
    prize: 50,
    color: "#0d9488",
    text: "#ffffff",
    icon: "💎",
  },
  {
    label: "Pause (0 SIM)",
    prize: 0,
    color: "#0f172a",
    text: "#64748b",
    icon: "⏸️",
  },
  {
    label: "+250 SIM",
    prize: 250,
    color: "#7c3aed",
    text: "#ffffff",
    icon: "👑",
  },
  {
    label: "+50 SIM",
    prize: 50,
    color: "#16a34a",
    text: "#ffffff",
    icon: "💎",
  },
  {
    label: "JACKPOT 500",
    prize: 500,
    color: "#dc2626",
    text: "#ffffff",
    icon: "🏆",
  },
];

export function LuckyWheel({
  onSpin,
  disabled = false,
  onWin,
}: LuckyWheelProps) {
  const [spinning, setSpinning] = useState(false);
  const [settling, setSettling] = useState(false);
  const [turboMode, setTurboMode] = useState(false);
  const [soundMuted, setSoundMuted] = useState(false);
  const [currentAngle, setCurrentAngle] = useState(0);
  const [needleFlick, setNeedleFlick] = useState(false);
  const [wonSegment, setWonSegment] = useState<string | null>(null);
  const [isWin, setIsWin] = useState(false);
  const [activeLedIndex, setActiveLedIndex] = useState(0);

  const angleRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);
  const ledIntervalRef = useRef<number | null>(null);
  const needleTimeoutRef = useRef<number | null>(null);
  const pendingWinRef = useRef<number | null>(null);

  const toggleSound = () => {
    const next = !soundMuted;
    setSoundMuted(next);
    localStorage.setItem("mdg-poker-sound", next ? "off" : "on");
  };

  useEffect(() => {
    const saved = localStorage.getItem("mdg-poker-sound");
    if (saved === "off") setSoundMuted(true);
  }, []);

  const handleSpin = async () => {
    if (spinning || disabled) return;

    setSpinning(true);
    setSettling(false);
    setWonSegment(null);
    setIsWin(false);
    if (pendingWinRef.current) {
      clearTimeout(pendingWinRef.current);
      pendingWinRef.current = null;
    }

    const startAngle = angleRef.current;

    // Chaser LED animation — speed depends on turbo
    if (ledIntervalRef.current) clearInterval(ledIntervalRef.current);
    ledIntervalRef.current = window.setInterval(
      () => {
        setActiveLedIndex((prev) => (prev + 1) % 24);
      },
      turboMode ? 35 : 60,
    );

    // Keep reference for animation even if daily limit (null)
    let result: import("@services/testGames").InstantPlay | null = null;
    let isDailyLimit = false;
    try {
      result = await onSpin();
      if (!result) {
        isDailyLimit = true;
        // Will animate to Pause segment and show limit message instead of abrupt stop
      }
    } catch {
      if (ledIntervalRef.current) clearInterval(ledIntervalRef.current);
      setSpinning(false);
      setSettling(false);
      return;
    }

    // If daily limit, force target to a Pause segment (0 or 4) so wheel still spins fully
    let effectiveTargetIndex: number | null = null;
    if (isDailyLimit) {
      const pauseIndices = WHEEL_SEGMENTS.map((s, i) =>
        s.prize === 0 ? i : -1,
      ).filter((i) => i !== -1);
      effectiveTargetIndex =
        pauseIndices[Math.floor(Math.random() * pauseIndices.length)] ?? 0;
    }

    // Determine target: random among matching prize segments, or Pause if daily limit
    let finalTargetIndex: number;
    if (isDailyLimit) {
      finalTargetIndex = effectiveTargetIndex ?? 0;
    } else if (result) {
      const eligibleIndices = WHEEL_SEGMENTS.map((s, i) =>
        s.prize === result.prize ? i : -1,
      ).filter((i) => i !== -1);
      if (eligibleIndices.length === 0) finalTargetIndex = 0;
      else if (eligibleIndices.length === 1)
        finalTargetIndex = eligibleIndices[0];
      else
        finalTargetIndex =
          eligibleIndices[Math.floor(Math.random() * eligibleIndices.length)];
    } else {
      // No result and not daily limit (should not happen) — fallback to Pause
      finalTargetIndex = 0;
    }

    const segmentAngle = 360 / WHEEL_SEGMENTS.length;
    // SVG segments are drawn with -90deg offset: segment i spans [i*angle-90, (i+1)*angle-90).
    // Its center is i*angle + angle/2 -90. Needle at top = 270deg (-90deg).
    // Rotation needed: needleAngle - segmentCenter = 270 - (i*angle+22.5-90) = 337.5 - i*angle
    const targetCenter = 337.5 - finalTargetIndex * segmentAngle;
    const normalizedTarget = ((targetCenter % 360) + 360) % 360;

    const duration = turboMode ? 2400 : 7200; // ms
    const spinsCount = turboMode ? 3 : 8;
    const extraRotations = spinsCount * 360;
    const startMod = ((startAngle % 360) + 360) % 360;
    const delta = (((normalizedTarget - startMod) % 360) + 360) % 360;
    const endAngle = startAngle + extraRotations + delta;

    const startTime = performance.now();
    let lastPegCrossed = Math.floor(startAngle / segmentAngle);
    let lastTickTime = 0;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);

      // Quintic ease-out
      const ease = 1 - Math.pow(1 - progress, 5);
      const animatedAngle = startAngle + (endAngle - startAngle) * ease;

      angleRef.current = animatedAngle;
      setCurrentAngle(animatedAngle);

      // Needle tick — throttled + RAF-based, no setTimeout leak
      const currentPeg = Math.floor(animatedAngle / segmentAngle);
      if (currentPeg > lastPegCrossed && now - lastTickTime > 30) {
        lastPegCrossed = currentPeg;
        lastTickTime = now;
        setNeedleFlick(true);
        casinoAudio.playWheelTick();
        if (needleTimeoutRef.current) clearTimeout(needleTimeoutRef.current);
        needleTimeoutRef.current = window.setTimeout(
          () => setNeedleFlick(false),
          55,
        );
      }

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        // Settling bounce phase — keep chaser alive during bounce then clear
        // Show result immediately as wheel begins to settle (no gap)
        if (isDailyLimit) {
          setWonSegment("Limite quotidienne atteinte — revenez demain !");
          setIsWin(false);
        } else {
          setWonSegment(WHEEL_SEGMENTS[finalTargetIndex].label);
          setIsWin(!!result && result.prize > 0);
        }
        setSettling(true);
        const settleTimeout = window.setTimeout(() => {
          if (ledIntervalRef.current) clearInterval(ledIntervalRef.current);
          setSettling(false);
          setSpinning(false);
          if (!isDailyLimit && result && result.prize > 0) {
            // Short delay so the bounce is perceived, then celebrate
            pendingWinRef.current = window.setTimeout(() => {
              onWin(result);
            }, 280);
          } else if (isDailyLimit) {
            // Daily limit: no modal, just inline message + soft thud
            casinoAudio.playSlotStop(0.7);
          } else {
            // Lose: subtle thud + no modal (just inline alert)
            casinoAudio.playSlotStop(0.85);
          }
        }, 420);
        pendingWinRef.current = settleTimeout as unknown as number;
      }
    };

    try {
      animFrameRef.current = requestAnimationFrame(animate);
    } catch {
      if (ledIntervalRef.current) clearInterval(ledIntervalRef.current);
      if (needleTimeoutRef.current) clearTimeout(needleTimeoutRef.current);
      setSpinning(false);
      setSettling(false);
    }
  };

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (ledIntervalRef.current) clearInterval(ledIntervalRef.current);
      if (needleTimeoutRef.current) clearTimeout(needleTimeoutRef.current);
      if (pendingWinRef.current) clearTimeout(pendingWinRef.current);
    };
  }, []);

  return (
    <div className="lucky-wheel-wrapper">
      <div className="wheel-cabinet">
        <div className="wheel-header">
          <span className="eyebrow gold">
            <Sparkles size={13} /> BONUS QUOTIDIEN CASINO
          </span>
          <h2>ROUE DE LA FORTUNE MDG</h2>
          <p>Tournez la roue pour débloquer jusqu'à 500 crédits SIM !</p>
        </div>

        <div className="wheel-stage-container">
          <div className="wheel-chaser-ring">
            {Array.from({ length: 24 }).map((_, idx) => (
              <span
                key={idx}
                className={`wheel-chaser-dot ${
                  spinning
                    ? idx === activeLedIndex ||
                      (idx + 12) % 24 === activeLedIndex
                      ? "lit"
                      : "dim"
                    : idx % 2 === 0
                      ? "lit"
                      : "dim"
                }`}
                style={{
                  transform: `rotate(${idx * 15}deg) translateY(-162px)`,
                }}
              />
            ))}
          </div>

          <div className="wheel-stage">
            <div
              className={`wheel-ticker-needle ${needleFlick ? "tick-bump" : ""}`}
            >
              ▼
            </div>

            <div
              className={`wheel-disc ${settling ? "wheel-settling" : ""} ${spinning ? "spinning" : ""}`}
              style={
                {
                  transform: `rotate(${currentAngle}deg)`,
                  ["--wheel-angle" as string]: `${currentAngle}deg`,
                } as React.CSSProperties
              }
            >
              <svg viewBox="0 0 300 300" className="wheel-svg">
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
                <circle
                  cx="150"
                  cy="150"
                  r="147"
                  fill="none"
                  stroke="#d4af37"
                  strokeWidth="6"
                />
                {WHEEL_SEGMENTS.map((_, i) => {
                  const angle =
                    (i * (360 / WHEEL_SEGMENTS.length) - 90) * (Math.PI / 180);
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

              <div className="wheel-center-hub">
                <Trophy size={22} className="wheel-hub-icon" />
              </div>
            </div>
          </div>
        </div>

        <div className="wheel-actions">
          {wonSegment && (
            <div className={`wheel-win-alert ${isWin ? "win" : "lose"}`}>
              <CheckCircle2 size={18} className="gold-icon" />
              <span>
                Résultat : <strong>{wonSegment}</strong>{" "}
                {isWin ? "🎉" : "— retentez demain !"}
              </span>
            </div>
          )}

          <div className="wheel-button-row">
            <button
              type="button"
              className={`button button-small ${turboMode ? "button-gold" : "button-outline"}`}
              onClick={() => setTurboMode((v) => !v)}
              title="Rotation express"
            >
              <Zap size={14} /> {turboMode ? "TURBO ON" : "TURBO"}
            </button>

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
              className="button button-gold wheel-spin-btn"
              onClick={handleSpin}
              disabled={spinning || settling || disabled}
            >
              {spinning || settling ? (
                <RefreshCw className="spin" size={18} />
              ) : (
                <Sparkles size={18} />
              )}
              <span>
                {spinning || settling
                  ? "ROTATION EN SUSPENSE..."
                  : "TOURNER LA ROUE (GRATUIT)"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
