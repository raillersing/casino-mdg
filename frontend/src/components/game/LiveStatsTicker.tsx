import { useTranslation } from "react-i18next";
import { useLiveStats } from "@hooks/useLiveStats";
import { Users, Gamepad2, Radio, ShieldCheck, Clock } from "lucide-react";

interface LiveStatsTickerProps {
  activeGameFilter?: string;
  onSelectGame?: (game: string) => void;
}

export function LiveStatsTicker({
  activeGameFilter,
  onSelectGame,
}: LiveStatsTickerProps) {
  const { i18n } = useTranslation();
  const mg = i18n.language.startsWith("mg");
  const { data, isError: error } = useLiveStats();
  const stats = error ? null : data;

  if (!stats)
    return (
      <div className="live-activity-loading-panel">
        <p role="status" className="live-activity-status-text">
          {error
            ? mg
              ? "Tsy misy antontanisa azo alaina"
              : "Activité temporairement indisponible"
            : mg
              ? "Miandry ny antontanisa…"
              : "Chargement de l’activité en direct…"}
        </p>
      </div>
    );

  return (
    <section
      className="live-activity"
      aria-label={mg ? "Hetsika ankehitriny" : "Activité actuelle"}
    >
      <div className="live-activity-header">
        <div className="live-pulse-badge">
          <span className="live-pulse-dot" />
          <span className="live-pulse-text">{mg ? "MIVANTANA" : "EN DIRECT"}</span>
        </div>
        <div className="live-sync-indicator">
          <ShieldCheck size={15} className="live-sync-icon" />
          <span>
            {mg ? "Voamarina amin’ny mpizara lalao" : "Données réelles certifiées"}
          </span>
        </div>
      </div>

      <div className="live-activity-totals">
        <div className="live-stat-card live-card-online">
          <div className="live-stat-icon-wrap icon-online">
            <Users size={20} />
          </div>
          <div className="live-stat-data">
            <span className="live-stat-val">
              <strong>{stats.total_online_players}</strong>
            </span>
            <span className="live-stat-lbl">
              {mg ? "amin’ny Internet" : "en ligne"}
            </span>
          </div>
        </div>

        <div className="live-stat-card live-card-playing">
          <div className="live-stat-icon-wrap icon-playing">
            <Gamepad2 size={20} />
          </div>
          <div className="live-stat-data">
            <span className="live-stat-val">
              <strong>{stats.total_in_game_players ?? "—"}</strong>
            </span>
            <span className="live-stat-lbl">
              {mg ? "milalao" : "en partie"}
            </span>
          </div>
        </div>

        <div className="live-stat-card live-card-tables">
          <div className="live-stat-icon-wrap icon-tables">
            <Radio size={20} />
          </div>
          <div className="live-stat-data">
            <span className="live-stat-val">
              <strong>{stats.total_running_tables}</strong>
            </span>
            <span className="live-stat-lbl">
              {mg ? "latabatra mandeha" : "tables publiques en cours"}
            </span>
          </div>
        </div>
      </div>

      {onSelectGame && (
        <div className="live-activity-games">
          {Object.entries(stats.games).map(([id, value]) => (
            <button
              type="button"
              key={id}
              className={`live-game-chip ${activeGameFilter === id ? "active" : ""}`}
              aria-pressed={activeGameFilter === id}
              onClick={() => onSelectGame(id)}
            >
              <span className="live-chip-name">{value.name}</span>
              <span className="live-chip-badge">
                {value.in_game_players ?? value.online_players}{" "}
                {mg ? "milalao" : "en partie"}
              </span>
              <span className="live-chip-tables">
                {value.running_tables}{" "}
                {mg ? "latabatra mandeha" : "tables en cours"}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="live-activity-footer">
        <small>
          <Clock size={12} className="live-footer-icon" />
          <span>
            {mg ? "Nohavaozina" : "Actualisé à"}{" "}
            {new Date(stats.updated_at).toLocaleTimeString(i18n.language)} ·{" "}
            {mg
              ? "Voamarina amin’ny mpizara lalao"
              : "Confirmé par le serveur de jeu"}
          </span>
        </small>
      </div>
    </section>
  );
}
