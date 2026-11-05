import { GameActivitySummary } from "@components/game/GameActivitySummary";
import { UniquePlayerStats } from "@components/game/UniquePlayerStats";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Link } from "react-router-dom";
import { ArrowRight, Search, Users } from "lucide-react";

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
];

export function GamesPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const visible = games.filter(
    (game) =>
      (category === "all" || category === game.kind) &&
      game.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <div className="discovery-page">
      <header className="discovery-heading">
        <span className="eyebrow">MDG GAME CLUB</span>
        <h1>{t("discovery.catalogTitle")}</h1>
        <p>{t("discovery.intro")}</p>
      </header>
      <section aria-labelledby="catalog-title">
        <div className="discovery-section-head">
          <h2 id="catalog-title">{t("discovery.allGames")}</h2>
          <span>{t("discovery.count")}</span>
        </div>
        {
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
        }
        <div className="discovery-grid">
          {visible.map((game) => (
            <div key={game.id} className="discovery-game">
              <Link
                to={`/play/${game.id}${params.get("intent") === "practice" ? "?intent=practice" : ""}`}
                key={game.id}
                className={`discovery-card discovery-${game.color}`}
              >
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
                    {t("discovery.chooseGame")} <ArrowRight size={17} />
                  </span>
                </div>
              </Link>
              <div className="discovery-game-stats">
                <GameActivitySummary gameType={game.id} compact />
                <UniquePlayerStats gameType={game.id} compact />
              </div>
            </div>
          ))}
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
