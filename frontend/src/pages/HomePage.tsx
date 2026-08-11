import { Link } from 'react-router-dom'
import { ArrowUpRight, ChevronRight, Clock3, Flame, Plus, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const games = [
  { id: 'poker', name: 'home.games.poker.name', meta: 'home.games.poker.meta', className: 'game-poker', icon: '♠', players: 'home.games.poker.players' },
  { id: 'belote', name: 'home.games.belote.name', meta: 'home.games.belote.meta', className: 'game-belote', icon: '♥', players: 'home.games.belote.players' },
  { id: 'rami', name: 'home.games.rami.name', meta: 'home.games.rami.meta', className: 'game-rami', icon: '♦', players: 'home.games.rami.players' },
]

export function HomePage() {
  const { t } = useTranslation()
  return <div className="page-stack home-page">
    <section className="hero-panel">
      <div className="hero-copy"><span className="eyebrow gold"><Sparkles size={13}/> {t('home.club')}</span><h1>{t('home.title')}<br/><em>{t('home.titleAccent')}</em></h1><p>{t('home.intro')}</p><div className="hero-actions"><Link to="/lobby" className="button button-gold">{t('home.enterLobby')} <ArrowUpRight size={17}/></Link><Link to="/auth" className="quiet-link">{t('home.createAccount')} <ChevronRight size={15}/></Link></div></div>
      <div className="hero-orbit"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="hero-card card-back">♠</div><div className="hero-card card-front"><span>A</span><strong>♥</strong></div><div className="hero-chip">MDG<br/><small>10K</small></div></div>
      <div className="hero-stats"><div><strong>2 408</strong><span>{t('home.activePlayers')}</span></div><div><strong>03</strong><span>{t('home.availableGames')}</span></div><div><strong>24/7</strong><span>{t('home.openTables')}</span></div></div>
    </section>
    <section className="section-block"><div className="section-heading"><div><span className="eyebrow">{t('home.featured')}</span><h2>{t('home.chooseTable')}</h2></div><Link to="/lobby" className="text-link">{t('home.viewAll')} <ChevronRight size={15}/></Link></div><div className="game-grid">{games.map((game) => <Link to={`/game/${game.id}/table-01`} className={`game-card ${game.className}`} key={game.id}><div className="game-card-top"><span className="game-icon">{game.icon}</span><span className="live-pill"><i/>{t(game.players)}</span></div><div className="game-card-bottom"><div><h3>{t(game.name)}</h3><p>{t(game.meta)}</p></div><span className="circle-arrow"><ArrowUpRight size={17}/></span></div></Link>)}</div></section>
    <section className="lower-grid"><div className="resume-card"><div className="section-heading compact"><div><span className="eyebrow">{t('home.activity')}</span><h2>{t('home.resume')}</h2></div><Clock3 size={19}/></div><div className="resume-row"><div className="mini-table mini-poker"><span>♠</span></div><div className="resume-info"><strong>Table Émeraude</strong><span>{t('home.resumeMeta')}</span><div className="progress"><i style={{width: '68%'}}/></div><small>{t('home.resumePlayers')}</small></div><Link to="/game/poker/emerald-01" className="button button-small">{t('games.join')}</Link></div></div><div className="spotlight-card"><div><span className="eyebrow gold"><Flame size={13}/> {t('home.tonight')}</span><h2>{t('home.tournament')}<br/><em>{t('home.tournamentAccent')}</em></h2><p>{t('home.tournamentMeta')}</p></div><div className="trophy">♛</div><Link to="/lobby" className="round-action" aria-label="Ouvrir le lobby"><Plus size={18}/></Link></div></section>
  </div>
}
