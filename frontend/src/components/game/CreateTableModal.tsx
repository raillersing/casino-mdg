import React, { useState } from "react";
import { CreateTablePayload, GameTable } from "../../services/games";

interface CreateTableModalProps {
  initialGameType?: "poker" | "belote" | "rami" | "ludo" | "domino";
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateTablePayload) => Promise<GameTable>;
}

const GAME_OPTIONS: Array<{
  id: "belote" | "domino" | "ludo" | "rami" | "poker";
  name: string;
  icon: string;
  description: string;
  defaultPlayers: number;
  allowedPlayers: number[];
}> = [
  {
    id: "belote",
    name: "Belote Malagasy",
    icon: "🃏",
    description: "4 joueurs en 2 équipes (Nord/Sud vs Est/Ouest)",
    defaultPlayers: 4,
    allowedPlayers: [4],
  },
  {
    id: "domino",
    name: "Domino Double-Six",
    icon: "🁓",
    description: "2 à 4 joueurs avec pioche ou bâte",
    defaultPlayers: 4,
    allowedPlayers: [2, 3, 4],
  },
  {
    id: "ludo",
    name: "Ludo Mada",
    icon: "🎲",
    description: "Course de pions avec captures et bonus",
    defaultPlayers: 4,
    allowedPlayers: [2, 3, 4],
  },
  {
    id: "rami",
    name: "Rami Malagasy",
    icon: "🎴",
    description: "Combinaisons de tierces et 101 points",
    defaultPlayers: 4,
    allowedPlayers: [2, 3, 4],
  },
  {
    id: "poker",
    name: "Poker Texas Hold'em",
    icon: "♠️",
    description: "No-Limit Hold'em avec blindes évolutives",
    defaultPlayers: 6,
    allowedPlayers: [2, 6, 9],
  },
];

const STAKE_PRESETS = [
  { label: "Gratuit (0 Ar)", value: 0 },
  { label: "500 Ar", value: 500 },
  { label: "1 000 Ar", value: 1000 },
  { label: "2 500 Ar", value: 2500 },
  { label: "5 000 Ar", value: 5000 },
  { label: "10 000 Ar", value: 10000 },
];

const TIMER_PRESETS = [
  { label: "⚡ Blitz (10s)", value: 10, desc: "Action rapide et intense" },
  { label: "⏱️ Standard (15s)", value: 15, desc: "Rythme de jeu recommandé" },
  { label: "🛋️ Relax (30s)", value: 30, desc: "Temps de réflexion convivial" },
];

