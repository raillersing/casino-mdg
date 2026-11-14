import { Compass, Plus, RefreshCw, Search, Users } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  gameName?: string;
  filtered: boolean;
  failed: boolean;
  onReset: () => void;
  onRefresh: () => void;
  onFindPlayers: () => void;
  onCreate: () => void;
}

/** No fabricated players, availability or wait times when the API returns no tables. */
export function LobbyEmptyState({
  gameName,
  filtered,
  failed,
  onReset,
  onRefresh,
  onFindPlayers,
  onCreate,
}: Props) {
  const { i18n } = useTranslation();
  const mg = i18n.language.startsWith("mg");
  const tr = (fr: string, malagasy: string) => (mg ? malagasy : fr);

  return (
    <section className="lobby-empty-v3" role={failed ? "alert" : "status"}>
      {failed ? (
        <RefreshCw size={28} aria-hidden="true" />
      ) : filtered ? (
        <Search size={28} aria-hidden="true" />
      ) : (
        <Compass size={28} aria-hidden="true" />
      )}
      <h3>
        {failed
          ? tr("Impossible de charger les tables.", "Tsy azo alaina ny latabatra.")
          : filtered
            ? tr("Aucune table pour ces filtres.", "Tsy misy latabatra mifanaraka amin'ny sivana.")
            : tr("Aucune table disponible pour le moment.", "Tsy mbola misy latabatra azo idirana.")}
      </h3>
      <p>
        {failed
          ? tr("Vérifiez votre connexion et réessayez.", "Jereo ny fifandraisana ary andramo indray.")
          : filtered
            ? tr("Retirez les filtres pour retrouver toutes les tables.", "Esory ny sivana mba hahitana ny latabatra rehetra.")
            : gameName
              ? tr(
                  `Vous pouvez chercher des adversaires pour ${gameName}, ou créer votre propre table.`,
                  `Afaka mitady mpilalao amin'ny ${gameName} ianao, na mamorona latabatra.`,
                )
              : tr(
                  "Choisissez un jeu pour chercher des adversaires ou créer une table.",
                  "Misafidiana lalao hitadiavana mpilalao na hamoronana latabatra.",
                )}
      </p>
      <div className="lobby-empty-v3-actions">
        {failed ? (
          <button type="button" className="button button-gold" onClick={onRefresh}>
            <RefreshCw size={17} aria-hidden="true" />
            {tr("Réessayer", "Andramo indray")}
          </button>
        ) : filtered ? (
          <button type="button" className="button button-gold" onClick={onReset}>
            {tr("Effacer les filtres", "Esory ny sivana")}
          </button>
        ) : (
          <>
            <button type="button" className="button button-gold" onClick={onFindPlayers}>
              <Users size={17} aria-hidden="true" />
              {tr("Trouver des joueurs", "Hitady mpilalao")}
            </button>
            <button type="button" className="button button-secondary" onClick={onCreate}>
              <Plus size={17} aria-hidden="true" />
              {tr("Créer une table", "Hamorona latabatra")}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
