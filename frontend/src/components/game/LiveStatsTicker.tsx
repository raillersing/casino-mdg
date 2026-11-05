import { useTranslation } from "react-i18next";
import { useLiveStats } from "@hooks/useLiveStats";

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
      <p role="status">
        {error
          ? mg
            ? "Tsy misy antontanisa azo alaina"
            : "Activité temporairement indisponible"
          : mg
            ? "Miandry…"
            : "Chargement de l’activité…"}
      </p>
    );
  return (
    <section
      className="live-activity"
      aria-label={mg ? "Hetsika ankehitriny" : "Activité actuelle"}
    >
      <div className="live-activity-totals">
        <span>
          <strong>{stats.total_online_players}</strong>{" "}
          {mg ? "amin’ny Internet" : "en ligne"}
        </span>
        <span>
          <strong>{stats.total_in_game_players ?? "—"}</strong>{" "}
          {mg ? "milalao" : "en partie"}
        </span>
        <span>
          <strong>{stats.total_running_tables}</strong>{" "}
          {mg ? "latabatra mandeha" : "tables publiques en cours"}
        </span>
      </div>
      {onSelectGame && (
        <div className="live-activity-games">
          {Object.entries(stats.games).map(([id, value]) => (
            <button
              type="button"
              key={id}
              aria-pressed={activeGameFilter === id}
              onClick={() => onSelectGame(id)}
            >
              {value.name} · {value.in_game_players ?? value.online_players}{" "}
              {mg ? "milalao" : "en partie"} · {value.running_tables}{" "}
              {mg ? "latabatra mandeha" : "tables en cours"}
            </button>
          ))}
        </div>
      )}
      <small>
        {mg ? "Nohavaozina" : "Actualisé à"}{" "}
        {new Date(stats.updated_at).toLocaleTimeString(i18n.language)} ·{" "}
        {mg
          ? "Voamarina amin’ny mpizara lalao"
          : "Confirmé par le serveur de jeu"}
      </small>
    </section>
  );
}
