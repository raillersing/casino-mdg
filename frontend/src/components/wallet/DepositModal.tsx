import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Lock,
  Phone,
  Smartphone,
  X,
  Zap,
} from "lucide-react";
import { createPaymentIntent, type PaymentIntentResponse } from "@services/payments";

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string | null;
  defaultPhone?: string;
  onDepositSuccess: () => void;
}

const OPERATORS = [
  {
    id: "mvola" as const,
    name: "MVola",
    network: "Telma (034, 038)",
    color: "#E5A800",
    bg: "rgba(229, 168, 0, 0.12)",
    border: "rgba(229, 168, 0, 0.35)",
    ussd: "#111#",
  },
  {
    id: "orange" as const,
    name: "Orange Money",
    network: "Orange (032, 037)",
    color: "#FF7900",
    bg: "rgba(255, 121, 0, 0.12)",
    border: "rgba(255, 121, 0, 0.35)",
    ussd: "#144#",
  },
  {
    id: "airtel" as const,
    name: "Airtel Money",
    network: "Airtel (033)",
    color: "#E60000",
    bg: "rgba(230, 0, 0, 0.12)",
    border: "rgba(230, 0, 0, 0.35)",
    ussd: "#436#",
  },
];

const PRESET_AMOUNTS = [5000, 10000, 20000, 50000, 100000, 200000];

export function DepositModal({
  isOpen,
  onClose,
  token,
  defaultPhone = "",
  onDepositSuccess,
}: DepositModalProps) {
  const [operator, setOperator] = useState<"mvola" | "orange" | "airtel">("mvola");
  const [phone, setPhone] = useState(defaultPhone.replace("+261", "0"));
  const [amount, setAmount] = useState<number>(10000);
  const [customAmount, setCustomAmount] = useState<string>("10000");
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

  const handlePresetClick = (val: number) => {
    setAmount(val);
    setCustomAmount(val.toString());
  };

  const handleCustomChange = (val: string) => {
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
      setError("Veuillez saisir un numéro de téléphone valide (ex: 034 00 000 00).");
      return;
    }
    if (amount < 1000) {
      setError("Le montant minimum de dépôt est de 1 000 Ar.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    const idempotencyKey = `dep-${operator}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    try {
      const res = await createPaymentIntent(
        token,
        operator,
        "deposit",
        amount,
        phone,
        idempotencyKey,
        true // sandbox/simulation
      );
      setResult(res);
      onDepositSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Échec de l'initialisation du paiement.");
    } finally {
      setLoading(false);
    }
  };

  const activeOp = OPERATORS.find((o) => o.id === operator) || OPERATORS[0];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card deposit-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "540px", width: "95%" }}
      >
        <div className="modal-header">
          <div className="modal-title-lockup">
            <span className="eyebrow gold">Recharge Mobile Money</span>
            <h2>Dépôt instantané en Ariary</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        {result ? (
          <div className="deposit-success-screen" style={{ padding: "20px 0", textAlign: "center" }}>
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

            <h3>Demande de paiement transmise !</h3>
            <p style={{ color: "var(--muted)", fontSize: "13px", maxWidth: "420px", margin: "8px auto 16px" }}>
              {result.message ||
                `Une notification Push USSD a été envoyée vers votre numéro ${phone}. Confirmez avec votre code secret.`}
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
                <span style={{ color: "var(--muted)" }}>Numéro :</span>
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
          <form onSubmit={handleSubmit} className="deposit-form" style={{ marginTop: "12px" }}>
            {error && (
              <div className="alert-box error" style={{ marginBottom: "16px" }}>
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            {/* Choix de l'opérateur */}
            <div style={{ marginBottom: "16px" }}>
              <label className="input-label" style={{ display: "block", marginBottom: "8px", fontSize: "12px", color: "var(--muted)" }}>
                1. Choisissez votre opérateur Mobile Money
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
                      <small style={{ fontSize: "10px", color: "var(--muted)" }}>{op.ussd}</small>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Numéro de téléphone */}
            <div style={{ marginBottom: "16px" }}>
              <label className="input-label" style={{ display: "block", marginBottom: "6px", fontSize: "12px", color: "var(--muted)" }}>
                2. Numéro de compte ({activeOp.name})
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
                3. Montant à créditer (Ariary)
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginBottom: "10px" }}>
                {PRESET_AMOUNTS.map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handlePresetClick(val)}
                    style={{
                      padding: "8px",
                      borderRadius: "6px",
                      background: amount === val ? "rgba(211, 176, 107, 0.18)" : "var(--panel)",
                      border: amount === val ? "1px solid var(--gold)" : "1px solid var(--line)",
                      color: amount === val ? "var(--gold)" : "var(--text)",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {val.toLocaleString("fr-FR")} Ar
                  </button>
                ))}
              </div>

              <input
                type="number"
                min="1000"
                step="1000"
                value={customAmount}
                onChange={(e) => handleCustomChange(e.target.value)}
                placeholder="Autre montant (min 1 000 Ar)"
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
                Transaction chiffrée par HMAC SHA-256 avec validation USSD directe opérateur ({activeOp.ussd}).
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button type="button" className="button button-outline" onClick={onClose} disabled={loading}>
                Annuler
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={loading}
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="spin" />
                    <span>Traitement…</span>
                  </>
                ) : (
                  <>
                    <Zap size={16} />
                    <span>Déposer {amount.toLocaleString("fr-FR")} Ar</span>
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
