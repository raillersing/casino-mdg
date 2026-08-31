import { LogOut, PauseCircle, Clock, X, AlertTriangle } from "lucide-react";

interface TableExitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLeaveNow: () => void;
  onLeaveNextHand: () => void;
  onToggleSitOut: () => void;
  isSittingOut: boolean;
  leaveAfterHand: boolean;
  hasActiveHand: boolean;
  currentBet?: number;
}

export function TableExitModal({
  isOpen,
  onClose,
  onLeaveNow,
  onLeaveNextHand,
  onToggleSitOut,
  isSittingOut,
  leaveAfterHand,
  hasActiveHand,
  currentBet = 0,
}: TableExitModalProps) {
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
                background: "rgba(229, 115, 115, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#e57373",
              }}
            >
              <LogOut size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>
                Quitter ou Faire une pause
              </h3>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)" }}>
                Gérez votre départ ou mettez votre partie en pause
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

        <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "16px" }}>
          {hasActiveHand && (
            <div
              style={{
                background: "rgba(255, 183, 77, 0.12)",
                border: "1px solid rgba(255, 183, 77, 0.3)",
                borderRadius: "10px",
                padding: "12px",
                display: "flex",
                gap: "10px",
                alignItems: "flex-start",
              }}
            >
              <AlertTriangle size={18} style={{ color: "var(--gold)", flexShrink: 0, marginTop: "2px" }} />
              <div style={{ fontSize: "0.85rem" }}>
                <strong style={{ color: "var(--gold)", display: "block" }}>
                  Main en cours active
                </strong>
                <span>
                  Vous participez actuellement au coup
                  {currentBet > 0 ? ` avec ${currentBet.toLocaleString("fr-FR")} MGA engagés` : ""}.
                  Si vous quittez immédiatement, votre main sera couchée (Fold).
                </span>
              </div>
            </div>
          )}

          {/* Option 1: Quitter à la fin de la main */}
          {hasActiveHand && (
            <button
              type="button"
              className="primary-button"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                background: leaveAfterHand ? "var(--green)" : "rgba(212, 163, 89, 0.15)",
                color: leaveAfterHand ? "#fff" : "var(--gold)",
                border: `1px solid ${leaveAfterHand ? "var(--green)" : "var(--gold)"}`,
                borderRadius: "10px",
                cursor: "pointer",
                fontWeight: 600,
                textAlign: "left",
              }}
              onClick={() => {
                onLeaveNextHand();
                onClose();
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Clock size={20} />
                <div>
                  <span style={{ display: "block", fontSize: "0.95rem" }}>
                    {leaveAfterHand
                      ? "✓ Quitter après cette main (Programmé)"
                      : "Quitter à la fin de cette main"}
                  </span>
                  <span style={{ fontSize: "0.75rem", opacity: 0.85, fontWeight: 400 }}>
                    Terminez votre coup en cours sans perdre vos jetons
                  </span>
                </div>
              </div>
            </button>
          )}

          {/* Option 2: Se mettre en pause / Sit-out */}
          <button
            type="button"
            className="secondary-button"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              background: isSittingOut ? "rgba(99, 102, 241, 0.2)" : "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: "10px",
              cursor: "pointer",
              textAlign: "left",
            }}
            onClick={() => {
              onToggleSitOut();
              onClose();
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <PauseCircle size={20} style={{ color: "var(--accent)" }} />
              <div>
                <span style={{ display: "block", fontSize: "0.95rem", fontWeight: 600 }}>
                  {isSittingOut ? "Reprendre ma place (Désactiver la pause)" : "Prendre une pause (Sit-out)"}
                </span>
                <span style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 400 }}>
                  Gardez votre place à la table en passant automatiquement vos mains
                </span>
              </div>
            </div>
          </button>

          {/* Option 3: Quitter immédiatement */}
          <button
            type="button"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              background: "rgba(229, 115, 115, 0.1)",
              border: "1px solid rgba(229, 115, 115, 0.3)",
              color: "#ef5350",
              borderRadius: "10px",
              cursor: "pointer",
              textAlign: "left",
              fontWeight: 600,
            }}
            onClick={() => {
              onLeaveNow();
              onClose();
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <LogOut size={20} />
              <div>
                <span style={{ display: "block", fontSize: "0.95rem" }}>
                  Quitter la table immédiatement
                </span>
                <span style={{ fontSize: "0.75rem", opacity: 0.85, fontWeight: 400 }}>
                  Retourner au lobby (vos jetons restants seront recrédités)
                </span>
              </div>
            </div>
          </button>
        </div>

        <div style={{ marginTop: "18px", textAlign: "right" }}>
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            style={{ padding: "8px 18px", fontSize: "0.88rem" }}
          >
            Rester à la table
          </button>
        </div>
      </div>
    </div>
  );
}
