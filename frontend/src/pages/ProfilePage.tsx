import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Award,
  Bell,
  ChevronRight,
  Dices,
  Edit3,
  HeartHandshake,
  LifeBuoy,
  LogOut,
  ShieldCheck,
  Trophy,
  UserRound,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { getGameStats, getLeaderboard, type GameStats } from "@services/games";
import { useGameStore } from "@stores/gameStore";
import { getKYCStatus, type KYCStatus } from "@services/kyc";
import { KYCModal } from "@components/KYCModal";
import {
  getResponsibleGamingStatus,
  type ResponsibleGamingProfile,
} from "@services/responsibleGaming";
import { ResponsibleGamingModal } from "@components/ResponsibleGamingModal";
import { useTranslation } from "react-i18next";
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
  const user = useGameStore((state) => state.user);
  const logout = useGameStore((state) => state.logout);
  const accessToken = useGameStore((state) => state.accessToken);
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
  const [rgProfile, setRgProfile] = useState<ResponsibleGamingProfile | null>(null);
  const [isRgModalOpen, setIsRgModalOpen] = useState(false);
  const [missions, setMissions] = useState<DailyMission[]>([]);
  const [missionError, setMissionError] = useState("");
  const [notificationPreferences, setNotificationPreferences] =
    useState<NotificationPreferences | null>(null);
  const [notificationError, setNotificationError] = useState("");

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
        <button className="button button-outline edit-button">
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
        <Link to="/games/test" className="quick-link-card">
          <Dices size={20} />
          <span>{t("nav.testGames")}</span>
          <ChevronRight size={16} />
        </Link>
      </div>
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
                {t("profile.kycLevel")} <small>{kyc?.level.toUpperCase() || "…"}</small>
              </h2>
            </div>
            <ShieldCheck size={19} />
          </div>
          <div className="settings-list">
            <div
              onClick={() => setIsKycModalOpen(true)}
              style={{ cursor: "pointer" }}
              role="button"
              tabIndex={0}
            >
              <span className="setting-icon">
                <ShieldCheck size={17} color={kyc?.level === "verified" || kyc?.level === "vip" ? "var(--green)" : "var(--gold)"} />
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
                <HeartHandshake size={17} color={rgProfile?.is_blocked ? "var(--red)" : "var(--gold)"} />
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
            <Link to="/lobby" className="text-link">
              {t("profile.allBadges")} <ChevronRight size={15} />
            </Link>
          </div>
          <button className="logout-button" onClick={logout}>
            <LogOut size={16} /> {t("profile.logout")}
          </button>
        </aside>
      </div>

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
