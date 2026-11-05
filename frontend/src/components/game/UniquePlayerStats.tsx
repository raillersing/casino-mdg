import { useState } from "react";
import { useQuery } from "react-query";
import { useTranslation } from "react-i18next";
import { Users, Activity, ShieldCheck } from "lucide-react";

type Statistics = {
  games: Record<string, Record<string, number>>;
  coverage_started_at: string | null;
  as_of: string;
};

export function UniquePlayerStats({
  gameType,
  compact = false,
}: {
  gameType: string;
  compact?: boolean;
}) {
  const { i18n } = useTranslation();
  const mg = i18n.language.startsWith("mg");
  const [days, setDays] = useState(7);
  const query = useQuery(
    "unique-player-statistics",
    async () => {
      const response = await fetch("/api/v1/games/player-statistics/");
      if (!response.ok) throw new Error("Statistics unavailable");
      return response.json() as Promise<Statistics>;
    },
    {
      staleTime: 60000,
      refetchInterval: 60000,
      refetchIntervalInBackground: false,
      retry: 1,
    },
  );
  const error = query.isError;
  const data = error ? undefined : query.data;
  // Read-only aggregate; no identity or private table is exposed.
  const value = data?.games[gameType]?.[`unique_players_${days}d`];

  if (compact)
    return (
      <p className="unique-player-summary">
        <Users size={13} className="unique-mini-icon" />
        <span className="unique-text-content">
          {error
            ? mg
              ? "Tsy misy antontanisa"
              : "Statistiques indisponibles"
            : !data
              ? "…"
              : data.coverage_started_at === null
                ? mg
                  ? "Tsy mbola misy tantara"
                  : "Historique à venir"
                : `${data.games[gameType]?.unique_players_7d ?? 0} ${mg ? "mpilalao samihafa · 7 andro" : "joueurs uniques · 7 jours"}`}
          {data?.coverage_started_at &&
            Date.now() - Date.parse(data.coverage_started_at) < 7 * 86400000 && (
              <span className="unique-partial-badge"> · {mg ? "mbola tsy feno" : "historique partiel"}</span>
            )}
        </span>
      </p>
    );

  return (
    <section
      aria-label={mg ? "Antontanisan’ny mpilalao" : "Joueurs uniques"}
      className="unique-player-stats"
    >
      <div className="unique-stats-top-row">
        <div className="unique-stats-heading">
          <Activity size={20} className="unique-stats-icon" />
          <div>
            <h3>{mg ? "Mpilalao samihafa (Audience Steam)" : "Audience & Joueurs uniques"}</h3>
            <span className="unique-stats-subtext">
              {mg ? "Fandraisana anjara voamarina" : "Fréquentation multijoueur humaine certifiée"}
            </span>
          </div>
        </div>
        <label className="unique-stats-period-select">
          <span className="period-label-text">{mg ? "Vanim-potoana" : "Période"}</span>
          <select
            aria-label={mg ? "Vanim-potoana" : "Période"}
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className="unique-select-box"
          >
            {[1, 7, 30, 365].map((day) => (
              <option key={day} value={day}>
                {day === 1 ? (mg ? "24 ora (1 andro)" : "24 heures (1 j)") : `${day} ${mg ? "andro" : "jours"}`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="unique-stats-main-card">
        <p role="status" className="unique-status-text">
          {error ? (
            <span className="status-err">
              {mg ? "Tsy misy antontanisa azo alaina" : "Statistiques indisponibles"}
            </span>
          ) : !data ? (
            <span className="status-loading">
              {mg ? "Miandry…" : "Chargement…"}
            </span>
          ) : data.coverage_started_at === null ? (
            <span className="status-empty">
              {mg ? "Tsy mbola misy tantara voarakitra" : "Historique pas encore disponible"}
            </span>
          ) : (
            <span className="status-val-wrap">
              <strong className="status-number">{value ?? "—"}</strong>{" "}
              <span className="status-label">
                {mg ? "mpilalao samihafa" : "joueurs uniques"} ·{" "}
                {days === 1 ? "24 h" : `${days} ${mg ? "andro" : "jours"}`}
              </span>
            </span>
          )}
        </p>

        {data?.coverage_started_at &&
          Date.now() - Date.parse(data.coverage_started_at) < days * 86400000 && (
            <p className="unique-partial-warning">
              ℹ️ {mg
                ? "Mbola tsy feno ny tantara amin’ity vanim-potoana ity (Historique partiel)."
                : "Historique partiel pour cette période (collecte récente)."}
            </p>
          )}
      </div>

      {data?.coverage_started_at && (
        <div className="unique-stats-verified-foot">
          <ShieldCheck size={14} className="verified-icon" />
          <small>
            {mg ? "Voarakitra nanomboka" : "Historique observé depuis le"}{" "}
            {new Date(data.coverage_started_at).toLocaleDateString(i18n.language)}{" "}
            ·{" "}
            {mg
              ? "Hetsika filalaovana voamarina"
              : "Participations confirmées, multijoueur humain"}
          </small>
        </div>
      )}
    </section>
  );
}
