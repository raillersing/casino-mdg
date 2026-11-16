import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Award,
  Bell,
  Check,
  ChevronRight,
  Dices,
  Edit3,
  HeartHandshake,
  LifeBuoy,
  LogOut,
  Monitor,
  ShieldCheck,
  Smartphone,
  Trophy,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import { getGameStats, getLeaderboard, type GameStats } from "@services/games";
import { useGameStore } from "@stores/gameStore";
import { useDeviceMode } from "@hooks/useDeviceMode";
import { getKYCStatus, type KYCStatus } from "@services/kyc";
import { KYCModal } from "@components/KYCModal";
import {
  getResponsibleGamingStatus,
  type ResponsibleGamingProfile,
} from "@services/responsibleGaming";
import { ResponsibleGamingModal } from "@components/ResponsibleGamingModal";
import { useTranslation } from "react-i18next";
import {
  getCurrentUser,
  requestEmailBinding,
  updateCurrentUser,
  verifyEmailBinding,
} from "@services/auth";
import {
  claimDailyMission,
  getDailyMissions,
  type DailyMission,
} from "@services/missions";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from "@services/notifications";

export function ProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useGameStore((state) => state.user);
  const setUser = useGameStore((state) => state.setUser);
  const logout = useGameStore((state) => state.logout);
  const accessToken = useGameStore((state) => state.accessToken);
  const { isMobile, toggleMode } = useDeviceMode();
  const name = user?.displayName || t("profile.visitor");
  const [stats, setStats] = useState<GameStats>({
    played: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    total_won: 0,
  });
  const [rank, setRank] = useState<number | null>(null);
  const [kyc, setKyc] = useState<KYCStatus | null>(null);
  const [isKycModalOpen, setIsKycModalOpen] = useState(false);
  const [rgProfile, setRgProfile] = useState<ResponsibleGamingProfile | null>(
    null,
  );
  const [isRgModalOpen, setIsRgModalOpen] = useState(false);
  const [missions, setMissions] = useState<DailyMission[]>([]);
  const [missionError, setMissionError] = useState("");
  const [notificationPreferences, setNotificationPreferences] =
    useState<NotificationPreferences | null>(null);
  const [notificationError, setNotificationError] = useState("");

  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const [editNameSaving, setEditNameSaving] = useState(false);
  const [editNameError, setEditNameError] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailRequestId, setEmailRequestId] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");
  const [emailError, setEmailError] = useState("");

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  const handleStartEditName = () => {
    setEditNameValue(user?.displayName || "");
    setEditNameError("");
    setIsEditingName(true);
  };

  const handleSaveName = async () => {
    const trimmed = editNameValue.trim();
    if (!trimmed) {
      setEditNameError("Le pseudo ne peut pas être vide.");
      return;
    }
    if (!accessToken) return;
    setEditNameSaving(true);
    setEditNameError("");
    try {
      const updated = await updateCurrentUser(accessToken, trimmed);
      if (user) {
        setUser({ ...user, displayName: updated.display_name });
      }
      setIsEditingName(false);
    } catch (err: unknown) {
      setEditNameError(
        err instanceof Error ? err.message : "Erreur lors de la mise à jour.",
      );
    } finally {
      setEditNameSaving(false);
    }
  };

  useEffect(() => {
    if (!accessToken) return;
    getCurrentUser(accessToken)
      .then((profile) => {
        const current = useGameStore.getState().user;
        setUser({
          ...current,
          id: profile.id,
          displayName: profile.display_name,
          phone: profile.phone,
          email: profile.email,
          emailVerified: profile.email_verified,
          xp: profile.xp,
          level: profile.level,
          balance: current?.balance ?? 0,
          isStaff: profile.is_staff,
        });
      })
      .catch(() => undefined);
  }, [accessToken, setUser]);

  const handleEmailRequest = async () => {
    if (!accessToken) return;
    setEmailBusy(true);
    setEmailError("");
    setEmailMessage("");
    try {
      const result = await requestEmailBinding(accessToken, contactEmail);
      setEmailRequestId(result.request_id);
      setEmailMessage("Code envoyé à l'adresse indiquée.");
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Envoi impossible.");
    } finally {
      setEmailBusy(false);
    }
  };

  const handleEmailVerify = async () => {
    if (!accessToken) return;
    setEmailBusy(true);
    setEmailError("");
    try {
      const result = await verifyEmailBinding(
        accessToken,
        emailRequestId,
        emailCode,
      );
      const current = useGameStore.getState().user;
      if (current) {
        setUser({
          ...current,
          email: result.email,
          emailVerified: result.email_verified,
        });
      }
      setEmailRequestId("");
      setEmailCode("");
      setEmailMessage("Adresse email vérifiée et associée à votre compte.");
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Code invalide.");
    } finally {
      setEmailBusy(false);
    }
  };

  const reloadKycStatus = () => {
    if (!accessToken) return;
    getKYCStatus(accessToken)
      .then(setKyc)
      .catch(() => undefined);
  };

  const reloadRgStatus = () => {
    if (!accessToken) return;
    getResponsibleGamingStatus(accessToken)
      .then(setRgProfile)
      .catch(() => undefined);
  };

  useEffect(() => {
    if (!accessToken) return;
    getGameStats(accessToken)
      .then((payload) => setStats(payload.stats))
      .catch(() => undefined);
    getLeaderboard()
      .then((payload) => {
        const entry = payload.results.find(
          (item) => item.display_name === name,
        );
        setRank(entry?.rank || null);
      })
      .catch(() => undefined);
    getKYCStatus(accessToken)
      .then(setKyc)
      .catch(() => undefined);
    getResponsibleGamingStatus(accessToken)
      .then(setRgProfile)
      .catch(() => undefined);
    getDailyMissions(accessToken)
      .then((payload) => setMissions(payload.missions))
      .catch(() => undefined);
    getNotificationPreferences(accessToken)
      .then(setNotificationPreferences)
      .catch(() => setNotificationError(t("profile.notificationsError")));
  }, [accessToken, name, t]);

  const toggleNotification = async (
    field: keyof NotificationPreferences,
    value: boolean,
  ) => {
    if (!accessToken || !notificationPreferences) return;
    const previous = notificationPreferences;
    setNotificationPreferences({ ...previous, [field]: value });
    try {
      const updated = await updateNotificationPreferences(accessToken, {
        [field]: value,
      });
      setNotificationPreferences(updated);
      setNotificationError("");
    } catch {
      setNotificationPreferences(previous);
      setNotificationError(t("profile.notificationsError"));
    }
  };

  const claimMission = async (mission: DailyMission) => {
    if (!accessToken) return;
    try {
      await claimDailyMission(accessToken, mission.key);
      setMissions((current) =>
        current.map((item) =>
          item.key === mission.key
            ? { ...item, claimed: true, claimable: false }
            : item,
        ),
      );
    } catch {
      setMissionError(t("profile.missionError"));
    }
  };

  if (!accessToken && !user) {
    return (
      <div
        className="page-stack"
        style={{ maxWidth: "540px", margin: "40px auto", textAlign: "center" }}
      >
        <div className="activity-card" style={{ padding: "32px 24px" }}>
          <UserRound
            size={48}
            style={{
              color: "var(--accent-gold, #e1bf79)",
              margin: "0 auto 16px",
            }}
          />
          <h2>Connexion requise</h2>
          <p
            style={{
              color: "var(--text-secondary, #adb9c4)",
              margin: "12px 0 24px",
            }}
          >
            Connectez-vous pour consulter vos statistiques, vos transactions et
            vos badges.
          </p>
          <Link
            to="/auth"
            className="button button-gold"
            style={{ display: "inline-flex", minHeight: "44px" }}
          >
            Se connecter / Créer un compte
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div className="profile-head">
        <div className="avatar profile-avatar">{name[0]}</div>
        <div>
          <span className="eyebrow">{t("profile.memberSince")}</span>
          <h1>
            {name} <em>Rakoto.</em>
          </h1>
          <p>
            <span className="online-dot" /> {t("profile.online")}
          </p>
        </div>
        <button
          type="button"
          className="button button-outline edit-button"
          onClick={handleStartEditName}
          title={t("profile.edit")}
        >
          <Edit3 size={15} /> {t("profile.edit")}
        </button>
      </div>
      <div className="profile-quick-links">
        <Link to="/wallet" className="quick-link-card">
          <WalletCards size={20} />
          <span>{t("nav.wallet")}</span>
          <ChevronRight size={16} />
        </Link>
        <Link to="/support" className="quick-link-card">
          <LifeBuoy size={20} />
          <span>{t("nav.support")}</span>
          <ChevronRight size={16} />
        </Link>
        <Link to="/clubs" className="quick-link-card">
          <UsersRound size={20} />
          <span>{t("nav.clubs")}</span>
          <ChevronRight size={16} />
        </Link>
        <Link to="/casino" className="quick-link-card">
          <Dices size={20} />
          <span>{t("nav.testGames")}</span>
          <ChevronRight size={16} />
        </Link>
      </div>
      <section className="activity-card" aria-label="Informations de contact">
        <div className="section-heading compact">
          <div>
            <span className="eyebrow">Informations du compte</span>
            <h2>Adresse email</h2>
          </div>
        </div>
        <p>
          {user?.email && !user.email.endsWith(".local")
            ? user.email
            : "Aucune adresse email personnelle associée"}
          {" · "}
          {user?.emailVerified ? "Vérifiée" : "Non vérifiée"}
        </p>
        {!user?.emailVerified && accessToken && (
          <div style={{ display: "grid", gap: "10px", marginTop: "12px" }}>
            <label htmlFor="profile-contact-email" className="field-label">
              Associer une adresse email à votre compte
            </label>
            <input
              id="profile-contact-email"
              className="auth-name-field"
              type="email"
              autoComplete="email"
              placeholder="exemple@domaine.com"
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
            />
            <button
              type="button"
              className="button button-outline"
              disabled={emailBusy || !contactEmail.includes("@")}
              onClick={() => void handleEmailRequest()}
            >
              Envoyer un code de vérification
            </button>
            {emailRequestId && (
              <>
                <label htmlFor="profile-email-code" className="field-label">
                  Code reçu par email
                </label>
                <input
                  id="profile-email-code"
                  className="auth-name-field"
                  inputMode="numeric"
                  maxLength={6}
                  value={emailCode}
                  onChange={(event) =>
                    setEmailCode(event.target.value.replace(/\D/g, ""))
                  }
                />
                <button
                  type="button"
                  className="button button-gold"
                  disabled={emailBusy || emailCode.length !== 6}
                  onClick={() => void handleEmailVerify()}
                >
                  Confirmer mon email
                </button>
              </>
            )}
            {emailMessage && <p role="status">{emailMessage}</p>}
            {emailError && (
              <p role="alert" className="auth-error">
                {emailError}
              </p>
            )
          </div>
        )}
      </section>
      {user?.isStaff && (
        <section className="activity-card staff-access-card">
          <div className="section-heading compact">
            <div>
              <span className="eyebrow gold">Accès équipe</span>
              <h2>Back-office pilote</h2>
            </div>
            <ShieldCheck size={19} />
          </div>
          <p>
            Suivez la cohorte, les sessions, la modération et les actions
            correctives.
          </p>
          <Link to="/backoffice" className="button button-outline">
            Ouvrir le back-office
          </Link>
        </section>
      )}
      <div className="profile-grid">
        <section>
          <div className="level-card">
            <div className="level-copy">
              <span className="eyebrow gold">{t("profile.progress")}</span>
              <h2>
                {t("profile.level", { level: user?.level || 4 })}{" "}
                <small>{t("profile.explorer")}</small>
              </h2>
              <p>{t("profile.nextLevel")}</p>
            </div>
            <div className="level-ring">
              <strong>68%</strong>
              <span>XP</span>
            </div>
            <div className="level-bar">
              <i style={{ width: "68%" }} />
            </div>
          </div>
          <div className="section-heading compact">
            <div>
              <span className="eyebrow">{t("profile.yourStats")}</span>
              <h2>{t("profile.gameStats")}</h2>
            </div>
            <Trophy size={19} />
          </div>
          <div className="stats-grid">
            <div>
              <strong>{stats.played}</strong>
              <span>{t("profile.gamesPlayed")}</span>
            </div>
            <div>
              <strong>
                {stats.played
                  ? Math.round((stats.wins / stats.played) * 100)
                  : 0}
                <span>%</span>
              </strong>
              <span>{t("profile.winRate")}</span>
            </div>
            <div>
              <strong>
                {stats.total_won.toLocaleString("fr-FR")}
                <span> SIM</span>
              </strong>
              <span>{t("profile.totalWinnings")}</span>
            </div>
            <div>
              <strong>{rank ? `#${rank}` : "—"}</strong>
              <span>{t("profile.localRank")}</span>
            </div>
          </div>
          <div className="section-heading compact">
            <div>
              <span className="eyebrow">{t("profile.compliance")}</span>
              <h2>
                {t("profile.kycLevel")}{" "}
                <small>{kyc?.level.toUpperCase() || "…"}</small>
              </h2>
            </div>
            <ShieldCheck size={19} />
          </div>
          <div className="settings-list">
            <div
              onClick={() => setIsKycModalOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setIsKycModalOpen(true);
                }
              }}
              style={{ cursor: "pointer" }}
              role="button"
              tabIndex={0}
            >
              <span className="setting-icon">
                <ShieldCheck
                  size={17}
                  color={
                    kyc?.level === "verified" || kyc?.level === "vip"
                      ? "var(--green)"
                      : "var(--gold)"
                  }
                />
              </span>
              <div>
                <strong>
                  {kyc?.request
                    ? t("profile.request", { status: kyc.request.status })
                    : "Vérifier mon identité & plafonds"}
                </strong>
                <span>
                  {kyc?.request?.status === "pending"
                    ? "Demande en cours d'examen par le service conformité."
                    : kyc?.request?.status === "approved"
                      ? `Niveau vérifié · Plafond : ${kyc.limits_mga.deposit.toLocaleString("fr-FR")} Ar`
                      : `Plafond actuel : ${kyc ? kyc.limits_mga.deposit.toLocaleString("fr-FR") : "…"} Ar · Téléverser mes documents`}
                </span>
              </div>
              <ChevronRight size={17} />
            </div>
            <div
              onClick={() => setIsRgModalOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setIsRgModalOpen(true);
                }
              }}
              style={{ cursor: "pointer" }}
              role="button"
              tabIndex={0}
            >
              <span className="setting-icon">
                <HeartHandshake
                  size={17}
                  color={rgProfile?.is_blocked ? "var(--red)" : "var(--gold)"}
                />
              </span>
              <div>
                <strong>Jeu Responsable & Limites</strong>
                <span>
                  {rgProfile?.is_blocked
                    ? "Compte actuellement en pause ou auto-exclu"
                    : rgProfile?.daily_deposit_limit
                      ? `Plafond journalier : ${rgProfile.daily_deposit_limit.toLocaleString("fr-FR")} Ar · Modifier`
                      : "Plafonds personnels, pause temporaire & auto-exclusion"}
                </span>
              </div>
              <ChevronRight size={17} />
            </div>
            <div>
              <span className="setting-icon">
                <UserRound size={17} />
              </span>
              <div>
                <strong>{t("profile.publicProfile")}</strong>
                <span>{t("profile.publicProfileHint")}</span>
              </div>
              <ChevronRight size={17} />
            </div>
            <div
              onClick={toggleMode}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleMode();
                }
              }}
              style={{ cursor: "pointer" }}
              role="button"
              tabIndex={0}
            >
              <span className="setting-icon">
                {isMobile ? <Monitor size={17} /> : <Smartphone size={17} />}
              </span>
              <div>
                <strong>
                  {isMobile
                    ? t("nav.desktopVersion") || "Version Ordinateur (Bureau)"
                    : t("nav.mobileVersion") || "Version Smartphone"}
                </strong>
                <span>
                  {isMobile
                    ? "Afficher la disposition grand écran avec barre latérale"
                    : "Afficher l'interface ergonomique pour smartphone"}
                </span>
              </div>
              <ChevronRight size={17} />
            </div>
          </div>
          <div className="section-heading compact notification-heading">
            <div>
              <span className="eyebrow">{t("profile.notifications")}</span>
              <h2>{t("profile.notificationSettings")}</h2>
            </div>
            <Bell size={19} />
          </div>
          {notificationPreferences && (
            <div className="notification-settings">
              {(
                [
                  ["game_invites", "notificationInvites"],
                  ["matchmaking", "notificationMatchmaking"],
                  ["table_turns", "notificationTurns"],
                  ["product_updates", "notificationProduct"],
                ] as const
              ).map(([field, label]) => (
                <label className="notification-setting" key={field}>
                  <span>
                    <strong>{t(`profile.${label}`)}</strong>
                    <small>{t(`profile.${label}Hint`)}</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={notificationPreferences[field]}
                    onChange={(event) =>
                      void toggleNotification(field, event.target.checked)
                    }
                  />
                </label>
              ))}
            </div>
          )}
          {notificationError && (
            <p className="form-error">{notificationError}</p>
          )}
        </section>
        <aside>
          <section className="activity-card">
            <div className="section-heading compact">
              <div>
                <span className="eyebrow gold">{t("profile.missions")}</span>
                <h2>{t("profile.missions")}</h2>
              </div>
            </div>
            {missions.map((mission) => (
              <div className="activity-row" key={mission.key}>
                <div>
                  <strong>{mission.title}</strong>
                  <span>
                    {t("profile.missionProgress", {
                      progress: mission.progress,
                      goal: mission.goal,
                      reward: mission.reward,
                    })}
                  </span>
                </div>
                {mission.claimable ? (
                  <button
                    className="text-link"
                    onClick={() => void claimMission(mission)}
                  >
                    {t("profile.missionClaim")}
                  </button>
                ) : (
                  <small>
                    {mission.claimed ? t("profile.missionClaimed") : "—"}
                  </small>
                )}
              </div>
            ))}
            {missionError && (
              <small className="form-error">{missionError}</small>
            )}
          </section>
          <div className="achievements-card">
            <div className="section-heading compact">
              <div>
                <span className="eyebrow gold">{t("profile.collection")}</span>
                <h2>{t("profile.recentBadges")}</h2>
              </div>
              <Award size={19} />
            </div>
            <div className="badge-list">
              <div>
                <span className="achievement gold-achievement">♛</span>
                <strong>{t("profile.firstWin")}</strong>
                <small>{t("profile.earnedToday")}</small>
              </div>
              <div>
                <span className="achievement blue-achievement">♠</span>
                <strong>{t("profile.tableAce")}</strong>
                <small>
                  {t("profile.winsRecorded", { count: stats.wins })}
                </small>
              </div>
              <div>
                <span className="achievement muted-achievement">♦</span>
                <strong>{t("profile.collector")}</strong>
                <small>
                  {t("profile.gamesPlayedCount", { count: stats.played })}
                </small>
              </div>
            </div>
            <span className="text-link" style={{ cursor: "default" }}>
              {t("profile.allBadges")} ({stats.wins > 0 ? "2" : "1"}/3
              débloqués)
            </span>
          </div>
          <button className="logout-button" onClick={handleLogout}>
            <LogOut size={16} /> {t("profile.logout")}
          </button>
        </aside>
      </div>

      {isEditingName && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: "400px" }}>
            <div className="modal-header">
              <h3>Modifier votre pseudo</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setIsEditingName(false)}
                aria-label="Fermer"
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ marginTop: "16px" }}>
              <label
                htmlFor="edit-pseudo-input"
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 600,
                  marginBottom: "8px",
                }}
              >
                Nouveau pseudo
              </label>
              <input
                id="edit-pseudo-input"
                type="text"
                maxLength={30}
                value={editNameValue}
                onChange={(e) => setEditNameValue(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  background: "var(--bg-dark, #0b1014)",
                  border: "1px solid var(--border-color, #2a3742)",
                  color: "#fff",
                  fontSize: "15px",
                  marginBottom: "12px",
                }}
              />
              {editNameError && (
                <div
                  style={{
                    color: "#e57373",
                    fontSize: "13px",
                    marginBottom: "12px",
                  }}
                >
                  {editNameError}
                </div>
              )}
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => setIsEditingName(false)}
                  style={{ flex: 1 }}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className="button button-gold"
                  onClick={handleSaveName}
                  disabled={editNameSaving}
                  style={{
                    flex: 1,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                  }}
                >
                  <Check size={16} />
                  <span>
                    {editNameSaving ? "Enregistrement..." : "Enregistrer"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <KYCModal
        isOpen={isKycModalOpen}
        onClose={() => setIsKycModalOpen(false)}
        kycStatus={kyc}
        token={accessToken}
        onStatusUpdated={reloadKycStatus}
      />

      <ResponsibleGamingModal
        isOpen={isRgModalOpen}
        onClose={() => setIsRgModalOpen(false)}
        token={accessToken}
        profile={rgProfile}
        onProfileUpdated={reloadRgStatus}
      />
    </div>
  );
}
