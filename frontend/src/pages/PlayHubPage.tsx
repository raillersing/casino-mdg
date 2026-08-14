import { useState, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Crown,
  Dices,
  Gamepad2,
  Loader2,
  Lock,
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

const GAME_META: Record<
  string,
  {
    name: string;
    icon: string;
    accent: string;
    description: string;
    playersLabel: string;
    rules: string[];
  }
> = {
  poker: {
    name: "Poker Texas Hold'em",
    icon: "♠",
    accent: "#d3b06b",
    description:
      "Le classique du poker : 2 cartes fermées, 5 cartes communes, pariez, bluffez et remportez le pot.",
    playersLabel: "2 – 9 joueurs",
    rules: [
      "2 cartes privées + 5 communes",
      "4 tours de mises (préflop, flop, turn, river)",
      "Gagnez le pot ou faites plier vos adversaires",
    ],
  },
  belote: {
    name: "Belote Malgache",
    icon: "♥",
    accent: "#e57373",
    description:
      "Jeu de cartes en équipe. Annoncez, coupez et marquez des points en remportant les plis.",
    playersLabel: "4 joueurs",
    rules: [
      "Jeu en équipe de 2",
      "Annonces et atouts",
      "162 points à répartir par manche",
    ],
  },
  rami: {
    name: "Rami",
    icon: "♦",
    accent: "#64b5f6",
    description:
      "Formez des suites et des groupes de même rang. Posez vos cartes et terminez avec le moins de points possible.",
    playersLabel: "2 – 4 joueurs",
    rules: [
      "10 cartes en main",
      "Suites et brelans",
      "Le premier à poser toutes ses cartes gagne",
    ],
  },
};

export function PlayHubPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { gameType = "poker" } = useParams();
  const meta = GAME_META[gameType] || GAME_META.poker;
  const accessToken = useGameStore((state) => state.accessToken);
  const isGuest = useGameStore((state) => state.isGuest);
  const guestName = useGameStore((state) => state.guestName);
  const setGuestMode = useGameStore((state) => state.setGuestMode);
  const setSession = useGameStore((state) => state.setSession);
  const [showGuestName, setShowGuestName] = useState(false);
  const [guestInput, setGuestInput] = useState("");
  const [startingMode, setStartingMode] = useState<string | null>(null);
  const [botCount, setBotCount] = useState(3);

  useEffect(() => {
    void trackEvent("play_hub_viewed", { game_type: gameType });
  }, [gameType]);

  const ensureGuest = () => {
    if (isGuest || accessToken) return true;
    setShowGuestName(true);
    return false;
  };

  const handleGuestSubmit = () => {
    const name = guestInput.trim() || "Invité";
    setGuestMode(name, 10000);
    setShowGuestName(false);
  };

  const launchDemo = async () => {
    if (!ensureGuest()) return;
    setStartingMode("demo");

    let token = accessToken;
    // If guest without token, create a temporary guest session on the backend
    if (!token && isGuest) {
      try {
        const auth = await createGuestToken(guestName || "Invité");
        setSession(auth.access, auth.refresh);
        setGuestMode(auth.user.display_name, auth.wallet.balance);
        token = auth.access;
      } catch {
        // fallback: keep local guest mode and try anyway
      }
    }

    if (token) {
      const idempotencyKey = `hub-${gameType}-${Date.now()}`;
      try {
        const session = await startBotSimulation(
          token,
          gameType as "poker" | "belote" | "rami",
          "balanced",
          idempotencyKey,
          gameType === "poker" ? botCount : undefined,
        );
        void trackEvent("bot_simulation_started", {
          mode: "demo",
          game_type: gameType,
          metadata: { source: "play_hub" },
        });
        navigate(
          `/game/${session.game_type}/${session.table_code}?mode=demo_ai&session=${session.session_id}&table_id=${session.table_id}`,
        );
        return;
      } catch {
        // fallback to generic demo URL
      }
    }
    const tableCode = `demo-${gameType}-${Math.random().toString(36).slice(2, 8)}`;
    navigate(`/game/${gameType}/${tableCode}?mode=demo_ai&guest=true`);
  };

  const launchQuick = () => {
    if (!accessToken) {
      navigate(`/auth?next=/play/${gameType}`);
      return;
    }
    setStartingMode("quick");
    navigate(`/lobby?filter=${gameType}&action=matchmaking`);
  };

  const launchTournament = () => {
    if (!accessToken) {
      navigate(`/auth?next=/play/${gameType}`);
      return;
    }
    setStartingMode("tournament");
    navigate(`/lobby?filter=${gameType}&mode=tournament`);
  };

  const launchPrivate = () => {
    if (!accessToken) {
      navigate(`/auth?next=/play/${gameType}`);
      return;
    }
    setStartingMode("private");
    navigate(`/lobby?filter=${gameType}&action=create`);
  };

  const modes = [
    {
      id: "quick",
      label: t("hub.quickMatch"),
      desc: t("hub.quickMatchDesc"),
      icon: Zap,
      color: "#22c55e",
      action: launchQuick,
      lock: !accessToken,
    },
    {
      id: "demo",
      label: t("hub.practice"),
      desc: t("hub.practiceDesc"),
      icon: Bot,
      color: "#3b82f6",
      action: launchDemo,
      lock: false,
    },
    {
      id: "tournament",
      label: t("hub.tournament"),
      desc: t("hub.tournamentDesc"),
      icon: Trophy,
      color: "#d3b06b",
      action: launchTournament,
      lock: !accessToken,
    },
    {
      id: "private",
      label: t("hub.privateTable"),
      desc: t("hub.privateTableDesc"),
      icon: Lock,
      color: "#a78bfa",
      action: launchPrivate,
      lock: !accessToken,
    },
  ];

  return (
    <div className="page-stack play-hub-page">
      {/* Back link */}
      <div className="hub-back">
        <Link to="/" className="text-link">
          <ArrowLeft size={16} /> {t("hub.backHome")}
        </Link>
      </div>

      {/* Game Hero */}
      <section className="hub-hero">
        <div className="hub-hero-icon" style={{ color: meta.accent }}>
          {meta.icon}
        </div>
        <div className="hub-hero-copy">
          <span className="eyebrow" style={{ color: meta.accent }}>
            <Gamepad2 size={13} /> {meta.playersLabel}
          </span>
          <h1>{meta.name}</h1>
          <p>{meta.description}</p>
          <div className="hub-rules">
            {meta.rules.map((rule, i) => (
              <span key={i}><Sparkles size={11} /> {rule}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Guest prompt */}
      {showGuestName && (
        <div className="guest-name-modal" role="dialog" aria-modal="true">
          <div className="guest-name-card">
            <span className="eyebrow"><Dices size={13} /> {t("hub.guestMode")}</span>
            <h2>{t("hub.enterName")}</h2>
            <p>{t("hub.guestBlurb")}</p>
            <input
              autoFocus
              maxLength={20}
              placeholder={t("hub.namePlaceholder")}
              value={guestInput}
              onChange={(e) => setGuestInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleGuestSubmit();
              }}
            />
            <div className="guest-name-actions">
              <button className="button button-outline" onClick={() => setShowGuestName(false)}>
                {t("hub.cancel")}
              </button>
              <button className="button button-gold" onClick={handleGuestSubmit}>
                {t("hub.playNow")} <ArrowRight size={16} />
              </button>
            </div>
            <div className="guest-trust">
              <Users size={14} />
              <span>{t("hub.noAuthRequired")}</span>
            </div>
          </div>
        </div>
      )}

      {/* Mode Grid */}
      <section className="hub-modes">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{t("hub.chooseMode")}</span>
            <h2>{t("hub.howToPlay")}</h2>
          </div>
        </div>
        <div className="hub-mode-grid">
          {modes.map((mode) => {
            const Icon = mode.icon;
            const isLoading = startingMode === mode.id;
            return (
              <button
                key={mode.id}
                className={`hub-mode-card ${mode.lock ? "locked" : ""}`}
                onClick={mode.action}
                disabled={isLoading}
              >
                <div
                  className="hub-mode-icon"
                  style={{ background: `${mode.color}18`, color: mode.color }}
                >
                  {isLoading ? <Loader2 className="spin" size={22} /> : <Icon size={22} />}
                </div>
                <div className="hub-mode-body">
                  <strong>{mode.label}</strong>
                  <span>{mode.desc}</span>
                </div>
                <div className="hub-mode-arrow">
                  {mode.lock ? (
                    <Lock size={16} />
                  ) : (
                    <ArrowRight size={18} />
                  )}
                </div>
              </button>
            );
          })}
        </div>
        {gameType === "poker" && (
          <div className="hub-bot-count">
            <label>
              <span>Nombre de bots</span>
              <input
                type="range"
                min={1}
                max={8}
                step={1}
                value={botCount}
                onChange={(e) => setBotCount(Number(e.target.value))}
              />
              <output>{botCount}</output>
            </label>
          </div>
        )}
      </section>

      {/* Cross-promo */}
      <section className="hub-cross">
        <div className="section-heading">
          <span className="eyebrow"><Crown size={13} /> {t("hub.discover")}</span>
          <h2>{t("hub.otherGames")}</h2>
        </div>
        <div className="hub-cross-grid">
          {Object.entries(GAME_META)
            .filter(([key]) => key !== gameType)
            .map(([key, info]) => (
              <Link
                to={`/play/${key}`}
                key={key}
                className="hub-cross-card"
                style={{ borderColor: info.accent }}
              >
                <span style={{ color: info.accent, fontSize: 24 }}>{info.icon}</span>
                <div>
                  <strong>{info.name}</strong>
                  <span>{info.playersLabel}</span>
                </div>
                <ArrowRight size={16} />
              </Link>
            ))}
        </div>
      </section>

      {/* Guest banner */}
      {isGuest && !accessToken && (
        <div className="hub-guest-bar">
          <div>
            <Sparkles size={16} />
            <span>
              {t("hub.guestPlayingAs", { name: guestName || "Invité" })}
            </span>
          </div>
          <Link to="/auth" className="button button-small">
            {t("hub.connectToSave")}
          </Link>
        </div>
      )}
    </div>
  );
}
