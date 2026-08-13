import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ChevronRight,
  Clock3,
  Dices,
  Flame,
  Plus,
  ShieldCheck,
  Sparkles,
  Ticket,
  LifeBuoy,
  UsersRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { trackEvent } from "@services/analytics";

const games = [
  {
    id: "poker",
    name: "home.games.poker.name",
    meta: "home.games.poker.meta",
    className: "game-poker",
    icon: "♠",
    players: "home.games.poker.players",
  },
  {
    id: "belote",
    name: "home.games.belote.name",
    meta: "home.games.belote.meta",
    className: "game-belote",
    icon: "♥",
    players: "home.games.belote.players",
  },
  {
    id: "rami",
    name: "home.games.rami.name",
    meta: "home.games.rami.meta",
    className: "game-rami",
    icon: "♦",
    players: "home.games.rami.players",
  },
];

export function HomePage() {
  const { t } = useTranslation();
  useEffect(() => {
    void trackEvent("activation_viewed", { metadata: { source: "home" } });
  }, []);
  return (
    <div className="page-stack home-page">
      <section className="hero-panel">
        <div className="hero-copy">
          <span className="eyebrow gold">
            <Sparkles size={13} /> {t("home.club")}
          </span>
          <h1>
            {t("home.title")}
            <br />
            <em>{t("home.titleAccent")}</em>
          </h1>
          <p>{t("home.intro")}</p>
          <div className="hero-actions">
            <Link to="/lobby" className="button button-gold">
              {t("home.enterLobby")} <ArrowUpRight size={17} />
            </Link>
            <Link to="/auth" className="quiet-link">
              {t("home.createAccount")} <ChevronRight size={15} />
            </Link>
          </div>
        </div>
        <div className="hero-orbit">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="hero-card card-back">♠</div>
          <div className="hero-card card-front">
            <span>A</span>
            <strong>♥</strong>
          </div>
          <div className="hero-chip">
            MDG
            <br />
            <small>10K</small>
          </div>
        </div>
        <div className="hero-stats">
          <div>
            <strong>SIM</strong>
            <span>{t("home.activePlayers")}</span>
          </div>
          <div>
            <strong>04</strong>
            <span>{t("home.availableGames")}</span>
          </div>
          <div>
            <strong>24/7</strong>
            <span>{t("home.openTables")}</span>
          </div>
        </div>
      </section>
      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{t("home.featured")}</span>
            <h2>{t("home.chooseTable")}</h2>
          </div>
          <Link to="/lobby" className="text-link">
            {t("home.viewAll")} <ChevronRight size={15} />
          </Link>
        </div>
        <div className="game-grid">
          {games.map((game) => (
            <Link
              to={`/game/${game.id}/table-01`}
              className={`game-card ${game.className}`}
              key={game.id}
            >
              <div className="game-card-top">
                <span className="game-icon">{game.icon}</span>
                <span className="live-pill">
                  <i />
                  {t(game.players)}
                </span>
              </div>
              <div className="game-card-bottom">
                <div>
                  <h3>{t(game.name)}</h3>
                  <p>{t(game.meta)}</p>
                </div>
                <span className="circle-arrow">
                  <ArrowUpRight size={17} />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <section className="quick-games-promo">
        <div className="quick-games-copy">
          <span className="eyebrow gold">
            <Sparkles size={13} /> {t("home.quickGames.eyebrow")}
          </span>
          <h2>{t("home.quickGames.title")}</h2>
          <p>{t("home.quickGames.body")}</p>
          <div className="quick-games-tags">
            <span>
              <Dices size={14} /> {t("home.quickGames.instant")}
            </span>
            <span>
              <Ticket size={14} /> {t("home.quickGames.draws")}
            </span>
            <span>
              <ShieldCheck size={14} /> {t("home.quickGames.simOnly")}
            </span>
          </div>
        </div>
        <Link
          to="/games/test"
          className="button button-gold"
          onClick={() =>
            void trackEvent("test_games_opened", {
              metadata: { source: "home" },
            })
          }
        >
          {t("home.quickGames.cta")} <ArrowUpRight size={16} />
        </Link>
      </section>
      <section className="section-block discover-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{t("home.discover.eyebrow")}</span>
            <h2>{t("home.discover.title")}</h2>
            <p className="section-lede">{t("home.discover.body")}</p>
          </div>
        </div>
        <div className="game-grid discover-grid">
          <Link to="/lobby" className="game-card discover-card">
            <div className="game-card-top"><span className="game-icon">♠</span></div>
            <div className="game-card-bottom"><div><h3>{t("home.discover.playTitle")}</h3><p>{t("home.discover.playBody")}</p></div><ArrowUpRight size={17} /></div>
          </Link>
          <Link to="/games/test" className="game-card discover-card">
            <div className="game-card-top"><span className="game-icon"><Dices size={24} /></span></div>
            <div className="game-card-bottom"><div><h3>{t("home.discover.chanceTitle")}</h3><p>{t("home.discover.chanceBody")}</p></div><ArrowUpRight size={17} /></div>
          </Link>
          <Link to="/clubs" className="game-card discover-card">
            <div className="game-card-top"><span className="game-icon"><UsersRound size={24} /></span></div>
            <div className="game-card-bottom"><div><h3>{t("home.discover.clubTitle")}</h3><p>{t("home.discover.clubBody")}</p></div><ArrowUpRight size={17} /></div>
          </Link>
          <Link to="/support" className="game-card discover-card">
            <div className="game-card-top"><span className="game-icon"><LifeBuoy size={24} /></span></div>
            <div className="game-card-bottom"><div><h3>{t("home.discover.supportTitle")}</h3><p>{t("home.discover.supportBody")}</p></div><ArrowUpRight size={17} /></div>
          </Link>
        </div>
      </section>
      <section className="lower-grid">
        <div className="resume-card">
          <div className="section-heading compact">
            <div>
              <span className="eyebrow">{t("home.activity")}</span>
              <h2>{t("home.resume")}</h2>
            </div>
            <Clock3 size={19} />
          </div>
          <div className="resume-row">
            <div className="mini-table mini-poker">
              <span>♠</span>
            </div>
            <div className="resume-info">
              <strong>Table Émeraude</strong>
              <span>{t("home.resumeMeta")}</span>
              <div className="progress">
                <i style={{ width: "68%" }} />
              </div>
              <small>{t("home.resumePlayers")}</small>
            </div>
            <Link to="/game/poker/emerald-01" className="button button-small">
              {t("games.join")}
            </Link>
          </div>
        </div>
        <div className="spotlight-card">
          <div>
            <span className="eyebrow gold">
              <Flame size={13} /> {t("home.tonight")}
            </span>
            <h2>
              {t("home.tournament")}
              <br />
              <em>{t("home.tournamentAccent")}</em>
            </h2>
            <p>{t("home.tournamentMeta")}</p>
          </div>
          <div className="trophy">♛</div>
          <Link
            to="/lobby"
            className="round-action"
            aria-label="Ouvrir le lobby"
          >
            <Plus size={18} />
          </Link>
        </div>
      </section>
    </div>
  );
}
