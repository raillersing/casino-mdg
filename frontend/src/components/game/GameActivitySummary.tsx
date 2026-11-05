import { useTranslation } from "react-i18next";
import { useLiveStats } from "@hooks/useLiveStats";

export function GameActivitySummary({
  gameType,
  compact = false,
}: {
  gameType: string;
  compact?: boolean;
}) {
  const { i18n } = useTranslation();
  const mg = i18n.language.startsWith("mg");
  const { data, isError } = useLiveStats();
  const game = data?.games[gameType];

  if (isError || !game)
    return (
      <p className="game-activity-summary game-activity-dim">
        <span className="live-status-dot offline" />
        {isError
          ? mg
            ? "Tsy misy hetsika azo alaina"
            : "Activité indisponible"
          : mg
            ? "Miandry…"
            : "Chargement de l’activité…"}
      </p>
    );

  const isLive = Boolean(game.in_game_players && game.in_game_players > 0);

  return (
    <p className="game-activity-summary">
      <span className={`live-status-dot ${isLive ? "active-pulse" : ""}`} />
      <span className="activity-item">
        <strong>{game.in_game_players ?? "—"}</strong>{" "}
        {mg ? "milalao" : "en partie"}
      </span>
      <span className="activity-sep">·</span>
      <span className="activity-item">
        <strong>{game.running_tables}</strong>{" "}
        {mg
          ? "latabatra mandeha"
          : compact
            ? "tables en cours"
            : "tables publiques en cours"}
      </span>
      {!compact && (
        <>
          <span className="activity-sep">·</span>
          <span className="activity-item">
            <strong>{game.open_tables}</strong>{" "}
            {mg ? "latabatra miandry" : "tables en attente"}
          </span>
        </>
      )}
    </p>
  );
}
