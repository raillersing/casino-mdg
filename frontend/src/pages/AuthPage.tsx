import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useGameStore } from "@stores/gameStore";
import { useTranslation } from "react-i18next";
import {
  createGuestToken,
  requestEmailOtp,
  requestOtp,
  verifyEmailOtp,
  verifyOtp,
} from "@/services/auth";

export function AuthPage() {
  const { t } = useTranslation();
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<"email" | "sms">(
    "email",
  );
  const [emailRequestId, setEmailRequestId] = useState("");
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [step, setStep] = useState<"phone" | "code" | "done">("phone");
  const [devCode, setDevCode] = useState<string>();
  const [smsSent, setSmsSent] = useState<boolean>(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setUser = useGameStore((state) => state.setUser);
  const setAuthenticated = useGameStore((state) => state.setAuthenticated);
  const setSession = useGameStore((state) => state.setSession);
  const setGuestMode = useGameStore((state) => state.setGuestMode);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  const handleRequest = async () => {
    setLoading(true);
    setError("");
    try {
      const result =
        deliveryMethod === "email"
          ? await requestEmailOtp(phone, email.trim())
          : await requestOtp(phone);
      setEmailRequestId(deliveryMethod === "email" ? result.request_id : "");
      setDevCode(result.dev_code);
      setSmsSent(Boolean(result.sms_sent));
      if (result.dev_code) {
        setCode(result.dev_code);
      }
      setResendCooldown(25);
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
      const result =
        deliveryMethod === "email"
          ? await verifyEmailOtp(
              emailRequestId,
              code,
              displayName || "Joueur MDG",
            )
          : await verifyOtp(phone, code, displayName || "Joueur MDG");
      setUser({
        id: result.user.id,
        displayName: result.user.display_name,
        email: result.user.email,
        emailVerified: result.user.email_verified,
        phone: result.user.phone,
        xp: result.user.xp,
        level: result.user.level,
        balance: result.wallet.balance,
        isStaff: result.user.is_staff,
      });
      setSession(result.access, result.refresh);
      setAuthenticated(true);
      setStep("done");
      window.setTimeout(() => navigate(searchParams.get("next") || "/"), 700);
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
        <ArrowLeft size={16} /> {t("authUi.back", "Retour à l'accueil")}
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
            <h1>{t("authUi.welcome", "Bienvenue au Club !")}</h1>
            <p>
              {t(
                "authUi.redirect",
                "Connexion réussie. Redirection vers vos tables...",
              )}
            </p>
          </div>
        ) : (
          <>
            <span className="eyebrow">
              {step === "phone"
                ? t("authUi.firstHand", "Connexion & Inscription Rapide")
                : t("authUi.secureCheck", "Vérification de Sécurité")}
            </span>
            <h1>
              {step === "phone" ? (
                <>
                  Entrez dans le
                  <br />
                  <em>Cercle de Jeu</em>
                </>
              ) : (
                <>
                  Dernière étape,
                  <br />
                  <em>confirmez votre code</em>
                </>
              )}
            </h1>
            <p className="auth-intro">
              {step === "phone"
                ? deliveryMethod === "email"
                  ? "Indiquez votre adresse email et votre numéro de téléphone. Un code sera envoyé à votre boîte mail. Le numéro identifie votre compte, mais n'est pas vérifié par email."
                  : "Indiquez votre numéro de téléphone pour recevoir un code SMS."
                : deliveryMethod === "email"
                  ? "Un code à six chiffres a été envoyé à votre adresse email."
                  : smsSent
                    ? "Un code à six chiffres a été envoyé par SMS."
                    : "Vérification en attente pour votre numéro."}
            </p>
            {step === "phone" ? (
              <>
                <div
                  role="group"
                  aria-label="Méthode de vérification"
                  style={{ display: "flex", gap: "10px", marginBottom: "16px" }}
                >
                  <button
                    type="button"
                    className={`button ${deliveryMethod === "email" ? "button-gold" : "button-outline"}`}
                    aria-pressed={deliveryMethod === "email"}
                    onClick={() => {
                      setDeliveryMethod("email");
                      setError("");
                    }}
                  >
                    Email
                  </button>
                  <button
                    type="button"
                    className={`button ${deliveryMethod === "sms" ? "button-gold" : "button-outline"}`}
                    aria-pressed={deliveryMethod === "sms"}
                    onClick={() => {
                      setDeliveryMethod("sms");
                      setError("");
                    }}
                  >
                    SMS
                  </button>
                </div>
                {deliveryMethod === "email" && (
                  <>
                    <label className="field-label" htmlFor="auth-email">
                      Adresse email
                    </label>
                    <input
                      id="auth-email"
                      type="email"
                      autoComplete="email"
                      className="auth-name-field"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="exemple@domaine.com"
                      required
                    />
                    <p style={{ fontSize: "12px", color: "var(--muted)" }}>
                      Si votre ancien compte n'a pas encore d'email, associez-en
                      un depuis votre profil après vous être connecté.
                    </p>
                  </>
                )}
                <label className="field-label">
                  {t("auth.phone", "Numéro de téléphone portable")}
                </label>
                <div className="phone-field">
                  <span>+261</span>
                  <input
                    aria-label={t("auth.phone", "Numéro de téléphone")}
                    autoFocus
                    value={phone}
                    onChange={(event) =>
                      setPhone(event.target.value.replace(/\D/g, ""))
                    }
                    placeholder="34 00 000 00"
                  />
                </div>
                <span
                  style={{
                    fontSize: "11px",
                    color: "var(--muted)",
                    margin: "-4px 0 12px",
                    display: "block",
                  }}
                >
                  Formats acceptés : 034..., 038..., 032..., 037..., 033...
                </span>
                <button
                  type="button"
                  className="button button-gold full"
                  disabled={
                    loading ||
                    phone.replace(/^0/, "").length < 8 ||
                    (deliveryMethod === "email" && !email.includes("@"))
                  }
                  onClick={() => void handleRequest()}
                >
                  {loading ? (
                    <Loader2 className="spin" size={17} />
                  ) : (
                    <>
                      {t("authUi.receiveCode", "Recevoir mon code")}{" "}
                      <ArrowRight size={17} />
                    </>
                  )}
                </button>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    margin: "16px 0 12px",
                    color: "var(--muted)",
                    fontSize: "0.78rem",
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      height: "1px",
                      background: "rgba(255,255,255,0.1)",
                    }}
                  />
                  <span>OU SANS COMPTE</span>
                  <div
                    style={{
                      flex: 1,
                      height: "1px",
                      background: "rgba(255,255,255,0.1)",
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="button button-outline full"
                  onClick={async () => {
                    setLoading(true);
                    setError("");
                    try {
                      const auth = await createGuestToken("Joueur Invité");
                      setSession(auth.access, auth.refresh);
                      setGuestMode(auth.user.display_name, auth.wallet.balance);
                      setStep("done");
                      window.setTimeout(
                        () => navigate(searchParams.get("next") || "/"),
                        600,
                      );
                    } catch {
                      setGuestMode("Invité", 10000);
                      setStep("done");
                      window.setTimeout(
                        () => navigate(searchParams.get("next") || "/"),
                        600,
                      );
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  style={{ fontSize: "0.85rem", padding: "10px 14px" }}
                >
                  🎮 Accès Direct Invité (10 000 SIM)
                </button>
              </>
            ) : (
              <>
                <label className="field-label">
                  {t(
                    "authUi.receivedCode",
                    "Code de vérification (6 chiffres)",
                  )}
                </label>
                <input
                  aria-label={t("authUi.receivedCode", "Code de vérification")}
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
                <label className="field-label">
                  {t("authUi.nickname", "Votre pseudo à la table (optionnel)")}
                </label>
                <input
                  aria-label={t("authUi.nickname", "Pseudo")}
                  className="auth-name-field"
                  maxLength={50}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Ex. Miora, Faly, Rado..."
                />

                {devCode && (
                  <div
                    style={{
                      margin: "12px 0",
                      padding: "12px 14px",
                      background: "rgba(211, 176, 107, 0.12)",
                      border: "1px solid rgba(211, 176, 107, 0.35)",
                      borderRadius: "10px",
                      textAlign: "center",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11px",
                        color: "var(--gold)",
                        display: "block",
                        marginBottom: "4px",
                        fontWeight: 600,
                      }}
                    >
                      <Sparkles
                        size={13}
                        style={{
                          display: "inline-block",
                          verticalAlign: "middle",
                          marginRight: "4px",
                        }}
                      />
                      {smsSent
                        ? "SMS envoyé ! Code de confirmation direct :"
                        : "Code local de développement :"}
                    </span>
                    <strong
                      style={{
                        fontSize: "22px",
                        letterSpacing: "4px",
                        color: "#fff",
                        fontFamily: "var(--mono)",
                        display: "block",
                        margin: "4px 0",
                      }}
                    >
                      {devCode}
                    </strong>
                    <button
                      type="button"
                      className="button button-small button-gold"
                      style={{
                        marginTop: "6px",
                        width: "100%",
                        fontSize: "11.5px",
                      }}
                      onClick={() => setCode(devCode)}
                    >
                      <CheckCircle2 size={13} /> Remplir automatiquement le code
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  className="button button-gold full"
                  disabled={loading || code.length !== 6}
                  onClick={() => void handleVerify()}
                >
                  {loading ? (
                    <Loader2 className="spin" size={17} />
                  ) : (
                    <>
                      {t("authUi.enterClub", "Valider et entrer au Club")}{" "}
                      <ArrowRight size={17} />
                    </>
                  )}
                </button>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: "12px",
                  }}
                >
                  <button
                    type="button"
                    className="auth-resend"
                    disabled={resendCooldown > 0 || loading}
                    onClick={() => void handleRequest()}
                    style={{
                      background: "none",
                      border: 0,
                      color:
                        resendCooldown > 0 ? "var(--muted)" : "var(--gold)",
                      cursor: resendCooldown > 0 ? "default" : "pointer",
                      fontSize: "12px",
                    }}
                  >
                    {resendCooldown > 0
                      ? `Renvoyer le code (${resendCooldown}s)`
                      : "Renvoyer un nouveau code"}
                  </button>

                  <button
                    type="button"
                    className="auth-resend"
                    onClick={() => {
                      setStep("phone");
                      setCode("");
                      setDevCode(undefined);
                      setEmailRequestId("");
                    }}
                    style={{
                      background: "none",
                      border: 0,
                      color: "var(--muted)",
                      cursor: "pointer",
                      fontSize: "12px",
                    }}
                  >
                    {deliveryMethod === "email"
                      ? "Modifier mes coordonnées"
                      : t("authUi.changePhone", "Changer de numéro")}
                  </button>
                </div>
              </>
            )}
            {error && <p className="auth-error">{error}</p>}
            <div className="auth-trust">
              <ShieldCheck size={16} />
              <span>
                {t(
                  "authUi.protected",
                  "Connexion chiffrée SSL & Protection des données",
                )}
              </span>
            </div>
          </>
        )}
      </div>
      <p className="auth-footer">
        {t("authUi.termsPrefix", "En continuant, vous acceptez les")}{" "}
        <Link to="/terms">{t("authUi.terms", "Conditions Générales")}</Link>.
      </p>
    </div>
  );
}
