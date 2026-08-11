import { Link } from 'react-router-dom'
import { ArrowUpRight, ChevronRight, Clock3, Flame, Plus, Sparkles } from 'lucide-react'

const games = [
  { id: 'poker', name: 'Texas Hold’em', meta: 'Tables rapides · 2–9 joueurs', className: 'game-poker', icon: '♠', players: '128 joueurs' },
  { id: 'belote', name: 'Belote classique', meta: 'Équipes · 4 joueurs', className: 'game-belote', icon: '♥', players: '64 joueurs' },
  { id: 'rami', name: 'Rami', meta: 'Parties privées · 2–4 joueurs', className: 'game-rami', icon: '♦', players: '42 joueurs' },
]

export function HomePage() {
  return <div className="page-stack home-page">
    <section className="hero-panel">
      <div className="hero-copy"><span className="eyebrow gold"><Sparkles size={13}/> Le club de jeu malgache</span><h1>Le jeu a une<br/><em>nouvelle adresse.</em></h1><p>Retrouvez votre table, vos amis et le frisson du prochain coup. Jouez gratuitement, où que vous soyez à Madagascar.</p><div className="hero-actions"><Link to="/lobby" className="button button-gold">Entrer dans le lobby <ArrowUpRight size={17}/></Link><Link to="/auth" className="quiet-link">Créer un compte <ChevronRight size={15}/></Link></div></div>
      <div className="hero-orbit"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="hero-card card-back">♠</div><div className="hero-card card-front"><span>A</span><strong>♥</strong></div><div className="hero-chip">MDG<br/><small>10K</small></div></div>
      <div className="hero-stats"><div><strong>2 408</strong><span>joueurs actifs</span></div><div><strong>03</strong><span>jeux disponibles</span></div><div><strong>24/7</strong><span>tables ouvertes</span></div></div>
    </section>
    <section className="section-block"><div className="section-heading"><div><span className="eyebrow">À la une</span><h2>Choisissez votre table</h2></div><Link to="/lobby" className="text-link">Voir tout <ChevronRight size={15}/></Link></div><div className="game-grid">{games.map((game) => <Link to={`/game/${game.id}/table-01`} className={`game-card ${game.className}`} key={game.id}><div className="game-card-top"><span className="game-icon">{game.icon}</span><span className="live-pill"><i/>{game.players}</span></div><div className="game-card-bottom"><div><h3>{game.name}</h3><p>{game.meta}</p></div><span className="circle-arrow"><ArrowUpRight size={17}/></span></div></Link>)}</div></section>
    <section className="lower-grid"><div className="resume-card"><div className="section-heading compact"><div><span className="eyebrow">Votre activité</span><h2>Reprendre la partie</h2></div><Clock3 size={19}/></div><div className="resume-row"><div className="mini-table mini-poker"><span>♠</span></div><div className="resume-info"><strong>Table Émeraude</strong><span>Texas Hold’em · il y a 12 min</span><div className="progress"><i style={{width: '68%'}}/></div><small>4 joueurs sur 6</small></div><Link to="/game/poker/emerald-01" className="button button-small">Rejoindre</Link></div></div><div className="spotlight-card"><div><span className="eyebrow gold"><Flame size={13}/> Ce soir au club</span><h2>Le tournoi<br/><em>des Hautes-Terres</em></h2><p>Samedi · 20:30 · 10 000 jetons offerts</p></div><div className="trophy">♛</div><Link to="/lobby" className="round-action"><Plus size={18}/></Link></div></section>
  </div>
}
