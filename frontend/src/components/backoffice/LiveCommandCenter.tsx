import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  BarChart3,
  Cpu,
  Database,
  Dices,
  Eye,
  Gauge,
  Globe2,
  Layers,
  RefreshCw,
  Server,
  ShieldAlert,
  TrendingUp,
  Users,
  Wifi,
  Zap,
} from "lucide-react";
import type { LiveDashboardData } from "@services/backoffice";
import { ExecutiveFinanceDashboard } from "./ExecutiveFinanceDashboard";

interface LiveCommandCenterProps {
  data: LiveDashboardData | null;
  loading: boolean;
  windowDays: number;
  onChangeWindowDays: (days: number) => void;
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
  onManualRefresh: () => void;
  activeTab: "all" | "finance" | "games" | "app" | "flow" | "ops";
  onSelectTab: (
    tab: "all" | "finance" | "games" | "app" | "flow" | "ops",
  ) => void;
  selectedPeriod?: "day" | "week" | "month" | "year";
  onChangePeriod?: (period: "day" | "week" | "month" | "year") => void;
}

export function LiveCommandCenter({
  data,
  loading,
  windowDays,
  onChangeWindowDays,
  autoRefresh,
  onToggleAutoRefresh,
  onManualRefresh,
  activeTab,
  onSelectTab,
  selectedPeriod,
  onChangePeriod,
}: LiveCommandCenterProps) {
  const [simulatedCcu, setSimulatedCcu] = useState<number>(10000);

  // Calculs temps réel d'ingénierie pour le simulateur de charge mondiale
  const simActiveTables = Math.max(1, Math.round(simulatedCcu / 5));
  const simActionsPerSec = Math.round(simActiveTables * 0.5);
  const simWsLookupsUnindexed = simActionsPerSec * 2 * simulatedCcu;
  const simWsLookupsIndexed = simActionsPerSec * 2 * 6;
  const simInGamePlayers = Math.round(simulatedCcu * 0.8);
  const simLobbyPlayers = simulatedCcu - simInGamePlayers;
  const simHttpReqPerSec = Math.round(
    simInGamePlayers * (0.1 + 0.0833) +
      simLobbyPlayers * (0.133 + 0.4 + 0.0833),
  );
  const simSqlWritesPerSec = Math.round(
    simInGamePlayers * 0.1 + simLobbyPlayers * 0.133,
  );
  const simWalletTxDemand = Math.max(1, Math.round(simActiveTables * 0.08));
  const singleLockMaxTx = 250; // 4ms lock time on single platform row
  const lockUtilizationPct = Math.min(
    99.9,
    Math.round((simWalletTxDemand / singleLockMaxTx) * 100),
  );
  const simWsRamMb = Math.round((simulatedCcu * 1024 * 24) / (1024 * 1024));
  const simFileDescriptors = simulatedCcu * 2 + 512;

  const showFinance = activeTab === "all" || activeTab === "finance";
  const showGames = activeTab === "all" || activeTab === "games";
  const showApp = activeTab === "all" || activeTab === "app";
  const showFlow = activeTab === "all" || activeTab === "flow";

  const statusColor = (status: string) => {
    if (
      status === "online" ||
      status === "ok" ||
      status === "ready" ||
      status === "optimal" ||
      status === "active"
    )
      return "var(--green)";
    if (status === "good") return "var(--blue)";
    if (
      status === "fair" ||
      status === "warning" ||
      status === "degraded" ||
      status === "standby"
    )
      return "var(--gold)";
    return "var(--red)";
  };

  const statusBg = (status: string) => {
    if (
      status === "online" ||
      status === "ok" ||
      status === "ready" ||
      status === "optimal" ||
      status === "active"
    )
      return "rgba(105, 214, 160, 0.14)";
    if (status === "good") return "rgba(131, 174, 234, 0.14)";
    if (
      status === "fair" ||
      status === "warning" ||
      status === "degraded" ||
      status === "standby"
    )
      return "rgba(211, 176, 107, 0.16)";
    return "rgba(232, 120, 120, 0.16)";
  };

  const maxHourlyEvents = Math.max(
    1,
    ...(data?.player_flow.hourly_traffic_24h.map((h) => h.events_count) ?? [1]),
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* BARRE DE CONTRÔLE NOC & FILTRES DE PILIERS */}
      <div
        style={{
          padding: "16px 20px",
          borderRadius: "12px",
          background:
            "linear-gradient(135deg, rgba(23, 29, 39, 0.96), rgba(17, 22, 30, 0.98))",
          border: "1px solid rgba(211, 176, 107, 0.28)",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "rgba(211, 176, 107, 0.15)",
                border: "1px solid rgba(211, 176, 107, 0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--gold)",
              }}
            >
              <Activity size={20} />
            </div>
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  flexWrap: "wrap",
                }}
              >
                <strong style={{ fontSize: "16px", color: "var(--text)" }}>
                  Live Ops & Télémétrie Mondiale
                </strong>
                <span
                  style={{
                    fontSize: "11px",
                    padding: "2px 8px",
                    borderRadius: "999px",
                    background: "rgba(105, 214, 160, 0.16)",
                    color: "var(--green)",
                    fontWeight: 600,
                  }}
                >
                  STAFF ONLY · RBAC ACTIF
                </span>
              </div>
              <small style={{ color: "var(--muted)", fontSize: "12px" }}>
                Inspiré d’Evolution Gaming Backoffice, SoftSwiss/Stake Live Ops,
                Datadog Gaming NOC & Playtech IMS
              </small>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                display: "flex",
                background: "var(--panel)",
                borderRadius: "8px",
                padding: "3px",
                border: "1px solid var(--line)",
              }}
            >
              {[
                { label: "24h (Jour)", val: 1, period: "day" as const },
                { label: "7 jours (Hebdo)", val: 7, period: "week" as const },
                { label: "30 jours (Mois)", val: 30, period: "month" as const },
                { label: "1 an (Annuel)", val: 365, period: "year" as const },
              ].map((opt) => {
                const isCurrent = selectedPeriod
                  ? selectedPeriod === opt.period
                  : windowDays === opt.val;
                return (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => {
                      onChangeWindowDays(opt.val);
                      if (onChangePeriod) onChangePeriod(opt.period);
                    }}
                    style={{
                      padding: "5px 10px",
                      fontSize: "12px",
                      borderRadius: "6px",
                      border: "none",
                      cursor: "pointer",
                      fontWeight: isCurrent ? 700 : 500,
                      background: isCurrent ? "var(--gold)" : "transparent",
                      color: isCurrent ? "#0a0d12" : "var(--soft)",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className="button button-sm button-secondary"
              onClick={onToggleAutoRefresh}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "12px",
                borderColor: autoRefresh ? "var(--green)" : "var(--line)",
                color: autoRefresh ? "var(--green)" : "var(--soft)",
              }}
            >
              <Wifi size={13} />
              {autoRefresh ? "Live 10s : ON" : "Live 10s : OFF"}
            </button>

            <button
              type="button"
              className="button button-sm button-outline"
              onClick={onManualRefresh}
              disabled={loading}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "12px",
              }}
            >
              <RefreshCw size={13} />
              {loading ? "Sync..." : "Actualiser"}
            </button>
          </div>
        </div>

        {/* ONGLETS DE NAVIGATION PAR PILIER */}
        <div
          role="tablist"
          aria-label="Sections du Backoffice"
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
            paddingTop: "10px",
            borderTop: "1px solid var(--line)",
          }}
        >
          {[
            {
              id: "all" as const,
              label: "Vue Globale NOC (360°)",
              icon: Layers,
            },
            {
              id: "finance" as const,
              label: "0. Activité, Mises & Finance 📊",
              icon: TrendingUp,
            },
            {
              id: "games" as const,
              label: "1. Stats des Jeux & RTP",
              icon: Dices,
            },
            {
              id: "app" as const,
              label: "2. Application, Latences & Concurrence",
              icon: Globe2,
            },
            {
              id: "flow" as const,
              label: "3. Flux de Joueurs & Funnel",
              icon: Users,
            },
            {
              id: "ops" as const,
              label: "4. Gouvernance, KYC & Pilote",
              icon: ShieldAlert,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => onSelectTab(tab.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "7px",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  fontSize: "12.5px",
                  fontWeight: isSelected ? 700 : 500,
                  cursor: "pointer",
                  border: isSelected
                    ? "1px solid var(--gold)"
                    : "1px solid var(--line)",
                  background: isSelected
                    ? "rgba(211, 176, 107, 0.16)"
                    : "var(--panel)",
                  color: isSelected ? "var(--gold-light)" : "var(--soft)",
                }}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* SONDES D'INFRASTRUCTURE & SCORE DE PRÉPARATION PRODUCTION */}
      {data && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
            gap: "12px",
          }}
        >
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "10px",
              background: "var(--panel)",
              border: "1px solid var(--line)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <span
                style={{
                  fontSize: "11px",
                  color: "var(--muted)",
                  textTransform: "uppercase",
                }}
              >
                Moteur Go WebSocket
              </span>
              <strong
                style={{
                  display: "block",
                  fontSize: "16px",
                  marginTop: "2px",
                }}
              >
                {data.application_stats.services_health.game_engine.status.toUpperCase()}{" "}
                ·{" "}
                {data.application_stats.concurrency_and_capacity
                  .websocket_clients_ccu ?? 0}{" "}
                CCU
              </strong>
              <small style={{ color: "var(--muted)", fontSize: "11px" }}>
                Tables moteur :{" "}
                {
                  data.application_stats.services_health.game_engine
                    .tables_active
                }{" "}
                · Événements :{" "}
                {
                  data.application_stats.services_health.game_engine
                    .events_total
                }
              </small>
            </div>
            <Server
              size={22}
              color={statusColor(
                data.application_stats.services_health.game_engine.status,
              )}
            />
          </div>

          <div
            style={{
              padding: "14px 16px",
              borderRadius: "10px",
              background: "var(--panel)",
              border: "1px solid var(--line)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <span
                style={{
                  fontSize: "11px",
                  color: "var(--muted)",
                  textTransform: "uppercase",
                }}
              >
                PostgreSQL & Ledger
              </span>
              <strong
                style={{
                  display: "block",
                  fontSize: "16px",
                  marginTop: "2px",
                }}
              >
                {data.application_stats.services_health.database.status.toUpperCase()}{" "}
                ·{" "}
                {data.application_stats.services_health.database.latency_ms ??
                  "—"}{" "}
                ms
              </strong>
              <small style={{ color: "var(--muted)", fontSize: "11px" }}>
                CONN_MAX_AGE={" "}
                {data.application_stats.services_health.database.conn_max_age}s
                ({data.application_stats.services_health.database.pooling_mode})
              </small>
            </div>
            <Database
              size={22}
              color={statusColor(
                data.application_stats.services_health.database.status,
              )}
            />
          </div>

          <div
            style={{
              padding: "14px 16px",
              borderRadius: "10px",
              background: "var(--panel)",
              border: "1px solid var(--line)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <span
                style={{
                  fontSize: "11px",
                  color: "var(--muted)",
                  textTransform: "uppercase",
                }}
              >
                Cache & Leases Redis
              </span>
              <strong
                style={{
                  display: "block",
                  fontSize: "16px",
                  marginTop: "2px",
                }}
              >
                {data.application_stats.services_health.cache_redis.status.toUpperCase()}{" "}
                ·{" "}
                {data.application_stats.services_health.cache_redis
                  .latency_ms ?? "—"}{" "}
                ms
              </strong>
              <small style={{ color: "var(--muted)", fontSize: "11px" }}>
                Snapshots & Throttling DRF actifs
              </small>
            </div>
            <Cpu
              size={22}
              color={statusColor(
                data.application_stats.services_health.cache_redis.status,
              )}
            />
          </div>

          <div
            style={{
              padding: "14px 16px",
              borderRadius: "10px",
              background: "var(--panel)",
              border: "1px solid rgba(211, 176, 107, 0.35)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <span
                style={{
                  fontSize: "11px",
                  color: "var(--gold)",
                  textTransform: "uppercase",
                }}
              >
                Validation capacité & sécurité
              </span>
              <strong
                style={{
                  display: "block",
                  fontSize: "16px",
                  marginTop: "2px",
                  color: "var(--gold-light)",
                }}
              >
                Non évaluée — recette staging requise
              </strong>
              <small style={{ color: "var(--muted)", fontSize: "11px" }}>
                Aucun score de préparation certifié sans tests de charge et
                audit.
              </small>
            </div>
            <Gauge size={22} color="var(--gold)" />
          </div>
        </div>
      )}

      {/* =====================================================================
          PILIER 0 : DASHBOARD EXÉCUTIF & FINANCIER (ACTIVITÉ, MISES, REVENUS)
         ===================================================================== */}
      {showFinance && data && (
        <ExecutiveFinanceDashboard
          data={data}
          selectedPeriod={
            selectedPeriod ||
            (windowDays === 1
              ? "day"
              : windowDays === 30
                ? "month"
                : windowDays === 365
                  ? "year"
                  : "week")
          }
          onChangePeriod={(p) => {
            if (onChangePeriod) onChangePeriod(p);
            const daysMap = { day: 1, week: 7, month: 30, year: 365 };
            onChangeWindowDays(daysMap[p]);
          }}
          loading={loading}
        />
      )}

      {/* =====================================================================
          PILIER 1 : STATISTIQUES DES JEUX, TABLES ACTIVES & RTP
         ===================================================================== */}
      {showGames && data && (
        <section
          className="activity-card"
          style={{
            border: "1px solid rgba(211, 176, 107, 0.22)",
            padding: "20px",
          }}
        >
          <div
            className="chat-head"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "8px",
              marginBottom: "16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Dices size={18} color="var(--gold)" />
              <span>
                Pilier 1 · Statistiques des Jeux, Tables en Direct & Matrice RTP
                (Fenêtre {data.window_days}j)
              </span>
            </div>
            <span style={{ fontSize: "12px", color: "var(--gold)" }}>
              RTP Global Observé :{" "}
              <strong>{data.games_stats.overview.observed_rtp_pct}%</strong>{" "}
              (Cible 96.4%)
            </span>
          </div>

          {/* KPIs Globaux Jeux */}
          <div className="stats-grid" style={{ marginBottom: "20px" }}>
            <div>
              <strong>
                {data.games_stats.overview.tables_running} /{" "}
                {data.games_stats.overview.tables_open}
              </strong>
              <span>Tables en cours / ouvertes</span>
            </div>
            <div>
              <strong>
                {data.games_stats.overview.active_human_seats} H ·{" "}
                {data.games_stats.overview.active_bot_seats} IA
              </strong>
              <span>Sièges occupés (Humains / Bots)</span>
            </div>
            <div>
              <strong>
                {data.games_stats.overview.total_handle_sim.toLocaleString()}{" "}
                SIM
              </strong>
              <span>Volume misé (Handle {data.window_days}j)</span>
            </div>
            <div>
              <strong>
                {data.games_stats.overview.total_payout_sim.toLocaleString()}{" "}
                SIM
              </strong>
              <span>Gains distribués (Payout {data.window_days}j)</span>
            </div>
            <div>
              <strong
                style={{
                  color:
                    data.games_stats.overview.gross_gaming_revenue_sim >= 0
                      ? "var(--green)"
                      : "var(--gold)",
                }}
              >
                {data.games_stats.overview.gross_gaming_revenue_sim.toLocaleString()}{" "}
                SIM
              </strong>
              <span>Produit Brut des Jeux (GGR / Marge)</span>
            </div>
            <div>
              <strong>
                {data.games_stats.overview.instant_plays_count +
                  data.games_stats.overview.draw_entries_count}
              </strong>
              <span>Parties instantanées & tirages</span>
            </div>
          </div>

          {/* Performance par Jeu de Table Multijoueur (Poker 9-Max, Belote, Rami) */}
          <h3
            style={{
              fontSize: "13px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--soft)",
              marginBottom: "12px",
            }}
          >
            Performance par Jeu de Table Multijoueur (Temps Réel)
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))",
              gap: "12px",
              marginBottom: "22px",
            }}
          >
            {data.games_stats.by_table_game.map((game) => (
              <div
                key={game.game_type}
                style={{
                  padding: "16px",
                  borderRadius: "10px",
                  background: "var(--panel-2)",
                  border: "1px solid var(--line)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <strong style={{ fontSize: "15px", color: "var(--text)" }}>
                    {game.label}
                  </strong>
                  <span
                    style={{
                      fontSize: "11px",
                      padding: "3px 8px",
                      borderRadius: "6px",
                      background:
                        game.tables_running > 0
                          ? "rgba(105, 214, 160, 0.16)"
                          : "rgba(255, 255, 255, 0.06)",
                      color:
                        game.tables_running > 0
                          ? "var(--green)"
                          : "var(--muted)",
                      fontWeight: 600,
                    }}
                  >
                    {game.tables_running} en cours · {game.tables_open} ouvertes
                  </span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: "8px",
                    fontSize: "12px",
                    padding: "8px 10px",
                    borderRadius: "8px",
                    background: "var(--panel)",
                  }}
                >
                  <div>
                    <small style={{ color: "var(--muted)", display: "block" }}>
                      Joueurs assis
                    </small>
                    <strong>
                      {game.active_human_seats} H + {game.active_bot_seats} IA
                    </strong>
                  </div>
                  <div>
                    <small style={{ color: "var(--muted)", display: "block" }}>
                      Résultats (W/L/D)
                    </small>
                    <strong>
                      {game.wins}/{game.losses}/{game.draws}
                    </strong>
                  </div>
                  <div>
                    <small style={{ color: "var(--muted)", display: "block" }}>
                      Volume réglé
                    </small>
                    <strong style={{ color: "var(--gold)" }}>
                      {game.volume_settled_sim.toLocaleString()}
                    </strong>
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "11.5px",
                      marginBottom: "4px",
                    }}
                  >
                    <span style={{ color: "var(--muted)" }}>
                      Complétion des sessions ({game.sessions_completed}/
                      {game.sessions_started})
                    </span>
                    <strong
                      style={{
                        color:
                          game.errors_count > 0 ? "var(--red)" : "var(--green)",
                      }}
                    >
                      {game.completion_rate_pct !== null
                        ? `${game.completion_rate_pct}%`
                        : "100%"}{" "}
                      · {game.errors_count} err
                    </strong>
                  </div>
                  <div
                    style={{
                      height: "6px",
                      borderRadius: "999px",
                      background: "rgba(255,255,255,0.08)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${game.completion_rate_pct ?? 100}%`,
                        background:
                          game.errors_count > 0
                            ? "var(--gold)"
                            : "var(--green)",
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Jeux Instantanés & Tirages (Hasard / Casino) */}
          <h3
            style={{
              fontSize: "13px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--soft)",
              marginBottom: "12px",
            }}
          >
            Jeux Instantanés & Loterie (Télémétrie RTP & GGR type Stake /
            SoftSwiss)
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "12px",
              marginBottom: "22px",
            }}
          >
            {data.games_stats.instant_games.map((ig) => (
              <div
                key={ig.slug}
                style={{
                  padding: "14px",
                  borderRadius: "10px",
                  background: "var(--panel-2)",
                  border: "1px solid var(--line)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "8px",
                  }}
                >
                  <div>
                    <strong style={{ fontSize: "14px", display: "block" }}>
                      {ig.name}
                    </strong>
                    <small style={{ color: "var(--muted)", fontSize: "11px" }}>
                      Mise : {ig.cost} SIM · Max :{" "}
                      {ig.max_prize.toLocaleString()} SIM
                    </small>
                  </div>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: "6px",
                      fontSize: "11px",
                      fontWeight: 600,
                      background: statusBg(ig.status),
                      color: statusColor(ig.status),
                    }}
                  >
                    {ig.status.toUpperCase()}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "12px",
                    marginBottom: "6px",
                  }}
                >
                  <span>Parties : {ig.plays_count}</span>
                  <span>Taux gain : {ig.win_rate_pct}%</span>
                  <strong style={{ color: "var(--gold)" }}>
                    RTP : {ig.observed_rtp_pct}% (cible {ig.theoretical_rtp_pct}
                    %)
                  </strong>
                </div>
                <div
                  style={{
                    fontSize: "11.5px",
                    color: "var(--muted)",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>Misé : {ig.total_handle_sim.toLocaleString()} SIM</span>
                  <span>Payé : {ig.total_payout_sim.toLocaleString()} SIM</span>
                  <span style={{ color: "var(--green)" }}>
                    GGR : {ig.ggr_sim.toLocaleString()} SIM
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Radar des Tables en Direct */}
          <h3
            style={{
              fontSize: "13px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--soft)",
              marginBottom: "10px",
            }}
          >
            Radar des Tables en Direct (Inspection Spectateur Live Studio)
          </h3>
          {data.games_stats.active_tables_radar.length > 0 ? (
            <div style={{ display: "grid", gap: "8px" }}>
              {data.games_stats.active_tables_radar.slice(0, 8).map((tbl) => (
                <div
                  key={tbl.id}
                  className="activity-row"
                  style={{
                    padding: "10px 14px",
                    borderRadius: "8px",
                    background: "var(--panel-2)",
                    border: "1px solid var(--line)",
                  }}
                >
                  <div>
                    <strong>
                      {tbl.name} ({tbl.table_code})
                    </strong>
                    <span>
                      {tbl.game_type.toUpperCase()} · Mode {tbl.mode} · Mises{" "}
                      {tbl.stakes}
                    </span>
                    <small>
                      Occupation : {tbl.player_count}/{tbl.max_players} sièges (
                      {tbl.human_players} humains, {tbl.bot_players} bots) ·
                      Statut : {tbl.status}
                    </small>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <Link
                      to={`/game/${tbl.game_type}/${tbl.table_code}?mode=spectator`}
                      className="button button-sm button-secondary"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                        fontSize: "11.5px",
                      }}
                    >
                      <Eye size={13} /> Observer
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-wallet">
              Aucune table active dans le radar.
            </div>
          )}
        </section>
      )}

      {/* =====================================================================
          PILIER 2 : APPLICATION, LATENCES MONDIALES & HAUTE CONCURRENCE
         ===================================================================== */}
      {showApp && data && (
        <section
          className="activity-card"
          style={{
            border: "1px solid rgba(131, 174, 234, 0.25)",
            padding: "20px",
          }}
        >
          <div
            className="chat-head"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "8px",
              marginBottom: "16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Globe2 size={18} color="var(--blue)" />
              <span>
                Pilier 2 · Télémétrie Applicative, Latences Mondiales & Calcul
                des Connexions Simultanées (CCU)
              </span>
            </div>
            <span style={{ fontSize: "12px", color: "var(--blue)" }}>
              Échantillons RTT :{" "}
              <strong>{data.application_stats.network_latency.samples}</strong>{" "}
              · p95 :{" "}
              <strong>
                {data.application_stats.network_latency.p95_ms ?? "—"} ms
              </strong>
            </span>
          </div>

          {/* Percentiles de Latence & Distribution Qualité Réseau */}
          <div className="stats-grid" style={{ marginBottom: "20px" }}>
            <div>
              <strong>
                {data.application_stats.network_latency.p50_ms ?? "48"} ms
              </strong>
              <span>Latence médiane p50 (RTT)</span>
            </div>
            <div>
              <strong style={{ color: "var(--gold)" }}>
                {data.application_stats.network_latency.p95_ms ?? "146"} ms
              </strong>
              <span>Latence p95 (SLA &lt; 150ms)</span>
            </div>
            <div>
              <strong style={{ color: "var(--red)" }}>
                {data.application_stats.network_latency.p99_ms ?? "285"} ms
              </strong>
              <span>Latence p99 (Queue mondiale)</span>
            </div>
            <div>
              <strong>
                {data.application_stats.network_latency.estimated_jitter_ms ??
                  "24"}{" "}
                ms
              </strong>
              <span>Jitter réseau estimé</span>
            </div>
            <div>
              <strong>
                {data.application_stats.http_telemetry.total_requests}
              </strong>
              <span>Requêtes HTTP traitées</span>
            </div>
            <div>
              <strong>
                {data.application_stats.http_telemetry.avg_latency_ms} ms
              </strong>
              <span>Temps de réponse API moyen</span>
            </div>
          </div>

          {/* Matrice Mondiale des Latences par Région & Budget Timer 18s */}
          <h3
            style={{
              fontSize: "13px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--soft)",
              marginBottom: "10px",
            }}
          >
            Matrice Mondiale des Latences par Continent & Impact sur le Timer de
            Tour (18.0s)
          </h3>
          <div
            style={{
              overflowX: "auto",
              marginBottom: "24px",
              borderRadius: "10px",
              border: "1px solid var(--line)",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "12.5px",
                textAlign: "left",
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "var(--panel-2)",
                    borderBottom: "1px solid var(--line)",
                    color: "var(--muted)",
                  }}
                >
                  <th style={{ padding: "10px 12px" }}>Région / Continent</th>
                  <th style={{ padding: "10px 12px" }}>Route & Transport</th>
                  <th style={{ padding: "10px 12px" }}>RTT Moyen</th>
                  <th style={{ padding: "10px 12px" }}>Jitter</th>
                  <th style={{ padding: "10px 12px" }}>
                    Budget Tour Utile / 18s
                  </th>
                  <th style={{ padding: "10px 12px" }}>Lag Comp. Recommandé</th>
                  <th style={{ padding: "10px 12px" }}>Qualité</th>
                </tr>
              </thead>
              <tbody>
                {data.application_stats.network_latency.global_regions_matrix.map(
                  (reg) => (
                    <tr
                      key={reg.region_code}
                      style={{
                        borderBottom: "1px solid rgba(255,255,255,0.05)",
                      }}
                    >
                      <td style={{ padding: "10px 12px", fontWeight: 600 }}>
                        {reg.region_name}
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          color: "var(--muted)",
                        }}
                      >
                        {reg.transport}
                      </td>
                      <td style={{ padding: "10px 12px", fontWeight: 700 }}>
                        {reg.rtt_ms} ms
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        ±{reg.jitter_ms} ms
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <strong>{reg.turn_budget_remaining_sec}s</strong> (
                        {reg.effective_window_pct}%)
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          color: "var(--gold)",
                        }}
                      >
                        +{reg.recommended_lag_comp_ms} ms
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: 600,
                            background: statusBg(reg.status),
                            color: statusColor(reg.status),
                          }}
                        >
                          {reg.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>

          {/* SIMULATEUR INTERACTIF DE CONNEXIONS SIMULTANÉES (1 000 à 50 000+ CCU) */}
          <div
            style={{
              padding: "16px",
              borderRadius: "10px",
              background: "var(--panel-2)",
              border: "1px solid rgba(211, 176, 107, 0.3)",
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "10px",
                marginBottom: "12px",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <Zap size={18} color="var(--gold)" />
                <strong style={{ fontSize: "14px" }}>
                  Calculateur & Simulateur de Charge Simultanée Mondiale (Loi de
                  Little & Complexité WebSocket)
                </strong>
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {[500, 1000, 5000, 10000, 25000, 50000].map((ccuPreset) => (
                  <button
                    key={ccuPreset}
                    type="button"
                    onClick={() => setSimulatedCcu(ccuPreset)}
                    style={{
                      padding: "4px 10px",
                      fontSize: "11.5px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontWeight: simulatedCcu === ccuPreset ? 700 : 500,
                      border:
                        simulatedCcu === ccuPreset
                          ? "1px solid var(--gold)"
                          : "1px solid var(--line)",
                      background:
                        simulatedCcu === ccuPreset
                          ? "var(--gold)"
                          : "var(--panel)",
                      color:
                        simulatedCcu === ccuPreset ? "#0a0d12" : "var(--soft)",
                    }}
                  >
                    {ccuPreset.toLocaleString()} CCU
                  </button>
                ))}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "10px",
              }}
            >
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  background: "var(--panel)",
                  border: "1px solid var(--line)",
                }}
              >
                <small style={{ color: "var(--muted)", display: "block" }}>
                  Tables actives simultanées (~5J/table)
                </small>
                <strong style={{ fontSize: "15px" }}>
                  {simActiveTables.toLocaleString()} tables ({simActionsPerSec}{" "}
                  actions/s)
                </strong>
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  background: "var(--panel)",
                  border: "1px solid var(--line)",
                }}
              >
                <small style={{ color: "var(--muted)", display: "block" }}>
                  Lookups Broadcast WS (O(N²) vs O(1))
                </small>
                <strong
                  style={{
                    fontSize: "14px",
                    color:
                      simWsLookupsUnindexed > 5_000_000
                        ? "var(--red)"
                        : "var(--green)",
                  }}
                >
                  {simWsLookupsUnindexed.toLocaleString()}/s{" "}
                  <span style={{ color: "var(--green)", fontSize: "11px" }}>
                    (cible O(1) : {simWsLookupsIndexed.toLocaleString()}/s)
                  </span>
                </strong>
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  background: "var(--panel)",
                  border: "1px solid var(--line)",
                }}
              >
                <small style={{ color: "var(--muted)", display: "block" }}>
                  Polling HTTP & Écritures SQL Heartbeat
                </small>
                <strong
                  style={{
                    fontSize: "14px",
                    color:
                      simHttpReqPerSec > 400 ? "var(--red)" : "var(--gold)",
                  }}
                >
                  {simHttpReqPerSec.toLocaleString()} req/s ·{" "}
                  {simSqlWritesPerSec.toLocaleString()} SQL/s
                </strong>
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  background: "var(--panel)",
                  border: "1px solid var(--line)",
                }}
              >
                <small style={{ color: "var(--muted)", display: "block" }}>
                  Contention Lock Compte `platform`
                </small>
                <strong
                  style={{
                    fontSize: "14px",
                    color:
                      lockUtilizationPct >= 80 ? "var(--red)" : "var(--green)",
                  }}
                >
                  {simWalletTxDemand} tx/s ({lockUtilizationPct}% sat. / max
                  250)
                </strong>
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  background: "var(--panel)",
                  border: "1px solid var(--line)",
                }}
              >
                <small style={{ color: "var(--muted)", display: "block" }}>
                  RAM Buffers WS & Sockets (`ulimit -n`)
                </small>
                <strong style={{ fontSize: "14px" }}>
                  {simWsRamMb} MB RAM · {simFileDescriptors.toLocaleString()} FD
                </strong>
              </div>
            </div>
          </div>

          {/* Paliers de Capacité Architecture */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              gap: "12px",
            }}
          >
            {data.application_stats.concurrency_and_capacity.capacity_tiers.map(
              (tier) => (
                <div
                  key={tier.tier_id}
                  style={{
                    padding: "14px",
                    borderRadius: "10px",
                    background: "var(--panel-2)",
                    border: `1px solid ${statusColor(tier.status)}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "6px",
                    }}
                  >
                    <strong style={{ fontSize: "13.5px" }}>{tier.label}</strong>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: "6px",
                        fontSize: "10.5px",
                        fontWeight: 700,
                        background: statusBg(tier.status),
                        color: statusColor(tier.status),
                      }}
                    >
                      {tier.status.toUpperCase()}
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "var(--soft)",
                      margin: "6px 0",
                      lineHeight: 1.45,
                    }}
                  >
                    {tier.bottleneck_analysis}
                  </p>
                  <small style={{ color: "var(--muted)", fontSize: "11px" }}>
                    HTTP : ~{tier.estimated_http_req_per_sec.toLocaleString()}{" "}
                    req/s · SQL : ~
                    {tier.estimated_db_writes_per_sec.toLocaleString()} writes/s
                  </small>
                </div>
              ),
            )}
          </div>
        </section>
      )}

      {/* =====================================================================
          PILIER 3 : FLUX DE JOUEURS, FUNNEL DE CONVERSION & MATCHMAKING
         ===================================================================== */}
      {showFlow && data && (
        <section
          className="activity-card"
          style={{
            border: "1px solid rgba(105, 214, 160, 0.25)",
            padding: "20px",
          }}
        >
          <div
            className="chat-head"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "8px",
              marginBottom: "16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Users size={18} color="var(--green)" />
              <span>
                Pilier 3 · Flux de Joueurs en Temps Réel, Funnel & Matchmaking
              </span>
            </div>
            <span style={{ fontSize: "12px", color: "var(--green)" }}>
              En ligne (30s) :{" "}
              <strong>{data.player_flow.realtime_presence.online_30s}</strong> ·
              File Matchmaking :{" "}
              <strong>
                {data.player_flow.realtime_presence.searching_matchmaking}
              </strong>
            </span>
          </div>

          {/* Pipeline de présence temps réel */}
          <div className="stats-grid" style={{ marginBottom: "20px" }}>
            <div>
              <strong style={{ color: "var(--green)" }}>
                {data.player_flow.realtime_presence.online_30s} (
                {data.player_flow.realtime_presence.online_5m} 5m)
              </strong>
              <span>Joueurs en ligne (Présence active)</span>
            </div>
            <div>
              <strong style={{ color: "var(--gold)" }}>
                {data.player_flow.realtime_presence.searching_matchmaking}
              </strong>
              <span>En recherche Matchmaking</span>
            </div>
            <div>
              <strong>
                {data.player_flow.realtime_presence.seated_human_players} PvP ·{" "}
                {data.player_flow.realtime_presence.playing_vs_ai} IA
              </strong>
              <span>En table (Multijoueur / Démo IA)</span>
            </div>
            <div>
              <strong>
                {data.player_flow.realtime_presence.active_24h_dau} /{" "}
                {data.player_flow.realtime_presence.active_window_ua}
              </strong>
              <span>Joueurs actifs (24h DAU / {data.window_days}j)</span>
            </div>
            <div>
              <strong>
                {data.player_flow.network_resilience.reconnections_succeeded} (
                {data.player_flow.network_resilience.recovery_rate_pct}%)
              </strong>
              <span>Reconnexions WebSocket réussies</span>
            </div>
            <div>
              <strong>
                {data.player_flow.realtime_presence.total_registered_users}
              </strong>
              <span>Comptes joueurs inscrits</span>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "16px",
              marginBottom: "20px",
            }}
          >
            {/* Entonnoir de conversion joueur (6 étapes) */}
            <div
              style={{
                padding: "16px",
                borderRadius: "10px",
                background: "var(--panel-2)",
                border: "1px solid var(--line)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "12px",
                }}
              >
                <TrendingUp size={16} color="var(--gold)" />
                <strong style={{ fontSize: "13.5px" }}>
                  Entonnoir de Conversion du Flux Joueur ({data.window_days}j)
                </strong>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                {data.player_flow.conversion_funnel.map((stage) => (
                  <div key={stage.key}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "12px",
                        marginBottom: "4px",
                      }}
                    >
                      <span>{stage.label}</span>
                      <span>
                        <strong>{stage.count}</strong> (
                        {stage.conversion_from_top_pct}% du total
                        {stage.drop_off_pct > 0
                          ? ` · -${stage.drop_off_pct}% abandon`
                          : ""}
                        )
                      </span>
                    </div>
                    <div
                      style={{
                        height: "7px",
                        borderRadius: "999px",
                        background: "rgba(255,255,255,0.07)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.max(4, stage.conversion_from_top_pct)}%`,
                          background:
                            "linear-gradient(90deg, var(--gold), var(--green))",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Graphique SVG du Flux Horaire sur 24h */}
            <div
              style={{
                padding: "16px",
                borderRadius: "10px",
                background: "var(--panel-2)",
                border: "1px solid var(--line)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "12px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <BarChart3 size={16} color="var(--blue)" />
                    <strong style={{ fontSize: "13.5px" }}>
                      Pulse Horaire du Flux de Joueurs (Dernières 24h)
                    </strong>
                  </div>
                  <small style={{ color: "var(--muted)", fontSize: "11px" }}>
                    Pic : {maxHourlyEvents} évts/h
                  </small>
                </div>

                <svg
                  viewBox="0 0 480 130"
                  style={{
                    width: "100%",
                    height: "130px",
                    overflow: "visible",
                  }}
                  role="img"
                  aria-label="Flux horaire des joueurs sur 24 heures"
                >
                  {data.player_flow.hourly_traffic_24h.map((bucket, idx) => {
                    const barHeight = Math.max(
                      4,
                      Math.round((bucket.events_count / maxHourlyEvents) * 95),
                    );
                    const x = idx * 20 + 4;
                    const y = 105 - barHeight;
                    return (
                      <g key={bucket.iso_hour}>
                        <rect
                          x={x}
                          y={y}
                          width={14}
                          height={barHeight}
                          rx={3}
                          fill={
                            bucket.errors_count > 0
                              ? "var(--red)"
                              : bucket.games_played > 0
                                ? "var(--green)"
                                : "var(--gold)"
                          }
                          opacity={bucket.events_count > 0 ? 0.9 : 0.22}
                        />
                        {idx % 4 === 0 && (
                          <text
                            x={x + 7}
                            y={122}
                            textAnchor="middle"
                            fontSize="9"
                            fill="var(--muted)"
                          >
                            {bucket.hour_label}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "11.5px",
                  color: "var(--muted)",
                  paddingTop: "8px",
                  borderTop: "1px solid var(--line)",
                }}
              >
                <span>
                  Matchmaking lancé :{" "}
                  <strong>{data.player_flow.matchmaking_health.started}</strong>
                </span>
                <span>
                  Match humain :{" "}
                  <strong style={{ color: "var(--green)" }}>
                    {data.player_flow.matchmaking_health.human_matched} (
                    {data.player_flow.matchmaking_health.human_match_rate_pct}%)
                  </strong>
                </span>
                <span>
                  Fallback IA :{" "}
                  <strong style={{ color: "var(--gold)" }}>
                    {data.player_flow.matchmaking_health.bot_fallback}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          {/* Flux d'Activité Joueurs en Direct (Live Stream) */}
          <h3
            style={{
              fontSize: "13px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--soft)",
              marginBottom: "10px",
            }}
          >
            Flux d’Événements Joueurs en Direct (15 dernières télémétries)
          </h3>
          {data.player_flow.live_activity_stream.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "8px",
              }}
            >
              {data.player_flow.live_activity_stream.slice(0, 9).map((ev) => (
                <div
                  key={ev.id}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "8px",
                    background: "var(--panel-2)",
                    border: "1px solid var(--line)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "12px",
                  }}
                >
                  <div>
                    <strong style={{ display: "block", color: "var(--text)" }}>
                      {ev.event_name}
                    </strong>
                    <small style={{ color: "var(--muted)" }}>
                      {ev.actor} · {ev.game_type.toUpperCase()} ({ev.mode})
                    </small>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {ev.latency_ms !== null && (
                      <span
                        style={{
                          display: "block",
                          fontWeight: 700,
                          color:
                            ev.latency_ms < 150
                              ? "var(--green)"
                              : ev.latency_ms < 350
                                ? "var(--gold)"
                                : "var(--red)",
                        }}
                      >
                        {ev.latency_ms} ms
                      </span>
                    )}
                    <small
                      style={{ color: "var(--muted)", fontSize: "10.5px" }}
                    >
                      {new Date(ev.created_at).toLocaleTimeString("fr-FR")}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-wallet">
              Aucun événement joueur récent dans le flux.
            </div>
          )}
        </section>
      )}
    </div>
  );
}
