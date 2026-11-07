import { useState } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  Crown,
  Dices,
  DollarSign,
  Layers,
  TrendingUp,
  Trophy,
  Wallet,
} from "lucide-react";
import type { LiveDashboardData } from "@services/backoffice";

interface ExecutiveFinanceDashboardProps {
  data: LiveDashboardData;
  selectedPeriod: "day" | "week" | "month" | "year";
  onChangePeriod: (period: "day" | "week" | "month" | "year") => void;
  loading?: boolean;
}

export function ExecutiveFinanceDashboard({
  data,
  selectedPeriod,
  onChangePeriod,
  loading = false,
}: ExecutiveFinanceDashboardProps) {
  const [txFilter, setTxFilter] = useState<string>("all");
  const [activeSubTab, setActiveSubTab] = useState<
    "overview" | "matrix" | "by_game" | "leaderboard" | "transactions" | "recent_games"
  >("overview");

  const exec = data.executive_dashboard;
  if (!exec) {
    return (
      <div
        style={{
          padding: "24px",
          borderRadius: "12px",
          background: "var(--panel)",
          border: "1px solid var(--line)",
          textAlign: "center",
          color: "var(--muted)",
        }}
      >
        <AlertTriangle size={32} color="var(--gold)" style={{ margin: "0 auto 12px" }} />
        <p>Données financières et exécutives non disponibles pour cette période.</p>
      </div>
    );
  }

  const currentMetrics =
    exec.periods_comparison[selectedPeriod] || exec.periods_comparison.week;
  const periods = exec.periods_comparison;

  const formatMGA = (val: number) => {
    return `${val.toLocaleString("fr-FR")} MGA`;
  };

  const periodLabels: Record<"day" | "week" | "month" | "year", string> = {
    day: "Aujourd'hui (24h)",
    week: "7 Jours (Hebdo)",
    month: "30 Jours (Mensuel)",
    year: "1 An (Annuel)",
  };

  const filteredTransactions = exec.financial_overview.recent_transactions.filter((tx) => {
    if (txFilter === "all") return true;
    if (txFilter === "pending") return tx.status === "pending";
    return tx.type === txFilter;
  });

  return (
    <section
      className="activity-card"
      style={{
        border: "1px solid rgba(211, 176, 107, 0.35)",
        background:
          "linear-gradient(145deg, rgba(17, 23, 33, 0.98), rgba(22, 30, 44, 0.95))",
        borderRadius: "14px",
        padding: "22px",
        display: "flex",
        flexDirection: "column",
        gap: "22px",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.35)",
      }}
    >
      {/* ─── EN-TÊTE DU DASHBOARD EXÉCUTIF & SÉLECTEUR DE PÉRIODE ─── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
          borderBottom: "1px solid rgba(211, 176, 107, 0.2)",
          paddingBottom: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "10px",
              background:
                "linear-gradient(135deg, rgba(211, 176, 107, 0.25), rgba(211, 176, 107, 0.08))",
              border: "1px solid var(--gold)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--gold)",
            }}
          >
            <TrendingUp size={24} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: "20px",
                  fontWeight: 800,
                  letterSpacing: "0.3px",
                  color: "#fff",
                }}
              >
                Tableau de Bord Exécutif & Financier
              </h2>
              <span
                style={{
                  fontSize: "11px",
                  padding: "3px 9px",
                  borderRadius: "999px",
                  background: "rgba(211, 176, 107, 0.18)",
                  color: "var(--gold-light)",
                  fontWeight: 700,
                  border: "1px solid rgba(211, 176, 107, 0.4)",
                  textTransform: "uppercase",
                }}
              >
                ADMIN STRICT · TEMPS RÉEL
              </span>
              {loading && (
                <span
                  style={{
                    fontSize: "11px",
                    padding: "3px 8px",
                    borderRadius: "6px",
                    background: "rgba(211, 176, 107, 0.2)",
                    color: "var(--gold)",
                    fontWeight: 600,
                  }}
                >
                  Sync...
                </span>
              )}
            </div>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: "12.5px",
                color: "var(--muted)",
              }}
            >
              Statistiques des tables créées, parties jouées, volume des mises, GGR, trésorerie et palmarès des joueurs.
            </p>
          </div>
        </div>

        {/* SÉLECTEUR DE PÉRIODE */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "12px", color: "var(--muted)", fontWeight: 600 }}>
            Période d&apos;analyse :
          </span>
          <div
            style={{
              display: "flex",
              background: "rgba(10, 13, 18, 0.8)",
              borderRadius: "10px",
              padding: "3px",
              border: "1px solid rgba(211, 176, 107, 0.3)",
            }}
          >
            {(["day", "week", "month", "year"] as const).map((periodKey) => {
              const active = selectedPeriod === periodKey;
              return (
                <button
                  key={periodKey}
                  type="button"
                  onClick={() => onChangePeriod(periodKey)}
                  style={{
                    padding: "7px 13px",
                    fontSize: "12px",
                    borderRadius: "7px",
                    border: "none",
                    cursor: "pointer",
                    fontWeight: active ? 700 : 500,
                    background: active
                      ? "linear-gradient(135deg, #d3b06b, #b89349)"
                      : "transparent",
                    color: active ? "#0a0d12" : "var(--soft)",
                    boxShadow: active ? "0 2px 8px rgba(211, 176, 107, 0.4)" : "none",
                    transition: "all 0.15s ease",
                  }}
                >
                  {periodLabels[periodKey]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── 4 CARTES KPI MAJEURES (PÉRIODE ACTIVE) ─── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "14px",
        }}
      >
        {/* CARTE 1: MISES & GGR */}
        <div
          style={{
            padding: "16px 18px",
            borderRadius: "12px",
            background: "rgba(13, 18, 26, 0.75)",
            border: "1px solid rgba(211, 176, 107, 0.25)",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "var(--muted)", fontWeight: 600 }}>
              VOLUME MISÉ ({periodLabels[selectedPeriod]})
            </span>
            <div
              style={{
                padding: "6px",
                borderRadius: "8px",
                background: "rgba(211, 176, 107, 0.15)",
                color: "var(--gold)",
              }}
            >
              <DollarSign size={18} />
            </div>
          </div>
          <div>
            <strong style={{ fontSize: "22px", color: "#fff", display: "block" }}>
              {formatMGA(currentMetrics.total_stakes_mga)}
            </strong>
            <div
              style={{
                display: "flex",
                gap: "12px",
                marginTop: "6px",
                fontSize: "12px",
                color: "var(--soft)",
                flexWrap: "wrap",
              }}
            >
              <span>
                Gains payés :{" "}
                <b style={{ color: "var(--gold)" }}>
                  {formatMGA(currentMetrics.total_payouts_mga)}
                </b>
              </span>
            </div>
          </div>
          <div
            style={{
              paddingTop: "8px",
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "11.5px",
            }}
          >
            <span style={{ color: "var(--muted)" }}>Marge Brute (GGR) :</span>
            <span
              style={{
                fontWeight: 700,
                color: currentMetrics.ggr_mga >= 0 ? "var(--green)" : "var(--red)",
              }}
            >
              {currentMetrics.ggr_mga >= 0 ? "+" : ""}
              {formatMGA(currentMetrics.ggr_mga)} ({currentMetrics.ggr_margin_pct}%)
            </span>
          </div>
        </div>

        {/* CARTE 2: FLUX DE TRÉSORERIE (DÉPÔTS / RETRAITS) */}
        <div
          style={{
            padding: "16px 18px",
            borderRadius: "12px",
            background: "rgba(13, 18, 26, 0.75)",
            border: "1px solid rgba(105, 214, 160, 0.25)",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "var(--muted)", fontWeight: 600 }}>
              TRÉSORERIE & PAIEMENTS
            </span>
            <div
              style={{
                padding: "6px",
                borderRadius: "8px",
                background: "rgba(105, 214, 160, 0.15)",
                color: "var(--green)",
              }}
            >
              <Wallet size={18} />
            </div>
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: "11.5px", color: "var(--muted)" }}>Dépôts validés :</span>
              <strong style={{ fontSize: "15px", color: "var(--green)" }}>
                +{formatMGA(currentMetrics.deposits_volume_mga)}
              </strong>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginTop: "4px",
              }}
            >
              <span style={{ fontSize: "11.5px", color: "var(--muted)" }}>Retraits réglés :</span>
              <strong style={{ fontSize: "15px", color: "var(--soft)" }}>
                -{formatMGA(currentMetrics.withdrawals_volume_mga)}
              </strong>
            </div>
          </div>
          <div
            style={{
              paddingTop: "8px",
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "11.5px",
            }}
          >
            <span style={{ color: "var(--muted)" }}>Flux Net Trésorerie :</span>
            <span
              style={{
                fontWeight: 700,
                color: currentMetrics.net_cash_flow_mga >= 0 ? "var(--green)" : "var(--gold)",
              }}
            >
              {currentMetrics.net_cash_flow_mga >= 0 ? "+" : ""}
              {formatMGA(currentMetrics.net_cash_flow_mga)}
            </span>
          </div>
          {exec.financial_overview.pending_withdrawals_count > 0 && (
            <div
              style={{
                fontSize: "11px",
                padding: "4px 8px",
                borderRadius: "6px",
                background: "rgba(232, 120, 120, 0.16)",
                color: "var(--red)",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <AlertTriangle size={13} />
              <span>
                {exec.financial_overview.pending_withdrawals_count} retrait(s) en attente (
                {formatMGA(exec.financial_overview.pending_withdrawals_volume_mga)})
              </span>
            </div>
          )}
        </div>

        {/* CARTE 3: TABLES & PARTIES JOUÉES */}
        <div
          style={{
            padding: "16px 18px",
            borderRadius: "12px",
            background: "rgba(13, 18, 26, 0.75)",
            border: "1px solid rgba(131, 174, 234, 0.25)",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "var(--muted)", fontWeight: 600 }}>
              ACTIVITÉ DU JEU
            </span>
            <div
              style={{
                padding: "6px",
                borderRadius: "8px",
                background: "rgba(131, 174, 234, 0.15)",
                color: "var(--blue)",
              }}
            >
              <Dices size={18} />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div>
              <strong style={{ fontSize: "22px", color: "#fff" }}>
                {currentMetrics.games_played}
              </strong>
              <span style={{ fontSize: "12px", color: "var(--muted)", marginLeft: "6px" }}>
                parties jouées
              </span>
            </div>
            <span
              style={{
                fontSize: "12px",
                padding: "3px 8px",
                borderRadius: "6px",
                background: "rgba(131, 174, 234, 0.18)",
                color: "var(--blue)",
                fontWeight: 600,
              }}
            >
              {currentMetrics.tables_created} tables créées
            </span>
          </div>
          <div
            style={{
              paddingTop: "8px",
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "11.5px",
            }}
          >
            <span style={{ color: "var(--muted)" }}>Mise moyenne / partie :</span>
            <span style={{ fontWeight: 700, color: "var(--gold)" }}>
              {formatMGA(currentMetrics.avg_stake_mga)}
            </span>
          </div>
        </div>

        {/* CARTE 4: JOUEURS ACTIFS & TOP STARS */}
        <div
          style={{
            padding: "16px 18px",
            borderRadius: "12px",
            background: "rgba(13, 18, 26, 0.75)",
            border: "1px solid rgba(199, 125, 255, 0.25)",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "var(--muted)", fontWeight: 600 }}>
              JOUEURS ACTIFS & STARS
            </span>
            <div
              style={{
                padding: "6px",
                borderRadius: "8px",
                background: "rgba(199, 125, 255, 0.15)",
                color: "#c77dff",
              }}
            >
              <Trophy size={18} />
            </div>
          </div>
          <div>
            <strong style={{ fontSize: "22px", color: "#fff" }}>
              {currentMetrics.unique_active_players}
            </strong>
            <span style={{ fontSize: "12px", color: "var(--muted)", marginLeft: "6px" }}>
              joueurs actifs
            </span>
          </div>
          <div
            style={{
              paddingTop: "8px",
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              fontSize: "11.5px",
              display: "flex",
              flexDirection: "column",
              gap: "3px",
            }}
          >
            {exec.leaderboards.top_winners[0] && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>🥇 Top Gagnant :</span>
                <span style={{ color: "var(--gold-light)", fontWeight: 600 }}>
                  {exec.leaderboards.top_winners[0].display_name} (
                  {exec.leaderboards.top_winners[0].wins_count} victoires)
                </span>
              </div>
            )}
            {exec.leaderboards.top_bettors[0] && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>💎 Top Mises :</span>
                <span style={{ color: "var(--blue)", fontWeight: 600 }}>
                  {exec.leaderboards.top_bettors[0].display_name} (
                  {formatMGA(exec.leaderboards.top_bettors[0].total_staked_mga)})
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── SOUS-NAVIGATION DES VUES ANALYTIQUES ─── */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          borderBottom: "1px solid var(--line)",
          paddingBottom: "8px",
          flexWrap: "wrap",
        }}
      >
        {[
          { id: "overview" as const, label: "Vue Période", icon: Layers },
          { id: "matrix" as const, label: "Comparatif 4 Périodes", icon: TrendingUp },
          { id: "by_game" as const, label: "Ventilation par Jeu", icon: Dices },
          { id: "leaderboard" as const, label: "Palmarès Joueurs 🏆", icon: Trophy },
          { id: "transactions" as const, label: "Transactions App 💳", icon: Wallet },
          { id: "recent_games" as const, label: "Dernières Parties 🎯", icon: Clock },
        ].map((subTab) => {
          const Icon = subTab.icon;
          const isSelected = activeSubTab === subTab.id;
          return (
            <button
              key={subTab.id}
              type="button"
              onClick={() => setActiveSubTab(subTab.id)}
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
                  : "1px solid rgba(255, 255, 255, 0.08)",
                background: isSelected
                  ? "rgba(211, 176, 107, 0.16)"
                  : "rgba(15, 20, 28, 0.6)",
                color: isSelected ? "var(--gold-light)" : "var(--soft)",
                transition: "all 0.15s ease",
              }}
            >
              <Icon size={14} />
              <span>{subTab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ─── VUE 1 : COMPARATIF DES 4 PÉRIODES (JOURNÉE / SEMAINE / MOIS / ANNÉE) ─── */}
      {(activeSubTab === "overview" || activeSubTab === "matrix") && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: "15px", color: "var(--gold-light)", fontWeight: 700 }}>
              📊 Matrice Comparative : Aujourd&apos;hui vs 7 Jours vs 30 Jours vs 1 An
            </h3>
            <span style={{ fontSize: "11.5px", color: "var(--muted)" }}>
              Données consolidées temps réel
            </span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table
              className="table-card"
              style={{
                width: "100%",
                borderCollapse: "separate",
                borderSpacing: 0,
                fontSize: "12.5px",
                borderRadius: "10px",
                overflow: "hidden",
                border: "1px solid var(--line)",
              }}
            >
              <thead>
                <tr style={{ background: "rgba(10, 14, 20, 0.8)", textAlign: "left" }}>
                  <th style={{ padding: "12px 14px", color: "var(--gold)" }}>MÉTRIQUE CLÉ</th>
                  <th style={{ padding: "12px 14px", color: "var(--soft)" }}>JOURNÉE (24H)</th>
                  <th style={{ padding: "12px 14px", color: "var(--soft)" }}>7 JOURS (HEBDO)</th>
                  <th style={{ padding: "12px 14px", color: "var(--soft)" }}>30 JOURS (MOIS)</th>
                  <th style={{ padding: "12px 14px", color: "var(--gold-light)" }}>1 AN (ANNUEL)</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: "10px 14px", fontWeight: 600 }}>🪑 Tables créées</td>
                  <td style={{ padding: "10px 14px" }}>{periods.day.tables_created}</td>
                  <td style={{ padding: "10px 14px" }}>{periods.week.tables_created}</td>
                  <td style={{ padding: "10px 14px" }}>{periods.month.tables_created}</td>
                  <td style={{ padding: "10px 14px", fontWeight: 700, color: "var(--gold)" }}>
                    {periods.year.tables_created}
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid var(--line)", background: "rgba(255, 255, 255, 0.02)" }}>
                  <td style={{ padding: "10px 14px", fontWeight: 600 }}>🎮 Parties complétées</td>
                  <td style={{ padding: "10px 14px" }}>{periods.day.games_played}</td>
                  <td style={{ padding: "10px 14px" }}>{periods.week.games_played}</td>
                  <td style={{ padding: "10px 14px" }}>{periods.month.games_played}</td>
                  <td style={{ padding: "10px 14px", fontWeight: 700, color: "var(--gold)" }}>
                    {periods.year.games_played}
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: "10px 14px", fontWeight: 600 }}>💵 Total Mises (Wagers)</td>
                  <td style={{ padding: "10px 14px" }}>{formatMGA(periods.day.total_stakes_mga)}</td>
                  <td style={{ padding: "10px 14px" }}>{formatMGA(periods.week.total_stakes_mga)}</td>
                  <td style={{ padding: "10px 14px" }}>{formatMGA(periods.month.total_stakes_mga)}</td>
                  <td style={{ padding: "10px 14px", fontWeight: 700, color: "var(--gold)" }}>
                    {formatMGA(periods.year.total_stakes_mga)}
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid var(--line)", background: "rgba(255, 255, 255, 0.02)" }}>
                  <td style={{ padding: "10px 14px", fontWeight: 600 }}>🏆 Total Gains Payés</td>
                  <td style={{ padding: "10px 14px" }}>{formatMGA(periods.day.total_payouts_mga)}</td>
                  <td style={{ padding: "10px 14px" }}>{formatMGA(periods.week.total_payouts_mga)}</td>
                  <td style={{ padding: "10px 14px" }}>{formatMGA(periods.month.total_payouts_mga)}</td>
                  <td style={{ padding: "10px 14px", fontWeight: 700 }}>
                    {formatMGA(periods.year.total_payouts_mga)}
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: "10px 14px", fontWeight: 600 }}>📈 Marge Brute GGR</td>
                  <td style={{ padding: "10px 14px", color: periods.day.ggr_mga >= 0 ? "var(--green)" : "var(--gold)" }}>
                    {formatMGA(periods.day.ggr_mga)} ({periods.day.ggr_margin_pct}%)
                  </td>
                  <td style={{ padding: "10px 14px", color: periods.week.ggr_mga >= 0 ? "var(--green)" : "var(--gold)" }}>
                    {formatMGA(periods.week.ggr_mga)} ({periods.week.ggr_margin_pct}%)
                  </td>
                  <td style={{ padding: "10px 14px", color: periods.month.ggr_mga >= 0 ? "var(--green)" : "var(--gold)" }}>
                    {formatMGA(periods.month.ggr_mga)} ({periods.month.ggr_margin_pct}%)
                  </td>
                  <td style={{ padding: "10px 14px", fontWeight: 700, color: periods.year.ggr_mga >= 0 ? "var(--green)" : "var(--gold)" }}>
                    {formatMGA(periods.year.ggr_mga)} ({periods.year.ggr_margin_pct}%)
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid var(--line)", background: "rgba(255, 255, 255, 0.02)" }}>
                  <td style={{ padding: "10px 14px", fontWeight: 600 }}>📥 Dépôts Validés</td>
                  <td style={{ padding: "10px 14px", color: "var(--green)" }}>{formatMGA(periods.day.deposits_volume_mga)}</td>
                  <td style={{ padding: "10px 14px", color: "var(--green)" }}>{formatMGA(periods.week.deposits_volume_mga)}</td>
                  <td style={{ padding: "10px 14px", color: "var(--green)" }}>{formatMGA(periods.month.deposits_volume_mga)}</td>
                  <td style={{ padding: "10px 14px", fontWeight: 700, color: "var(--green)" }}>
                    {formatMGA(periods.year.deposits_volume_mga)}
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: "10px 14px", fontWeight: 600 }}>📤 Retraits Exécutés</td>
                  <td style={{ padding: "10px 14px" }}>{formatMGA(periods.day.withdrawals_volume_mga)}</td>
                  <td style={{ padding: "10px 14px" }}>{formatMGA(periods.week.withdrawals_volume_mga)}</td>
                  <td style={{ padding: "10px 14px" }}>{formatMGA(periods.month.withdrawals_volume_mga)}</td>
                  <td style={{ padding: "10px 14px", fontWeight: 700 }}>
                    {formatMGA(periods.year.withdrawals_volume_mga)}
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid var(--line)", background: "rgba(255, 255, 255, 0.02)" }}>
                  <td style={{ padding: "10px 14px", fontWeight: 600 }}>⚖️ Flux Net Trésorerie</td>
                  <td style={{ padding: "10px 14px", fontWeight: 700, color: periods.day.net_cash_flow_mga >= 0 ? "var(--green)" : "var(--gold)" }}>
                    {formatMGA(periods.day.net_cash_flow_mga)}
                  </td>
                  <td style={{ padding: "10px 14px", fontWeight: 700, color: periods.week.net_cash_flow_mga >= 0 ? "var(--green)" : "var(--gold)" }}>
                    {formatMGA(periods.week.net_cash_flow_mga)}
                  </td>
                  <td style={{ padding: "10px 14px", fontWeight: 700, color: periods.month.net_cash_flow_mga >= 0 ? "var(--green)" : "var(--gold)" }}>
                    {formatMGA(periods.month.net_cash_flow_mga)}
                  </td>
                  <td style={{ padding: "10px 14px", fontWeight: 800, color: periods.year.net_cash_flow_mga >= 0 ? "var(--green)" : "var(--gold)" }}>
                    {formatMGA(periods.year.net_cash_flow_mga)}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: "10px 14px", fontWeight: 600 }}>👥 Joueurs Actifs Uniques</td>
                  <td style={{ padding: "10px 14px" }}>{periods.day.unique_active_players}</td>
                  <td style={{ padding: "10px 14px" }}>{periods.week.unique_active_players}</td>
                  <td style={{ padding: "10px 14px" }}>{periods.month.unique_active_players}</td>
                  <td style={{ padding: "10px 14px", fontWeight: 700, color: "var(--gold)" }}>
                    {periods.year.unique_active_players}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── VUE 2 : VENTILATION PAR JEU ─── */}
      {(activeSubTab === "overview" || activeSubTab === "by_game") && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: "15px", color: "var(--gold-light)", fontWeight: 700 }}>
              🎲 Ventilation par Jeu · {periodLabels[selectedPeriod]}
            </h3>
            <span style={{ fontSize: "11.5px", color: "var(--muted)" }}>
              Belote, Ludo, Domino, Rami & Poker
            </span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table
              className="table-card"
              style={{
                width: "100%",
                borderCollapse: "separate",
                borderSpacing: 0,
                fontSize: "12.5px",
                borderRadius: "10px",
                overflow: "hidden",
                border: "1px solid var(--line)",
              }}
            >
              <thead>
                <tr style={{ background: "rgba(10, 14, 20, 0.8)", textAlign: "left" }}>
                  <th style={{ padding: "12px 14px", color: "var(--gold)" }}>JEU</th>
                  <th style={{ padding: "12px 14px", color: "var(--soft)" }}>TABLES CRÉÉES</th>
                  <th style={{ padding: "12px 14px", color: "var(--soft)" }}>TABLES EN DIRECT</th>
                  <th style={{ padding: "12px 14px", color: "var(--soft)" }}>PARTIES JOUÉES</th>
                  <th style={{ padding: "12px 14px", color: "var(--soft)" }}>MISES TOTALES</th>
                  <th style={{ padding: "12px 14px", color: "var(--soft)" }}>GAINS PAYÉS</th>
                  <th style={{ padding: "12px 14px", color: "var(--soft)" }}>MARGE GGR</th>
                  <th style={{ padding: "12px 14px", color: "var(--soft)" }}>JOUEURS</th>
                </tr>
              </thead>
              <tbody>
                {exec.by_game_analytics.map((g) => (
                  <tr
                    key={g.game_type}
                    style={{ borderBottom: "1px solid var(--line)" }}
                  >
                    <td style={{ padding: "11px 14px", fontWeight: 700, color: "#fff" }}>
                      {g.label}
                    </td>
                    <td style={{ padding: "11px 14px" }}>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: "4px",
                          background: g.tables_created > 0 ? "rgba(211, 176, 107, 0.16)" : "transparent",
                          color: g.tables_created > 0 ? "var(--gold)" : "var(--muted)",
                          fontWeight: 600,
                        }}
                      >
                        {g.tables_created}
                      </span>
                    </td>
                    <td style={{ padding: "11px 14px" }}>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: "4px",
                          background: g.active_tables > 0 ? "rgba(105, 214, 160, 0.16)" : "transparent",
                          color: g.active_tables > 0 ? "var(--green)" : "var(--muted)",
                          fontWeight: 600,
                        }}
                      >
                        {g.active_tables}
                      </span>
                    </td>
                    <td style={{ padding: "11px 14px", fontWeight: 600 }}>{g.games_played}</td>
                    <td style={{ padding: "11px 14px" }}>{formatMGA(g.total_stakes_mga)}</td>
                    <td style={{ padding: "11px 14px" }}>{formatMGA(g.total_payouts_mga)}</td>
                    <td
                      style={{
                        padding: "11px 14px",
                        fontWeight: 700,
                        color: g.ggr_mga >= 0 ? "var(--green)" : "var(--gold)",
                      }}
                    >
                      {g.ggr_mga >= 0 ? "+" : ""}
                      {formatMGA(g.ggr_mga)}
                    </td>
                    <td style={{ padding: "11px 14px" }}>{g.unique_players}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── VUE 3 : PALMARÈS & LEADERBOARDS (TOP GAGNANTS & TOP MISES) ─── */}
      {(activeSubTab === "overview" || activeSubTab === "leaderboard") && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
          {/* COLONNE 1 : TOP GAGNANTS */}
          <div
            style={{
              padding: "16px",
              borderRadius: "12px",
              background: "rgba(10, 14, 20, 0.6)",
              border: "1px solid rgba(211, 176, 107, 0.25)",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Trophy size={18} color="var(--gold)" />
              <h4 style={{ margin: 0, fontSize: "14px", color: "var(--gold-light)", fontWeight: 700 }}>
                🏆 Top Gagnants (Plus de victoires & gains)
              </h4>
            </div>

            {exec.leaderboards.top_winners.length === 0 ? (
              <p style={{ fontSize: "12px", color: "var(--muted)", margin: "8px 0" }}>
                Aucune victoire enregistrée pour le moment.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {exec.leaderboards.top_winners.slice(0, 7).map((winner, idx) => (
                  <div
                    key={winner.user_id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      background: idx === 0 ? "rgba(211, 176, 107, 0.12)" : "rgba(255, 255, 255, 0.02)",
                      border: idx === 0 ? "1px solid rgba(211, 176, 107, 0.3)" : "1px solid rgba(255, 255, 255, 0.04)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span
                        style={{
                          width: "22px",
                          height: "22px",
                          borderRadius: "50%",
                          background:
                            idx === 0
                              ? "var(--gold)"
                              : idx === 1
                              ? "#c0c0c0"
                              : idx === 2
                              ? "#cd7f32"
                              : "rgba(255, 255, 255, 0.1)",
                          color: idx < 3 ? "#0a0d12" : "var(--muted)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "11px",
                          fontWeight: 800,
                        }}
                      >
                        {idx + 1}
                      </span>
                      <div>
                        <strong style={{ fontSize: "12.5px", color: "#fff", display: "block" }}>
                          {winner.display_name}
                        </strong>
                        <small style={{ fontSize: "11px", color: "var(--muted)" }}>
                          {winner.identifier}
                        </small>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <strong style={{ fontSize: "13px", color: "var(--gold)", display: "block" }}>
                        {formatMGA(winner.total_won_mga)}
                      </strong>
                      <small style={{ fontSize: "11px", color: "var(--green)", fontWeight: 600 }}>
                        {winner.wins_count} victoires
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* COLONNE 2 : TOP GROS JOUEURS (VIPs) */}
          <div
            style={{
              padding: "16px",
              borderRadius: "12px",
              background: "rgba(10, 14, 20, 0.6)",
              border: "1px solid rgba(131, 174, 234, 0.25)",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Crown size={18} color="var(--blue)" />
              <h4 style={{ margin: 0, fontSize: "14px", color: "var(--blue)", fontWeight: 700 }}>
                💎 Top Mises & VIPs (Plus gros volumes misés)
              </h4>
            </div>

            {exec.leaderboards.top_bettors.length === 0 ? (
              <p style={{ fontSize: "12px", color: "var(--muted)", margin: "8px 0" }}>
                Aucune mise enregistrée pour le moment.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {exec.leaderboards.top_bettors.slice(0, 7).map((bettor, idx) => (
                  <div
                    key={bettor.user_id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      background: idx === 0 ? "rgba(131, 174, 234, 0.12)" : "rgba(255, 255, 255, 0.02)",
                      border: idx === 0 ? "1px solid rgba(131, 174, 234, 0.3)" : "1px solid rgba(255, 255, 255, 0.04)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span
                        style={{
                          width: "22px",
                          height: "22px",
                          borderRadius: "50%",
                          background:
                            idx === 0
                              ? "var(--blue)"
                              : "rgba(255, 255, 255, 0.1)",
                          color: idx === 0 ? "#0a0d12" : "var(--muted)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "11px",
                          fontWeight: 800,
                        }}
                      >
                        {idx + 1}
                      </span>
                      <div>
                        <strong style={{ fontSize: "12.5px", color: "#fff", display: "block" }}>
                          {bettor.display_name}
                        </strong>
                        <small style={{ fontSize: "11px", color: "var(--muted)" }}>
                          {bettor.identifier}
                        </small>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <strong style={{ fontSize: "13px", color: "var(--blue)", display: "block" }}>
                        {formatMGA(bettor.total_staked_mga)}
                      </strong>
                      <small style={{ fontSize: "11px", color: "var(--soft)" }}>
                        {bettor.bets_count} mises (moy. {formatMGA(bettor.avg_stake_mga)})
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── VUE 4 : JOURNAL DES TRANSACTIONS FINANCIÈRES RÉELLES ─── */}
      {(activeSubTab === "overview" || activeSubTab === "transactions") && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: "15px", color: "var(--gold-light)", fontWeight: 700 }}>
                💳 Transactions Financières Réelles dans l&apos;App
              </h3>
              <small style={{ color: "var(--muted)", fontSize: "11.5px" }}>
                Dépôts, retraits, paris de jeux et bonus crédités
              </small>
            </div>

            {/* FILTRE DE TYPE DE TRANSACTION */}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {[
                { id: "all", label: "Toutes" },
                { id: "deposit", label: "Dépôts 📥" },
                { id: "withdrawal", label: "Retraits 📤" },
                { id: "game", label: "Jeux 🎲" },
                { id: "bonus", label: "Bonus 🎁" },
                { id: "pending", label: "En Attente ⏳" },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setTxFilter(f.id)}
                  style={{
                    padding: "4px 9px",
                    borderRadius: "6px",
                    fontSize: "11.5px",
                    border: txFilter === f.id ? "1px solid var(--gold)" : "1px solid var(--line)",
                    background: txFilter === f.id ? "rgba(211, 176, 107, 0.2)" : "var(--panel)",
                    color: txFilter === f.id ? "var(--gold-light)" : "var(--soft)",
                    cursor: "pointer",
                    fontWeight: txFilter === f.id ? 700 : 500,
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table
              className="table-card"
              style={{
                width: "100%",
                borderCollapse: "separate",
                borderSpacing: 0,
                fontSize: "12px",
                borderRadius: "10px",
                overflow: "hidden",
                border: "1px solid var(--line)",
              }}
            >
              <thead>
                <tr style={{ background: "rgba(10, 14, 20, 0.8)", textAlign: "left" }}>
                  <th style={{ padding: "10px 12px", color: "var(--gold)" }}>CODE TRANSACTION</th>
                  <th style={{ padding: "10px 12px", color: "var(--soft)" }}>DATE & HEURE</th>
                  <th style={{ padding: "10px 12px", color: "var(--soft)" }}>JOUEUR</th>
                  <th style={{ padding: "10px 12px", color: "var(--soft)" }}>TYPE</th>
                  <th style={{ padding: "10px 12px", color: "var(--soft)" }}>SENS</th>
                  <th style={{ padding: "10px 12px", color: "var(--soft)" }}>MONTANT</th>
                  <th style={{ padding: "10px 12px", color: "var(--soft)" }}>STATUT</th>
                  <th style={{ padding: "10px 12px", color: "var(--soft)" }}>DESCRIPTION</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: "18px", textAlign: "center", color: "var(--muted)" }}>
                      Aucune transaction trouvée pour ce filtre.
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((tx) => {
                    const isCredit = tx.direction === "credit";
                    const isCompleted = tx.status === "completed";
                    const isPending = tx.status === "pending";

                    return (
                      <tr key={tx.id} style={{ borderBottom: "1px solid var(--line)" }}>
                        <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: "11px", color: "var(--soft)" }}>
                          {tx.transaction_code.slice(0, 22)}...
                        </td>
                        <td style={{ padding: "9px 12px", color: "var(--muted)", whiteSpace: "nowrap" }}>
                          {new Date(tx.created_at).toLocaleString("fr-FR", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td style={{ padding: "9px 12px" }}>
                          <strong style={{ color: "#fff", display: "block" }}>
                            {tx.user_display_name}
                          </strong>
                          <small style={{ color: "var(--muted)", fontSize: "10.5px" }}>
                            {tx.user_identifier}
                          </small>
                        </td>
                        <td style={{ padding: "9px 12px" }}>
                          <span
                            style={{
                              padding: "2px 7px",
                              borderRadius: "4px",
                              fontSize: "11px",
                              fontWeight: 600,
                              background:
                                tx.type === "deposit"
                                  ? "rgba(105, 214, 160, 0.15)"
                                  : tx.type === "withdrawal"
                                  ? "rgba(211, 176, 107, 0.15)"
                                  : tx.type === "game"
                                  ? "rgba(131, 174, 234, 0.15)"
                                  : "rgba(199, 125, 255, 0.15)",
                              color:
                                tx.type === "deposit"
                                  ? "var(--green)"
                                  : tx.type === "withdrawal"
                                  ? "var(--gold)"
                                  : tx.type === "game"
                                  ? "var(--blue)"
                                  : "#c77dff",
                              textTransform: "capitalize",
                            }}
                          >
                            {tx.type}
                          </span>
                        </td>
                        <td style={{ padding: "9px 12px" }}>
                          <span
                            style={{
                              color: isCredit ? "var(--green)" : "var(--soft)",
                              fontWeight: 600,
                              display: "flex",
                              alignItems: "center",
                              gap: "3px",
                            }}
                          >
                            {isCredit ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}
                            {isCredit ? "Crédit" : "Débit"}
                          </span>
                        </td>
                        <td style={{ padding: "9px 12px", fontWeight: 700, color: isCredit ? "var(--green)" : "#fff" }}>
                          {isCredit ? "+" : "-"}
                          {formatMGA(tx.amount)}
                        </td>
                        <td style={{ padding: "9px 12px" }}>
                          <span
                            style={{
                              padding: "2px 7px",
                              borderRadius: "4px",
                              fontSize: "10.5px",
                              fontWeight: 700,
                              background: isCompleted
                                ? "rgba(105, 214, 160, 0.15)"
                                : isPending
                                ? "rgba(211, 176, 107, 0.15)"
                                : "rgba(232, 120, 120, 0.15)",
                              color: isCompleted
                                ? "var(--green)"
                                : isPending
                                ? "var(--gold)"
                                : "var(--red)",
                            }}
                          >
                            {isCompleted ? "Complété" : isPending ? "En attente" : tx.status}
                          </span>
                        </td>
                        <td style={{ padding: "9px 12px", color: "var(--muted)", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {tx.description}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── VUE 5 : DERNIÈRES PARTIES JOUÉES ─── */}
      {(activeSubTab === "overview" || activeSubTab === "recent_games") && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: "15px", color: "var(--gold-light)", fontWeight: 700 }}>
              🎯 Flux des Dernières Parties Jouées
            </h3>
            <span style={{ fontSize: "11.5px", color: "var(--muted)" }}>
              {exec.recent_games_feed.length} parties réglées
            </span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table
              className="table-card"
              style={{
                width: "100%",
                borderCollapse: "separate",
                borderSpacing: 0,
                fontSize: "12px",
                borderRadius: "10px",
                overflow: "hidden",
                border: "1px solid var(--line)",
              }}
            >
              <thead>
                <tr style={{ background: "rgba(10, 14, 20, 0.8)", textAlign: "left" }}>
                  <th style={{ padding: "10px 12px", color: "var(--gold)" }}>JEU</th>
                  <th style={{ padding: "10px 12px", color: "var(--soft)" }}>DATE & HEURE</th>
                  <th style={{ padding: "10px 12px", color: "var(--soft)" }}>JOUEUR / VAINQUEUR</th>
                  <th style={{ padding: "10px 12px", color: "var(--soft)" }}>RÉSULTAT</th>
                  <th style={{ padding: "10px 12px", color: "var(--soft)" }}>MONTANT</th>
                </tr>
              </thead>
              <tbody>
                {exec.recent_games_feed.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: "16px", textAlign: "center", color: "var(--muted)" }}>
                      Aucune partie réglée récemment.
                    </td>
                  </tr>
                ) : (
                  exec.recent_games_feed.map((rg) => {
                    const isWin = rg.outcome === "win";
                    return (
                      <tr key={rg.id} style={{ borderBottom: "1px solid var(--line)" }}>
                        <td style={{ padding: "9px 12px", fontWeight: 700, color: "#fff" }}>
                          {rg.game_label}
                        </td>
                        <td style={{ padding: "9px 12px", color: "var(--muted)" }}>
                          {new Date(rg.created_at).toLocaleString("fr-FR", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td style={{ padding: "9px 12px", color: "var(--soft)", fontWeight: 600 }}>
                          {rg.player_name}
                        </td>
                        <td style={{ padding: "9px 12px" }}>
                          <span
                            style={{
                              padding: "2px 7px",
                              borderRadius: "4px",
                              fontSize: "10.5px",
                              fontWeight: 700,
                              background: isWin
                                ? "rgba(105, 214, 160, 0.15)"
                                : rg.outcome === "draw"
                                ? "rgba(211, 176, 107, 0.15)"
                                : "rgba(232, 120, 120, 0.15)",
                              color: isWin
                                ? "var(--green)"
                                : rg.outcome === "draw"
                                ? "var(--gold)"
                                : "var(--red)",
                              textTransform: "uppercase",
                            }}
                          >
                            {isWin ? "Victoire" : rg.outcome === "draw" ? "Égalité" : "Défaite"}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "9px 12px",
                            fontWeight: 700,
                            color: isWin ? "var(--green)" : "var(--muted)",
                          }}
                        >
                          {isWin ? `+${formatMGA(rg.amount)}` : "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
