import { useEffect, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, CreditCard, Loader2, WalletCards, Zap } from 'lucide-react'
import { useGameStore } from '@stores/gameStore'
import { getWalletBalance, getWalletTransactions, type WalletBalance, type WalletTransaction } from '@/services/wallet'
import { createPaymentIntent } from '@services/payments'

export function WalletPage() {
  const [tab, setTab] = useState<'overview' | 'history'>('overview')
  const [balance, setBalance] = useState<WalletBalance | null>(null)
  const [transactions, setTransactions] = useState<WalletTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [intentMessage, setIntentMessage] = useState('')
  const [intentLoading, setIntentLoading] = useState(false)
  const accessToken = useGameStore((state) => state.accessToken)

  useEffect(() => {
    if (!accessToken) { setLoading(false); return }
    Promise.all([getWalletBalance(accessToken), getWalletTransactions(accessToken)])
      .then(([wallet, history]) => { setBalance(wallet); setTransactions(history.results) })
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : 'Impossible de charger le portefeuille.'))
      .finally(() => setLoading(false))
  }, [accessToken])

  const createSandboxIntent = async () => {
    if (!accessToken) { setIntentMessage('Connectez-vous pour utiliser ce parcours.'); return }
    setIntentLoading(true); setIntentMessage('')
    try { const intent = await createPaymentIntent(accessToken, 'mvola', 'deposit', 5000, `sandbox-${Date.now()}`); setIntentMessage(`Intent sandbox ${intent.status} — aucun solde n’a été modifié.`) } catch (requestError) { setIntentMessage(requestError instanceof Error ? requestError.message : 'Intent impossible.') } finally { setIntentLoading(false) }
  }

  return <div className="page-stack"><div className="page-title-row"><div><span className="eyebrow">Votre espace financier</span><h1>Portefeuille <em>du club.</em></h1><p>Gérez vos jetons et suivez vos dernières activités.</p></div><button className="button button-gold" onClick={() => void createSandboxIntent()} disabled={intentLoading}><CreditCard size={17}/> {intentLoading ? 'Création…' : 'Tester un dépôt sandbox'}</button></div><div className="wallet-layout"><section><div className="balance-card"><div className="balance-top"><span>Solde disponible</span><WalletCards size={18}/></div><strong>{loading ? <Loader2 className="spin" size={28}/> : (balance?.balance ?? 0).toLocaleString('fr-FR')} <small>jetons</small></strong><div className="balance-footer"><span>Mode simulation · monnaie virtuelle</span><span className="balance-up">SIM</span></div></div><div className="wallet-tabs">{(['overview', 'history'] as const).map((item) => <button className={tab === item ? 'active' : ''} onClick={() => setTab(item)} key={item}>{item === 'overview' ? 'Vue d’ensemble' : 'Historique'}</button>)}</div>{error && <p className="auth-error">{error}</p>}{intentMessage && <p className="secure-note">{intentMessage}</p>}{tab === 'overview' ? <><div className="section-heading compact"><div><span className="eyebrow">Rapide & sécurisé</span><h2>Votre solde est prêt</h2></div></div><div className="deposit-grid"><div className="wallet-info-tile"><strong>10 000</strong><small>bonus de bienvenue crédité</small></div><div className="wallet-info-tile"><strong>{transactions.length}</strong><small>transaction{transactions.length > 1 ? 's' : ''} enregistrée{transactions.length > 1 ? 's' : ''}</small></div><div className="wallet-info-tile"><strong>{balance?.currency || 'SIM'}</strong><small>monnaie du mode simulation</small></div></div></> : <div className="activity-card">{transactions.length ? transactions.map((item) => <ActivityRow key={item.id} transaction={item}/>) : <div className="empty-wallet">Aucune transaction enregistrée.</div>}</div>}</section><aside className="wallet-aside"><div className="payment-card"><span className="eyebrow gold"><Zap size={13}/> Sandbox</span><h3>Parcours de paiement.</h3><p>Vous pouvez tester la création d’un intent MVola. Aucun solde n’est modifié et aucun paiement réel n’est déclenché.</p><div className="payment-methods"><span>MVola</span><span>Orange Money</span><span>Airtel Money</span></div><button className="button button-outline full" onClick={() => void createSandboxIntent()} disabled={intentLoading}><CreditCard size={16}/> Créer un intent test</button></div><div className="secure-note"><WalletCards size={18}/><div><strong>Solde protégé</strong><span>Votre historique reste privé et accessible à tout moment.</span></div></div></aside></div></div>
}

function ActivityRow({ transaction }: { transaction: WalletTransaction }) { const positive = transaction.direction === 'credit'; return <div className="activity-row"><span className={`activity-icon ${positive ? 'positive' : ''}`}>{positive ? <ArrowDownLeft/> : <ArrowUpRight/>}</span><div><strong>{transaction.description || transaction.type}</strong><span>{new Date(transaction.created_at).toLocaleString('fr-FR')}</span></div><b className={positive ? 'positive-text' : ''}>{positive ? '+' : '−'} {transaction.amount.toLocaleString('fr-FR')}</b></div> }
