import { useEffect, useState } from "react";
import { useGameStore } from "@stores/gameStore";
import { Link, useNavigate } from "react-router-dom";
import { LiveStatsTicker } from "@components/game/LiveStatsTicker";
import {
  ArrowRight,
  Users,
  Bot,
  Compass,
  KeyRound,
  Zap,
  Loader2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { startBotSimulation } from "@services/games";
import { createGuestToken } from "@services/auth";

interface GameDef {
  id: "belote" | "domino" | "ludo" | "rami" | "poker";
  name: string;
  players: string;
  desc: string;
  kind: "cards" | "board";
  color: string;
}

const FEATURED_GAMES: GameDef[] = [
  {
    id: "belote",
    name: "Belote Malagasy",
    players: "4 joueurs · En équipe",
    desc: "Remportez les plis avec votre partenaire. Atouts et annonces traditionnelles.",
    kind: "cards",
    color: "rose",
  },
  {
    id: "domino",
    name: "Domino Double-Six",
    players: "2 à 4 joueurs",
    desc: "Associez vos dominos et videz votre main avant vos adversaires.",
    kind: "board",
    color: "amber",
  },
  {
    id: "ludo",
    name: "Ludo Mada",
    players: "2 à 4 joueurs",
    desc: "Sortez sur un 6 et ramenez vos quatre pions à la maison centrale.",
    kind: "board",
    color: "green",
  },
  {
    id: "rami",
    name: "Rami Malagasy",
    players: "2 à 4 joueurs",
    desc: "Formez des tierces, suites et combinaisons de cartes pour poser votre jeu.",
    kind: "cards",
    color: "blue",
  },
  {
    id: "poker",
    name: "Poker Texas Hold’em",
    players: "2 à 9 joueurs",
    desc: "Composez votre meilleure main à 5 cartes et remportez le pot en Ariary.",
    kind: "cards",
    color: "gold",
  },
];

export function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const token = useGameStore((state) => state.accessToken);
  const setSession = useGameStore((state) => state.setSession);
  const setGuestMode = useGameStore((state) => state.setGuestMode);

  const [resumable, setResumable] = useState<
    Array<{ id: string; table_code: string; game_type: string; name: string }>
  >([]);
  const [launchingGame, setLaunchingGame] = useState<string | null>(null);

  useEffect(() => {
    setResumable([]);
    if (!token) return;
    const controller = new AbortController();
    fetch("/api/v1/games/resumable/", {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((data) => setResumable(data.results || []))
      .catch(() => undefined);
    return () => controller.abort();
  }, [token]);

  const handleSoloPlay = async (gameId: "belote" | "domino" | "ludo" | "rami" | "poker") => {
    setLaunchingGame(gameId);
    try {
      let currentToken = token;
      if (!currentToken) {
        const guest = await createGuestToken("Invité");
        setSession(guest.access, guest.refresh);
        setGuestMode(guest.user.display_name, guest.wallet.balance);
        currentToken = guest.access;
      }
      const botCount = gameId === "rami" ? 1 : 3;
      const idempotencyKey = `home-solo-${gameId}-${Date.now()}`;
      const session = await startBotSimulation(
        currentToken,
        gameId,
        "balanced",
        idempotencyKey,
        botCount,
      );
      navigate(
        `/game/${session.game_type}/${session.table_code}?mode=demo_ai&session=${session.session_id}&table_id=${session.table_id}${session.admission_token ? `&admission_token=${session.admission_token}` : ""}`,
      );
    } catch (err) {
      console.error("Solo launch failed", err);
      navigate(`/lobby/${gameId}`);
    } finally {
      setLaunchingGame(null);
    }
  };

  const actions = [
    { key: "online", icon: Compass, to: "/lobby" },
    { key: "friends", icon: Users, to: "/lobby?action=create" },
    { key: "practice", icon: Bot, to: "/games?intent=practice" },
  ];

  return (
    <div className="club-home">
      {/* 1. Hero */}
      <section className="club-home-hero" aria-labelledby="home-title">
        <img
          src="/images/games/belote-cover.webp"
          alt=""
          width="960"
          height="640"
        />
        <div className="club-home-hero-copy">
          <span className="eyebrow">MDG GAME CLUB</span>
          <h1 id="home-title">{t("welcome.title") || "Une partie, ensemble ?"}</h1>
          <p>{t("welcome.intro") || "Vos classiques malagasy, à partager entre proches ou avec de nouveaux partenaires."}</p>
          <div className="club-home-actions">
            <Link className="button button-gold" to="/games">
              {t("welcome.choose") || "Choisir un jeu"} <ArrowRight size={18} />
            </Link>
            <Link
              className="button button-secondary"
              to="/lobby?action=join-private"
            >
              <KeyRound size={17} />
              {t("welcome.join") || "J’ai un code privé"}
            </Link>
          </div>
        </div>
      </section>

      {/* 2. Reprendre ma partie si active */}
      {resumable.length > 0 && (
        <section aria-label={t("welcome.resume") || "Reprendre une partie"}>
          <h2>{t("welcome.resume") || "Reprendre une partie"}</h2>
          {resumable.map((table) => (
            <Link
              className="button button-gold"
              key={table.id}
              to={`/game/${table.game_type}/${table.table_code}`}
              style={{ margin: "4px" }}
            >
              {table.name} <ArrowRight size={16} />
            </Link>
          ))}
        </section>
      )}

      {/* Live Activity Ticker */}
      <LiveStatsTicker />

      {/* 3. Les 5 Jeux Phares - Grille Directe & Jouable en 1-Clic */}
      <section aria-labelledby="home-featured-games" style={{ marginTop: "24px" }}>
        <div className="discovery-section-head">
          <div>
            <span className="eyebrow">5 Classiques Malagasy</span>
            <h2 id="home-featured-games">Choisissez votre jeu & jouez</h2>
          </div>
          <Link to="/games" className="text-link">
            {t("discovery.allGames") || "Tous les jeux"} <ArrowRight size={16} />
          </Link>
        </div>

        <div className="discovery-grid" style={{ marginTop: "16px" }}>
          {FEATURED_GAMES.map((game) => {
            const isLaunching = launchingGame === game.id;
            return (
              <div key={game.id} className="discovery-game">
                <div className={`discovery-card discovery-${game.color}`}>
                  <div className="discovery-art" aria-hidden="true">
                    <img
                      src={`/images/games/${game.id}-cover.webp`}
                      alt=""
                      loading="lazy"
                      width={960}
                      height={640}
                    />
                  </div>
                  <div className="discovery-card-copy">
                    <span className="discovery-players">{game.players}</span>
                    <h3>{game.name}</h3>
                    <p>{game.desc}</p>
                  </div>
                </div>

                {/* 2 Actions Directes en 1 clic */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "8px",
                    marginTop: "8px",
                    padding: "0 4px",
                  }}
                >
                  <Link
                    to={`/lobby/${game.id}`}
                    className="button button-gold button-small"
                    style={{
                      justifyContent: "center",
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    <Zap size={15} /> Voir les tables
                  </Link>

                  <button
                    type="button"
                    className="button button-secondary button-small"
                    disabled={isLaunching}
                    onClick={() => handleSoloPlay(game.id)}
                    style={{ justifyContent: "center", fontWeight: 600 }}
                  >
                    {isLaunching ? (
                      <>
                        <Loader2 size={15} className="spin" /> Lancement...
                      </>
                    ) : (
                      <>
                        <Bot size={15} /> Solo vs IA
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. Comment voulez-vous jouer ? (3 intentions) */}
      <section aria-labelledby="home-intents" style={{ marginTop: "32px" }}>
        <h2 id="home-intents">{t("welcome.how") || "Comment voulez-vous jouer ?"}</h2>
        <div className="club-home-intents">
          {actions.map(({ key, icon: Icon, to }) => (
            <Link to={to} key={key}>
              <Icon size={25} />
              <h3>{t(`welcome.${key}`)}</h3>
              <p>{t(`welcome.${key}Desc`)}</p>
              <ArrowRight size={18} />
            </Link>
          ))}
        </div>
      </section>

      {/* 5. Aide / Support */}
      <aside className="club-home-help" aria-label={t("welcome.helpTitle") || "Une première partie ?"}>
        <h2>{t("welcome.helpTitle") || "Une première partie ?"}</h2>
        <p>{t("welcome.help") || "Choisissez un jeu, découvrez ses règles, puis entraînez-vous ou invitez vos proches."}</p>
        <Link to="/support" className="text-link">
          {t("welcome.support") || "Besoin d’aide ?"} <ArrowRight size={16} />
        </Link>
      </aside>
    </div>
  );
}
