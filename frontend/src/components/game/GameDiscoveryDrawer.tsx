import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, Zap, ChevronRight } from "lucide-react";
import { BottomSheet } from "@components/ui/BottomSheet";
import { useGameStore } from "@stores/gameStore";
import { startBotSimulation } from "@services/games";
import { createGuestToken } from "@services/auth";
import { trackEvent } from "@services/analytics";
import { BotCountSelector } from "@components/game/BotCountSelector";
import { haptics } from "@utils/haptics";

interface GameDef {
  id: "belote" | "domino" | "ludo" | "rami" | "poker";
  name: string;
  badge: string;
  icon: string;
  accent: string;
  players: string;
  summary: string;
  tags: string[];
}

const GAMES: GameDef[] = [
  {
    id: "belote",
    name: "Belote Malagasy",
    badge: "Cartes & Atout",
    icon: "♥",
    accent: "#ef4444",
    players: "4 joueurs (2 vs 2)",
    summary:
      "Le jeu d'équipe culte de Madagascar. Annonces, atouts, belote-rebelote et 162 points par donne.",
    tags: ["Partenaire", "Atout", "162 pts"],
  },
  {
    id: "domino",
    name: "Domino Double-Six",
    badge: "Tactique & Pose",
    icon: "🁓",
    accent: "#f59e0b",
    players: "2 à 4 joueurs",
    summary:
      "Posez vos tuiles ivoire sur table en palissandre, piochez au talon et bloquez vos rivaux.",
    tags: ["Double-Six", "Talon 3D", "Pose directe"],
  },
  {
    id: "ludo",
    name: "Ludo Mada",
    badge: "Plateau Convivial",
    icon: "🎲",
    accent: "#10b981",
    players: "2 à 4 joueurs",
    summary:
      "Lancez le dé 3D, sortez vos 4 pions sur un 6 et amenez-les au centre le premier.",
    tags: ["Dés 3D", "Pions 4 couleurs", "Capture"],
  },
  {
    id: "rami",
    name: "Rami Malagasy",
    badge: "Combinaisons",
    icon: "♦",
    accent: "#3b82f6",
    players: "2 à 4 joueurs",
    summary:
      "Tierces et brelans à 13 cartes. Défaussez avec stratégie pour poser toutes vos cartes.",
    tags: ["13 Cartes", "Tierces & Brelans", "Défausse"],
  },
  {
    id: "poker",
    name: "Poker Texas Hold'em",
    badge: "Compétition No-Limit",
    icon: "♠",
    accent: "#d3b06b",
    players: "2 à 9 joueurs",
    summary:
      "No-Limit Hold'em officiel. 2 cartes fermées, 5 communes, relances, bluffs et showdowns.",
    tags: ["No-Limit", "Blinds", "Tournois"],
  },
];

interface GameDiscoveryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  defaultGameId?: "belote" | "domino" | "ludo" | "rami" | "poker";
}

