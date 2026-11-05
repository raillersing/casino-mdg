import { useState } from "react";
import { useQuery } from "react-query";
import { useTranslation } from "react-i18next";

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
            <span> · {mg ? "mbola tsy feno" : "historique partiel"}</span>
          )}
      </p>
    );
  return (
    <section
      aria-label={mg ? "Antontanisan’ny mpilalao" : "Joueurs uniques"}
      className="unique-player-stats"
    >
      <label>
        {mg ? "Vanim-potoana" : "Période"}{" "}
        <select
          aria-label={mg ? "Vanim-potoana" : "Période"}
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
        >
          {[1, 7, 30, 365].map((day) => (
            <option key={day} value={day}>
              {day === 1 ? "24 h" : `${day} ${mg ? "andro" : "jours"}`}
            </option>
          ))}
        </select>
      </label>
      <p role="status">
        {error ? (
          mg ? (
            "Tsy misy antontanisa azo alaina"
          ) : (
            "Statistiques indisponibles"
          )
        ) : !data ? (
          mg ? (
            "Miandry…"
          ) : (
            "Chargement…"
          )
        ) : data.coverage_started_at === null ? (
          mg ? (
            "Tsy mbola misy tantara voarakitra"
          ) : (
            "Historique pas encore disponible"
          )
        ) : (
          <>
            <strong>{value ?? "—"}</strong>{" "}
            {mg ? "mpilalao samihafa" : "joueurs uniques"} ·{" "}
            {days === 1 ? "24 h" : `${days} ${mg ? "andro" : "jours"}`}
          </>
        )}
      </p>
      {data?.coverage_started_at &&
        Date.now() - Date.parse(data.coverage_started_at) < days * 86400000 && (
          <p>
            {mg
              ? "Mbola tsy feno ny tantara amin’ity vanim-potoana ity."
              : "Historique partiel pour cette période."}
          </p>
        )}
      {data?.coverage_started_at && (
        <small>
          {mg ? "Voarakitra nanomboka" : "Historique observé depuis le"}{" "}
          {new Date(data.coverage_started_at).toLocaleDateString(i18n.language)}{" "}
          ·{" "}
          {mg
            ? "Hetsika filalaovana voamarina"
            : "Participations confirmées, multijoueur humain"}
        </small>
      )}
    </section>
  );
}
