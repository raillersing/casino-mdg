import { useState } from "react";
import {
  Activity,
  RefreshCw,
  Shield,
  Signal,
  SignalLow,
  SignalMedium,
  WifiOff,
  X,
} from "lucide-react";
import { useNetworkQuality } from "@hooks/useNetworkQuality";

interface NetworkQualityBadgeProps {
  compact?: boolean;
  className?: string;
  overrideLatency?: number | null;
}

export function NetworkQualityBadge({
  compact = false,
  className = "",
  overrideLatency,
}: NetworkQualityBadgeProps) {
  const {
    isOnline,
    latencyMs,
    effectiveType,
    quality,
    jitter,
    downlink,
    isTesting,
    refresh,
  } = useNetworkQuality();
  const [showModal, setShowModal] = useState(false);

  // If a live table WebSocket provides overrideLatency, use it
  const activeLatency =
    overrideLatency !== undefined && overrideLatency !== null
      ? overrideLatency
      : latencyMs;

  let activeQuality = quality;
  if (!isOnline) {
    activeQuality = "offline";
  } else if (activeLatency !== null) {
    if (activeLatency >= 350) activeQuality = "poor";
    else if (activeLatency >= 150) activeQuality = "fair";
    else activeQuality = "good";
  }

  const qualityColor =
    activeQuality === "good"
      ? "#4ade80"
      : activeQuality === "fair"
        ? "#d3b06b"
        : "#ef5350";

  const IconComponent =
    activeQuality === "good"
      ? Signal
      : activeQuality === "fair"
        ? SignalMedium
        : activeQuality === "poor"
          ? SignalLow
          : WifiOff;

  const qualityLabel =
    activeQuality === "good"
      ? "Réseau optimal"
      : activeQuality === "fair"
        ? "3G stable"
        : activeQuality === "poor"
          ? "Réseau instable"
          : "Hors ligne";

  return (
    <>
      <div
        className={`network-badge-wrap ${className}`}
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          className="network-badge-button"
          onClick={() => setShowModal(true)}
          title={`Qualité du réseau : ${qualityLabel} (${activeLatency ?? "—"} ms) · Cliquez pour voir le diagnostic`}
          aria-label={`Qualité du réseau : ${qualityLabel} (${activeLatency ?? "—"} ms)`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            background: "rgba(17, 22, 30, 0.75)",
            border: `1px solid ${activeQuality === "offline" ? "rgba(239, 83, 80, 0.4)" : "rgba(211, 176, 107, 0.2)"}`,
            borderRadius: "16px",
            padding: compact ? "3px 7px" : "4px 9px",
            color: qualityColor,
            fontSize: "11px",
            fontFamily: "var(--mono)",
            cursor: "pointer",
            whiteSpace: "nowrap",
            transition: "all 0.15s ease",
          }}
        >
          <IconComponent
            size={12}
            strokeWidth={2.4}
            style={{ color: qualityColor }}
          />
          {activeLatency !== null ? (
            <span>{activeLatency} ms</span>
          ) : isOnline ? (
            <span>{effectiveType.toUpperCase()}</span>
          ) : (
            <span>OFF</span>
          )}
        </button>
      </div>

      {/* Modal / Volet Diagnostic Réseau Haute-Fidélité */}
      {showModal && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setShowModal(false)}
        >
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="net-diag-title"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "420px", padding: "20px" }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "14px",
                paddingBottom: "10px",
                borderBottom: "1px solid var(--line)",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <Activity size={18} style={{ color: "var(--gold)" }} />
                <h3
                  id="net-diag-title"
                  style={{ margin: 0, fontSize: "15px", color: "#fff" }}
                >
                  Diagnostic Réseau & Télémétrie
                </h3>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowModal(false)}
                aria-label="Fermer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Pastille état global */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                background: "rgba(10, 13, 18, 0.7)",
                borderRadius: "8px",
                border: `1px solid ${activeQuality === "offline" ? "rgba(239, 83, 80, 0.3)" : "rgba(211, 176, 107, 0.25)"}`,
                marginBottom: "14px",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <span
                  style={{
                    width: "9px",
                    height: "9px",
                    borderRadius: "50%",
                    background: qualityColor,
                    boxShadow: `0 0 8px ${qualityColor}`,
                  }}
                />
                <div>
                  <strong style={{ fontSize: "13px", color: qualityColor }}>
                    {qualityLabel}
                  </strong>
                  <div style={{ fontSize: "11px", color: "var(--muted)" }}>
                    Serveur Edge Antananarivo · WSS
                  </div>
                </div>
              </div>
              <span
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: qualityColor,
                  fontFamily: "var(--mono)",
                }}
              >
                {activeLatency !== null ? `${activeLatency} ms` : "—"}
              </span>
            </div>

            {/* Grille des indicateurs détaillés */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "8px",
                marginBottom: "14px",
              }}
            >
              <div
                style={{
                  background: "rgba(17, 22, 30, 0.6)",
                  border: "1px solid var(--line)",
                  borderRadius: "6px",
                  padding: "8px 10px",
                }}
              >
                <span
                  style={{
                    fontSize: "10.5px",
                    color: "var(--muted)",
                    display: "block",
                  }}
                >
                  Gigue (Jitter)
                </span>
                <strong
                  style={{
                    fontSize: "13px",
                    color: "#fff",
                    fontFamily: "var(--mono)",
                  }}
                >
                  ±{jitter} ms
                </strong>
              </div>

              <div
                style={{
                  background: "rgba(17, 22, 30, 0.6)",
                  border: "1px solid var(--line)",
                  borderRadius: "6px",
                  padding: "8px 10px",
                }}
              >
                <span
                  style={{
                    fontSize: "10.5px",
                    color: "var(--muted)",
                    display: "block",
                  }}
                >
                  Connexion
                </span>
                <strong style={{ fontSize: "13px", color: "var(--gold)" }}>
                  {effectiveType.toUpperCase()}{" "}
                  {downlink ? `(${downlink} Mb/s)` : ""}
                </strong>
              </div>

              <div
                style={{
                  background: "rgba(17, 22, 30, 0.6)",
                  border: "1px solid var(--line)",
                  borderRadius: "6px",
                  padding: "8px 10px",
                }}
              >
                <span
                  style={{
                    fontSize: "10.5px",
                    color: "var(--muted)",
                    display: "block",
                  }}
                >
                  Protocole
                </span>
                <strong style={{ fontSize: "13px", color: "#4ade80" }}>
                  WSS TLS 1.3
                </strong>
              </div>

              <div
                style={{
                  background: "rgba(17, 22, 30, 0.6)",
                  border: "1px solid var(--line)",
                  borderRadius: "6px",
                  padding: "8px 10px",
                }}
              >
                <span
                  style={{
                    fontSize: "10.5px",
                    color: "var(--muted)",
                    display: "block",
                  }}
                >
                  Reconnexion
                </span>
                <strong style={{ fontSize: "13px", color: "#fff" }}>
                  Auto (30s grâce)
                </strong>
              </div>
            </div>

            {/* Note d'intégrité joueur spécial Madagascar */}
            <div
              style={{
                display: "flex",
                gap: "8px",
                alignItems: "flex-start",
                padding: "8px 10px",
                background: "rgba(211, 176, 107, 0.08)",
                border: "1px solid rgba(211, 176, 107, 0.2)",
                borderRadius: "6px",
                fontSize: "11px",
                color: "var(--soft)",
                lineHeight: 1.45,
                marginBottom: "16px",
              }}
            >
              <Shield
                size={16}
                style={{
                  color: "var(--gold)",
                  flexShrink: 0,
                  marginTop: "2px",
                }}
              />
              <span>
                <strong>Protection Déconnexion :</strong> En cas de
                micro-coupure 3G/4G, votre siège et vos jetons sont maintenus
                réservés pendant 30 secondes pour vous permettre de reprendre
                votre coup.
              </span>
            </div>

            {/* Bouton de rafraîchissement immédiat */}
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                className="button button-gold"
                onClick={() => void refresh()}
                disabled={isTesting}
                style={{ flex: 1, justifyContent: "center", fontSize: "12px" }}
              >
                <RefreshCw size={14} className={isTesting ? "spin" : ""} />
                {isTesting
                  ? "Mesure du ping..."
                  : "Tester la connexion maintenant"}
              </button>
              <button
                type="button"
                className="button button-secondary button-small"
                onClick={() => setShowModal(false)}
                style={{ fontSize: "12px" }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
