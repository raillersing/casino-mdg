import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Bot,
  ChevronRight,
  Gamepad2,
  Play,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { trackEvent } from "@services/analytics";
import { useGameStore } from "@stores/gameStore";
import { startBotSimulation } from "@services/games";
import { createGuestToken } from "@services/auth";

const games = [
  {
    id: "poker",
    name: "home.games.poker.name",
    meta: "home.games.poker.meta",
    icon: "♠",
    accent: "#d3b06b",
    players: "2 – 9",
  },
  {
    id: "belote",
    name: "home.games.belote.name",
    meta: "home.games.belote.meta",
    icon: "♥",
    accent: "#e57373",
    players: "4",
  },
  {
    id: "rami",
    name: "home.games.rami.name",
    meta: "home.games.rami.meta",
    icon: "♦",
    accent: "#64b5f6",
    players: "2 – 4",
  },
];

export function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isGuest = useGameStore((state) => state.isGuest);
  const accessToken = useGameStore((state) => state.accessToken);
  const guestName = useGameStore((state) => state.guestName);
  const setGuestMode = useGameStore((state) => state.setGuestMode);
  const setSession = useGameStore((state) => state.setSession);
  const [startingDemo, setStartingDemo] = useState<string | null>(null);
  const [demoError, setDemoError] = useState("");
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [guestInput, setGuestInput] = useState("");
  const [pendingGameId, setPendingGameId] = useState<string | null>(null);

  useEffect(() => {
    void trackEvent("activation_viewed", { metadata: { source: "home" } });
  }, []);

  const handleGuestSubmit = async () => {
    const name = guestInput.trim() || "Invité";
    setGuestMode(name, 10000);
    setShowGuestModal(false);
    // Retry the demo launch
    if (pendingGameId) {
      await launchDemo(pendingGameId);
      setPendingGameId(null);
    }
  };

  const launchDemo = async (gameId: string) => {
    setDemoError("");
    if (!accessToken && !isGuest) {
      setShowGuestModal(true);
      setPendingGameId(gameId);
      return;
    }
    setStartingDemo(gameId);
    let token = accessToken;
    if (!token && isGuest) {
      try {
        const auth = await createGuestToken(guestName || "Invité");
        setSession(auth.access, auth.refresh);
        setGuestMode(auth.user.display_name, auth.wallet.balance);
        token = auth.access;
      } catch {
        // fallback: try with local guest mode anyway
      }
    }
    if (!token) {
      setDemoError(t("app.error"));
      setStartingDemo(null);
      return;
    }
    const idempotencyKey = `home-${gameId}-${Date.now()}`;
    try {
      const session = await startBotSimulation(
        token,
        gameId as "poker" | "belote" | "rami",
        "balanced",
        idempotencyKey,
      );
      void trackEvent("bot_simulation_started", {
        mode: "demo",
        game_type: gameId,
        metadata: { source: "home_card" },
      });
      navigate(
        `/game/${session.game_type}/${session.table_code}?mode=demo_ai&session=${session.session_id}&table_id=${session.table_id}`,
      );
    } catch (err) {
      console.error("Demo launch failed:", err);
      setDemoError(
        err instanceof Error ? err.message : t("simulationUnavailable"),
      );
      setStartingDemo(null);
    }
  };

  return (
    <div className="page-stack home-page">
      {/* Hero */}
      <section className="hero-panel hero-slim">
        <div className="hero-copy">
          <span className="eyebrow gold">
            <Sparkles size={13} /> MDG GAME CLUB
          </span>
          <h1>
            {t("home.title")}
            <br />
            <em>{t("home.titleAccent")}</em>
          </h1>
          <p>{t("home.intro")}</p>
          <div className="hero-actions">
            <Link to="/play/poker" className="button button-gold">
              <Play size={17} /> {t("home.playNow")} <ArrowRight size={17} />
            </Link>
            {!accessToken && (
              <Link to="/auth" className="quiet-link">
                {t("home.createAccount")} <ChevronRight size={15} />
              </Link>
            )}
          </div>
          {isGuest && !accessToken && (
            <div className="hero-guest-pill">
              <Bot size={13} />
              <span>{t("home.guestActive")}</span>
            </div>
          )}
        </div>
        <div className="hero-orbit hero-orbit-slim">
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
      </section>

      {/* Game selection */}
      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{t("home.featured")}</span>
            <h2>{t("home.chooseTable")}</h2>
            <p className="section-lede">{t("home.chooseBlurb")}</p>
          </div>
        </div>
        {demoError && (
          <div className="error-banner" style={{ marginBottom: "0.75rem" }}>
            {demoError}
          </div>
        )}
        <div className="game-grid">
          {games.map((game) => (
            <div
              className={`game-card game-card-large`}
              key={game.id}
              style={{ borderTop: `3px solid ${game.accent}` }}
            >
              <div className="game-card-top">
                <span className="game-icon" style={{ color: game.accent }}>
                  {game.icon}
                </span>
                <span className="live-pill">
                  <i /> {game.players} joueurs
                </span>
              </div>
              <div className="game-card-bottom">
                <div>
                  <h3>{t(game.name)}</h3>
                  <p>{t(game.meta)}</p>
                </div>
              </div>
              <div className="game-card-actions">
                <button
                  className="button button-small"
                  disabled={startingDemo === game.id}
                  onClick={() => launchDemo(game.id)}
                >
                  <Bot size={13} />{" "}
                  {startingDemo === game.id ? t("startingSimulation") : t("hub.practice")}
                </button>
                <Link
                  to={`/lobby?filter=${game.id}`}
                  className="button button-gold button-small"
                >
                  <Zap size={13} /> {t("home.playNow")}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="section-block steps-block">
        <div className="section-heading">
          <span className="eyebrow">{t("home.howItWorks")}</span>
          <h2>{t("home.threeSteps")}</h2>
        </div>
        <div className="steps-grid">
          {[
            {
              icon: Gamepad2,
              title: t("home.step1Title"),
              body: t("home.step1Body"),
            },
            {
              icon: Users,
              title: t("home.step2Title"),
              body: t("home.step2Body"),
            },
            {
              icon: Trophy,
              title: t("home.step3Title"),
              body: t("home.step3Body"),
            },
          ].map((step, i) => (
            <div className="step-card" key={i}>
              <div className="step-number">0{i + 1}</div>
              <step.icon size={22} />
              <strong>{step.title}</strong>
              <p>{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust / social proof */}
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
            <div className="game-card-top">
              <span className="game-icon">♠</span>
            </div>
            <div className="game-card-bottom">
              <div>
                <h3>{t("home.discover.playTitle")}</h3>
                <p>{t("home.discover.playBody")}</p>
              </div>
              <ArrowRight size={17} />
            </div>
          </Link>
          <Link to="/clubs" className="game-card discover-card">
            <div className="game-card-top">
              <span className="game-icon">
                <Users size={24} />
              </span>
            </div>
            <div className="game-card-bottom">
              <div>
                <h3>{t("home.discover.clubTitle")}</h3>
                <p>{t("home.discover.clubBody")}</p>
              </div>
              <ArrowRight size={17} />
            </div>
          </Link>
        </div>
      </section>

      {/* Lower grid */}
      <section className="lower-grid">
        <div className="resume-card">
          <div className="section-heading compact">
            <div>
              <span className="eyebrow">{t("home.activity")}</span>
              <h2>{t("home.resume")}</h2>
            </div>
          </div>
          <div className="resume-row">
            <div className="mini-table mini-poker">
              <span>♠</span>
            </div>
            <div className="resume-info">
              <strong>{t("home.resumeTable")}</strong>
              <span>{t("home.resumeMeta")}</span>
              <div className="progress">
                <i style={{ width: "68%" }} />
              </div>
              <small>{t("home.resumePlayers")}</small>
            </div>
            <Link to="/lobby" className="button button-small">
              {t("games.join")}
            </Link>
          </div>
        </div>
        <div className="spotlight-card">
          <div>
            <span className="eyebrow gold">
              <Sparkles size={13} /> {t("home.tonight")}
            </span>
            <h2>
              {t("home.tournament")}
              <br />
              <em>{t("home.tournamentAccent")}</em>
            </h2>
            <p>{t("home.tournamentMeta")}</p>
          </div>
          <div className="trophy">♛</div>
          <Link to="/lobby" className="round-action" aria-label="Ouvrir le lobby">
            <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      {/* Trust footer */}
      <section className="section-block trust-block">
        <div className="trust-items">
          <div>
            <ShieldCheck size={20} />
            <span>{t("home.trustSecure")}</span>
          </div>
          <div>
            <Bot size={20} />
            <span>{t("home.trustBots")}</span>
          </div>
          <div>
            <Users size={20} />
            <span>{t("home.trustCommunity")}</span>
          </div>
        </div>
      </section>

      {/* Guest name modal */}
      {showGuestModal && (
        <div className="guest-name-modal" role="dialog" aria-modal="true" onClick={() => setShowGuestModal(false)}>
          <div className="guest-name-card" onClick={(e) => e.stopPropagation()}>
            <span className="eyebrow">{t("hub.guestMode")}</span>
            <h2>{t("hub.enterName")}</h2>
            <p>{t("hub.guestBlurb")}</p>
            <input
              autoFocus
              type="text"
              placeholder={t("hub.namePlaceholder")}
              value={guestInput}
              onChange={(e) => setGuestInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleGuestSubmit();
              }}
              maxLength={20}
            />
            <div className="guest-name-actions">
              <button className="button button-outline" onClick={() => setShowGuestModal(false)}>
                {t("hub.cancel")}
              </button>
              <button className="button button-gold" onClick={() => void handleGuestSubmit()}>
                {t("hub.playNow")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
