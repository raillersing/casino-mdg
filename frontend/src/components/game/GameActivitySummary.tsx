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
      <p className="game-activity-summary">
        {isError
          ? mg
            ? "Tsy misy hetsika azo alaina"
            : "Activité indisponible"
          : mg
            ? "Miandry…"
            : "Chargement de l’activité…"}
      </p>
    );
  return (
    <p className="game-activity-summary">
      <strong>{game.in_game_players ?? "—"}</strong>{" "}
      {mg ? "milalao" : "en partie"}
      {" · "}
      <strong>{game.running_tables}</strong>{" "}
      {mg
        ? "latabatra mandeha"
        : compact
          ? "tables en cours"
          : "tables publiques en cours"}
      {!compact && (
        <>
          {" "}
          · <strong>{game.open_tables}</strong>{" "}
          {mg ? "latabatra miandry" : "tables en attente"}
        </>
      )}
    </p>
  );
}
