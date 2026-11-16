import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Search, Users, Bot, Zap, Loader2 } from "lucide-react";
import { useGameStore } from "@stores/gameStore";
import { startBotSimulation } from "@services/games";
import { createGuestToken } from "@services/auth";

const games = [
  {
    id: "belote",
    name: "Belote Malagasy",
    symbol: "♥",
    kind: "cards",
    players: "4 joueurs · En équipe",
    description: "Remportez les plis avec votre partenaire.",
    color: "rose",
  },
  {
    id: "domino",
    name: "Domino Double-Six",
    symbol: "⚅",
    kind: "board",
    players: "2 à 4 joueurs",
    description: "Associez vos dominos et videz votre main.",
    color: "amber",
  },
  {
    id: "ludo",
    name: "Ludo Mada",
    symbol: "⚄",
    kind: "board",
    players: "2 à 4 joueurs",
    description: "Ramenez vos quatre pions à la maison.",
    color: "green",
  },
  {
    id: "rami",
    name: "Rami Malagasy",
    symbol: "♦",
    kind: "cards",
    players: "2 à 4 joueurs",
    description: "Formez des suites et des groupes de cartes.",
    color: "blue",
  },
  {
    id: "poker",
    name: "Poker Texas Hold’em",
    symbol: "♠",
    kind: "cards",
    players: "2 à 9 joueurs",
    description: "Composez votre meilleure main à cinq cartes.",
    color: "gold",
  },
] as const;

type CatalogGame = (typeof games)[number];

function CatalogGameCard({
  game,
  actionLabel,
}: {
  game: CatalogGame;
  actionLabel: string;
}) {
  return (
    <>
      <div className="discovery-art" aria-hidden="true">
        <img
          src={`/images/games/${game.id}-cover.webp`}
          alt=""
          loading={game.id === "belote" ? "eager" : "lazy"}
          decoding="async"
          width={960}
          height={640}
        />
      </div>
      <div className="discovery-card-copy">
        <span className="discovery-players">{game.players}</span>
        <h3>{game.name}</h3>
        <p>{game.description}</p>
        <span className="discovery-card-action">
          {actionLabel} <ArrowRight size={17} aria-hidden="true" />
        </span>
      </div>
    </>
  );
}

