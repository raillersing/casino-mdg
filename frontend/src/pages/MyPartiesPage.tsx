import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Clock3, RefreshCcw, ShieldCheck, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGameStore } from "@stores/gameStore";
import { getTables, type GameTable } from "@services/games";
import "../styles/playing-v2.css";

type ResumableResponse = { results: GameTable[] };

export function MyPartiesPage() {
  const { i18n } = useTranslation();
  const mg = i18n.language.startsWith("mg");
  const tr = (fr: string, malagasy: string) => (mg ? malagasy : fr);
  const token = useGameStore((state) => state.accessToken);
  const [joined, setJoined] = useState<GameTable[]>([]);
  const [verified, setVerified] = useState<GameTable[]>([]);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");
  const [resumeError, setResumeError] = useState("");

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!token) {
      setJoined([]);
      setVerified([]);
      setPending(false);
      return;
    }
    setPending(true);
    setError("");
    setResumeError("");
    const [all, active] = await Promise.allSettled([
      getTables(undefined, token),
      fetch("/api/v1/games/resumable/", {
        signal,
        headers: { Authorization: `Bearer ${token}` },
      }).then(async (response) => {
        if (!response.ok) throw new Error("RECONNECTION_UNAVAILABLE");
        return (await response.json()) as ResumableResponse;
      }),
    ]);
    if (signal?.aborted) return;
    if (all.status === "fulfilled") {
      setJoined(all.value.results.filter((table) => table.joined === true));
    } else {
      setJoined([]);
      setError(tr(
        "Impossible de charger vos tables pour le moment.",
        "Tsy azo alaina ny latabatrao amin'izao.",
      ));
    }
    if (active.status === "fulfilled") {
      setVerified(active.value.results);
    } else {
      setVerified([]);
      setResumeError(tr(
        "La vérification des parties en cours est indisponible.",
        "Tsy azo hamarinina ny lalao mbola mandeha.",
      ));
    }
    setPending(false);
  }, [token, mg]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const activeIds = new Set(verified.map((table) => table.id));
  const waiting = joined.filter((table) => !activeIds.has(table.id));

  if (!token) {
    return (
      <main className="playing-v2-page">
        <h1>{tr("Mes parties", "Ny lalaoko")}</h1>
        <p>{tr(
          "Connectez-vous pour retrouver vos tables et reprendre une partie.",
          "Midira amin'ny kaontinao hahitana ireo latabatrao.",
        )}</p>
        <Link className="playing-v2-primary" to="/auth?next=%2Fmes-parties">
          {tr("Se connecter", "Hiditra")} <ArrowRight size={18} />
        </Link>
        <Link className="playing-v2-secondary" to="/games">
          {tr("Découvrir les jeux", "Hahita lalao")}
        </Link>
      </main>
    );
  }

  return (
    <main className="playing-v2-page">
      <header className="playing-v2-header">
        <div>
          <span className="playing-v2-eyebrow">MDG GAME CLUB</span>
          <h1>{tr("Mes parties", "Ny lalaoko")}</h1>
          <p>{tr(
            "Retrouvez les tables dans lesquelles vous avez une place.",
            "Jereo ireo latabatra efa misy ny toeranao.",
          )}</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={pending}>
          <RefreshCcw size={17} aria-hidden="true" />
          {tr("Actualiser", "Havaozina")}
        </button>
      </header>

      {pending && <p role="status">{tr("Chargement…", "Miandry…")}</p>}
      {error && <p role="alert" className="playing-v2-error">{error}</p>}
      {resumeError && <p role="status" className="playing-v2-notice">{resumeError}</p>}

      {!pending && (
        <>
          <section aria-labelledby="playing-v2-live">
            <div className="playing-v2-section-head">
              <ShieldCheck size={20} aria-hidden="true" />
              <h2 id="playing-v2-live">
                {tr("Parties en cours confirmées", "Lalao mbola mandeha voamarina")}
              </h2>
            </div>
            {verified.length === 0 ? (
              <p className="playing-v2-empty">
                {tr("Aucune partie en cours confirmée.",
                    "Tsy misy lalao mandeha voamarina.")}
              </p>
            ) : (
              <div className="playing-v2-grid">
                {verified.map((table) => (
                  <article key={table.id} className="playing-v2-card">
                    <span className="playing-v2-state">
                      <ShieldCheck size={15} aria-hidden="true" />
                      {tr("Partie confirmée", "Lalao voamarina")}
                    </span>
                    <h3>{table.name}</h3>
                    <p>{table.game_type.toUpperCase()}</p>
                    <Link to={`/game/${table.game_type}/${table.table_code}?table_id=${encodeURIComponent(table.id)}`}>
                      {tr("Reprendre la partie", "Hanohy ny lalao")}
                      <ArrowRight size={18} aria-hidden="true" />
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="playing-v2-waiting">
            <div className="playing-v2-section-head">
              <Clock3 size={20} aria-hidden="true" />
              <h2 id="playing-v2-waiting">{tr("Mes autres tables", "Ny latabatro hafa")}</h2>
            </div>
            {waiting.length === 0 ? (
              <p className="playing-v2-empty">
                {tr("Vous n'avez pas d'autre table accessible.",
                    "Tsy misy latabatra hafa azo idirana.")}
              </p>
            ) : (
              <div className="playing-v2-grid">
                {waiting.map((table) => (
                  <article key={table.id} className="playing-v2-card">
                    <span className="playing-v2-state playing-v2-state-neutral">
                      <Users size={15} aria-hidden="true" />
                      {table.status === "running"
                        ? tr("État à vérifier", "Mila hamarinina")
                        : tr("En attente", "Miandry")}
                    </span>
                    <h3>{table.name}</h3>
                    <p>
                      {table.game_type.toUpperCase()} · {table.player_count}/{table.max_players}
                      {" "}{tr("places réservées", "toerana voatokana")}
                    </p>
                    <Link to={`/game/${table.game_type}/${table.table_code}?table_id=${encodeURIComponent(table.id)}`}>
                      {tr("Ouvrir la table", "Sokafy ny latabatra")}
                      <ArrowRight size={18} aria-hidden="true" />
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </section>
          <Link to="/games" className="playing-v2-secondary">
            {tr("Choisir un autre jeu", "Hifidy lalao hafa")}
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </>
      )}
    </main>
  );
}
