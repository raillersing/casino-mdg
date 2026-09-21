import { Link } from "react-router-dom";
import { Compass, Home, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className="page-stack not-found-page" style={{ minHeight: "65vh", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "40px 20px" }}>
      <div
        style={{
          maxWidth: "520px",
          background: "rgba(18, 24, 34, 0.85)",
          border: "1px solid rgba(211, 176, 107, 0.25)",
          borderRadius: "20px",
          padding: "48px 32px",
          boxShadow: "0 18px 48px rgba(0, 0, 0, 0.6)",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "80px",
            height: "80px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(211, 176, 107, 0.2) 0%, rgba(18, 24, 34, 0.6) 100%)",
            border: "1px solid rgba(211, 176, 107, 0.4)",
            fontSize: "36px",
            color: "var(--gold)",
            marginBottom: "20px",
          }}
        >
          ♠
        </div>

        <span className="eyebrow gold" style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
          <Sparkles size={14} /> ERREUR 404
        </span>

        <h1 style={{ fontSize: "2rem", fontWeight: 800, margin: "0 0 12px", color: "var(--soft)" }}>
          Table Introuvable
        </h1>

        <p style={{ color: "var(--muted)", fontSize: "0.95rem", lineHeight: 1.6, margin: "0 0 28px" }}>
          Cette table n'existe pas ou la partie a déjà pris fin. Rejoignez le lobby pour trouver une partie en cours ou revenez à l'accueil.
        </p>

        <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/lobby" className="button button-gold">
            <Compass size={17} /> {t("nav.play")} (Lobby)
          </Link>
          <Link to="/" className="button button-outline">
            <Home size={17} /> {t("nav.home")}
          </Link>
        </div>
      </div>
    </div>
  );
}
