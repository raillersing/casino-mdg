import { useCallback, useEffect, useState } from "react";
import {
  X,
  Flame,
  Gift,
  CheckCircle2,
  Calendar,
  Sparkles,
  Award,
  Loader2,
} from "lucide-react";
import {
  fetchDailyMissions,
  claimMissionOrStreak,
  type DailyMissionsPayload,
} from "@services/missions";
import { useGameStore } from "@stores/gameStore";
import { haptics } from "@utils/haptics";

interface DailyMissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRewardClaimed?: (amount: number) => void;
}

export function DailyMissionsModal({
  isOpen,
  onClose,
  onRewardClaimed,
}: DailyMissionsModalProps) {
  const accessToken = useGameStore((s) => s.accessToken);
  const [data, setData] = useState<DailyMissionsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [claimingKey, setClaimingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadMissions = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const payload = await fetchDailyMissions(accessToken);
      setData(payload);
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (isOpen) {
      void loadMissions();
      setMessage(null);
    }
  }, [isOpen, loadMissions]);

  const handleClaim = async (key: string, rewardAmount: number) => {
    if (!accessToken) return;
    setClaimingKey(key);
    try {
      const res = await claimMissionOrStreak(accessToken, key);
      haptics.winCelebration();
      setMessage(
        `Félicitations ! +${res.reward || rewardAmount} Ar crédités sur votre compte.`,
      );
      if (onRewardClaimed) onRewardClaimed(res.reward || rewardAmount);
      await loadMissions();
    } catch (err: unknown) {
      setMessage(
        err instanceof Error ? err.message : "Erreur lors de la réclamation.",
      );
    } finally {
      setClaimingKey(null);
    }
  };

  if (!isOpen) return null;

  const streak = data?.streak;
  const missions = data?.missions || [];

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div
        className="modal-card"
        style={{
          maxWidth: "520px",
          width: "95vw",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "linear-gradient(180deg, #131720 0%, #0c0f15 100%)",
          border: "1px solid rgba(211, 176, 107, 0.35)",
        }}
      >
        {/* Header */}
        <div className="modal-header" style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "10px",
                background: "rgba(255, 112, 67, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ff7043",
              }}
            >
              <Flame size={22} />
            </div>
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: "1.2rem",
                  fontWeight: 700,
                  color: "var(--gold)",
                }}
              >
                Missions &amp; Bonus Série
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.82rem",
                  color: "var(--muted)",
                }}
              >
                Récompenses quotidiennes et progression
              </p>
            </div>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Fermer"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        {message && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "8px",
              background: "rgba(76, 175, 80, 0.18)",
              border: "1px solid #4caf50",
              color: "#a5d6a7",
              fontSize: "0.85rem",
              fontWeight: 600,
              marginBottom: "14px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <CheckCircle2 size={16} />
            <span>{message}</span>
          </div>
        )}

        {loading && !data ? (
          <div
            style={{
              textAlign: "center",
              padding: "30px 10px",
              color: "var(--muted)",
            }}
          >
            <Loader2
              size={24}
              className="spin"
              style={{ margin: "0 auto 8px" }}
            />
            Chargement de vos quêtes...
          </div>
        ) : (
          <div>
            {/* Section Série Quotidienne (Daily Streak) */}
            <div
              style={{
                padding: "14px",
                borderRadius: "12px",
                background: "rgba(211, 176, 107, 0.08)",
                border: "1px solid rgba(211, 176, 107, 0.25)",
                marginBottom: "18px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "12px",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <Calendar size={18} style={{ color: "var(--gold)" }} />
                  <span
                    style={{
                      fontSize: "0.95rem",
                      fontWeight: 700,
                      color: "var(--gold)",
                    }}
                  >
                    Série de Connexion : Jour {streak?.current_day || 1}/7
                  </span>
                </div>
                {streak && !streak.claimed && (
                  <button
                    type="button"
                    onClick={() => handleClaim("daily_streak", streak.reward)}
                    disabled={claimingKey === "daily_streak"}
                    className="primary-button"
                    style={{
                      padding: "6px 14px",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <Gift size={14} />
                    {claimingKey === "daily_streak"
                      ? "Réclamation..."
                      : `Prendre +${streak.reward} Ar`}
                  </button>
                )}
                {streak?.claimed && (
                  <span
                    style={{
                      fontSize: "0.78rem",
                      color: "#4caf50",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <CheckCircle2 size={14} />
                    Bonus du jour réclamé
                  </span>
                )}
              </div>

              {/* Calendrier 7 Jours */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, 1fr)",
                  gap: "6px",
                  textAlign: "center",
                }}
              >
                {(
                  streak?.schedule || [100, 200, 300, 500, 750, 1000, 2500]
                ).map((amt, i) => {
                  const dayNum = i + 1;
                  const isCurrent = dayNum === (streak?.current_day || 1);
                  const isPast = dayNum < (streak?.current_day || 1);
                  return (
                    <div
                      key={dayNum}
                      style={{
                        padding: "8px 4px",
                        borderRadius: "8px",
                        background: isCurrent
                          ? "rgba(211, 176, 107, 0.25)"
                          : isPast
                            ? "rgba(76, 175, 80, 0.15)"
                            : "rgba(255, 255, 255, 0.04)",
                        border: isCurrent
                          ? "1px solid var(--gold)"
                          : isPast
                            ? "1px solid rgba(76, 175, 80, 0.3)"
                            : "1px solid rgba(255, 255, 255, 0.07)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "0.7rem",
                          color: isCurrent
                            ? "var(--gold)"
                            : isPast
                              ? "#81c784"
                              : "var(--muted)",
                          fontWeight: 600,
                        }}
                      >
                        J{dayNum}
                      </div>
                      <div
                        style={{
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          color: isCurrent ? "#fff" : "var(--soft)",
                          marginTop: "2px",
                        }}
                      >
                        {amt}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section Quêtes du Jour */}
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "12px",
                }}
              >
                <Award size={18} style={{ color: "var(--gold)" }} />
                <span style={{ fontSize: "0.95rem", fontWeight: 700 }}>
                  Quêtes Quotidiennes
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                {missions.map((m) => {
                  const percent = Math.min(
                    100,
                    Math.round((m.progress / m.goal) * 100),
                  );
                  return (
                    <div
                      key={m.key}
                      style={{
                        padding: "12px 14px",
                        borderRadius: "10px",
                        background: "rgba(255, 255, 255, 0.03)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "12px",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "0.88rem",
                            fontWeight: 600,
                            marginBottom: "6px",
                          }}
                        >
                          <span>{m.title}</span>
                          <span
                            style={{ color: "var(--gold)", fontWeight: 700 }}
                          >
                            +{m.reward} Ar
                          </span>
                        </div>

                        {/* Barre de progression */}
                        <div
                          style={{
                            height: "6px",
                            borderRadius: "3px",
                            background: "rgba(255, 255, 255, 0.1)",
                            overflow: "hidden",
                            position: "relative",
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              width: `${percent}%`,
                              background:
                                percent === 100 ? "#4caf50" : "var(--gold)",
                              transition: "width 0.3s ease",
                            }}
                          />
                        </div>
                        <div
                          style={{
                            fontSize: "0.72rem",
                            color: "var(--muted)",
                            marginTop: "4px",
                          }}
                        >
                          Progression : {m.progress} / {m.goal}
                        </div>
                      </div>

                      {/* Bouton d'action */}
                      <div>
                        {m.claimed ? (
                          <span
                            style={{
                              fontSize: "0.78rem",
                              color: "#4caf50",
                              fontWeight: 700,
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <CheckCircle2 size={15} />
                            Réclamé
                          </span>
                        ) : m.claimable ? (
                          <button
                            type="button"
                            onClick={() => handleClaim(m.key, m.reward)}
                            disabled={claimingKey === m.key}
                            className="primary-button"
                            style={{
                              padding: "6px 12px",
                              fontSize: "0.8rem",
                              fontWeight: 700,
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <Sparkles size={13} />
                            {claimingKey === m.key ? "..." : "Réclamer"}
                          </button>
                        ) : (
                          <span
                            style={{
                              fontSize: "0.78rem",
                              color: "var(--muted)",
                            }}
                          >
                            En cours
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div style={{ marginTop: "18px", textAlign: "right" }}>
          <button
            type="button"
            className="primary-button"
            onClick={onClose}
            style={{ padding: "8px 24px", fontSize: "0.88rem" }}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
