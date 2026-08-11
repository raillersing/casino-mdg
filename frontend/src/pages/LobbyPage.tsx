import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Lock, Plus, Search, SlidersHorizontal, Users } from 'lucide-react'
import { getTables, joinTable, type GameTable } from '@services/games'
import { useGameStore } from '@stores/gameStore'

const labels = { poker: 'Poker', belote: 'Belote', rami: 'Rami' }
const gameNames = { poker: 'Texas Hold’em', belote: 'Belote classique', rami: 'Rami' }

export function LobbyPage() {
  const [filter, setFilter] = useState('Tous')
  const [query, setQuery] = useState('')
  const [tables, setTables] = useState<GameTable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [joining, setJoining] = useState<string | null>(null)
  const accessToken = useGameStore((state) => state.accessToken)

  useEffect(() => {
    setLoading(true)
    getTables(filter).then((payload) => setTables(payload.results)).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false))
  }, [filter])

  const shown = tables.filter((table) => table.name.toLowerCase().includes(query.toLowerCase()))
  const join = async (table: GameTable) => {
    if (!accessToken) return
    setJoining(table.id)
    try {
      const result = await joinTable(table.id, accessToken)
      setTables((current) => current.map((item) => item.id === table.id ? result.table : item))
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Impossible de rejoindre la table.') } finally { setJoining(null) }
  }

  return <div className="page-stack">
  <div className="page-title-row"><div><span className="eyebrow">Le club est ouvert</span><h1>Lobby <em>en direct.</em></h1><p>Choisissez une table et prenez place en quelques secondes.</p></div><button className="button button-gold"><Plus size={17}/> Créer une table</button></div>
  <div className="lobby-toolbar"><div className="tabs">{['Tous', 'Poker', 'Belote', 'Rami'].map((item) => <button className={filter === item ? 'active' : ''} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div><label className="search-box"><Search size={17}/><input placeholder="Rechercher une table" value={query} onChange={(e) => setQuery(e.target.value)}/></label><button className="filter-button"><SlidersHorizontal size={17}/> <span>Filtres</span></button></div>
  <div className="live-strip"><div className="live-strip-icon"><Users size={18}/></div><div><strong>234 joueurs sont en ligne</strong><span>Les tables se remplissent vite ce soir.</span></div><div className="avatar-stack"><span>J</span><span>M</span><span>R</span><b>+231</b></div></div>
  {error && <div className="empty-note"><span>{error}</span></div>}
  <div className="table-list">{loading ? <div className="empty-note"><span>Chargement des tables…</span></div> : shown.length === 0 ? <div className="empty-note"><span>Aucune table ne correspond à votre recherche.</span></div> : shown.map((table, index) => { const type = labels[table.game_type]; const game = gameNames[table.game_type]; const live = table.status === 'running'; return <div className="table-row" key={table.id}><div className={`table-symbol symbol-${type.toLowerCase()}`}>{type === 'Poker' ? '♠' : type === 'Belote' ? '♥' : '♦'}</div><div className="table-main"><div><strong>{table.name}</strong>{index === 0 && <span className="hot-tag">Populaire</span>}</div><span>{game}</span></div><div className="table-cell"><small>Mises</small><strong>{table.stakes}</strong></div><div className="table-cell"><small>Joueurs</small><strong>{table.player_count} / {table.max_players}</strong></div><div className="table-status"><span className={live ? 'status-live' : ''}><i/>{live ? 'En cours' : 'Ouverte'}</span></div>{accessToken ? <button className="join-button" onClick={() => join(table)} disabled={joining === table.id || table.status === 'finished' || table.player_count >= table.max_players}>{joining === table.id ? 'Connexion…' : live ? 'Voir la table' : 'Rejoindre'} <ArrowUpRight size={16}/></button> : <Link to="/auth" className="join-button">Se connecter <ArrowUpRight size={16}/></Link>}</div> })}</div>
  <div className="empty-note"><Lock size={16}/><span>Les tables privées apparaissent ici lorsque vos amis vous invitent.</span></div>
</div> }
