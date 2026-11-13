import { useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Check, Users, ArrowLeft, LogOut, Shield } from "lucide-react";

export interface WaitingPlayer {
  id: string;
  name: string;
  seat?: number;
  isCreator?: boolean;
  isBot?: boolean;
  isActive?: boolean;
}

interface WaitingRoomProps {
  tableId: string;
  tableName: string;
  tableCode?: string;
  gameType: string;
  maxPlayers: number;
  currentPlayers: WaitingPlayer[];
  currentUserId?: string;
  stakeAmount?: number;
  turnDuration?: number;
  isPrivate?: boolean;
  accessCode?: string | null;
  connectionError?: string;
  onLeave: () => void;
}

const GAME_EMOJIS: Record<string, string> = {
  poker: "♠",
  belote: "🂠",
  rami: "🂡",
  ludo: "🎲",
  domino: "🀰",
};

const GAME_NAMES: Record<string, string> = {
  poker: "Poker Texas Hold'em",
  belote: "Belote Contrée",
  rami: "Rami Malagasy",
  ludo: "Ludo Mada",
  domino: "Domino Gasikara",
};

export function WaitingRoom({
  tableName,
  gameType,
  maxPlayers,
  currentPlayers,
  currentUserId,
  stakeAmount = 0,
  turnDuration = 30,
  isPrivate = false,
  accessCode,
  connectionError,
  onLeave,
}: WaitingRoomProps) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  const emoji = GAME_EMOJIS[gameType.toLowerCase()] || "🎮";
  const gameLabel = GAME_NAMES[gameType.toLowerCase()] || gameType;
  const confirmedConnections = currentPlayers.filter((p) => p.isActive === true).length;
  const seatedCount = currentPlayers.length;
  const isPoker = gameType.toLowerCase() === "poker";
  const minRequired = isPoker ? 2 : maxPlayers;
  const remaining = Math.max(0, minRequired - seatedCount);

  // A public table identifier must never be offered as a private join secret.
  const invitationCode = isPrivate ? accessCode || "" : "";

  const handleCopyCode = async () => {
    if (!invitationCode) return;
    try {
      await navigator.clipboard.writeText(invitationCode);
      setCopied(true);
      setCopyError("");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError("Copie indisponible. Sélectionnez le code manuellement.");
    }
  };

  // Build the list of seats
  const seats: Array<WaitingPlayer | null> = [];
  for (let i = 0; i < maxPlayers; i++) {
    const playerAtSeat = currentPlayers.find((p) => p.seat === i) || null;
    seats.push(playerAtSeat);
  }

  return (
    <div
      style={{
        maxWidth: "600px",
        margin: "0 auto",
        padding: "16px",
        minHeight: "80vh",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      {/* Top Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingBottom: "12px",
          borderBottom: "1px solid var(--border-color, #2a3742)",
        }}
      >
        <Link
          to={`/lobby/${gameType}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            color: "var(--text-secondary, #adb9c4)",
            textDecoration: "none",
            fontSize: "14px",
            fontWeight: 500,
          }}
        >
          <ArrowLeft size={16} />
          <span>Tables {gameLabel}</span>
        </Link>
        <button
          type="button"
          onClick={onLeave}
          className="button button-ghost"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            color: "#e57373",
            padding: "6px 12px",
            fontSize: "13px",
            borderRadius: "8px",
            border: "1px solid rgba(229, 115, 115, 0.3)",
            background: "rgba(229, 115, 115, 0.08)",
            cursor: "pointer",
          }}
        >
          <LogOut size={14} />
          <span>Quitter</span>
        </button>
      </div>

      {connectionError && (
        <p
          className="form-error game-connection-error"
          style={{
            margin: "12px 0",
            padding: "10px 14px",
            borderRadius: "8px",
            background: "rgba(229, 115, 115, 0.15)",
            border: "1px solid rgba(229, 115, 115, 0.4)",
            color: "#ff8a80",
            fontSize: "14px",
          }}
        >
          {connectionError}
        </p>
      )}

      {/* Title & Status */}
      <div>
        <span
          style={{
            fontSize: "12px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--accent-gold, #e1bf79)",
            fontWeight: 600,
          }}
        >
          Salle d'attente · Présence
        </span>
        <h1
          style={{
            fontSize: "1.5rem",
            fontWeight: 700,
            margin: "4px 0 8px 0",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span>{emoji}</span>
          <span>{tableName || `${gameLabel} entre amis`}</span>
        </h1>
      </div>

      {/* Notice Banner */}
      <div
        style={{
          padding: "14px 16px",
          borderRadius: "12px",
          backgroundColor:
            remaining === 0
              ? "rgba(112, 215, 173, 0.15)"
              : "rgba(225, 191, 121, 0.12)",
          border: `1px solid ${remaining === 0 ? "#70d7ad" : "rgba(225, 191, 121, 0.4)"}`,
          color: remaining === 0 ? "#70d7ad" : "#e1bf79",
          fontSize: "14px",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}
      >
        <Users size={18} />
        <span>
          {remaining === 0
            ? "Les places nécessaires sont occupées. En attente de la confirmation du moteur de jeu."
            : `${seatedCount} place(s) occupée(s) sur ${maxPlayers}. Encore ${remaining} participant(s) requis.`}
        </span>
      </div>

      {/* Participants List */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          background: "var(--surface-color, #151d25)",
          borderRadius: "16px",
          border: "1px solid var(--border-color, #2a3742)",
          padding: "16px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingBottom: "8px",
            borderBottom: "1px solid var(--border-color, #2a3742)",
            fontSize: "13px",
            color: "var(--text-secondary, #adb9c4)",
          }}
        >
          <span>
            Participants ({seatedCount}/{maxPlayers})
          </span>
          <span>{confirmedConnections} connexion(s) confirmée(s)</span>
        </div>

        {seats.map((player, index) => {
          const isMe = Boolean(
            player &&
            currentUserId &&
            (player.id === currentUserId ||
              player.id === String(currentUserId)),
          );
          return (
            <div
              key={player?.id || `seat-${index}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 0",
                borderBottom:
                  index < maxPlayers - 1
                    ? "1px solid rgba(42, 55, 66, 0.5)"
                    : "none",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "12px" }}
              >
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "50%",
                    backgroundColor: player
                      ? isMe
                        ? "var(--accent-gold, #e1bf79)"
                        : "#334652"
                      : "rgba(42, 55, 66, 0.4)",
                    color: player
                      ? isMe
                        ? "#16120b"
                        : "#fff"
                      : "var(--text-secondary, #adb9c4)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: "15px",
                    border: isMe ? "2px solid #e1bf79" : "none",
                  }}
                >
                  {player ? player.name.slice(0, 1).toUpperCase() : index + 1}
                </div>
                <div>
                  {player ? (
                    <div>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: "14px",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <span>
                          {isMe ? `Vous · ${player.name}` : player.name}
                        </span>
                        {player.isCreator && (
                          <span
                            style={{
                              fontSize: "10px",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              backgroundColor: "rgba(225, 191, 121, 0.2)",
                              color: "var(--accent-gold, #e1bf79)",
                              fontWeight: 700,
                              textTransform: "uppercase",
                            }}
                          >
                            Créateur
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "12px", color: "#70d7ad" }}>
                        {player.isActive === false
                          ? "Reconnexion en cours"
                          : player.isActive === true
                            ? "Connexion confirmée"
                            : "Présence à confirmer"}
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        color: "var(--text-secondary, #adb9c4)",
                        fontSize: "13px",
                      }}
                    >
                      Place libre
                    </div>
                  )}
                </div>
              </div>
              <span
                style={{
                  fontSize: "12px",
                  color: "var(--text-secondary, #adb9c4)",
                }}
              >
                Siège {index + 1}
              </span>
            </div>
          );
        })}
      </div>

      {/* Private Code Card */}
      {isPrivate && invitationCode && (
        <div
          style={{
            background: "var(--surface-color, #151d25)",
            borderRadius: "16px",
            border: "1px solid var(--border-color, #2a3742)",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Shield size={16} color="var(--accent-gold, #e1bf79)" />
            <span
              style={{
                fontSize: "13px",
                color: "var(--text-secondary, #adb9c4)",
              }}
            >
              Table privée — Partagez ce code à vos amis
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "#0b1014",
              borderRadius: "10px",
              padding: "10px 14px",
              border: "1px solid var(--border-color, #2a3742)",
            }}
          >
            <span
              style={{
                fontFamily: "monospace",
                fontSize: "1.25rem",
                fontWeight: 700,
                letterSpacing: "0.15em",
                color: "var(--accent-gold, #e1bf79)",
              }}
            >
              {invitationCode}
            </span>
            <button
              type="button"
              onClick={handleCopyCode}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                border: "1px solid var(--border-color, #2a3742)",
                background: "transparent",
                color: copied ? "#70d7ad" : "inherit",
                padding: "8px 12px",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "13px",
                minHeight: "44px",
              }}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              <span>{copied ? "Copié !" : "Copier"}</span>
            </button>
          </div>
          {copyError && <p role="alert" style={{ color: "var(--red)", margin: 0 }}>{copyError}</p>}
        </div>
      )}
      {isPrivate && !invitationCode && (
        <p className="playing-v2-notice" role="status">
          Le code privé n'est pas disponible pour ce compte. Demandez une invitation au créateur.
        </p>
      )}

      {/* Table details footer */}
      <div
        style={{
          marginTop: "auto",
          padding: "14px 16px",
          borderRadius: "12px",
          border: "1px solid var(--border-color, #2a3742)",
          fontSize: "13px",
          color: "var(--text-secondary, #adb9c4)",
          textAlign: "center",
        }}
      >
        <span>
          Participation :{" "}
          <strong>
            {stakeAmount > 0 ? `${stakeAmount.toLocaleString()} Ar` : "Gratuit"}
          </strong>
        </span>
        <span style={{ margin: "0 8px" }}>·</span>
        <span>
          <strong>{maxPlayers}</strong> places
        </span>
        <span style={{ margin: "0 8px" }}>·</span>
        <span>
          Tour de <strong>{turnDuration}s</strong>
        </span>
      </div>
    </div>
  );
}
