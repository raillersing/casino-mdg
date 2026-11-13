import { ArrowRight, Loader2, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { GameTable } from "../../services/games";

interface Props {
  table: GameTable;
  isJoining: boolean;
  onJoin: () => void;
}

/** A seat reservation is not proof that a player is connected. */
export function TableAvailabilityCard({ table, isJoining, onJoin }: Props) {
  const { i18n } = useTranslation();
  const mg = i18n.language.startsWith("mg");
  const tr = (fr: string, malagasy: string) => (mg ? malagasy : fr);
  const reserved = Math.max(0, table.player_count ?? 0);
  const capacity = Math.max(1, table.max_players);
  const free = Math.max(0, capacity - reserved);
  const alreadyJoined = table.joined === true;
  const isFull = free === 0;
  const canJoin = table.status !== "finished" && (alreadyJoined || !isFull);

  return (
    <article className="game-lobby-table-card">
      <div className="game-lobby-table-top">
        <div className="game-lobby-table-name">
          <h3>{table.name}</h3>
          <span className="game-lobby-seat-count">
            <Users size={15} aria-hidden="true" />
            {reserved}/{capacity} {tr("places réservées", "toerana voatokana")}
          </span>
        </div>
        <span className="game-lobby-table-status">
          {table.status === "running"
            ? tr("En cours", "Efa mandeha")
            : tr("En attente", "Miandry")}
        </span>
      </div>

      <div className="game-lobby-table-details">
        <span>
          {alreadyJoined
            ? tr("Vous avez une place", "Manana toerana ianao")
            : isFull
              ? tr("Complet", "Feno")
              : `${free} ${tr("place(s) libre(s)", "toerana malalaka")}`}
        </span>
        <span>
          {table.stake_amount && table.stake_amount > 0
            ? `${tr("Minimum", "Farafahakeliny")} : ${table.stake_amount.toLocaleString("fr-FR")} Ar`
            : tr("Sans mise", "Tsy misy vola ampidirina")}
        </span>
        {typeof table.turn_duration === "number" && (
          <span>
            {table.turn_duration}s / {tr("tour", "fihodinana")}
          </span>
        )}
      </div>

      <button
        className="game-lobby-table-join"
        type="button"
        onClick={onJoin}
        disabled={!canJoin || isJoining}
        aria-label={
          alreadyJoined
            ? tr(`Reprendre ${table.name}`, `Hiverina amin'ny ${table.name}`)
            : tr(`Rejoindre ${table.name}`, `Hiditra amin'ny ${table.name}`)
        }
      >
        {isJoining ? (
          <Loader2 size={17} className="spin" aria-hidden="true" />
        ) : (
          <ArrowRight size={17} aria-hidden="true" />
        )}
        {isJoining
          ? tr("Connexion…", "Miditra…")
          : alreadyJoined
            ? tr("Reprendre la partie", "Hanohy ny lalao")
            : isFull
              ? tr("Table complète", "Feno ny latabatra")
              : tr("Rejoindre la table", "Hiditra amin'ny latabatra")}
      </button>
    </article>
  );
}
