import { ReactNode, useState, useEffect } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import {
  Bell,
  CircleUserRound,
  UsersRound,
  Users,
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
import { sendMatchmakingHeartbeat } from "@services/games";
import { getCurrentUser, refreshAccessToken } from "@services/auth";
import { getWalletBalance } from "@services/wallet";
import { useGameStore } from "@stores/gameStore";
import { useDeviceMode } from "@hooks/useDeviceMode";
import { haptics } from "@utils/haptics";

import { NetworkQualityBadge } from "@components/ui/NetworkQualityBadge";
import { DailyMissionsModal } from "@components/game/DailyMissionsModal";
import { SocialHubModal } from "@components/social/SocialHubModal";

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
  const [showSocialModal, setShowSocialModal] = useState(false);

  // Desktop sidebar navigation items
  const sidebarNavItems = [
    { to: "/", label: t("nav.home"), icon: Home },
    { to: "/games", label: t("nav.games", "Jeux"), icon: Gamepad2 },
    { to: "/mes-parties", label: t("nav.myGames", "Mes parties"), icon: Users },
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
    if (!accessToken) return;
    Promise.all([
      getCurrentUser(accessToken),
      getWalletBalance(accessToken).catch(() => null),
    ])
      .then(([current, wallet]) => {
        const mga = wallet?.mga_balance ?? 0;
        setUser({
          id: current.id,
          displayName: current.display_name,
          email: `${current.phone}@mdg.local`,
          phone: current.phone,
          xp: current.xp,
          level: current.level,
          balance: mga,
          mgaBalance: wallet?.mga_balance,
          mgaHeldBalance: wallet?.mga_held_balance ?? 0,
          isStaff: current.is_staff,
        });
      })
      .catch((err: unknown) => {
        const status =
          (err as { response?: { status?: number }; status?: number })?.response
            ?.status ??
          (err as { response?: { status?: number }; status?: number })?.status;
        const msg = String((err as { message?: string })?.message || "");
        if (status === 401 || msg.includes("401")) {
          if (!refreshToken) {
            logout();
            return;
          }
          void refreshAccessToken(refreshToken)
            .then((session) => setSession(session.access, session.refresh))
            .catch(() => logout());
        }
      });
  }, [accessToken, logout, refreshToken, setSession, setUser]);

  useEffect(() => {
    if (!accessToken) return;
    const parts = location.pathname.split("/");
    const game = ["play", "game", "lobby"].includes(parts[1]) ? parts[2] : undefined;
    const validGame = ["belote", "domino", "ludo", "rami", "poker"].includes(
      game || "",
    )
      ? game
      : undefined;
    const heartbeat = () => {
      if (document.visibilityState === "visible")
        void sendMatchmakingHeartbeat(accessToken, validGame).catch(
          () => undefined,
        );
    };
    heartbeat();
    const timer = window.setInterval(heartbeat, 15000);
    document.addEventListener("visibilitychange", heartbeat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", heartbeat);
    };
  }, [accessToken, location.pathname]);

  const updateBalance = useGameStore((state) => state.updateBalance);
  useEffect(() => {
    if (!accessToken) return;
    const refresh = () => {
      if (document.visibilityState === "visible")
        void getWalletBalance(accessToken)
          .then((w) => {
            if (typeof w.mga_balance === "number")
              updateBalance(w.mga_balance, w.mga_held_balance);
          })
          .catch(() => undefined);
    };
    const timer = window.setInterval(refresh, 5000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [accessToken, updateBalance]);
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
        <nav
          className="sidebar-nav"
          aria-label={`${t("a11y.primaryNavigation")} — bureau`}
        >
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
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-promo">
          <span className="eyebrow">{t("social.club")}</span>
          <strong>{t("promo.title")}</strong>
          <p>{t("promo.body")}</p>
          <Link to="/games" className="text-link">
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
              <Link
                to="/wallet"
                className="balance-pill"
                aria-label={t("nav.wallet")}
              >
                <WalletCards size={14} />
                <span>
                  {typeof user.mgaBalance === "number"
                    ? `${user.mgaBalance.toLocaleString()} Ar`
                    : "Solde indisponible"}
                </span>
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
              <>
                <button
                  type="button"
                  className="icon-button social-hub-btn"
                  onClick={() => setShowSocialModal(true)}
                  title={
                    language === "MG" ? "Namana sy hafatra" : "Amis & Messages"
                  }
                  aria-label={
                    language === "MG" ? "Namana sy hafatra" : "Amis & Messages"
                  }
                  style={{
                    color: "#83aeea",
                    background: "rgba(131, 174, 234, 0.12)",
                    borderColor: "rgba(131, 174, 234, 0.3)",
                  }}
                >
                  <Users size={18} />
                </button>
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
              </>
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

        <SocialHubModal
          isOpen={showSocialModal}
          onClose={() => setShowSocialModal(false)}
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

          <NavLink
            to="/games"
            className={({ isActive }) =>
              isActive ||
              location.pathname.startsWith("/play/") ||
              location.pathname.startsWith("/lobby/")
                ? "active"
                : ""
            }
          >
            <Gamepad2 size={22} />
            <span>Jeux</span>
          </NavLink>

          <NavLink
            to="/mes-parties"
            className={({ isActive }) => (isActive ? "active" : "")}
            onClick={() => haptics.tabChange()}
          >
            <Users size={20} />
            <span>{t("nav.myGames", "Mes parties")}</span>
          </NavLink>

          <NavLink
            to={user ? "/profile" : "/auth"}
            className={({ isActive }) => (isActive ? "active" : "")}
            onClick={() => haptics.tabChange()}
          >
            <CircleUserRound size={20} />
            <span>
              {user
                ? t("nav.profile") || "Profil"
                : t("nav.login") || "Connexion"}
            </span>
          </NavLink>
        </nav>
      </div>
    </div>
  );
}
