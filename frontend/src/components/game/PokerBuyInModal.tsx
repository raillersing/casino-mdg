import { useState } from "react";
import { Coins, X } from "lucide-react";

interface PokerBuyInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (buyIn: number) => void;
  tableName?: string;
  minStake: number;
  availableBalance: number;
}

export function PokerBuyInModal({
  isOpen,
  onClose,
  onConfirm,
  tableName = "Table Poker",
  minStake,
  availableBalance,
}: PokerBuyInModalProps) {
  const initialBuyIn = Math.min(
    availableBalance,
    Math.max(minStake || 5000, 5000),
  );
  const [buyIn, setBuyIn] = useState<number>(initialBuyIn);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const minRequired = minStake || 5000;
  const quickOptions = [5000, 10000, 25000, 50000, 100000].filter(
    (amt) => amt >= minRequired && amt <= availableBalance,
  );

  const remaining = Math.max(0, availableBalance - buyIn);

  const handleSelectQuick = (amount: number) => {
    setBuyIn(amount);
    setError(null);
  };

  const handleConfirm = () => {
    if (buyIn < minRequired) {
      setError(`Le tapis minimum pour cette table est de ${minRequired.toLocaleString()} Ar.`);
      return;
    }
    if (buyIn > availableBalance) {
      setError("Le tapis choisi dépasse votre solde disponible.");
      return;
    }
    setError(null);
    onConfirm(buyIn);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card" style={{ maxWidth: "440px" }}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
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
              <span
                style={{
                  fontSize: "11px",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--accent-gold, #e1bf79)",
                  fontWeight: 600,
                }}
              >
                Tapis d'entrée · {tableName}
              </span>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>
                Avec combien jouez-vous ?
              </h3>
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

        <div style={{ marginTop: "16px" }}>
          {/* Card Minimum + Solde */}
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "12px",
              background: "var(--bg-dark, #0b1014)",
              border: "1px solid var(--border-color, #2a3742)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "13px",
              }}
            >
              <span style={{ color: "var(--text-secondary, #adb9c4)" }}>
                Minimum de la table
              </span>
              <strong>{minRequired.toLocaleString()} Ar</strong>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "13px",
              }}
            >
              <span style={{ color: "var(--text-secondary, #adb9c4)" }}>
                Mon solde disponible
              </span>
              <strong style={{ color: "var(--accent-gold, #e1bf79)" }}>
                {availableBalance.toLocaleString()} Ar
              </strong>
            </div>
          </div>

          {/* Amount input */}
          <div style={{ marginBottom: "16px" }}>
            <label
              htmlFor="buyin-input"
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 600,
                marginBottom: "6px",
              }}
            >
              Mon tapis (Ar)
            </label>
            <input
              id="buyin-input"
              type="number"
              min={minRequired}
              max={availableBalance}
              step="1000"
              value={buyIn || ""}
              onChange={(e) => {
                setBuyIn(Math.max(0, Number(e.target.value)));
                setError(null);
              }}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: "10px",
                background: "var(--bg-dark, #0b1014)",
                border: "1px solid var(--border-color, #2a3742)",
                color: "#fff",
                fontSize: "18px",
                fontWeight: 700,
              }}
            />
          </div>

          {/* Quick choices */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
              marginBottom: "16px",
            }}
          >
            {quickOptions.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => handleSelectQuick(amt)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  border:
                    buyIn === amt
                      ? "1px solid var(--accent-gold, #e1bf79)"
                      : "1px solid var(--border-color, #2a3742)",
                  background:
                    buyIn === amt
                      ? "rgba(225, 191, 121, 0.15)"
                      : "transparent",
                  color:
                    buyIn === amt
                      ? "var(--accent-gold, #e1bf79)"
                      : "var(--text-secondary, #adb9c4)",
                }}
              >
                {amt >= 1000 ? `${amt / 1000}K` : amt} Ar
              </button>
            ))}
            {availableBalance >= minRequired && (
              <button
                type="button"
                onClick={() => handleSelectQuick(availableBalance)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  border:
                    buyIn === availableBalance
                      ? "1px solid var(--accent-gold, #e1bf79)"
                      : "1px solid var(--border-color, #2a3742)",
                  background:
                    buyIn === availableBalance
                      ? "rgba(225, 191, 121, 0.15)"
                      : "transparent",
                  color:
                    buyIn === availableBalance
                      ? "var(--accent-gold, #e1bf79)"
                      : "var(--text-secondary, #adb9c4)",
                }}
              >
                Max ({availableBalance.toLocaleString()} Ar)
              </button>
            )}
          </div>

          {/* Big Amount & Residual */}
          <div style={{ textAlign: "center", marginBottom: "14px" }}>
            <div
              style={{
                fontSize: "2rem",
                fontWeight: 700,
                color: "var(--accent-gold, #e1bf79)",
              }}
            >
              {buyIn.toLocaleString()} Ar
            </div>
            <p
              style={{
                fontSize: "13px",
                color: "var(--text-secondary, #adb9c4)",
                margin: "4px 0 0 0",
              }}
            >
              Il restera <strong>{remaining.toLocaleString()} Ar</strong> disponibles hors de cette table.
            </p>
          </div>

          <p
            style={{
              fontSize: "12px",
              color: "var(--text-secondary, #adb9c4)",
              margin: "0 0 16px 0",
              lineHeight: 1.4,
            }}
          >
            La table n'impose pas de maximum. Vous pourrez ajouter des fonds entre deux mains depuis votre solde disponible.
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

          <button
            type="button"
            className="button button-gold"
            onClick={handleConfirm}
            style={{
              width: "100%",
              minHeight: "48px",
              fontWeight: 700,
              fontSize: "15px",
            }}
            disabled={buyIn < minRequired || buyIn > availableBalance}
          >
            Rejoindre avec {buyIn.toLocaleString()} Ar
          </button>
          <p
            style={{
              textAlign: "center",
              fontSize: "11px",
              color: "var(--text-secondary, #adb9c4)",
              marginTop: "8px",
            }}
          >
            Le montant est réservé une seule fois par le serveur.
          </p>
        </div>
      </div>
    </div>
  );
}
