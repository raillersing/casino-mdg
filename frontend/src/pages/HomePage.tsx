import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bot,
  KeyRound,
  Plus,
  UsersRound,
  Gamepad2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGameStore } from "@stores/gameStore";
import "../styles/home-game-v2.css";

type ResumableGame = {
  id: string;
  table_code: string;
  game_type: string;
  name: string;
};

const FEATURED = [
  { id: "belote", name: "Belote Malagasy", players: "4 joueurs · 2 équipes", playersMg: "Mpilalao 4 · Ekipa 2" },
  { id: "ludo", name: "Ludo Mada", players: "2 à 4 joueurs", playersMg: "Mpilalao 2 ka hatramin'ny 4" },
] as const;

export function HomePage() {
  const { i18n } = useTranslation();
  const mg = i18n.language.startsWith("mg");
  const tr = (fr: string, malagasy: string) => (mg ? malagasy : fr);
  const token = useGameStore((state) => state.accessToken);
  const [resumable, setResumable] = useState<ResumableGame[]>([]);

  useEffect(() => {
    setResumable([]);
    if (!token) return;
    const controller = new AbortController();
    fetch("/api/v1/games/resumable/", {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("RESUME_UNAVAILABLE");
        return (await response.json()) as { results: ResumableGame[] };
      })
      .then((data) => {
        if (!controller.signal.aborted) setResumable(data.results || []);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [token]);

  return (
    <div className="club-home home-game-v2">
      <section className="home-game-hero" aria-labelledby="home-title">
        <img
          src="/images/games/belote-cover.webp"
          width="960"
          height="640"
          alt=""
        />
        <div className="home-game-hero-content">
          <span className="home-game-eyebrow">MDG GAME CLUB</span>
          <h1 id="home-title">
            {tr("Une partie, ensemble ?", "Andao hiara-hilalao?")}
          </h1>
          <p>
            {tr(
              "Belote, Ludo, Domino, Rami et Poker. Choisissez votre jeu, trouvez une table et amusez-vous.",
              "Beloty, Ludo, Dôminô, Ramy sy Poker. Misafidiana lalao ary mitadiava latabatra.",
            )}
          </p>
          <div className="home-game-hero-actions">
            <Link to="/games?intent=matchmaking" className="home-game-primary">
              <Gamepad2 size={19} aria-hidden="true" />
              {tr("Jouer en ligne", "Hilalao amin'ny hafa")}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link
              to="/lobby?action=join-private"
              className="home-game-secondary"
            >
              <KeyRound size={18} aria-hidden="true" />
              {tr("J'ai un code d'invitation", "Manana kaody fanasana aho")}
            </Link>
          </div>
        </div>
      </section>

      {resumable.length > 0 && (
        <section
          className="home-game-resume"
          aria-labelledby="home-resume-title"
        >
          <div className="home-game-section-heading">
            <h2 id="home-resume-title">
              {tr("Reprendre ma partie", "Hanohy ny lalaoko")}
            </h2>
            <Link to="/mes-parties">{tr("Mes parties", "Ny lalaoko")}</Link>
          </div>
          <div className="home-game-resume-list">
            {resumable.slice(0, 3).map((table) => (
              <Link
                key={table.id}
                to={`/game/${table.game_type}/${table.table_code}?table_id=${encodeURIComponent(table.id)}`}
              >
                <span>
                  <strong>{table.name}</strong>
                  <small>{table.game_type.toUpperCase()}</small>
                </span>
                <ArrowRight size={19} aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="home-intents" className="home-game-intents">
        <div className="home-game-section-heading">
          <h2 id="home-intents">
            {tr("Comment voulez-vous jouer ?", "Ahoana no tianao hilalaovana?")}
          </h2>
        </div>
        <div className="home-game-intention-list">
          <Link to="/games?intent=matchmaking" className="home-game-intent">
            <span className="home-game-intent-icon">
              <UsersRound aria-hidden="true" size={23} />
            </span>
            <span>
              <strong>
                {tr("Jouer avec d'autres", "Hilalao amin'ny hafa")}
              </strong>
              <small>
                {tr(
                  "Tables ouvertes et recherche de joueurs",
                  "Latabatra misokatra sy fitadiavana mpilalao",
                )}
              </small>
            </span>
            <ArrowRight aria-hidden="true" size={18} />
          </Link>
          <Link to="/games?intent=create" className="home-game-intent">
            <span className="home-game-intent-icon">
              <Plus aria-hidden="true" size={23} />
            </span>
            <span>
              <strong>{tr("Créer une table", "Hamorona latabatra")}</strong>
              <small>
                {tr(
                  "Inviter vos proches ou jouer en public",
                  "Hanasa namana na hilalao amin'ny rehetra",
                )}
              </small>
            </span>
            <ArrowRight aria-hidden="true" size={18} />
          </Link>
          <Link to="/games?intent=practice" className="home-game-intent">
            <span className="home-game-intent-icon">
              <Bot aria-hidden="true" size={23} />
            </span>
            <span>
              <strong>
                {tr("S'entraîner en solo", "Hanao fanazaran-tena irery")}
              </strong>
              <small>
                {tr(
                  "Parties contre des robots identifiés",
                  "Hilalao amin'ny milina",
                )}
              </small>
            </span>
            <ArrowRight aria-hidden="true" size={18} />
          </Link>
        </div>
      </section>

      <section
        aria-labelledby="home-featured-games"
        className="home-game-featured"
      >
        <div className="home-game-section-heading">
          <h2 id="home-featured-games">
            {tr("Découvrir un jeu", "Hahita lalao")}
          </h2>
          <Link to="/games">{tr("Tous les jeux", "Ny lalao rehetra")}</Link>
        </div>
        <div className="home-game-featured-list">
          {FEATURED.map((game) => (
            <Link
              key={game.id}
              to={`/lobby/${game.id}?action=matchmaking`}
              className="home-game-featured-card"
            >
              <img
                src={`/images/games/${game.id}-cover.webp`}
                width="480"
                height="320"
                loading="lazy"
                alt=""
              />
              <span>
                <strong>{game.name}</strong>
                <small>{mg ? game.playersMg : game.players}</small>
                <em>
                  {tr("Jouer maintenant", "Hilalao izao")}{" "}
                  <ArrowRight size={15} aria-hidden="true" />
                </em>
              </span>
            </Link>
          ))}
        </div>
      </section>
      <div className="home-game-footer-links">
        <Link to="/lobby">
          {tr("Trouver une table", "Hitady latabatra")} <ArrowRight size={16} />
        </Link>
        <Link to="/support">
          {tr("Besoin d'aide ?", "Mila fanampiana?")} <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}
