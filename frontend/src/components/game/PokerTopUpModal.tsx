import { useState } from "react";
import { Coins, X, ArrowUpRight, CheckCircle2 } from "lucide-react";

interface PokerTopUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmTopUp: (amount: number) => Promise<void>;
  currentStack: number;
  availableBalance: number;
  pendingTopUp?: number;
}

export function PokerTopUpModal({
  isOpen,
  onClose,
  onConfirmTopUp,
  currentStack,
  availableBalance,
  pendingTopUp = 0,
}: PokerTopUpModalProps) {
  const [selectedAmount, setSelectedAmount] = useState<number>(5000);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const quickAmounts = [5000, 10000, 25000, 50000].filter(
    (amt) => amt <= Math.max(5000, availableBalance),
  );

  const previewStack = currentStack + pendingTopUp + selectedAmount;
  const remainingBalance = Math.max(0, availableBalance - selectedAmount);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedAmount <= 0) {
      setError("Le montant doit être supérieur à 0.");
      return;
    }
    if (selectedAmount > availableBalance) {
      setError("Le montant dépasse votre solde disponible.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await onConfirmTopUp(selectedAmount);
      onClose();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Erreur lors de la recharge.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card" style={{ maxWidth: "440px" }}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "rgba(225, 191, 121, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--accent-gold, #e1bf79)",
              }}
            >
              <Coins size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>
                Ajouter des fonds (Tapis)
              </h3>
              <small style={{ color: "var(--text-secondary, #adb9c4)" }}>
                Compléter votre tapis entre deux mains
              </small>
            </div>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: "16px" }}>
          {/* Stack & Balance Summary */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "10px",
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                padding: "12px",
                borderRadius: "10px",
                background: "var(--bg-dark, #0b1014)",
                border: "1px solid var(--border-color, #2a3742)",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-secondary, #adb9c4)",
                }}
              >
                Tapis actuel
              </div>
              <div
                style={{ fontSize: "1.1rem", fontWeight: 700, color: "#fff" }}
              >
                {currentStack.toLocaleString()} Ar
              </div>
            </div>

            <div
              style={{
                padding: "12px",
                borderRadius: "10px",
                background: "var(--bg-dark, #0b1014)",
                border: "1px solid var(--border-color, #2a3742)",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-secondary, #adb9c4)",
                }}
              >
                Solde MGA disponible
              </div>
              <div
                style={{
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  color: "var(--accent-gold, #e1bf79)",
                }}
              >
                {availableBalance.toLocaleString()} Ar
              </div>
            </div>
          </div>

          {pendingTopUp > 0 && (
            <div
              style={{
                padding: "10px 12px",
                borderRadius: "8px",
                backgroundColor: "rgba(112, 215, 173, 0.12)",
                border: "1px solid #70d7ad",
                color: "#70d7ad",
                fontSize: "13px",
                marginBottom: "16px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <CheckCircle2 size={16} />
              <span>
                +{pendingTopUp.toLocaleString()} Ar déjà réservés — ajoutés à la
                prochaine main.
              </span>
            </div>
          )}

          {/* Amount Input */}
          <div style={{ marginBottom: "16px" }}>
            <label
              htmlFor="top-up-amount"
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 600,
                marginBottom: "8px",
              }}
            >
              Montant à ajouter (Ar)
            </label>
            <input
              id="top-up-amount"
              type="number"
              min="1000"
              max={availableBalance}
              step="1000"
              value={selectedAmount || ""}
              onChange={(e) =>
                setSelectedAmount(Math.max(0, Number(e.target.value)))
              }
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: "10px",
                background: "var(--bg-dark, #0b1014)",
                border: "1px solid var(--border-color, #2a3742)",
                color: "#fff",
                fontSize: "16px",
                fontWeight: 600,
              }}
            />
          </div>

          {/* Quick Amount Chips */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
              marginBottom: "16px",
            }}
          >
            {quickAmounts.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setSelectedAmount(amt)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  border:
                    selectedAmount === amt
                      ? "1px solid var(--accent-gold, #e1bf79)"
                      : "1px solid var(--border-color, #2a3742)",
                  background:
                    selectedAmount === amt
                      ? "rgba(225, 191, 121, 0.15)"
                      : "transparent",
                  color:
                    selectedAmount === amt
                      ? "var(--accent-gold, #e1bf79)"
                      : "var(--text-secondary, #adb9c4)",
                }}
              >
                +{amt >= 1000 ? `${amt / 1000}K` : amt} Ar
              </button>
            ))}
            {availableBalance > 0 && (
              <button
                type="button"
                onClick={() => setSelectedAmount(availableBalance)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  border:
                    selectedAmount === availableBalance
                      ? "1px solid var(--accent-gold, #e1bf79)"
                      : "1px solid var(--border-color, #2a3742)",
                  background:
                    selectedAmount === availableBalance
                      ? "rgba(225, 191, 121, 0.15)"
                      : "transparent",
                  color:
                    selectedAmount === availableBalance
                      ? "var(--accent-gold, #e1bf79)"
                      : "var(--text-secondary, #adb9c4)",
                }}
              >
                Max ({availableBalance.toLocaleString()} Ar)
              </button>
            )}
          </div>

          {/* Preview */}
          <div
            style={{
              padding: "12px",
              borderRadius: "10px",
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid var(--border-color, #2a3742)",
              marginBottom: "16px",
              fontSize: "13px",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-secondary, #adb9c4)" }}>
                Nouveau tapis à la prochaine main
              </span>
              <strong style={{ color: "var(--accent-gold, #e1bf79)" }}>
                {previewStack.toLocaleString()} Ar
              </strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-secondary, #adb9c4)" }}>
                Solde restant disponible
              </span>
              <span>{remainingBalance.toLocaleString()} Ar</span>
            </div>
          </div>

          <p
            style={{
              fontSize: "12px",
              color: "var(--text-secondary, #adb9c4)",
              margin: "0 0 16px 0",
              lineHeight: 1.4,
            }}
          >
            Le montant sera réservé sur votre compte MGA et ajouté à votre tapis
            dès la fin de la main courante, sans impacter les mises en cours.
          </p>

          {error && (
            <div
              style={{
                color: "#e57373",
                fontSize: "13px",
                marginBottom: "12px",
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              type="button"
              className="button button-ghost"
              onClick={onClose}
              style={{ flex: 1, minHeight: "44px" }}
              disabled={isSubmitting}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="button button-gold"
              style={{
                flex: 2,
                minHeight: "44px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                fontWeight: 700,
              }}
              disabled={
                isSubmitting ||
                selectedAmount <= 0 ||
                selectedAmount > availableBalance
              }
            >
              <ArrowUpRight size={16} />
              <span>
                {isSubmitting
                  ? "Réservation..."
                  : `Réserver +${selectedAmount.toLocaleString()} Ar`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