export const GameDiscoveryDrawer: React.FC<GameDiscoveryDrawerProps> = ({
  isOpen,
  onClose,
  defaultGameId = "belote",
}) => {
  const navigate = useNavigate();
  const [selectedGameId, setSelectedGameId] =
    useState<GameDef["id"]>(defaultGameId);
  const [startingDemo, setStartingDemo] = useState(false);
  const [error, setError] = useState("");

  const accessToken = useGameStore((state) => state.accessToken);
  const isGuest = useGameStore((state) => state.isGuest);
  const guestName = useGameStore((state) => state.guestName);
  const setSession = useGameStore((state) => state.setSession);
  const setGuestMode = useGameStore((state) => state.setGuestMode);

  const [botCounts, setBotCounts] = useState<Record<string, number>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("mdg-bot-counts") || "{}");
      return { poker: 3, belote: 3, rami: 1, ludo: 3, domino: 3, ...saved };
    } catch {
      return { poker: 3, belote: 3, rami: 1, ludo: 3, domino: 3 };
    }
  });

  const setBotCount = (gameId: string, val: number) => {
    setBotCounts((prev) => {
      const next = { ...prev, [gameId]: val };
      localStorage.setItem("mdg-bot-counts", JSON.stringify(next));
      return next;
    });
  };

  const selectedGame = GAMES.find((g) => g.id === selectedGameId) || GAMES[0];

  const handleLaunchSolo = async () => {
    haptics.buttonTap();
    setStartingDemo(true);
    setError("");

    let token = accessToken;
    if (!token && !isGuest) {
      // Auto-create guest session for seamless 1-tap discovery
      try {
        const auth = await createGuestToken("Joueur");
        setSession(auth.access, auth.refresh);
        setGuestMode(auth.user.display_name, auth.wallet.balance);
        token = auth.access;
      } catch {
        setError("Impossible d'initialiser la session invité.");
        setStartingDemo(false);
        return;
      }
    } else if (!token && isGuest) {
      try {
        const auth = await createGuestToken(guestName || "Joueur");
        setSession(auth.access, auth.refresh);
        setGuestMode(auth.user.display_name, auth.wallet.balance);
        token = auth.access;
      } catch {
        // fallback
      }
    }

    if (!token) {
      setError("Connexion requise pour lancer la partie.");
      setStartingDemo(false);
      return;
    }

    const botCount =
      botCounts[selectedGameId] ?? (selectedGameId === "rami" ? 1 : 3);
    const idempotencyKey = `drawer-${selectedGameId}-${Date.now()}`;

    try {
      const session = await startBotSimulation(
        token,
        selectedGameId,
        "balanced",
        idempotencyKey,
        botCount,
      );
      void trackEvent("bot_simulation_started", {
        mode: "demo",
        game_type: selectedGameId,
        metadata: { source: "mobile_discovery_drawer" },
      });
      onClose();
      navigate(
        `/game/${session.game_type}/${session.table_code}?mode=demo_ai&session=${session.session_id}&table_id=${session.table_id}${
          session.admission_token
            ? `&admission_token=${session.admission_token}`
            : ""
        }`,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erreur de lancement de la simulation.",
      );
    } finally {
      setStartingDemo(false);
    }
  };

  const handleGoLobby = () => {
    haptics.buttonTap();
    onClose();
    navigate(`/lobby?filter=${selectedGameId}`);
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="🎮 Salle des Jeux MDG"
      subtitle="Choisissez un jeu et lancez une partie en 1-clic"
      maxHeight="90vh"
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          paddingBottom: "24px",
        }}
      >
        {/* Horizontal Game Selector Pills */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            overflowX: "auto",
            padding: "4px 2px",
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none",
          }}
        >
          {GAMES.map((game) => {
            const isSelected = game.id === selectedGameId;
            return (
              <button
                key={game.id}
                type="button"
                onClick={() => {
                  haptics.buttonTap();
                  setSelectedGameId(game.id);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "7px",
                  padding: "9px 14px",
                  borderRadius: "22px",
                  border: isSelected
                    ? `1.5px solid ${game.accent}`
                    : "1px solid rgba(255,255,255,0.12)",
                  background: isSelected
                    ? `linear-gradient(135deg, ${game.accent}25 0%, rgba(20,20,25,0.85) 100%)`
                    : "rgba(255,255,255,0.04)",
                  color: isSelected ? "#fff" : "var(--muted)",
                  fontWeight: isSelected ? 700 : 500,
                  fontSize: "13px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  transition: "all 0.18s ease",
                  boxShadow: isSelected ? `0 0 12px ${game.accent}30` : "none",
                }}
              >
                <span style={{ color: game.accent, fontSize: "16px" }}>
                  {game.icon}
                </span>
                <span>{game.name.split(" ")[0]}</span>
              </button>
            );
          })}
        </div>

        {/* Selected Game Hero Card */}
        <div
          style={{
            borderRadius: "16px",
            background:
              "linear-gradient(135deg, rgba(25, 30, 42, 0.95) 0%, rgba(15, 18, 26, 0.95) 100%)",
            border: `1.5px solid ${selectedGame.accent}45`,
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            boxShadow: `0 8px 24px rgba(0,0,0,0.4), 0 0 16px ${selectedGame.accent}15`,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "12px",
                  background: `${selectedGame.accent}20`,
                  border: `1px solid ${selectedGame.accent}40`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "22px",
                  color: selectedGame.accent,
                }}
              >
                {selectedGame.icon}
              </div>
              <div>
                <h4
                  style={{
                    margin: 0,
                    fontSize: "16px",
                    color: "#fff",
                    fontWeight: 800,
                  }}
                >
                  {selectedGame.name}
                </h4>
                <span
                  style={{
                    fontSize: "11.5px",
                    color: selectedGame.accent,
                    fontWeight: 600,
                  }}
                >
                  {selectedGame.badge} · {selectedGame.players}
                </span>
              </div>
            </div>
            <span
              style={{
                fontSize: "11px",
                background: "rgba(16, 185, 129, 0.15)",
                color: "#34d399",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                padding: "3px 8px",
                borderRadius: "12px",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                fontWeight: 600,
              }}
            >
              <i
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#10b981",
                  display: "inline-block",
                }}
              />
              En direct
            </span>
          </div>

          <p
            style={{
              margin: 0,
              fontSize: "12.5px",
              color: "#cbd5e1",
              lineHeight: 1.45,
            }}
          >
            {selectedGame.summary}
          </p>

          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {selectedGame.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: "11px",
                  background: "rgba(255,255,255,0.06)",
                  color: "var(--muted)",
                  padding: "3px 8px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {tag}
              </span>
            ))}
          </div>

          {error && (
            <div
              className="error-banner"
              style={{ margin: 0, padding: "8px 12px", fontSize: "12px" }}
            >
              {error}
            </div>
          )}

          {/* Stepper for Bots */}
          <div style={{ marginTop: "4px" }}>
            <BotCountSelector
              gameType={selectedGameId}
              value={
                botCounts[selectedGameId] ?? (selectedGameId === "rami" ? 1 : 3)
              }
              onChange={(val) => setBotCount(selectedGameId, val)}
              disabled={startingDemo}
            />
          </div>

          {/* 2 Big Primary Actions */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "10px",
              marginTop: "4px",
            }}
          >
            <button
              type="button"
              className="button button-gold"
              onClick={handleGoLobby}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "7px",
                padding: "12px 14px",
                fontWeight: 800,
                fontSize: "13px",
              }}
            >
              <Zap size={16} />
              <span>Tables en ligne</span>
            </button>

            <button
              type="button"
              className="button button-secondary"
              onClick={handleLaunchSolo}
              disabled={startingDemo}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "7px",
                padding: "12px 14px",
                fontWeight: 700,
                fontSize: "13px",
              }}
            >
              <Bot size={16} />
              <span>{startingDemo ? "Lancement..." : "Entraînement IA"}</span>
            </button>
          </div>
        </div>

        {/* Quick Discovery Cards for remaining games */}
        <div>
          <div
            style={{
              fontSize: "12px",
              fontWeight: 700,
              color: "var(--muted)",
              marginBottom: "8px",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Autres Jeux Disponibles
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {GAMES.filter((g) => g.id !== selectedGameId).map((other) => (
              <div
                key={other.id}
                onClick={() => {
                  haptics.buttonTap();
                  setSelectedGameId(other.id);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  cursor: "pointer",
                  transition: "background 0.15s ease",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "10px" }}
                >
                  <span style={{ fontSize: "18px", color: other.accent }}>
                    {other.icon}
                  </span>
                  <div>
                    <strong
                      style={{
                        fontSize: "13px",
                        color: "#fff",
                        display: "block",
                      }}
                    >
                      {other.name}
                    </strong>
                    <small style={{ fontSize: "11px", color: "var(--muted)" }}>
                      {other.players}
                    </small>
                  </div>
                </div>
                <ChevronRight size={16} style={{ color: "var(--muted)" }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </BottomSheet>
  );
};
