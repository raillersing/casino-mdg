import { Settings2, Volume2, VolumeX, Eye, Sparkles, MessageSquareOff, HelpCircle, X } from "lucide-react";

interface TableSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  soundEnabled: boolean;
  onToggleSound: (enabled: boolean) => void;
  fourColorDeck: boolean;
  onToggleFourColorDeck: (enabled: boolean) => void;
  motionEnabled: boolean;
  onToggleMotion: (enabled: boolean) => void;
  showHandStrength: boolean;
  onToggleHandStrength: (enabled: boolean) => void;
  muteChat: boolean;
  onToggleMuteChat: (enabled: boolean) => void;
}

export function TableSettingsModal({
  isOpen,
  onClose,
  soundEnabled,
  onToggleSound,
  fourColorDeck,
  onToggleFourColorDeck,
  motionEnabled,
  onToggleMotion,
  showHandStrength,
  onToggleHandStrength,
  muteChat,
  onToggleMuteChat,
}: TableSettingsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card" style={{ maxWidth: "480px" }}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "rgba(212, 163, 89, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--gold)",
              }}
            >
              <Settings2 size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>
                Réglages de la table
              </h3>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)" }}>
                Personnalisez votre confort de jeu et l'affichage
              </p>
            </div>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Fermer"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "16px" }}>
          {/* Deck 4 couleurs */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 14px",
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <Eye size={20} style={{ color: "var(--accent)" }} />
              <div>
                <span style={{ display: "block", fontSize: "0.95rem", fontWeight: 600 }}>
                  Jeu de cartes 4 couleurs (Pro)
                </span>
                <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                  ♠ Noir · ♥ Rouge · ♣ Vert · ♦ Bleu (visibilité accrue)
                </span>
              </div>
            </div>
            <label className="switch-toggle" style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={fourColorDeck}
                onChange={(e) => onToggleFourColorDeck(e.target.checked)}
              />
              <span className="slider round" />
            </label>
          </div>

          {/* Bruitages & Audio */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 14px",
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              {soundEnabled ? (
                <Volume2 size={20} style={{ color: "var(--green)" }} />
              ) : (
                <VolumeX size={20} style={{ color: "var(--muted)" }} />
              )}
              <div>
                <span style={{ display: "block", fontSize: "0.95rem", fontWeight: 600 }}>
                  Effets sonores & Alertes
                </span>
                <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                  Sons de jetons, cartes distribuées, annonces de tour
                </span>
              </div>
            </div>
            <label className="switch-toggle" style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => onToggleSound(e.target.checked)}
              />
              <span className="slider round" />
            </label>
          </div>

          {/* Animations & Fluidité */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 14px",
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <Sparkles size={20} style={{ color: "var(--gold)" }} />
              <div>
                <span style={{ display: "block", fontSize: "0.95rem", fontWeight: 600 }}>
                  Animations & Dynamique de table
                </span>
                <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                  Distribution fluide, glissement des jetons et célébrations
                </span>
              </div>
            </div>
            <label className="switch-toggle" style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={motionEnabled}
                onChange={(e) => onToggleMotion(e.target.checked)}
              />
              <span className="slider round" />
            </label>
          </div>

          {/* Indicateur de force de la main */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 14px",
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <HelpCircle size={20} style={{ color: "var(--accent)" }} />
              <div>
                <span style={{ display: "block", fontSize: "0.95rem", fontWeight: 600 }}>
                  Aide : Force de la main en direct
                </span>
                <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                  Affiche votre combinaison actuelle (ex: Deux Paires, Tirage Quinte)
                </span>
              </div>
            </div>
            <label className="switch-toggle" style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={showHandStrength}
                onChange={(e) => onToggleHandStrength(e.target.checked)}
              />
              <span className="slider round" />
            </label>
          </div>

          {/* Mode Silence / Masquer le chat */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 14px",
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <MessageSquareOff size={20} style={{ color: muteChat ? "#ef5350" : "var(--muted)" }} />
              <div>
                <span style={{ display: "block", fontSize: "0.95rem", fontWeight: 600 }}>
                  Mode Concentration (Sourdine du Chat)
                </span>
                <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                  Masquer les émotes et discussions des adversaires
                </span>
              </div>
            </div>
            <label className="switch-toggle" style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={muteChat}
                onChange={(e) => onToggleMuteChat(e.target.checked)}
              />
              <span className="slider round" />
            </label>
          </div>
        </div>

        <div style={{ marginTop: "18px", textAlign: "right" }}>
          <button
            type="button"
            className="primary-button"
            onClick={onClose}
            style={{ padding: "8px 24px", fontSize: "0.9rem" }}
          >
            Appliquer
          </button>
        </div>
      </div>
    </div>
  );
}
