import { ReactNode, useState, useEffect } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import {
  Bell,
  CircleUserRound,
  Compass,
  UsersRound,
  Home,
  LogIn,
  Smartphone,
  WalletCards,
  Sparkles,
  Flame,
  ShieldCheck,
  Gamepad2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { getCurrentUser, refreshAccessToken } from "@services/auth";
import { useGameStore } from "@stores/gameStore";
import { useDeviceMode } from "@hooks/useDeviceMode";
import { haptics } from "@utils/haptics";

import { NetworkQualityBadge } from "@components/ui/NetworkQualityBadge";
import { DailyMissionsModal } from "@components/game/DailyMissionsModal";
import { GameDiscoveryDrawer } from "@components/game/GameDiscoveryDrawer";

export function Layout({ children }: { children: ReactNode }) {
  const user = useGameStore((state) => state.user);
  const accessToken = useGameStore((state) => state.accessToken);
  const refreshToken = useGameStore((state) => state.refreshToken);
  const isGuest = useGameStore((state) => state.isGuest);
  const setUser = useGameStore((state) => state.setUser);
  const setSession = useGameStore((state) => state.setSession);
  const logout = useGameStore((state) => state.logout);
  const { i18n, t } = useTranslation();
  const location = useLocation();
  const { setMode } = useDeviceMode();
  const [showMissionsModal, setShowMissionsModal] = useState(false);
  const [showGamesDrawer, setShowGamesDrawer] = useState(false);

  // Desktop sidebar navigation items
  const sidebarNavItems = [
    { to: "/", label: t("nav.home"), icon: Home },
    { to: "/lobby", label: t("nav.play"), icon: Compass },
    { to: "/clubs", label: t("nav.clubs"), icon: UsersRound },
    { to: "/wallet", label: t("nav.wallet"), icon: WalletCards },
    { to: "/profile", label: t("nav.profile"), icon: CircleUserRound },
    ...(user?.isStaff
      ? [
          {
            to: "/backoffice",
            label: "Back-office Live Ops",
            icon: ShieldCheck,
          },
        ]
      : []),
  ];

  const language = i18n.language.startsWith("mg") ? "MG" : "FR";

  useEffect(() => {
    if (!accessToken || user) return;
    getCurrentUser(accessToken)
      .then((current) =>
        setUser({
          id: current.id,
          displayName: current.display_name,
          email: `${current.phone}@mdg.local`,
          xp: current.xp,
          level: current.level,
          balance: 0,
          isStaff: current.is_staff,
        }),
      )
      .catch(() => {
        if (!refreshToken) {
          logout();
          return;
        }
        void refreshAccessToken(refreshToken)
          .then((session) => setSession(session.access, session.refresh))
          .catch(() => logout());
      });
  }, [accessToken, logout, refreshToken, setSession, setUser, user]);

  const isGamePage = location.pathname.startsWith("/game/");

  return (
    <div className="app-shell">
      {/* Sidebar Desktop */}
      <aside className="sidebar">
        <Link to="/" className="brand-lockup">
          <span className="brand-mark">♠</span>
          <span>
            <strong>MDG</strong>
            <small>GAME CLUB</small>
          </span>
        </Link>
        <div className="sidebar-label">{t("nav.navigation")}</div>
        <nav className="sidebar-nav" aria-label={`${t("a11y.primaryNavigation")} — bureau`}>
          {sidebarNavItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `nav-link ${isActive ? "active" : ""}`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
          <button
            type="button"
            className="nav-link"
            onClick={() => {
              haptics.buttonTap();
              setShowGamesDrawer(true);
            }}
            style={{ width: "100%", textAlign: "left", cursor: "pointer", border: 0, background: "none" }}
          >
            <Gamepad2 size={18} style={{ color: "var(--gold)" }} />
            <span>Salle des Jeux</span>
          </button>
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-promo">
          <span className="eyebrow">{t("social.club")}</span>
          <strong>{t("promo.title")}</strong>
          <p>{t("promo.body")}</p>
          <Link to="/lobby" className="text-link">
            {t("games.create")} →
          </Link>
        </div>
        <div className="sidebar-user">
          {user ? (
            <>
              <div className="avatar avatar-sm">{user.displayName[0]}</div>
              <div>
                <strong>{user.displayName}</strong>
                <small>{t("profile.level", { level: user.level })}</small>
              </div>
            </>
          ) : (
            <>
              <div className="avatar avatar-sm muted">?</div>
              <div>
                <strong>{t("profile.visitor")}</strong>
                <small>{t("profile.discovery")}</small>
              </div>
            </>
          )}
        </div>
        <div className="sidebar-device-toggle">
          <button
            type="button"
            onClick={() => setMode("mobile")}
            className="device-switch-btn"
            title={t("nav.mobileVersion")}
          >
            <Smartphone size={14} />
            <span>{t("nav.mobileVersion")}</span>
          </button>
        </div>
      </aside>

      <div className="main-shell">
        {isGuest && !accessToken && (
          <div className="guest-banner" role="status">
            <div>
              <Sparkles size={14} />
              <span>{t("layout.guestBanner")}</span>
            </div>
            <Link to="/auth" className="button button-small button-gold">
              {t("layout.connect")}
            </Link>
          </div>
        )}

        {/* Topbar Globale */}
        <header className="topbar">
          <Link to="/" className="mobile-brand" aria-label={t("nav.home")}>
            <span className="brand-mark">♠</span>
            <strong>MDG</strong>
          </Link>
          <div className="topbar-balance">
            {user ? (
              <Link to="/wallet" className="balance-pill" aria-label={t("nav.wallet")}>
                <WalletCards size={14} />
                <span>{user.balance.toLocaleString()} Ar</span>
              </Link>
            ) : (
              <span className="balance-pill muted">
                <span className="hide-on-mobile">MDG Game Club</span>
                <span className="show-on-mobile">♠ MDG</span>
              </span>
            )}
          </div>
          <div className="topbar-actions">
            <NetworkQualityBadge compact />
            {user && (
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowMissionsModal(true)}
                title="Missions quotidiennes & Bonus Série"
                aria-label="Missions quotidiennes & Bonus Série"
                style={{
                  color: "#ff7043",
                  background: "rgba(255, 112, 67, 0.12)",
                  borderColor: "rgba(255, 112, 67, 0.3)",
                }}
              >
                <Flame size={18} />
              </button>
            )}
            <button
              className="language-toggle"
              onClick={() =>
                void i18n.changeLanguage(language === "FR" ? "mg" : "fr")
              }
              aria-label={t("a11y.changeLanguage")}
            >
              {language}
            </button>
            <button
              className="icon-button"
              aria-label={t("a11y.notifications")}
            >
              <Bell size={18} />
              <i />
            </button>
            {user ? (
              <Link
                to="/profile"
                className="top-avatar avatar"
                aria-label={t("a11y.openProfile")}
              >
                {user.displayName[0]}
              </Link>
            ) : (
              <Link to="/auth" className="login-link">
                <LogIn size={16} /> {t("nav.login")}
              </Link>
            )}
          </div>
        </header>

        <main className="content">{children}</main>

        <DailyMissionsModal
          isOpen={showMissionsModal}
          onClose={() => setShowMissionsModal(false)}
        />

        <GameDiscoveryDrawer
          isOpen={showGamesDrawer}
          onClose={() => setShowGamesDrawer(false)}
        />

        {/* Bottom Navigation Bar (mobile) — 5 onglets tactiles haute-visibilité */}
        <nav
          className={`bottom-nav ${isGamePage ? "hidden" : ""}`}
          aria-label={`${t("a11y.primaryNavigation")} — mobile barre`}
        >
          <NavLink
            to="/"
            end
            className={({ isActive }) => (isActive ? "active" : "")}
            onClick={() => haptics.tabChange()}
          >
            <Home size={20} />
            <span>{t("nav.home") || "Accueil"}</span>
          </NavLink>

          <button
            type="button"
            className={`bottom-nav-action-btn ${showGamesDrawer ? "active" : ""}`}
            onClick={() => {
              haptics.buttonTap();
              setShowGamesDrawer(true);
            }}
            title="Ouvrir la salle des jeux"
          >
            <div className="bottom-nav-center-glow">
              <Gamepad2 size={22} />
            </div>
            <span>Jeux</span>
          </button>

          <NavLink
            to="/lobby"
            className={({ isActive }) => (isActive ? "active" : "")}
            onClick={() => haptics.tabChange()}
          >
            <Compass size={20} />
            <span>{t("nav.lobby") || "Lobby"}</span>
          </NavLink>

          <NavLink
            to="/clubs"
            className={({ isActive }) => (isActive ? "active" : "")}
            onClick={() => haptics.tabChange()}
          >
            <UsersRound size={20} />
            <span>{t("nav.clubs") || "Clubs"}</span>
          </NavLink>

          <NavLink
            to={user ? "/profile" : "/auth"}
            className={({ isActive }) => (isActive ? "active" : "")}
            onClick={() => haptics.tabChange()}
          >
            <CircleUserRound size={20} />
            <span>{user ? t("nav.profile") || "Profil" : t("nav.login") || "Connexion"}</span>
          </NavLink>
        </nav>
      </div>
    </div>
  );
}
