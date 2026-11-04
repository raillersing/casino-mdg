import React, { useState } from "react";
import { GameTable, joinTableByCode } from "../../services/games";

interface JoinPrivateTableModalProps {
  isOpen: boolean;
  accessToken: string;
  onClose: () => void;
  onJoined: (table: GameTable) => void;
}

export const JoinPrivateTableModal: React.FC<JoinPrivateTableModalProps> = ({
  isOpen,
  accessToken,
  onClose,
  onJoined,
}) => {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      setError("Veuillez saisir un code de salle.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const response = await joinTableByCode(accessToken, cleanCode);
      onJoined(response.table);
      onClose();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Code de salle invalide ou table indisponible.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={onClose}
      style={{
        zIndex: 1000,
        backgroundColor: "rgba(10, 14, 23, 0.85)",
        backdropFilter: "blur(6px)",
      }}
    >
      <section
        className="create-table-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="join-private-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(92vw, 440px)",
          padding: "24px",
          background: "#161b26",
          border: "1px solid rgba(168, 85, 247, 0.4)",
          borderRadius: "16px",
          boxShadow: "0 25px 60px rgba(0,0,0,0.65)",
        }}
      >
        <div className="modal-heading" style={{ marginBottom: "16px" }}>
          <div>
            <span
              className="eyebrow"
              style={{
                color: "#c084fc",
                textTransform: "uppercase",
                fontSize: "11px",
                letterSpacing: "1px",
                fontWeight: 700,
              }}
            >
              Salon Privé
            </span>
            <h2
              id="join-private-title"
              style={{ margin: "4px 0 0", fontSize: "20px", color: "#fff" }}
            >
              Rejoindre une Table Privée
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

        <p
          style={{
            color: "#94a3b8",
            fontSize: "13px",
            lineHeight: 1.5,
            marginBottom: "16px",
          }}
        >
          Entrez le code à 6 caractères partagé par votre ami (ex:{" "}
          <strong style={{ color: "#e8c374" }}>XKAMHZ</strong>) ou le code de
          salle pour entrer directement dans la partie.
        </p>

        {error && (
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
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label
            htmlFor="private-table-code"
            style={{
              display: "block",
              fontWeight: 600,
              color: "#cbd5e1",
              fontSize: "13px",
              marginBottom: "8px",
            }}
          >
            Code d'accès de la table
          </label>
          <input
            id="private-table-code"
            type="text"
            className="text-input"
            value={code}
            placeholder="Ex: XKAMHZ"
            autoFocus
            maxLength={16}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            style={{
              width: "100%",
              minHeight: "48px",
              fontSize: "18px",
              fontWeight: 700,
              letterSpacing: "3px",
              textAlign: "center",
              textTransform: "uppercase",
              boxSizing: "border-box",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(168, 85, 247, 0.5)",
              borderRadius: "10px",
              color: "#f8fafc",
              marginBottom: "20px",
            }}
          />

          <div
            className="modal-actions"
            style={{
              display: "flex",
              gap: "10px",
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              className="button button-outline"
              onClick={onClose}
              disabled={loading}
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
              type="submit"
              className="button button-gold"
              disabled={loading || !code.trim()}
              style={{
                padding: "10px 22px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
                background: "linear-gradient(135deg, #a855f7, #6366f1)",
                borderColor: "#a855f7",
                color: "#fff",
              }}
            >
              {loading ? "Connexion..." : "Rejoindre la Salle"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};
