import React, { useEffect, useState } from "react";
import { getLiveStats, LiveStatsResponse } from "../../services/games";

interface LiveStatsTickerProps {
  activeGameFilter?: string;
  onSelectGame?: (gameType: string) => void;
}

export const LiveStatsTicker: React.FC<LiveStatsTickerProps> = ({
  activeGameFilter,
  onSelectGame,
}) => {
  const [stats, setStats] = useState<LiveStatsResponse | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchStats = () => {
      getLiveStats(activeGameFilter && activeGameFilter !== "all" ? activeGameFilter : undefined)
        .then((data) => {
          if (mounted) setStats(data);
        })
        .catch(() => undefined);
    };

    fetchStats();
    const interval = window.setInterval(fetchStats, 15000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [activeGameFilter]);

  if (!stats) return null;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        padding: "10px 16px",
        marginBottom: "16px",
        borderRadius: "12px",
        background: "rgba(22, 27, 38, 0.75)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        backdropFilter: "blur(8px)",
      }}
    >
      {/* Indicateur global en direct */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              display: "inline-block",
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              backgroundColor: "#22c55e",
              boxShadow: "0 0 10px #22c55e",
              animation: "pulse 2s infinite ease-in-out",
            }}
          />
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#f8fafc" }}>
            {stats.total_online_players}{" "}
            <span style={{ fontWeight: 400, color: "#94a3b8" }}>
              joueur{stats.total_online_players > 1 ? "s" : ""} en direct
            </span>
          </span>
        </div>

        <div style={{ width: "1px", height: "16px", background: "rgba(255,255,255,0.12)" }} />

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "14px" }}>🎲</span>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#e8c374" }}>
            {stats.total_running_tables}{" "}
            <span style={{ fontWeight: 400, color: "#94a3b8" }}>
              table{stats.total_running_tables > 1 ? "s" : ""} en cours
            </span>
          </span>
          <span style={{ fontSize: "12px", color: "#64748b" }}>
            ({stats.total_active_tables} salon{stats.total_active_tables > 1 ? "s" : ""} ouvert{stats.total_active_tables > 1 ? "s" : ""})
          </span>
        </div>
      </div>

      {/* Mini-badges par jeu */}
      {stats.games && (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          {Object.entries(stats.games).map(([key, g]) => {
            const isCurrent = activeGameFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelectGame?.(key)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "3px 8px",
                  borderRadius: "6px",
                  fontSize: "11px",
                  border: isCurrent
                    ? "1px solid rgba(232, 195, 116, 0.4)"
                    : "1px solid rgba(255, 255, 255, 0.05)",
                  background: isCurrent
                    ? "rgba(232, 195, 116, 0.12)"
                    : "rgba(255, 255, 255, 0.02)",
                  color: isCurrent ? "#e8c374" : "#94a3b8",
                  cursor: onSelectGame ? "pointer" : "default",
                  transition: "all 0.15s ease",
                }}
              >
                <span style={{ fontWeight: 600 }}>{g.name.split(" ")[0]}</span>
                <span
                  style={{
                    backgroundColor: g.running_tables > 0 ? "rgba(34, 197, 94, 0.2)" : "rgba(255,255,255,0.06)",
                    color: g.running_tables > 0 ? "#4ade80" : "#64748b",
                    padding: "1px 5px",
                    borderRadius: "4px",
                    fontSize: "10px",
                    fontWeight: 700,
                  }}
                >
                  {g.running_tables} en jeu
                </span>
                {g.online_players > 0 && (
                  <span style={{ color: "#38bdf8", fontSize: "10px" }}>
                    · {g.online_players}👥
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
