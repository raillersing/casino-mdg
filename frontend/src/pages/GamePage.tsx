import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, Copy, MessageCircle, Send, Settings2, Users } from 'lucide-react'
import { createTableInvitation, getTableChat, sendTableMessage, type ChatMessage } from '@services/social'
import { useGameStore } from '@stores/gameStore'

export function GamePage() {
  const { t } = useTranslation()
  const { gameType, tableId } = useParams()
  const [selected, setSelected] = useState('')
  const [message, setMessage] = useState('')
  const [chat, setChat] = useState<ChatMessage[]>([])
  const [socialError, setSocialError] = useState('')
  const [invite, setInvite] = useState('')
  const accessToken = useGameStore((state) => state.accessToken)
  const isPoker = gameType === 'poker'

  useEffect(() => {
    if (!tableId || !accessToken) return
    getTableChat(tableId, accessToken).then((payload) => setChat(payload.results)).catch((error: Error) => setSocialError(error.message))
  }, [accessToken, tableId])

  const sendMessage = async () => {
    if (!tableId || !accessToken || !message.trim()) return
    try { const sent = await sendTableMessage(tableId, message.trim(), accessToken); setChat((current) => [...current, sent]); setMessage(''); setSocialError('') } catch (error) { setSocialError(error instanceof Error ? error.message : t('app.error')) }
  }

  const inviteFriend = async () => {
    if (!tableId || !accessToken) return
    try { const result = await createTableInvitation(tableId, accessToken); const link = `${window.location.origin}/game/${gameType}/${tableId}?invite=${result.token}`; await navigator.clipboard?.writeText(link); setInvite(link); setSocialError('') } catch (error) { setSocialError(error instanceof Error ? error.message : t('app.error')) }
  }

  return <div className="game-room"><div className="game-room-head"><Link to="/lobby" className="back-link"><ChevronLeft size={17}/> Quitter la table</Link><div><strong>Table Émeraude</strong><span><i/> Partie en cours · {isPoker ? 'Texas Hold’em' : gameType}</span></div><button className="icon-button" onClick={inviteFriend} title="Inviter un ami"><Users size={18}/></button></div><div className={`felt-table ${isPoker ? 'felt-green' : 'felt-blue'}`}><div className="table-brand">MDG <small>GAME CLUB</small></div><PlayerSeat pos="top" name="Tovo" chips="8 420"/><PlayerSeat pos="left" name="Rija" chips="12 100"/><PlayerSeat pos="right" name="Saholy" chips="6 750"/><div className="pot">POT <strong>2 400</strong></div><div className="community-cards"><PlayingCard value="A" suit="♠"/><PlayingCard value="K" suit="♥" red/><PlayingCard value="8" suit="♦" red/><PlayingCard value="7" suit="♣"/><PlayingCard value="?" suit="" hidden/></div><div className="you-seat"><div className="you-avatar">M</div><div><strong>Vous</strong><span>12 450 jetons</span></div></div><div className="hole-cards"><PlayingCard value="A" suit="♥" red selected={selected === 'a'} onClick={() => setSelected('a')}/><PlayingCard value="J" suit="♣" selected={selected === 'j'} onClick={() => setSelected('j')}/></div></div><div className="game-controls"><div className="turn-state"><span className="timer">00:18</span><div><strong>À vous de jouer</strong><span>Choisissez votre action</span></div></div><div className="action-row"><button className="action-fold">Se coucher</button><button className="action-check">Checker</button><button className="action-bet">Miser <strong>800</strong></button></div></div><div className="game-bottom"><div className="chat-box"><div className="chat-head"><span><MessageCircle size={15}/> Chat de table</span><Users size={15}/></div><div className="chat-messages">{chat.length ? chat.map((item) => <p key={item.id}><b>{item.author}</b> {item.body}</p>) : <p className="muted">Aucun message pour le moment.</p>}</div><div className="chat-input"><input placeholder="Écrire un message…" value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void sendMessage() }}/><button onClick={() => void sendMessage()}><Send size={15}/></button></div>{socialError && <small className="form-error">{socialError}</small>}{invite && <button className="text-link" onClick={() => void navigator.clipboard?.writeText(invite)}><Copy size={14}/> Lien d’invitation copié</button>}</div><div className="game-info"><div><Settings2 size={16}/><span>Paramètres de table</span></div><div><span>Buy-in</span><strong>10 000 jetons</strong></div><div><span>Blinds</span><strong>100 / 200</strong></div></div></div></div>
}
function PlayerSeat({ pos, name, chips }: { pos: string; name: string; chips: string }) { return <div className={`player-seat seat-${pos}`}><div className="seat-avatar">{name[0]}</div><div><strong>{name}</strong><span>{chips}</span></div></div> }
function PlayingCard({ value, suit, red, hidden, selected, onClick }: { value: string; suit: string; red?: boolean; hidden?: boolean; selected?: boolean; onClick?: () => void }) { return <button onClick={onClick} className={`playing-card ${red ? 'red' : ''} ${hidden ? 'hidden-card' : ''} ${selected ? 'selected' : ''}`}><span>{hidden ? '?' : value}</span><b>{hidden ? '✦' : suit}</b></button> }
