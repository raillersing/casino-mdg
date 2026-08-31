import { useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Loader2,
  Lock,
  Phone,
  Smartphone,
  X,
} from "lucide-react";
import { createPaymentIntent, type PaymentIntentResponse } from "@services/payments";

interface WithdrawalModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string | null;
  availableBalance: number;
  defaultPhone?: string;
  onWithdrawalSuccess: () => void;
}

const OPERATORS = [
  {
    id: "mvola" as const,
    name: "MVola",
    network: "Telma (034, 038)",
    color: "#E5A800",
    bg: "rgba(229, 168, 0, 0.12)",
    border: "rgba(229, 168, 0, 0.35)",
  },
  {
    id: "orange" as const,
    name: "Orange Money",
    network: "Orange (032, 037)",
    color: "#FF7900",
    bg: "rgba(255, 121, 0, 0.12)",
    border: "rgba(255, 121, 0, 0.35)",
  },
  {
    id: "airtel" as const,
    name: "Airtel Money",
    network: "Airtel (033)",
    color: "#E60000",
    bg: "rgba(230, 0, 0, 0.12)",
    border: "rgba(230, 0, 0, 0.35)",
  },
];

export function WithdrawalModal({
  isOpen,
  onClose,
  token,
  availableBalance,
  defaultPhone = "",
  onWithdrawalSuccess,
}: WithdrawalModalProps) {
  const [operator, setOperator] = useState<"mvola" | "orange" | "airtel">("mvola");
  const [phone, setPhone] = useState(defaultPhone.replace("+261", "0"));
  const [amount, setAmount] = useState<number>(availableBalance > 5000 ? 5000 : availableBalance);
  const [customAmount, setCustomAmount] = useState<string>(
    availableBalance > 5000 ? "5000" : availableBalance.toString()
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PaymentIntentResponse | null>(null);

  if (!isOpen) return null;

  const handlePhoneChange = (val: string) => {
    setPhone(val);
    const cleaned = val.replace(/\s+/g, "");
    if (cleaned.startsWith("034") || cleaned.startsWith("038")) {
      setOperator("mvola");
    } else if (cleaned.startsWith("032") || cleaned.startsWith("037")) {
      setOperator("orange");
    } else if (cleaned.startsWith("033")) {
      setOperator("airtel");
    }
  };

  const handleAmountChange = (val: string) => {
    setCustomAmount(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setAmount(parsed);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError("Connexion requise.");
      return;
    }
    if (!phone || phone.length < 9) {
      setError("Veuillez saisir un numéro de téléphone valide.");
      return;
    }
    if (amount < 1000) {
      setError("Le montant minimum de retrait est de 1 000 Ar.");
      return;
    }
    if (amount > availableBalance) {
      setError(`Solde insuffisant. Votre solde disponible est de ${availableBalance.toLocaleString("fr-FR")} Ar.`);
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    const idempotencyKey = `wdl-${operator}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    try {
      const res = await createPaymentIntent(
        token,
        operator,
        "withdrawal",
        amount,
        phone,
        idempotencyKey,
        true
      );
      setResult(res);
      onWithdrawalSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Échec de l'initialisation du retrait.");
    } finally {
      setLoading(false);
    }
  };

  const activeOp = OPERATORS.find((o) => o.id === operator) || OPERATORS[0];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card withdrawal-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "540px", width: "95%" }}
      >
        <div className="modal-header">
          <div className="modal-title-lockup">
            <span className="eyebrow gold">Retrait Mobile Money</span>
            <h2>Retirer vos gains en Ariary</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        {result ? (
          <div className="withdrawal-success-screen" style={{ padding: "20px 0", textAlign: "center" }}>
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                background: "rgba(105, 214, 160, 0.15)",
                color: "var(--green)",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 16px",
              }}
            >
              <CheckCircle2 size={32} />
            </div>

            <h3>Demande de retrait enregistrée !</h3>
            <p style={{ color: "var(--muted)", fontSize: "13px", maxWidth: "420px", margin: "8px auto 16px" }}>
              {result.message ||
                `Votre demande de retrait de ${amount.toLocaleString("fr-FR")} Ar vers le numéro ${phone} (${activeOp.name}) est en cours de transfert.`}
            </p>

            <div
              style={{
                background: "var(--panel-2)",
                borderRadius: "8px",
                padding: "14px",
                margin: "16px 0",
                textAlign: "left",
                fontSize: "12px",
                border: "1px solid var(--line)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ color: "var(--muted)" }}>Opérateur :</span>
                <strong>{activeOp.name}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ color: "var(--muted)" }}>Montant :</span>
                <strong style={{ color: "var(--gold)" }}>{amount.toLocaleString("fr-FR")} Ar</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ color: "var(--muted)" }}>Numéro de réception :</span>
                <strong>{phone}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>Référence :</span>
                <code>{result.provider_reference}</code>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "20px" }}>
              <button type="button" className="button button-primary" onClick={onClose}>
                Terminé
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="withdrawal-form" style={{ marginTop: "12px" }}>
            {error && (
              <div className="alert-box error" style={{ marginBottom: "16px" }}>
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            {/* Solde disponible */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 14px",
                borderRadius: "8px",
                background: "var(--panel-2)",
                border: "1px solid var(--line)",
                marginBottom: "16px",
              }}
            >
              <div>
                <span style={{ fontSize: "11px", color: "var(--muted)", display: "block" }}>
                  Solde réel disponible
                </span>
                <strong style={{ fontSize: "16px", color: "var(--gold)" }}>
                  {availableBalance.toLocaleString("fr-FR")} Ar
                </strong>
              </div>
              <button
                type="button"
                className="button button-sm button-secondary"
                onClick={() => {
                  setAmount(availableBalance);
                  setCustomAmount(availableBalance.toString());
                }}
              >
                Max
              </button>
            </div>

            {/* Choix de l'opérateur */}
            <div style={{ marginBottom: "16px" }}>
              <label className="input-label" style={{ display: "block", marginBottom: "8px", fontSize: "12px", color: "var(--muted)" }}>
                1. Opérateur Mobile Money de réception
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                {OPERATORS.map((op) => {
                  const isSelected = operator === op.id;
                  return (
                    <button
                      key={op.id}
                      type="button"
                      onClick={() => setOperator(op.id)}
                      style={{
                        padding: "12px 8px",
                        borderRadius: "8px",
                        background: isSelected ? op.bg : "var(--panel)",
                        border: isSelected ? `2px solid ${op.color}` : "1px solid var(--line)",
                        textAlign: "center",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <Smartphone size={20} color={op.color} style={{ margin: "0 auto 4px" }} />
                      <strong style={{ display: "block", fontSize: "13px", color: isSelected ? op.color : "var(--text)" }}>
                        {op.name}
                      </strong>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Numéro de téléphone */}
            <div style={{ marginBottom: "16px" }}>
              <label className="input-label" style={{ display: "block", marginBottom: "6px", fontSize: "12px", color: "var(--muted)" }}>
                2. Numéro du compte récepteur ({activeOp.name})
              </label>
              <div style={{ position: "relative" }}>
                <Phone
                  size={16}
                  style={{
                    position: "absolute",
                    left: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--muted)",
                  }}
                />
                <input
                  type="tel"
                  placeholder="034 00 000 00"
                  value={phone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px 10px 38px",
                    borderRadius: "6px",
                    background: "var(--panel)",
                    border: "1px solid var(--line)",
                    color: "var(--text)",
                    fontSize: "14px",
                  }}
                  required
                />
              </div>
            </div>

            {/* Montant */}
            <div style={{ marginBottom: "18px" }}>
              <label className="input-label" style={{ display: "block", marginBottom: "8px", fontSize: "12px", color: "var(--muted)" }}>
                3. Montant du retrait (Ariary)
              </label>
              <input
                type="number"
                min="1000"
                step="1000"
                value={customAmount}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="Montant en Ariary (min 1 000 Ar)"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "6px",
                  background: "var(--panel)",
                  border: "1px solid var(--line)",
                  color: "var(--text)",
                  fontSize: "14px",
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px",
                borderRadius: "6px",
                background: "rgba(255,255,255,0.03)",
                fontSize: "11px",
                color: "var(--muted)",
                marginBottom: "20px",
              }}
            >
              <Lock size={14} color="var(--gold)" />
              <span>
                Le montant sera bloqué de votre solde et débloqué immédiatement sur votre compte Mobile Money dès confirmation de l'opérateur.
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button type="button" className="button button-outline" onClick={onClose} disabled={loading}>
                Annuler
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={loading || availableBalance < 1000}
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="spin" />
                    <span>Traitement…</span>
                  </>
                ) : (
                  <>
                    <ArrowUpRight size={16} />
                    <span>Retirer {amount.toLocaleString("fr-FR")} Ar</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
