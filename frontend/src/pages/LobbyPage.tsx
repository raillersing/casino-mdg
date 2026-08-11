import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Lock, Plus, Search, SlidersHorizontal, Users } from 'lucide-react'
import { getTables, joinTable, type GameTable } from '@services/games'
import { useGameStore } from '@stores/gameStore'
import { useTranslation } from 'react-i18next'

export function LobbyPage() {
  const { t } = useTranslation()
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [tables, setTables] = useState<GameTable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [joining, setJoining] = useState<string | null>(null)
  const accessToken = useGameStore((state) => state.accessToken)

  useEffect(() => {
    setLoading(true)
    getTables(filter === 'all' ? 'Tous' : filter).then((payload) => setTables(payload.results)).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false))
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
  <div className="page-title-row"><div><span className="eyebrow">{t('lobby.open')}</span><h1>{t('lobby.title')} <em>{t('lobby.live')}</em></h1><p>{t('lobby.choose')}</p></div><button className="button button-gold"><Plus size={17}/> {t('games.create')}</button></div>
  <div className="lobby-toolbar"><div className="tabs">{[{ key: 'all', label: t('lobby.all') }, { key: 'poker', label: t('games.poker') }, { key: 'belote', label: t('games.belote') }, { key: 'rami', label: t('games.rami') }].map((item) => <button className={filter === item.key ? 'active' : ''} onClick={() => setFilter(item.key)} key={item.key}>{item.label}</button>)}</div><label className="search-box"><Search size={17}/><input aria-label={t('lobby.search')} placeholder={t('lobby.search')} value={query} onChange={(e) => setQuery(e.target.value)}/></label><button className="filter-button"><SlidersHorizontal size={17}/> <span>{t('lobby.filters')}</span></button></div>
  <div className="live-strip"><div className="live-strip-icon"><Users size={18}/></div><div><strong>{t('lobby.online')}</strong><span>{t('lobby.fillFast')}</span></div><div className="avatar-stack"><span>J</span><span>M</span><span>R</span><b>+231</b></div></div>
  {error && <div className="empty-note"><span>{error}</span></div>}
  <div className="table-list">{loading ? <div className="empty-note"><span>{t('lobby.loading')}</span></div> : shown.length === 0 ? <div className="empty-note"><span>{t('lobby.empty')}</span></div> : shown.map((table, index) => { const live = table.status === 'running'; return <div className="table-row" key={table.id}><div className={`table-symbol symbol-${table.game_type}`}>{table.game_type === 'poker' ? '♠' : table.game_type === 'belote' ? '♥' : '♦'}</div><div className="table-main"><div><strong>{table.name}</strong>{index === 0 && <span className="hot-tag">{t('lobby.popular')}</span>}</div><span>{t(`games.${table.game_type}`)}</span></div><div className="table-cell"><small>{t('lobby.stakes')}</small><strong>{table.stakes}</strong></div><div className="table-cell"><small>{t('lobby.players')}</small><strong>{table.player_count} / {table.max_players}</strong></div><div className="table-status"><span className={live ? 'status-live' : ''}><i/>{live ? t('lobby.running') : t('lobby.openTable')}</span></div>{accessToken ? <button className="join-button" onClick={() => join(table)} disabled={joining === table.id || table.status === 'finished' || table.player_count >= table.max_players}>{joining === table.id ? t('lobby.connecting') : live ? t('lobby.watch') : t('games.join')} <ArrowUpRight size={16}/></button> : <Link to="/auth" className="join-button">{t('nav.login')} <ArrowUpRight size={16}/></Link>}</div> })}</div>
  <div className="empty-note"><Lock size={16}/><span>{t('lobby.privateHint')}</span></div>
</div> }
