import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDownLeft, ArrowUpRight, CreditCard, Loader2, WalletCards, Zap, X } from 'lucide-react'
import { useGameStore } from '@stores/gameStore'
import { getWalletBalance, getWalletTransaction, getWalletTransactions, type WalletBalance, type WalletTransaction, type WalletTransactionDetail } from '@/services/wallet'
import { createPaymentIntent, getPaymentIntents, type PaymentIntentSummary } from '@services/payments'

export function WalletPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'overview' | 'history'>('overview')
  const [balance, setBalance] = useState<WalletBalance | null>(null)
  const [transactions, setTransactions] = useState<WalletTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [intentMessage, setIntentMessage] = useState('')
  const [intentLoading, setIntentLoading] = useState(false)
  const [intents, setIntents] = useState<PaymentIntentSummary[]>([])
  const [selectedTransaction, setSelectedTransaction] = useState<WalletTransactionDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const accessToken = useGameStore((state) => state.accessToken)

  useEffect(() => {
    if (!accessToken) { setLoading(false); return }
    Promise.all([getWalletBalance(accessToken), getWalletTransactions(accessToken), getPaymentIntents(accessToken)])
      .then(([wallet, history, paymentIntents]) => { setBalance(wallet); setTransactions(history.results); setIntents(paymentIntents.results) })
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : 'Impossible de charger le portefeuille.'))
      .finally(() => setLoading(false))
  }, [accessToken])

  const createSandboxIntent = async () => {
    if (!accessToken) { setIntentMessage(t('auth.login')); return }
    setIntentLoading(true); setIntentMessage('')
    try { const intent = await createPaymentIntent(accessToken, 'mvola', 'deposit', 5000, `sandbox-${Date.now()}`); setIntentMessage(`Intent sandbox ${intent.status} — ${t('wallet.noTransactions')}`) } catch (requestError) { setIntentMessage(requestError instanceof Error ? requestError.message : t('app.error')) } finally { setIntentLoading(false) }
  }

  const openTransaction = async (transaction: WalletTransaction) => {
    if (!accessToken) return
    setDetailLoading(true); setDetailError('')
    try { setSelectedTransaction(await getWalletTransaction(accessToken, transaction.id)) } catch { setDetailError(t('wallet.detailError')) } finally { setDetailLoading(false) }
  }

  return <div className="page-stack"><div className="page-title-row"><div><span className="eyebrow">{t('wallet.title')}</span><h1>{t('wallet.title')}</h1><p>{t('wallet.subtitle')}</p></div><button className="button button-gold" onClick={() => void createSandboxIntent()} disabled={intentLoading}><CreditCard size={17}/> {intentLoading ? t('wallet.creating') : t('wallet.sandboxTest')}</button></div><div className="wallet-layout"><section><div className="balance-card"><div className="balance-top"><span>{t('wallet.available')}</span><WalletCards size={18}/></div><strong>{loading ? <Loader2 className="spin" size={28}/> : (balance?.balance ?? 0).toLocaleString('fr-FR')} <small>{t('wallet.tokens')}</small></strong><div className="balance-footer"><span>{t('wallet.simulation')}</span><span className="balance-up">SIM</span></div></div><div className="wallet-tabs">{(['overview', 'history'] as const).map((item) => <button className={tab === item ? 'active' : ''} onClick={() => setTab(item)} key={item}>{item === 'overview' ? t('wallet.overview') : t('wallet.history')}</button>)}</div>{error && <p className="auth-error">{error}</p>}{intentMessage && <p className="secure-note">{intentMessage}</p>}{tab === 'overview' ? <><div className="section-heading compact"><div><span className="eyebrow">{t('wallet.quickSecure')}</span><h2>{t('wallet.ready')}</h2></div></div><div className="deposit-grid"><div className="wallet-info-tile"><strong>10 000</strong><small>{t('wallet.welcomeBonus')}</small></div><div className="wallet-info-tile"><strong>{transactions.length}</strong><small>{transactions.length > 1 ? t('wallet.transactions') : t('wallet.transaction')}</small></div><div className="wallet-info-tile"><strong>{intents.length}</strong><small>{t('wallet.sandboxIntents')}</small></div></div></> : <><div className="activity-card">{transactions.length ? transactions.map((item) => <ActivityRow key={item.id} transaction={item} onClick={() => void openTransaction(item)}/>) : <div className="empty-wallet">{t('wallet.noTransactions')}</div>}</div>{detailLoading && <p className="secure-note">{t('wallet.loadingDetail')}</p>}{detailError && <p className="auth-error">{detailError}</p>}{selectedTransaction && <TransactionDetail detail={selectedTransaction} onClose={() => setSelectedTransaction(null)} t={t}/>}</>}</section><aside className="wallet-aside"><div className="payment-card"><span className="eyebrow gold"><Zap size={13}/> Sandbox</span><h3>{t('wallet.paymentJourney')}</h3><p>{t('wallet.sandboxDescription')}</p><div className="payment-methods"><span>MVola</span><span>Orange Money</span><span>Airtel Money</span></div><button className="button button-outline full" onClick={() => void createSandboxIntent()} disabled={intentLoading}><CreditCard size={16}/> {t('wallet.createTest')}</button></div><div className="secure-note"><WalletCards size={18}/><div><strong>{t('wallet.protected')}</strong><span>{t('wallet.privateHistory')}</span></div></div></aside></div></div>
}

function ActivityRow({ transaction, onClick }: { transaction: WalletTransaction; onClick: () => void }) { const positive = transaction.direction === 'credit'; return <button className="activity-row" onClick={onClick}><span className={`activity-icon ${positive ? 'positive' : ''}`}>{positive ? <ArrowDownLeft/> : <ArrowUpRight/>}</span><span><strong>{transaction.description || transaction.type}</strong><small>{new Date(transaction.created_at).toLocaleString('fr-FR')}</small></span><b className={positive ? 'positive-text' : ''}>{positive ? '+' : '−'} {transaction.amount.toLocaleString('fr-FR')}</b></button> }

function TransactionDetail({ detail, onClose, t }: { detail: WalletTransactionDetail; onClose: () => void; t: (key: string, options?: Record<string, unknown>) => string }) { return <section className="payment-card"><div className="chat-head"><strong>{t('wallet.details')}</strong><button className="icon-button" onClick={onClose} aria-label={t('a11y.close')}><X size={16}/></button></div><p>{detail.description || detail.type} · {detail.amount.toLocaleString('fr-FR')} {detail.currency}</p><p className="secure-note">{t('wallet.transactionCode')}: {detail.transaction_code}</p><h4>{t('wallet.ledgerEntries')}</h4>{detail.entries.map((entry, index) => <div className="activity-row" key={`${entry.account_type}-${index}`}><span>{t('wallet.account', { type: entry.account_type })}</span><span>{entry.entry_type}</span><b>{entry.amount.toLocaleString('fr-FR')} · {t('wallet.balanceAfter')}: {entry.balance_after.toLocaleString('fr-FR')}</b></div>)}</section> }
