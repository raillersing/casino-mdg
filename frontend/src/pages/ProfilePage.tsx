import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Award, ChevronRight, Edit3, LogOut, ShieldCheck, Trophy, UserRound } from 'lucide-react'
import { getGameStats, getLeaderboard, type GameStats } from '@services/games'
import { useGameStore } from '@stores/gameStore'

export function ProfilePage() {
  const user = useGameStore((state) => state.user)
  const logout = useGameStore((state) => state.logout)
  const accessToken = useGameStore((state) => state.accessToken)
  const name = user?.displayName || 'Visiteur'
  const [stats, setStats] = useState<GameStats>({ played: 0, wins: 0, losses: 0, draws: 0, total_won: 0 })
  const [rank, setRank] = useState<number | null>(null)

  useEffect(() => {
    if (!accessToken) return
    getGameStats(accessToken).then((payload) => setStats(payload.stats)).catch(() => undefined)
    getLeaderboard().then((payload) => { const entry = payload.results.find((item) => item.display_name === name); setRank(entry?.rank || null) }).catch(() => undefined)
  }, [accessToken, name])

  return <div className="page-stack"><div className="profile-head"><div className="avatar profile-avatar">{name[0]}</div><div><span className="eyebrow">Membre depuis août 2026</span><h1>{name} <em>Rakoto.</em></h1><p><span className="online-dot"/> En ligne maintenant · Antananarivo</p></div><button className="button button-outline edit-button"><Edit3 size={15}/> Modifier</button></div><div className="profile-grid"><section><div className="level-card"><div className="level-copy"><span className="eyebrow gold">Progression du joueur</span><h2>Niveau {user?.level || 4} <small>Explorateur</small></h2><p>Encore 320 XP pour atteindre le niveau 5.</p></div><div className="level-ring"><strong>68%</strong><span>XP</span></div><div className="level-bar"><i style={{ width: '68%' }}/></div></div><div className="section-heading compact"><div><span className="eyebrow">Vos chiffres</span><h2>Statistiques de jeu</h2></div><Trophy size={19}/></div><div className="stats-grid"><div><strong>{stats.played}</strong><span>Parties jouées</span></div><div><strong>{stats.played ? Math.round((stats.wins / stats.played) * 100) : 0}<span>%</span></strong><span>Taux de victoire</span></div><div><strong>{stats.total_won.toLocaleString('fr-FR')}<span> SIM</span></strong><span>Gains cumulés</span></div><div><strong>{rank ? `#${rank}` : '—'}</strong><span>Classement local</span></div></div><div className="section-heading compact"><div><span className="eyebrow">Vos préférences</span><h2>Réglages du compte</h2></div></div><div className="settings-list"><div><span className="setting-icon"><UserRound size={17}/></span><div><strong>Profil public</strong><span>Ce que les autres joueurs voient</span></div><ChevronRight size={17}/></div><div><span className="setting-icon"><ShieldCheck size={17}/></span><div><strong>Sécurité & confidentialité</strong><span>Numéro, session et données</span></div><ChevronRight size={17}/></div></div></section><aside><div className="achievements-card"><div className="section-heading compact"><div><span className="eyebrow gold">Collection</span><h2>Badges récents</h2></div><Award size={19}/></div><div className="badge-list"><div><span className="achievement gold-achievement">♛</span><strong>Première victoire</strong><small>Obtenu aujourd’hui</small></div><div><span className="achievement blue-achievement">♠</span><strong>As de la table</strong><small>{stats.wins} victoires enregistrées</small></div><div><span className="achievement muted-achievement">♦</span><strong>Collectionneur</strong><small>{stats.played} parties jouées</small></div></div><Link to="/lobby" className="text-link">Voir tous les badges <ChevronRight size={15}/></Link></div><button className="logout-button" onClick={logout}><LogOut size={16}/> Se déconnecter</button></aside></div></div>
}