export function GamesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const intent = searchParams.get("intent");
  const isCreating = intent === "create";
  const isPracticing = intent === "practice";
  const isMatching = intent === "matchmaking";
  const { i18n } = useTranslation();
  const mg = i18n.language.startsWith("mg");
  const token = useGameStore((state) => state.accessToken);
  const setSession = useGameStore((state) => state.setSession);
  const setGuestMode = useGameStore((state) => state.setGuestMode);

  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [launchingGame, setLaunchingGame] = useState<string | null>(null);

  const handleSoloPlay = async (
    gameId: "belote" | "domino" | "ludo" | "rami" | "poker",
  ) => {
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
      const idempotencyKey = `catalog-solo-${gameId}-${Date.now()}`;
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

  const visible = games.filter(
    (game) =>
      (category === "all" || category === game.kind) &&
      game.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );

  return (
    <div className="discovery-page">
      <header className="discovery-heading">
        <span className="eyebrow">MDG GAME CLUB</span>
        <h1>
          {isCreating
            ? mg
              ? "Hamorona latabatra ho an'ny lalao iza?"
              : "Pour quel jeu créer une table ?"
            : isPracticing
              ? mg
                ? "Iza no lalao hianaranao?"
                : "À quel jeu voulez-vous vous entraîner ?"
              : isMatching
                ? mg
                  ? "Inona no lalao tianao hiarahana milalao?"
                  : "À quel jeu voulez-vous jouer en ligne ?"
                : t("discovery.catalogTitle")}
        </h1>
        <p>
          {isCreating
            ? mg
              ? "Misafidiana lalao, dia amboary ny isan'ny mpilalao."
              : "Choisissez un jeu puis personnalisez votre table."
            : isPracticing
              ? mg
                ? "Misafidiana lalao hianarana miaraka amin'ny milina."
                : "Choisissez un jeu pour vous entraîner avec des robots identifiés."
              : isMatching
                ? mg
                  ? "Misafidiana lalao. Hanomboka avy hatrany ny fitadiavana mpilalao."
                  : "Choisissez un jeu pour lancer la recherche de joueurs."
                : t("discovery.intro")}
        </p>
      </header>

      <section aria-labelledby="catalog-title">
        <div className="discovery-section-head">
          <h2 id="catalog-title">{t("discovery.allGames")}</h2>
          <span>{t("discovery.count")}</span>
        </div>

        <div className="discovery-tools">
          <label className="discovery-search">
            <Search size={18} />
            <input
              aria-label={t("discovery.search")}
              placeholder={t("discovery.search")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div
            className="discovery-filters"
            aria-label={t("discovery.categories")}
          >
            {[
              ["all", t("discovery.all")],
              ["cards", t("discovery.cards")],
              ["board", t("discovery.board")],
            ].map(([value, label]) => (
              <button
                key={value}
                aria-pressed={category === value}
                onClick={() => setCategory(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="discovery-grid">
          {visible.map((game) => {
            const isLaunching = launchingGame === game.id;
            return (
              <div key={game.id} className="discovery-game">
                {isPracticing ? (
                  <button
                    type="button"
                    className={`discovery-card discovery-${game.color} discovery-card-button`}
                    onClick={() => void handleSoloPlay(game.id)}
                    disabled={isLaunching}
                  >
                    <CatalogGameCard
                      game={game}
                      actionLabel={
                        mg
                          ? "Hanomboka fanazaran-tena"
                          : "Lancer l'entraînement"
                      }
                    />
                  </button>
                ) : (
                  <Link
                    to={
                      isCreating
                        ? `/lobby/${game.id}?action=create`
                        : isMatching
                          ? `/lobby/${game.id}?action=matchmaking`
                          : `/lobby/${game.id}`
                    }
                    className={`discovery-card discovery-${game.color}`}
                  >
                    <CatalogGameCard
                      game={game}
                      actionLabel={
                        isCreating
                          ? mg
                            ? "Hamorona latabatra"
                            : "Créer une table"
                          : isMatching
                            ? mg
                              ? "Hitady mpilalao"
                              : "Trouver des joueurs"
                            : mg
                              ? "Hijery latabatra"
                              : "Voir les tables"
                      }
                    />
                  </Link>
                )}

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
                    to={
                      isMatching
                        ? `/lobby/${game.id}`
                        : `/lobby/${game.id}?action=matchmaking`
                    }
                    className="button button-gold button-small"
                    style={{
                      justifyContent: "center",
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    <Zap size={14} />{" "}
                    {isMatching
                      ? mg
                        ? "Hijery latabatra"
                        : "Voir les tables"
                      : mg
                        ? "Hilalao amin'ny hafa"
                        : "Jouer en ligne"}
                  </Link>

                  {isPracticing ? (
                    <Link
                      to={`/lobby/${game.id}`}
                      className="button button-secondary button-small"
                      style={{ justifyContent: "center", fontWeight: 600 }}
                    >
                      {mg ? "Hijery latabatra" : "Voir les tables"}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      disabled={isLaunching}
                      onClick={() => void handleSoloPlay(game.id)}
                      style={{ justifyContent: "center", fontWeight: 600 }}
                    >
                      {isLaunching ? (
                        <>
                          <Loader2 size={14} className="spin" /> Lancement...
                        </>
                      ) : (
                        <>
                          <Bot size={14} /> Solo vs IA
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {visible.length === 0 && (
          <div className="empty-note" role="status">
            <p>{t("discovery.none")}</p>
            <button
              className="button button-secondary"
              onClick={() => {
                setQuery("");
                setCategory("all");
              }}
            >
              {t("discovery.reset")}
            </button>
          </div>
        )}
      </section>

      <aside className="discovery-online" aria-label="Jouer à plusieurs">
        <div>
          <Users size={24} />
          <div>
            <h2>{t("discovery.onlineTitle")}</h2>
            <p>{t("discovery.onlineDesc")}</p>
          </div>
        </div>
        <Link to="/lobby" className="button button-secondary">
          {t("discovery.online")} <ArrowRight size={17} />
        </Link>
      </aside>

      <p className="discovery-help">{t("discovery.help")}</p>
    </div>
  );
}
