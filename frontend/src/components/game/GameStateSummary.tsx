import { useTranslation } from "react-i18next";

export function GameStateSummary({
  gameType,
  state,
}: {
  gameType: string;
  state: Record<string, unknown>;
}) {
  const { t } = useTranslation();
  const players = Array.isArray(state.players) ? state.players : [];
  if (gameType === "belote") {
    const phase = String(state.phase || "playing");
    const points = Array.isArray(state.team_points)
      ? state.team_points
      : [0, 0];
    const suits = ["♣", "♦", "♥", "♠"];
    const trumpNum = Number(state.trump ?? -1);
    const trumpLabel = trumpNum >= 0 && trumpNum < 4 ? suits[trumpNum] : "—";
    const proposedTrumpNum = Number(state.proposed_trump ?? -1);
    const proposedTrumpLabel =
      proposedTrumpNum >= 0 && proposedTrumpNum < 4
        ? suits[proposedTrumpNum]
        : "—";
    if (phase === "bidding") {
      const bidder = Number(state.bidder ?? -1);
      const bidderName =
        bidder >= 0 && Array.isArray(state.players)
          ? String(
              (state.players as Array<Record<string, unknown>>)[bidder]?.name ||
                "",
            )
          : "";
      return (
        <div className="secure-note game-sync-note">
          <strong>{t("games.belote")}</strong> · {t("game.bidding")} ·{" "}
          {t("game.proposedTrump")} :{" "}
          <span className="belote-trump">{proposedTrumpLabel}</span>
          {bidderName ? ` · ${t("game.bidder")} : ${bidderName}` : ""}
        </div>
      );
    }
    if (phase === "all_passed") {
      return (
        <div className="secure-note game-sync-note">
          <strong>{t("games.belote")}</strong> · {t("game.allPassed")} —{" "}
          {t("game.redeal")}
        </div>
      );
    }
    return (
      <div className="secure-note game-sync-note">
        <strong>{t("games.belote")}</strong> · {t("game.trump")} :{" "}
        <span className="belote-trump">{trumpLabel}</span> · {t("game.team")} 1
        : {String(points[0])} · {t("game.team")} 2 : {String(points[1])} ·{" "}
        {t("game.trick")} :{" "}
        {Array.isArray(state.trick) ? state.trick.length : 0}/4
      </div>
    );
  }
  if (gameType === "ludo") {
    const activePlayerIndex = Number(state.current ?? 0);
    const lastRoll = Number(state.last_roll ?? 0);
    return (
      <div className="secure-note game-sync-note">
        <strong>🎲 Ludo Malagasy</strong> · Tour : Joueur{" "}
        {activePlayerIndex + 1}
        {lastRoll > 0 ? ` · Dé : ${lastRoll}` : ""} · Joueurs : {players.length}
      </div>
    );
  }
  if (gameType === "domino") {
    const left = Number(state.left_end ?? -1);
    const right = Number(state.right_end ?? -1);
    const boneyardCount = Number(state.boneyard_count ?? 0);
    return (
      <div className="secure-note game-sync-note">
        <strong>🁓 Domino Double-Six</strong> · Ligne : [{left >= 0 ? left : "—"}{" "}
        | {right >= 0 ? right : "—"}] · Talon restant : {boneyardCount} ·
        Joueurs : {players.length}
      </div>
    );
  }
  return (
    <div className="secure-note game-sync-note">
      <strong>{t("games.rami")}</strong> · {t("game.activePlayer")} :{" "}
      {String(state.current ?? "—")} ·{t("game.discard")} :{" "}
      {Array.isArray(state.discard) ? state.discard.length : 0} ·
      {t("lobby.players")} : {players.length}
      {Number(state.knocked_by ?? -1) >= 0 && (
        <>
          {" "}
          · {t("game.knock")}
          {state.gin ? ` (${t("game.gin")})` : ""}
        </>
      )}
    </div>
  );
}
