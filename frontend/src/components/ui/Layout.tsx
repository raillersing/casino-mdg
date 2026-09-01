import { ReactNode } from "react";
import { NavLink, Link, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  CircleUserRound,
  Compass,
  UsersRound,
  Dices,
  Home,
  LogIn,
  Menu,
  WalletCards,
  LifeBuoy,
  Sparkles,
  X,
  Gamepad2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { getCurrentUser, refreshAccessToken } from "@services/auth";
import { useGameStore } from "@stores/gameStore";

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
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);

  // Simplified nav: Home, Play (lobby), Profile
  const navItems = [
    { to: "/", label: t("nav.home"), icon: Home },
    { to: "/lobby", label: t("nav.play"), icon: Compass },
    { to: "/casino", label: t("nav.testGames") || "Jeux de hasard", icon: Dices },
    { to: "/profile", label: t("nav.profile"), icon: CircleUserRound },
  ];
  const language = i18n.language.startsWith("mg") ? "MG" : "FR";

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileMenuOpen]);

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
  const fabGames = [
    { id: "poker", name: t("games.poker"), icon: "♠", color: "#d3b06b", path: "/lobby?filter=poker" },
    { id: "belote", name: t("games.belote"), icon: "♥", color: "#e57373", path: "/lobby?filter=belote" },
    { id: "rami", name: t("games.rami"), icon: "♦", color: "#64b5f6", path: "/lobby?filter=rami" },
    { id: "casino", name: t("nav.testGames") || "Jeux de hasard", icon: "🎲", color: "#ffb74d", path: "/casino" },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/" className="brand-lockup">
          <span className="brand-mark">♠</span>
          <span>
            <strong>MDG</strong>
            <small>GAME CLUB</small>
          </span>
        </Link>
        <div className="sidebar-label">{t("nav.navigation")}</div>
        <nav className="sidebar-nav" aria-label={t("a11y.primaryNavigation")}>
          {navItems.map(({ to, label, icon: Icon }) => (
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
        <header className="topbar">
          <div className="mobile-brand">
            <span className="brand-mark">♠</span>
            <strong>MDG</strong>
          </div>
          <div className="topbar-balance">
            {user ? (
              <Link to="/wallet" className="balance-pill">
                <WalletCards size={14} />
                <span>{user.balance.toLocaleString()} Ar</span>
              </Link>
            ) : (
              <span className="balance-pill muted">MDG Game Club</span>
            )}
          </div>
          <div className="topbar-actions">
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
            <button
              className="icon-button mobile-menu"
              aria-label={
                mobileMenuOpen ? t("a11y.closeMenu") : t("a11y.openMenu")
              }
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation"
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              <Menu size={20} />
            </button>
          </div>
        </header>
        <main className="content">{children}</main>

        {/* Floating Action Button (FAB) — visible on all pages except game */}
        {!isGamePage && (
          <div className="fab-container">
            {fabOpen && (
              <div className="fab-menu">
                <button className="fab-close" onClick={() => setFabOpen(false)}>
                  <X size={18} />
                </button>
                {fabGames.map((game) => (
                  <button
                    key={game.id}
                    className="fab-game-btn"
                    onClick={() => {
                      setFabOpen(false);
                      navigate(game.path || `/lobby?filter=${game.id}`);
                    }}
                  >
                    <span className="fab-game-icon" style={{ color: game.color }}>
                      {game.icon}
                    </span>
                    <span className="fab-game-label">{game.name}</span>
                  </button>
                ))}
              </div>
            )}
            <button
              className={`fab-main ${fabOpen ? "active" : ""}`}
              onClick={() => setFabOpen((open) => !open)}
              aria-label={t("nav.play")}
            >
              <Gamepad2 size={22} />
            </button>
          </div>
        )}

        {/* Bottom Navigation Bar (mobile) */}
        <nav className="bottom-nav" aria-label={t("a11y.primaryNavigation")}>
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              <Icon size={20} />
              <span>{label}</span>
            </NavLink>
          ))}
          <button
            className="bottom-nav-more"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu size={20} />
            <span>{t("nav.more")}</span>
          </button>
        </nav>

        {mobileMenuOpen && (
          <button
            type="button"
            className="mobile-menu-backdrop"
            aria-label={t("a11y.closeMenu")}
            onClick={() => setMobileMenuOpen(false)}
          />
        )}
        <nav
          id="mobile-navigation"
          className={`mobile-nav ${mobileMenuOpen ? "open" : ""}`}
          aria-label={t("a11y.primaryNavigation")}
        >
          {[
            ...navItems,
            { to: "/wallet", label: t("nav.wallet"), icon: WalletCards },
            { to: "/clubs", label: t("nav.clubs"), icon: UsersRound },
            { to: "/games/test", label: t("nav.testGames"), icon: Dices },
            { to: "/support", label: t("nav.support"), icon: LifeBuoy },
          ].map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              <Icon size={19} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
