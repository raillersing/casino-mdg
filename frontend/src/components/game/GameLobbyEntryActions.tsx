import { Loader2, LockKeyhole, Plus, Search, Users } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  gameName: string;
  isSearching: boolean;
  isStarting: boolean;
  waitingSeconds: number;
  isCreating: boolean;
  availableSizes?: number[];
  selectedSize?: number;
  onSizeChange?: (size: number) => void;
  onSearch: () => void;
  onCancel: () => void;
  onCreate: () => void;
  onPrivateCode: () => void;
  error?: string;
}

/**
 * Primary game-lobby actions. The matchmaking ticket and the table list
 * remain owned by LobbyPage; this component never invents availability.
 */
export function GameLobbyEntryActions({
  gameName,
  isSearching,
  isStarting,
  waitingSeconds,
  isCreating,
  availableSizes,
  selectedSize,
  onSizeChange,
  onSearch,
  onCancel,
  onCreate,
  onPrivateCode,
  error,
}: Props) {
  const { i18n } = useTranslation();
  const mg = i18n.language.startsWith("mg");
  const tr = (fr: string, malagasy: string) => (mg ? malagasy : fr);

  return (
    <section
      className="game-lobby-entry"
      aria-labelledby="game-lobby-entry-title"
    >
      <div className="game-lobby-entry-copy">
        <h2 id="game-lobby-entry-title">
          {tr("Jouer maintenant", "Hilalao izao")}
        </h2>
        <p>
          {tr(
            "Rejoignez des joueurs, ou préparez une table à votre façon.",
            "Mitadiava mpilalao na mamoròna latabatra araka izay tianao.",
          )}
        </p>
      </div>

      {availableSizes &&
        availableSizes.length > 1 &&
        !isSearching &&
        !isStarting &&
        onSizeChange && (
          <fieldset
            className="game-lobby-format"
            aria-label={tr("Format de la partie", "Isan'ny mpilalao")}
          >
            <legend>{tr("Nombre de joueurs", "Isan'ny mpilalao")}</legend>
            <div className="game-lobby-format-options">
              {availableSizes.map((size) => (
                <button
                  key={size}
                  type="button"
                  disabled={isCreating}
                  aria-pressed={selectedSize === size}
                  className={selectedSize === size ? "selected" : ""}
                  onClick={() => onSizeChange(size)}
                >
                  {size} {tr("joueurs", "mpilalao")}
                </button>
              ))}
            </div>
          </fieldset>
        )}

      {isSearching ? (
        <div className="game-lobby-searching" role="status" aria-live="polite">
          <div className="game-lobby-searching-copy">
            <Loader2 size={20} className="spin" aria-hidden="true" />
            <div>
              <strong>{tr("Recherche en cours", "Mitady mpilalao")}</strong>
              <span>
                {tr("Temps écoulé", "Fotoana lasa")}: {waitingSeconds}s
              </span>
            </div>
          </div>
          <button
            className="game-lobby-cancel"
            type="button"
            onClick={onCancel}
          >
            {tr("Annuler", "Hanafoana")}
          </button>
        </div>
      ) : (
        <button
          className="game-lobby-find"
          type="button"
          onClick={onSearch}
          disabled={isCreating || isStarting}
          aria-busy={isStarting}
          aria-label={
            isStarting
              ? tr("Lancement de la recherche…", "Manomboka ny fikarohana…")
              : tr(
                  `Trouver des joueurs pour ${gameName}`,
                  `Hitady mpilalao amin'ny ${gameName}`,
                )
          }
        >
          {isStarting ? (
            <Loader2 size={20} className="spin" aria-hidden="true" />
          ) : (
            <Search size={20} aria-hidden="true" />
          )}
          <span>
            <strong>
              {isStarting
                ? tr("Lancement de la recherche…", "Manomboka ny fikarohana…")
                : tr("Trouver des joueurs", "Hitady mpilalao")}
            </strong>
            <small>
              {tr("Matchmaking automatique", "Fampiarahana ho azy")}
            </small>
          </span>
        </button>
      )}

      <div className="game-lobby-other-actions">
        <button type="button" onClick={onCreate} disabled={isCreating}>
          {isCreating ? (
            <Loader2 className="spin" size={18} aria-hidden="true" />
          ) : (
            <Plus size={18} aria-hidden="true" />
          )}
          {tr("Créer une table", "Hamorona latabatra")}
        </button>
        <button type="button" onClick={onPrivateCode}>
          <LockKeyhole size={18} aria-hidden="true" />
          {tr("J'ai un code", "Manana kaody aho")}
        </button>
      </div>
      {error && (
        <p className="game-lobby-entry-error" role="alert">
          {error}
        </p>
      )}
      <p className="game-lobby-entry-note">
        <Users size={14} aria-hidden="true" />
        {tr(
          "La partie démarre après confirmation des participants.",
          "Hanomboka ny lalao rehefa voamarina ny mpandray anjara.",
        )}
      </p>
    </section>
  );
}
