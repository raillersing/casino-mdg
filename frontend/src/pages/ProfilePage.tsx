import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Award, ChevronRight, Edit3, LogOut, ShieldCheck, Trophy, UserRound } from 'lucide-react'
import { getGameStats, getLeaderboard, type GameStats } from '@services/games'
import { useGameStore } from '@stores/gameStore'
import { getKYCStatus, type KYCStatus } from '@services/kyc'
import { useTranslation } from 'react-i18next'

export function ProfilePage() {
  const { t } = useTranslation()
  const user = useGameStore((state) => state.user)
  const logout = useGameStore((state) => state.logout)
  const accessToken = useGameStore((state) => state.accessToken)
  const name = user?.displayName || t('profile.visitor')
  const [stats, setStats] = useState<GameStats>({ played: 0, wins: 0, losses: 0, draws: 0, total_won: 0 })
  const [rank, setRank] = useState<number | null>(null)
  const [kyc, setKyc] = useState<KYCStatus | null>(null)

  useEffect(() => {
    if (!accessToken) return
    getGameStats(accessToken).then((payload) => setStats(payload.stats)).catch(() => undefined)
    getLeaderboard().then((payload) => { const entry = payload.results.find((item) => item.display_name === name); setRank(entry?.rank || null) }).catch(() => undefined)
    getKYCStatus(accessToken).then(setKyc).catch(() => undefined)
  }, [accessToken, name])

  return <div className="page-stack"><div className="profile-head"><div className="avatar profile-avatar">{name[0]}</div><div><span className="eyebrow">{t('profile.memberSince')}</span><h1>{name} <em>Rakoto.</em></h1><p><span className="online-dot"/> {t('profile.online')}</p></div><button className="button button-outline edit-button"><Edit3 size={15}/> {t('profile.edit')}</button></div><div className="profile-grid"><section><div className="level-card"><div className="level-copy"><span className="eyebrow gold">{t('profile.progress')}</span><h2>{t('profile.level', { level: user?.level || 4 })} <small>{t('profile.explorer')}</small></h2><p>{t('profile.nextLevel')}</p></div><div className="level-ring"><strong>68%</strong><span>XP</span></div><div className="level-bar"><i style={{ width: '68%' }}/></div></div><div className="section-heading compact"><div><span className="eyebrow">{t('profile.yourStats')}</span><h2>{t('profile.gameStats')}</h2></div><Trophy size={19}/></div><div className="stats-grid"><div><strong>{stats.played}</strong><span>{t('profile.gamesPlayed')}</span></div><div><strong>{stats.played ? Math.round((stats.wins / stats.played) * 100) : 0}<span>%</span></strong><span>{t('profile.winRate')}</span></div><div><strong>{stats.total_won.toLocaleString('fr-FR')}<span> SIM</span></strong><span>{t('profile.totalWinnings')}</span></div><div><strong>{rank ? `#${rank}` : '—'}</strong><span>{t('profile.localRank')}</span></div></div><div className="section-heading compact"><div><span className="eyebrow">{t('profile.compliance')}</span><h2>{t('profile.kycLevel')} <small>{kyc?.level || '…'}</small></h2></div><ShieldCheck size={19}/></div><div className="settings-list"><div><span className="setting-icon"><ShieldCheck size={17}/></span><div><strong>{kyc?.request ? t('profile.request', { status: kyc.request.status }) : t('profile.noRequest')}</strong><span>{t('profile.documentsDisabled', { limit: kyc ? kyc.limits_mga.deposit.toLocaleString('fr-FR') : '…' })}</span></div><ChevronRight size={17}/></div><div><span className="setting-icon"><UserRound size={17}/></span><div><strong>{t('profile.publicProfile')}</strong><span>{t('profile.publicProfileHint')}</span></div><ChevronRight size={17}/></div></div></section><aside><div className="achievements-card"><div className="section-heading compact"><div><span className="eyebrow gold">{t('profile.collection')}</span><h2>{t('profile.recentBadges')}</h2></div><Award size={19}/></div><div className="badge-list"><div><span className="achievement gold-achievement">♛</span><strong>{t('profile.firstWin')}</strong><small>{t('profile.earnedToday')}</small></div><div><span className="achievement blue-achievement">♠</span><strong>{t('profile.tableAce')}</strong><small>{t('profile.winsRecorded', { count: stats.wins })}</small></div><div><span className="achievement muted-achievement">♦</span><strong>{t('profile.collector')}</strong><small>{t('profile.gamesPlayedCount', { count: stats.played })}</small></div></div><Link to="/lobby" className="text-link">{t('profile.allBadges')} <ChevronRight size={15}/></Link></div><button className="logout-button" onClick={logout}><LogOut size={16}/> {t('profile.logout')}</button></aside></div></div>
}
