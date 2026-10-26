import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Bot,
  Compass,
  Gamepad2,
  LogIn,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { useGameStore } from "@stores/gameStore";
import { useTranslation } from "react-i18next";
import { trackEvent } from "@services/analytics";
import { createGuestToken } from "@services/auth";
import { startBotSimulation } from "@services/games";
import { BotCountSelector } from "@components/game/BotCountSelector";

interface GameDef {
  id: "belote" | "domino" | "ludo" | "rami" | "poker";
  name: string;
  badge: string;
  meta: string;
  icon: string;
  accent: string;
  players: string;
  tags: string[];
}

const games: GameDef[] = [
  {
    id: "belote",
    name: "Belote Malagasy",
    badge: "Cartes & Atout",
    meta: "Le jeu d'équipe traditionnel de référence à Madagascar. Annonces, coupes, atout et belote-rebelote à 4 joueurs.",
    icon: "♥",
    accent: "#ef4444",
    players: "4 joueurs (2 vs 2)",
    tags: ["Partenaire", "162 Points", "Atout"],
  },
  {
    id: "domino",
    name: "Domino Double-Six",
    badge: "Stratégie Tactile",
    meta: "Posez vos tuiles en ivoire sur le plateau de Palissandre, piochez au talon et bloquez le jeu de vos adversaires.",
    icon: "🁓",
    accent: "#f59e0b",
    players: "2 à 4 joueurs",
    tags: ["Double-Six", "Talon 3D", "Pose directe"],
  },
  {
    id: "ludo",
    name: "Ludo Mada",
    badge: "Grand Jeu de Plateau",
    meta: "Le jeu convivial incontournable. Lancez le dé 3D, sortez vos 4 pions et ramenez-les le premier à la maison.",
    icon: "🎲",
    accent: "#10b981",
    players: "2 à 4 joueurs",
    tags: ["Dés 3D", "Pions 4 couleurs", "Capture"],
  },
  {
    id: "rami",
    name: "Rami Malagasy",
    badge: "Combinaisons & Défausse",
    meta: "Constituez vos tierces et brelans à 13 cartes. Défaussez avec discernement et posez pour l'emporter.",
    icon: "♦",
    accent: "#3b82f6",
    players: "2 à 4 joueurs",
    tags: ["13 Cartes", "Tierces & Brelans", "Défausse"],
  },
  {
    id: "poker",
    name: "Poker Texas Hold'em",
    badge: "Compétition & Tournois",
    meta: "No-Limit Hold'em stratégique. 2 cartes fermées, 5 cartes communes, relances, bluffs et showdowns épiques.",
    icon: "♠",
    accent: "#d3b06b",
    players: "2 à 9 joueurs",
    tags: ["No-Limit", "Blinds & Relances", "Tournois MTT"],
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
  const [heroGameId, setHeroGameId] = useState<"belote" | "domino" | "ludo" | "rami" | "poker">("belote");

  const [botCounts, setBotCounts] = useState<Record<string, number>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("mdg-bot-counts") || "{}");
      return { poker: saved.poker ?? 3, belote: saved.belote ?? 3, rami: saved.rami ?? 1, ludo: saved.ludo ?? 3, domino: saved.domino ?? 3, ...saved };
    } catch {
      return { poker: 3, belote: 3, rami: 1, ludo: 3, domino: 3 };
    }
  });

  const setBotCount = (gameId: string, value: number) => {
    setBotCounts((prev) => {
      const next = { ...prev, [gameId]: value };
      localStorage.setItem("mdg-bot-counts", JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    void trackEvent("activation_viewed", { metadata: { source: "home" } });
  }, []);

  const handleGuestSubmit = async () => {
    const name = guestInput.trim() || "Invité";
    setGuestMode(name, 10000);
    setShowGuestModal(false);
    if (pendingGameId) {
      await launchDemo(pendingGameId);
      setPendingGameId(null);
    }
  };

  const launchDemo = async (gameId: string, botCountOverride?: number) => {
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
        // fallback to guest session
      }
    }
    if (!token) {
      setDemoError(t("app.error"));
      setStartingDemo(null);
      return;
    }
    const botCount = botCountOverride ?? botCounts[gameId] ?? (gameId === "rami" ? 1 : 3);
    const idempotencyKey = `home-${gameId}-${Date.now()}`;
    try {
      const session = await startBotSimulation(
        token,
        gameId as "poker" | "belote" | "rami" | "ludo" | "domino",
        "balanced",
        idempotencyKey,
        botCount,
      );
      void trackEvent("bot_simulation_started", {
        mode: "demo",
        game_type: gameId,
        metadata: { source: "home_card" },
      });
      navigate(
        `/game/${session.game_type}/${session.table_code}?mode=demo_ai&session=${session.session_id}&table_id=${session.table_id}${session.admission_token ? `&admission_token=${session.admission_token}` : ""}`,
      );
    } catch (err) {
      console.error("Demo launch failed:", err);
      setDemoError(
        err instanceof Error ? err.message : t("simulationUnavailable"),
      );
      setStartingDemo(null);
    }
  };

  const selectedHeroGame = games.find((g) => g.id === heroGameId) ?? games[0];

  return (
    <div className="home-claude">
      {/* 1. Hero Claude Aesthetic: Calm, High-Typography Contrast & Direct Utility */}
      <section className="home-hero-claude">
        <div className="home-hero-left">
          <span className="home-eyebrow">
            <Sparkles size={13} /> MDG Game Club · Salon d'Excellence
          </span>
          <h1 className="home-hero-title">
            L'art du jeu malagasy,
            <br />
            <em>avec élégance et équité.</em>
          </h1>
          <p className="home-hero-lead">
            Belote, Domino Double-Six, Ludo Mada, Rami et Poker Texas Hold'em réunis sur une plateforme rapide et authentique. Rejoignez des tables en direct, invitez vos proches dans des salons privés ou entraînez votre jeu contre nos intelligences artificielles.
          </p>

          <div className="home-hero-actions">
            <Link to="/lobby" className="button button-gold" style={{ minHeight: "44px", padding: "12px 22px", fontSize: "13.5px" }}>
              <Compass size={17} /> Explorer les tables en direct <ArrowRight size={17} />
            </Link>
            {!accessToken && (
              <Link to="/auth" className="button button-outline" style={{ minHeight: "44px", padding: "12px 20px", fontSize: "13.5px" }}>
                <LogIn size={15} /> Connexion / Inscription
              </Link>
            )}
            {isGuest && !accessToken && (
              <div className="hero-guest-pill" style={{ margin: 0 }}>
                <Bot size={13} />
                <span>{guestName || "Invité"} · Mode Découverte</span>
              </div>
            )}
          </div>

          <div className="home-hero-badges">
            <span>
              <i style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981", display: "inline-block", boxShadow: "0 0 6px #10b981" }} />
              Tables actives 24h/24
            </span>
            <span>
              <ShieldCheck size={14} style={{ color: "var(--gold)" }} /> 100% Stratégie & Fair-play
            </span>
            <span>
              <Users size={14} style={{ color: "var(--gold)" }} /> Salons privés avec lien WhatsApp
            </span>
          </div>
        </div>

        {/* 2. Hero Interactive Quick Deck (Express Table Launcher) */}
        <div className="home-quick-deck">
          <div className="home-quick-deck-header">
            <div className="home-quick-deck-title">
              <Zap size={15} style={{ color: "var(--gold)" }} />
              <span>Partie Express</span>
            </div>
            <span style={{ fontSize: "11px", color: "var(--muted)" }}>Prenez place en 1-clic</span>
          </div>

          {/* Quick game pills */}
          <div className="home-quick-pills">
            {games.map((g) => (
              <button
                key={g.id}
                type="button"
                className={`home-quick-pill ${heroGameId === g.id ? "active" : ""}`}
                onClick={() => setHeroGameId(g.id)}
              >
                <span style={{ color: g.accent }}>{g.icon}</span>
                <span>{g.name.split(" ")[0]}</span>
              </button>
            ))}
          </div>

          {/* Selected Game Preview */}
          <div className="home-quick-preview">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: "13px", color: "#fff" }}>{selectedHeroGame.name}</strong>
              <span style={{ fontSize: "11px", color: selectedHeroGame.accent, fontWeight: 600 }}>
                {selectedHeroGame.players}
              </span>
            </div>
            <p>{selectedHeroGame.meta}</p>
            <div className="home-quick-tags">
              {selectedHeroGame.tags.map((tag) => (
                <span key={tag} className="home-tag-chip">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Embedded Bot Stepper */}
          <BotCountSelector
            gameType={heroGameId}
            value={botCounts[heroGameId] ?? (heroGameId === "rami" ? 1 : 3)}
            onChange={(v) => setBotCount(heroGameId, v)}
            disabled={startingDemo === heroGameId}
          />

          {/* Dual Action Buttons */}
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "8px" }}>
            <Link
              to={`/lobby?filter=${heroGameId}`}
              className="button button-gold button-small"
              style={{ justifyContent: "center", fontSize: "12.5px" }}
            >
              <Compass size={14} /> Tables en ligne
            </Link>
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={() => void launchDemo(heroGameId, botCounts[heroGameId])}
              disabled={startingDemo === heroGameId}
              style={{ justifyContent: "center", fontSize: "12.5px" }}
            >
              <Bot size={14} /> {startingDemo === heroGameId ? "Lancement..." : "Entraînement IA"}
            </button>
          </div>
        </div>
      </section>

      {/* 3. Games Matrix Section */}
      <section>
        <div className="home-section-head">
          <div>
            <span className="home-eyebrow">Nos Salons Officiels</span>
            <h2>Cinq grands classiques, zéro hasard trompeur</h2>
            <p>
              Des règles authentiques fidèles aux traditions malagasy et internationales, une ergonomie claire et une jouabilité instantanée.
            </p>
          </div>
        </div>

        {demoError && (
          <div className="error-banner" style={{ marginBottom: "1rem" }}>
            {demoError}
          </div>
        )}

        <div className="home-games-matrix">
          {games.map((game) => (
            <div
              key={game.id}
              className="home-game-card-claude"
              style={{ borderTop: `3px solid ${game.accent}` }}
            >
              <div>
                <div className="home-game-top">
                  <div className="home-game-identity">
                    <div
                      className="home-game-icon-box"
                      style={{
                        background: `${game.accent}1a`,
                        color: game.accent,
                        border: `1px solid ${game.accent}33`,
                      }}
                    >
                      {game.icon}
                    </div>
                    <div className="home-game-title">
                      <h3>{game.name}</h3>
                      <span>{game.badge}</span>
                    </div>
                  </div>
                  <span className="home-game-players-badge">{game.players}</span>
                </div>

                <p className="home-game-desc">{game.meta}</p>

                <div className="home-quick-tags" style={{ marginBottom: "12px" }}>
                  {game.tags.map((tag) => (
                    <span key={tag} className="home-tag-chip">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <BotCountSelector
                  gameType={game.id}
                  value={botCounts[game.id] ?? (game.id === "rami" ? 1 : 3)}
                  onChange={(v) => setBotCount(game.id, v)}
                  disabled={startingDemo === game.id}
                />

                <div className="home-game-actions-bar">
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    disabled={startingDemo === game.id}
                    onClick={() => launchDemo(game.id, botCounts[game.id])}
                    style={{ justifyContent: "center" }}
                  >
                    <Bot size={13} /> {startingDemo === game.id ? "Lancement..." : "Solo vs IA"}
                  </button>
                  <Link
                    to={`/lobby?filter=${game.id}`}
                    className="button button-gold button-small"
                    style={{ justifyContent: "center" }}
                  >
                    <Zap size={13} /> Rejoindre
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Three Steps Guide */}
      <section>
        <div className="home-section-head">
          <div>
            <span className="home-eyebrow">Prise en main immédiate</span>
            <h2>Comment jouer sur MDG Game Club ?</h2>
            <p>Trois étapes fluides pour commencer à jouer sans friction.</p>
          </div>
        </div>

        <div className="home-steps-grid">
          {[
            {
              step: "01",
              title: "Choisissez votre jeu & vos enjeux",
              body: "Sélectionnez votre jeu favori (Belote, Domino, Ludo, Rami ou Poker). Choisissez une table libre selon vos préférences ou optez pour une partie 100% gratuite.",
              icon: Gamepad2,
            },
            {
              step: "02",
              title: "Prenez place ou invitez vos amis",
              body: "Rejoignez une table ouverte en matchmaking direct, ou créez un salon privé en un clic avec lien d'invitation partageable directement sur WhatsApp.",
              icon: Users,
            },
            {
              step: "03",
              title: "Jouez en temps réel et progressez",
              body: "Profitez d'animations tactiles fluides, de tapis réalistes et d'une ambiance sonore feutrée. Montez en niveau et suivez votre historique de jeu.",
              icon: Trophy,
            },
          ].map((item) => (
            <div key={item.step} className="home-step-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div className="home-step-badge">{item.step}</div>
                <item.icon size={20} style={{ color: "var(--gold)" }} />
              </div>
              <strong>{item.title}</strong>
              <p>{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Trust & Craftsmanship Pillars */}
      <section className="home-trust-grid">
        <div className="home-trust-card">
          <div className="home-trust-icon">
            <ShieldCheck size={20} />
          </div>
          <div className="home-trust-copy">
            <strong>Fair-Play Vérifiable</strong>
            <p>Distributions aléatoires cryptographiques, aucun avantage masqué et zéro jeux de hasard trompeurs.</p>
          </div>
        </div>
        <div className="home-trust-card">
          <div className="home-trust-icon">
            <Users size={20} />
          </div>
          <div className="home-trust-copy">
            <strong>Salons Privés & Convivialité</strong>
            <p>Créez votre club, lancez des tables avec mot de passe et jouez en toute intimité entre amis ou en famille.</p>
          </div>
        </div>
        <div className="home-trust-card">
          <div className="home-trust-icon">
            <Zap size={20} />
          </div>
          <div className="home-trust-copy">
            <strong>Zéro Téléchargement</strong>
            <p>Application Web ultra-légère conçue pour tourner à 60 images par seconde, même avec une connexion mobile 3G/4G.</p>
          </div>
        </div>
      </section>

      {/* 6. Guest Modal */}
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
                if (e.key === "Enter") void handleGuestSubmit();
              }}
              maxLength={20}
            />
            <div className="guest-name-actions">
              <button type="button" className="button button-outline" onClick={() => setShowGuestModal(false)}>
                {t("hub.cancel")}
              </button>
              <button type="button" className="button button-gold" onClick={() => void handleGuestSubmit()}>
                {t("hub.playNow")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