export const CreateTableModal: React.FC<CreateTableModalProps> = ({
  initialGameType = "belote",
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [gameType, setGameType] = useState<
    "poker" | "belote" | "rami" | "ludo" | "domino"
  >(initialGameType);
  const [name, setName] = useState("");
  const [stakeAmount, setStakeAmount] = useState<number>(0);
  const [turnDuration, setTurnDuration] = useState<number>(15);
  const [maxPlayers, setMaxPlayers] = useState<number>(
    GAME_OPTIONS.find((g) => g.id === initialGameType)?.defaultPlayers || 4,
  );
  const [isPrivate, setIsPrivate] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Game-specific settings
  // Belote
  const [beloteTargetScore, setBeloteTargetScore] = useState<number>(1001);
  const [beloteVariant, setBeloteVariant] = useState<string>("classique");
  const [beloteAnnouncements, setBeloteAnnouncements] =
    useState<boolean>(true);

  // Domino
  const [dominoTargetScore, setDominoTargetScore] = useState<number>(150);
  const [dominoDoubleSixLead, setDominoDoubleSixLead] = useState<boolean>(true);

  // Ludo
  const [ludoTargetPawns, setLudoTargetPawns] = useState<number>(4);
  const [ludoFastMode, setLudoFastMode] = useState<boolean>(false);
  const [ludoCaptureBonus, setLudoCaptureBonus] = useState<boolean>(true);

  // Rami
  const [ramiTargetScore, setRamiTargetScore] = useState<number>(101);
  const [ramiInitialMeld, setRamiInitialMeld] = useState<number>(40);

  // Poker
  const [pokerSpeed, setPokerSpeed] = useState<string>("turbo");
  const [pokerSmallBlind, setPokerSmallBlind] = useState<number>(50);

  if (!isOpen) return null;

  const currentGame =
    GAME_OPTIONS.find((g) => g.id === gameType) || GAME_OPTIONS[0];

  const handleGameSelect = (
    nextGame: "poker" | "belote" | "rami" | "ludo" | "domino",
  ) => {
    setGameType(nextGame);
    const cfg = GAME_OPTIONS.find((g) => g.id === nextGame);
    if (cfg) {
      setMaxPlayers(cfg.defaultPlayers);
    }
  };

  const handleCreate = async () => {
    setSubmitting(true);
    setErrorMessage("");

    let rulesConfig: Record<string, unknown> = {};
    if (gameType === "belote") {
      rulesConfig = {
        target_score: beloteTargetScore,
        variant: beloteVariant,
        announcements: beloteAnnouncements,
      };
    } else if (gameType === "domino") {
      rulesConfig = {
        target_score: dominoTargetScore,
        double_six_leads: dominoDoubleSixLead,
      };
    } else if (gameType === "ludo") {
      rulesConfig = {
        target_pawns: ludoTargetPawns,
        fast_exit: ludoFastMode,
        capture_bonus: ludoCaptureBonus,
      };
    } else if (gameType === "rami") {
      rulesConfig = {
        target_score: ramiTargetScore,
        initial_meld_min: ramiInitialMeld,
      };
    } else if (gameType === "poker") {
      rulesConfig = {
        speed: pokerSpeed,
        small_blind: pokerSmallBlind,
        big_blind: pokerSmallBlind * 2,
      };
    }

    const payload: CreateTablePayload = {
      name:
        name.trim() ||
        `${currentGame.name} ${isPrivate ? "Privé" : "Standard"}`,
      game_type: gameType,
      max_players: maxPlayers,
      is_private: isPrivate,
      stake_amount: stakeAmount,
      turn_duration: turnDuration,
      rules_config: rulesConfig,
    };

    try {
      await onSubmit(payload);
      onClose();
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Erreur lors de la création de la table",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={onClose}
      style={{
        zIndex: 1000,
        backgroundColor: "rgba(10, 14, 23, 0.82)",
        backdropFilter: "blur(6px)",
      }}
    >
      <section
        className="create-table-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-table-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(96vw, 560px)",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "24px",
          background: "#161b26",
          border: "1px solid rgba(218, 170, 74, 0.4)",
          borderRadius: "16px",
          boxShadow: "0 25px 60px rgba(0,0,0,0.6)",
        }}
      >
        {/* En-tête */}
        <div className="modal-heading" style={{ marginBottom: "16px" }}>
          <div>
            <span
              className="eyebrow"
              style={{
                color: "#e8c374",
                textTransform: "uppercase",
                fontSize: "11px",
                letterSpacing: "1px",
                fontWeight: 700,
              }}
            >
              Configurateur de Table
            </span>
            <h2
              id="create-table-title"
              style={{ margin: "4px 0 0", fontSize: "20px", color: "#fff" }}
            >
              Créer une Table Personnalisée
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Fermer"
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "none",
              color: "#fff",
              borderRadius: "50%",
              width: "36px",
              height: "36px",
              cursor: "pointer",
              fontSize: "18px",
            }}
          >
            ✕
          </button>
        </div>

        {errorMessage && (
          <div
            style={{
              padding: "10px 14px",
              marginBottom: "16px",
              borderRadius: "8px",
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              color: "#fca5a5",
              fontSize: "13px",
            }}
          >
            {errorMessage}
          </div>
        )}

        {/* 1. Sélection du Jeu */}
        <label
          className="field-label"
          style={{ fontWeight: 600, color: "#cbd5e1", fontSize: "13px" }}
        >
          1. Choisir le Jeu
        </label>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(95px, 1fr))",
            gap: "8px",
            marginBottom: "16px",
          }}
        >
          {GAME_OPTIONS.map((g) => {
            const isSelected = g.id === gameType;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => handleGameSelect(g.id)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "10px 6px",
                  borderRadius: "10px",
                  border: isSelected
                    ? "2px solid #e8c374"
                    : "1px solid rgba(255,255,255,0.1)",
                  background: isSelected
                    ? "rgba(232, 195, 116, 0.12)"
                    : "rgba(255,255,255,0.03)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <span style={{ fontSize: "22px", marginBottom: "4px" }}>
                  {g.icon}
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: isSelected ? 700 : 500,
                    color: isSelected ? "#e8c374" : "#94a3b8",
                    textAlign: "center",
                  }}
                >
                  {g.name.split(" ")[0]}
                </span>
              </button>
            );
          })}
        </div>

        {/* 2. Nom de la Table */}
        <label
          className="field-label"
          htmlFor="table-name-input"
          style={{ fontWeight: 600, color: "#cbd5e1", fontSize: "13px" }}
        >
          2. Nom de la table
        </label>
        <input
          id="table-name-input"
          className="text-input"
          value={name}
          placeholder={`Ex: Salon ${currentGame.name}, Amis du Dimanche...`}
          onChange={(e) => setName(e.target.value)}
          style={{
            width: "100%",
            marginBottom: "16px",
            boxSizing: "border-box",
          }}
        />

        {/* 3. Mises en Ariary */}
        <label
          className="field-label"
          style={{ fontWeight: 600, color: "#cbd5e1", fontSize: "13px" }}
        >
          3. Mise par joueur (Stakes)
        </label>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "8px",
            marginBottom: "16px",
          }}
        >
          {STAKE_PRESETS.map((preset) => {
            const isSelected = stakeAmount === preset.value;
            return (
              <button
                key={preset.value}
                type="button"
                onClick={() => setStakeAmount(preset.value)}
                style={{
                  padding: "8px 6px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: isSelected ? 700 : 500,
                  border: isSelected
                    ? "1px solid #e8c374"
                    : "1px solid rgba(255,255,255,0.08)",
                  background: isSelected
                    ? "rgba(232, 195, 116, 0.15)"
                    : "rgba(255,255,255,0.03)",
                  color: isSelected ? "#e8c374" : "#94a3b8",
                  cursor: "pointer",
                }}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* 4. Durée du Tour (Chronomètre) */}
        <label
          className="field-label"
          style={{ fontWeight: 600, color: "#cbd5e1", fontSize: "13px" }}
        >
          4. Rythme & Réflexion (Chrono par tour)
        </label>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "8px",
            marginBottom: "16px",
          }}
        >
          {TIMER_PRESETS.map((timer) => {
            const isSelected = turnDuration === timer.value;
            return (
              <button
                key={timer.value}
                type="button"
                onClick={() => setTurnDuration(timer.value)}
                style={{
                  padding: "8px 6px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: isSelected ? 700 : 500,
                  border: isSelected
                    ? "1px solid #38bdf8"
                    : "1px solid rgba(255,255,255,0.08)",
                  background: isSelected
                    ? "rgba(56, 189, 248, 0.15)"
                    : "rgba(255,255,255,0.03)",
                  color: isSelected ? "#38bdf8" : "#94a3b8",
                  cursor: "pointer",
                }}
              >
                {timer.label}
              </button>
            );
          })}
        </div>

        {/* 5. Nombre de Joueurs (si variable) */}
        {currentGame.allowedPlayers.length > 1 && (
          <div style={{ marginBottom: "16px" }}>
            <label
              className="field-label"
              style={{ fontWeight: 600, color: "#cbd5e1", fontSize: "13px" }}
            >
              5. Nombre de Joueurs
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              {currentGame.allowedPlayers.map((count) => {
                const isSelected = maxPlayers === count;
                return (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setMaxPlayers(count)}
                    style={{
                      flex: 1,
                      padding: "8px",
                      borderRadius: "8px",
                      fontSize: "12px",
                      fontWeight: isSelected ? 700 : 500,
                      border: isSelected
                        ? "1px solid #a855f7"
                        : "1px solid rgba(255,255,255,0.08)",
                      background: isSelected
                        ? "rgba(168, 85, 247, 0.15)"
                        : "rgba(255,255,255,0.03)",
                      color: isSelected ? "#c084fc" : "#94a3b8",
                      cursor: "pointer",
                    }}
                  >
                    {count} Joueurs
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 6. Spécificités & Règles du Jeu */}
        <div
          style={{
            padding: "12px",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "10px",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              fontSize: "12px",
              fontWeight: 700,
              color: "#e8c374",
              marginBottom: "8px",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Spécificités : {currentGame.name}
          </div>

          {/* Belote */}
          {gameType === "belote" && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "10px" }}
            >
              <div>
                <label
                  style={{
                    fontSize: "12px",
                    color: "#94a3b8",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Score de victoire :
                </label>
                <div style={{ display: "flex", gap: "6px" }}>
                  {[
                    { label: "501 pts (Express)", val: 501 },
                    { label: "1 001 pts (Standard)", val: 1001 },
                    { label: "1 501 pts (Marathon)", val: 1501 },
                  ].map((s) => (
                    <button
                      key={s.val}
                      type="button"
                      onClick={() => setBeloteTargetScore(s.val)}
                      style={{
                        flex: 1,
                        padding: "6px 4px",
                        fontSize: "11px",
                        borderRadius: "6px",
                        border:
                          beloteTargetScore === s.val
                            ? "1px solid #e8c374"
                            : "1px solid rgba(255,255,255,0.1)",
                        background:
                          beloteTargetScore === s.val
                            ? "rgba(232, 195, 116, 0.2)"
                            : "transparent",
                        color:
                          beloteTargetScore === s.val ? "#e8c374" : "#94a3b8",
                        cursor: "pointer",
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  style={{
                    fontSize: "12px",
                    color: "#94a3b8",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Variante de jeu :
                </label>
                <div style={{ display: "flex", gap: "6px" }}>
                  {[
                    { id: "classique", label: "Classique" },
                    { id: "coinche", label: "Coinchée" },
                    { id: "tout_atout", label: "Tout Atout / Sans Atout" },
                  ].map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setBeloteVariant(v.id)}
                      style={{
                        flex: 1,
                        padding: "6px 4px",
                        fontSize: "11px",
                        borderRadius: "6px",
                        border:
                          beloteVariant === v.id
                            ? "1px solid #e8c374"
                            : "1px solid rgba(255,255,255,0.1)",
                        background:
                          beloteVariant === v.id
                            ? "rgba(232, 195, 116, 0.2)"
                            : "transparent",
                        color: beloteVariant === v.id ? "#e8c374" : "#94a3b8",
                        cursor: "pointer",
                      }}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "12px",
                  color: "#cbd5e1",
                  cursor: "pointer",
                  marginTop: "4px",
                }}
              >
                <input
                  type="checkbox"
                  checked={beloteAnnouncements}
                  onChange={(e) => setBeloteAnnouncements(e.target.checked)}
                />
                Autoriser les annonces de cartes (Tierce, 50, 100, Carré)
              </label>
            </div>
          )}

          {/* Domino */}
          {gameType === "domino" && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "10px" }}
            >
              <div>
                <label
                  style={{
                    fontSize: "12px",
                    color: "#94a3b8",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Score cible :
                </label>
                <div style={{ display: "flex", gap: "6px" }}>
                  {[
                    { label: "1 Manche sèche", val: 1 },
                    { label: "100 pts (Express)", val: 100 },
                    { label: "150 pts (Standard)", val: 150 },
                    { label: "200 pts", val: 200 },
                  ].map((s) => (
                    <button
                      key={s.val}
                      type="button"
                      onClick={() => setDominoTargetScore(s.val)}
                      style={{
                        flex: 1,
                        padding: "6px 4px",
                        fontSize: "11px",
                        borderRadius: "6px",
                        border:
                          dominoTargetScore === s.val
                            ? "1px solid #e8c374"
                            : "1px solid rgba(255,255,255,0.1)",
                        background:
                          dominoTargetScore === s.val
                            ? "rgba(232, 195, 116, 0.2)"
                            : "transparent",
                        color:
                          dominoTargetScore === s.val ? "#e8c374" : "#94a3b8",
                        cursor: "pointer",
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "12px",
                  color: "#cbd5e1",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={dominoDoubleSixLead}
                  onChange={(e) => setDominoDoubleSixLead(e.target.checked)}
                />
                Premier tour : Pose du Double-Six obligatoire en ouverture
              </label>
            </div>
          )}

          {/* Ludo */}
          {gameType === "ludo" && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "10px" }}
            >
              <div>
                <label
                  style={{
                    fontSize: "12px",
                    color: "#94a3b8",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Condition de victoire :
                </label>
                <div style={{ display: "flex", gap: "6px" }}>
                  {[
                    { label: "1 pion (Express ~3 min)", val: 1 },
                    { label: "2 pions (Rapide)", val: 2 },
                    { label: "4 pions (Complet officiel)", val: 4 },
                  ].map((p) => (
                    <button
                      key={p.val}
                      type="button"
                      onClick={() => setLudoTargetPawns(p.val)}
                      style={{
                        flex: 1,
                        padding: "6px 4px",
                        fontSize: "11px",
                        borderRadius: "6px",
                        border:
                          ludoTargetPawns === p.val
                            ? "1px solid #e8c374"
                            : "1px solid rgba(255,255,255,0.1)",
                        background:
                          ludoTargetPawns === p.val
                            ? "rgba(232, 195, 116, 0.2)"
                            : "transparent",
                        color:
                          ludoTargetPawns === p.val ? "#e8c374" : "#94a3b8",
                        cursor: "pointer",
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  marginTop: "2px",
                }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "12px",
                    color: "#cbd5e1",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={ludoFastMode}
                    onChange={(e) => setLudoFastMode(e.target.checked)}
                  />
                  Sortie accélérée : Sortir un pion sur 1 ou 6 (au lieu de 6
                  uniquement)
                </label>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "12px",
                    color: "#cbd5e1",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={ludoCaptureBonus}
                    onChange={(e) => setLudoCaptureBonus(e.target.checked)}
                  />
                  Bonus de capture : Relancer le dé après avoir mangé un pion
                  adverse
                </label>
              </div>
            </div>
          )}

          {/* Rami */}
          {gameType === "rami" && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "10px" }}
            >
              <div>
                <label
                  style={{
                    fontSize: "12px",
                    color: "#94a3b8",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Score d'élimination :
                </label>
                <div style={{ display: "flex", gap: "6px" }}>
                  {[
                    { label: "101 points (Standard Malagasy)", val: 101 },
                    { label: "201 points (Partie longue)", val: 201 },
                  ].map((s) => (
                    <button
                      key={s.val}
                      type="button"
                      onClick={() => setRamiTargetScore(s.val)}
                      style={{
                        flex: 1,
                        padding: "6px 4px",
                        fontSize: "11px",
                        borderRadius: "6px",
                        border:
                          ramiTargetScore === s.val
                            ? "1px solid #e8c374"
                            : "1px solid rgba(255,255,255,0.1)",
                        background:
                          ramiTargetScore === s.val
                            ? "rgba(232, 195, 116, 0.2)"
                            : "transparent",
                        color:
                          ramiTargetScore === s.val ? "#e8c374" : "#94a3b8",
                        cursor: "pointer",
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  style={{
                    fontSize: "12px",
                    color: "#94a3b8",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Première pose minimale :
                </label>
                <div style={{ display: "flex", gap: "6px" }}>
                  {[
                    { label: "40 points (Madagascar)", val: 40 },
                    { label: "51 points (Avec tierce franche)", val: 51 },
                  ].map((m) => (
                    <button
                      key={m.val}
                      type="button"
                      onClick={() => setRamiInitialMeld(m.val)}
                      style={{
                        flex: 1,
                        padding: "6px 4px",
                        fontSize: "11px",
                        borderRadius: "6px",
                        border:
                          ramiInitialMeld === m.val
                            ? "1px solid #e8c374"
                            : "1px solid rgba(255,255,255,0.1)",
                        background:
                          ramiInitialMeld === m.val
                            ? "rgba(232, 195, 116, 0.2)"
                            : "transparent",
                        color:
                          ramiInitialMeld === m.val ? "#e8c374" : "#94a3b8",
                        cursor: "pointer",
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Poker */}
          {gameType === "poker" && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "10px" }}
            >
              <div>
                <label
                  style={{
                    fontSize: "12px",
                    color: "#94a3b8",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Structure des Blindes (Petite / Grosse) :
                </label>
                <div style={{ display: "flex", gap: "6px" }}>
                  {[
                    { label: "10 / 20 Ar", sb: 10 },
                    { label: "25 / 50 Ar", sb: 25 },
                    { label: "50 / 100 Ar", sb: 50 },
                    { label: "200 / 400 Ar", sb: 200 },
                  ].map((b) => (
                    <button
                      key={b.sb}
                      type="button"
                      onClick={() => setPokerSmallBlind(b.sb)}
                      style={{
                        flex: 1,
                        padding: "6px 4px",
                        fontSize: "11px",
                        borderRadius: "6px",
                        border:
                          pokerSmallBlind === b.sb
                            ? "1px solid #e8c374"
                            : "1px solid rgba(255,255,255,0.1)",
                        background:
                          pokerSmallBlind === b.sb
                            ? "rgba(232, 195, 116, 0.2)"
                            : "transparent",
                        color:
                          pokerSmallBlind === b.sb ? "#e8c374" : "#94a3b8",
                        cursor: "pointer",
                      }}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  style={{
                    fontSize: "12px",
                    color: "#94a3b8",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Vitesse d'évolution :
                </label>
                <div style={{ display: "flex", gap: "6px" }}>
                  {[
                    { id: "turbo", label: "⚡ Turbo (3 min)" },
                    { id: "regular", label: "⏱️ Standard (8 min)" },
                  ].map((sp) => (
                    <button
                      key={sp.id}
                      type="button"
                      onClick={() => setPokerSpeed(sp.id)}
                      style={{
                        flex: 1,
                        padding: "6px 4px",
                        fontSize: "11px",
                        borderRadius: "6px",
                        border:
                          pokerSpeed === sp.id
                            ? "1px solid #e8c374"
                            : "1px solid rgba(255,255,255,0.1)",
                        background:
                          pokerSpeed === sp.id
                            ? "rgba(232, 195, 116, 0.2)"
                            : "transparent",
                        color: pokerSpeed === sp.id ? "#e8c374" : "#94a3b8",
                        cursor: "pointer",
                      }}
                    >
                      {sp.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 7. Salon Public vs Privé */}
        <label
          className="private-toggle"
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "12px",
            padding: "12px",
            background: isPrivate
              ? "rgba(168, 85, 247, 0.1)"
              : "rgba(255,255,255,0.02)",
            border: isPrivate
              ? "1px solid rgba(168, 85, 247, 0.4)"
              : "1px solid rgba(255,255,255,0.06)",
            borderRadius: "10px",
            cursor: "pointer",
            marginBottom: "20px",
          }}
        >
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            style={{ marginTop: "3px" }}
          />
          <div>
            <strong
              style={{
                color: isPrivate ? "#c084fc" : "#fff",
                fontSize: "13px",
                display: "block",
              }}
            >
              🔒 Table Privée avec Code d'Accès
            </strong>
            <small
              style={{
                color: "#94a3b8",
                fontSize: "11.5px",
                display: "block",
                marginTop: "2px",
                lineHeight: 1.4,
              }}
            >
              La table sera masquée du lobby public. Un code unique à 6
              caractères sera généré pour inviter vos amis en direct via
              WhatsApp ou copie en un clic.
            </small>
          </div>
        </label>

        {/* Actions */}
        <div
          className="modal-actions"
          style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}
        >
          <button
            type="button"
            className="button button-outline"
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: "10px 18px",
              borderRadius: "8px",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            className="button button-gold"
            disabled={submitting}
            onClick={() => void handleCreate()}
            style={{
              padding: "10px 22px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {submitting ? "Création en cours..." : "Créer et Ouvrir la Table"}
          </button>
        </div>
      </section>
    </div>
  );
};
