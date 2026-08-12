import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { useGameStore } from "@stores/gameStore";
import { useTranslation } from "react-i18next";
import { requestOtp, verifyOtp } from "@/services/auth";

export function AuthPage() {
  const { t } = useTranslation();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [step, setStep] = useState<"phone" | "code" | "done">("phone");
  const [devCode, setDevCode] = useState<string>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setUser = useGameStore((state) => state.setUser);
  const setAuthenticated = useGameStore((state) => state.setAuthenticated);
  const setSession = useGameStore((state) => state.setSession);

  const handleRequest = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await requestOtp(phone);
      setDevCode(result.dev_code);
      setStep("code");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Impossible d’envoyer le code.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await verifyOtp(phone, code, displayName || "Joueur MDG");
      setUser({
        id: result.user.id,
        displayName: result.user.display_name,
        email: `${result.user.phone}@mdg.local`,
        xp: result.user.xp,
        level: result.user.level,
        balance: result.wallet.balance,
      });
      setSession(result.access, result.refresh);
      setAuthenticated(true);
      setStep("done");
      window.setTimeout(() => navigate("/"), 700);
    } catch (verifyError) {
      setError(
        verifyError instanceof Error ? verifyError.message : "Code invalide.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-layout">
      <Link to="/" className="back-link">
        <ArrowLeft size={16} /> {t("authUi.back")}
      </Link>
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">♠</span>
          <strong>MDG GAME CLUB</strong>
        </div>
        {step === "done" ? (
          <div className="success-state">
            <div className="success-icon">
              <Check size={26} />
            </div>
            <h1>{t("authUi.welcome")}</h1>
            <p>{t("authUi.redirect")}</p>
          </div>
        ) : (
          <>
            <span className="eyebrow">
              {step === "phone"
                ? t("authUi.firstHand")
                : t("authUi.secureCheck")}
            </span>
            <h1>
              {step === "phone" ? (
                <>
                  {t("authUi.enter")}
                  <br />
                  <em>{t("authUi.circle")}</em>
                </>
              ) : (
                <>
                  {t("authUi.oneMore")}
                  <br />
                  <em>{t("authUi.step")}</em>
                </>
              )}
            </h1>
            <p className="auth-intro">
              {step === "phone"
                ? t("authUi.phoneIntro")
                : t("authUi.codeSent", { phone })}
            </p>
            {step === "phone" ? (
              <>
                <label className="field-label">{t("auth.phone")}</label>
                <div className="phone-field">
                  <span>+261</span>
                  <input
                    aria-label={t("auth.phone")}
                    autoFocus
                    value={phone}
                    onChange={(event) =>
                      setPhone(event.target.value.replace(/\D/g, ""))
                    }
                    placeholder="34 00 000 00"
                  />
                </div>
                <button
                  className="button button-gold full"
                  disabled={loading || phone.length < 9}
                  onClick={handleRequest}
                >
                  {loading ? (
                    <Loader2 className="spin" size={17} />
                  ) : (
                    <>
                      {t("authUi.receiveCode")} <ArrowRight size={17} />
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <label className="field-label">
                  {t("authUi.receivedCode")}
                </label>
                <input
                  aria-label={t("authUi.receivedCode")}
                  className="auth-code-field"
                  autoFocus
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, ""))
                  }
                  placeholder="000 000"
                />
                <label className="field-label">{t("authUi.nickname")}</label>
                <input
                  aria-label={t("authUi.nickname")}
                  className="auth-name-field"
                  maxLength={50}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Ex. Miora"
                />
                {devCode && (
                  <p className="dev-code">
                    {t("authUi.localCode")} : <strong>{devCode}</strong>
                  </p>
                )}
                <button
                  className="button button-gold full"
                  disabled={loading || code.length !== 6}
                  onClick={handleVerify}
                >
                  {loading ? (
                    <Loader2 className="spin" size={17} />
                  ) : (
                    <>
                      {t("authUi.enterClub")} <ArrowRight size={17} />
                    </>
                  )}
                </button>
                <button
                  className="auth-resend"
                  onClick={() => setStep("phone")}
                >
                  {t("authUi.changePhone")}
                </button>
              </>
            )}
            {error && <p className="auth-error">{error}</p>}
            <div className="auth-trust">
              <ShieldCheck size={16} />
              <span>{t("authUi.protected")}</span>
            </div>
          </>
        )}
      </div>
      <p className="auth-footer">
        {t("authUi.termsPrefix")} <a>{t("authUi.terms")}</a>.
      </p>
    </div>
  );
}
