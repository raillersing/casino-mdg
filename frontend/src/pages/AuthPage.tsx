import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Loader2, ShieldCheck } from 'lucide-react'
import { useGameStore } from '@stores/gameStore'
import { requestOtp, verifyOtp } from '@/services/auth'

export function AuthPage() {
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [step, setStep] = useState<'phone' | 'code' | 'done'>('phone')
  const [devCode, setDevCode] = useState<string>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const setUser = useGameStore((state) => state.setUser)
  const setAuthenticated = useGameStore((state) => state.setAuthenticated)
  const setSession = useGameStore((state) => state.setSession)

  const handleRequest = async () => {
    setLoading(true); setError('')
    try { const result = await requestOtp(phone); setDevCode(result.dev_code); setStep('code') } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Impossible d’envoyer le code.') } finally { setLoading(false) }
  }

  const handleVerify = async () => {
    setLoading(true); setError('')
    try {
      const result = await verifyOtp(phone, code, displayName || 'Joueur MDG')
      setUser({ id: result.user.id, displayName: result.user.display_name, email: `${result.user.phone}@mdg.local`, xp: result.user.xp, level: result.user.level, balance: result.wallet.balance })
      setSession(result.access, result.refresh)
      setAuthenticated(true); setStep('done'); window.setTimeout(() => navigate('/'), 700)
    } catch (verifyError) { setError(verifyError instanceof Error ? verifyError.message : 'Code invalide.') } finally { setLoading(false) }
  }

  return <div className="auth-layout"><Link to="/" className="back-link"><ArrowLeft size={16}/> Retour à l’accueil</Link><div className="auth-card"><div className="auth-brand"><span className="brand-mark">♠</span><strong>MDG GAME CLUB</strong></div>{step === 'done' ? <div className="success-state"><div className="success-icon"><Check size={26}/></div><h1>Bienvenue au club.</h1><p>Votre espace est prêt. Redirection vers votre accueil…</p></div> : <><span className="eyebrow">{step === 'phone' ? 'Première main' : 'Vérification sécurisée'}</span><h1>{step === 'phone' ? <>Entrez dans<br/><em>le cercle.</em></> : <>Encore<br/><em>une étape.</em></>}</h1><p className="auth-intro">{step === 'phone' ? 'Un numéro suffit pour commencer. Vous recevrez un code de vérification pour ouvrir votre espace.' : `Un code à 6 chiffres a été envoyé au +261 ${phone}.`}</p>{step === 'phone' ? <><label className="field-label">Numéro de téléphone</label><div className="phone-field"><span>+261</span><input autoFocus value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))} placeholder="34 00 000 00" /></div><button className="button button-gold full" disabled={loading || phone.length < 9} onClick={handleRequest}>{loading ? <Loader2 className="spin" size={17}/> : <>Recevoir mon code <ArrowRight size={17}/></>}</button></> : <><label className="field-label">Code reçu</label><input className="auth-code-field" autoFocus inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} placeholder="000 000"/><label className="field-label">Votre pseudo</label><input className="auth-name-field" maxLength={50} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Ex. Miora"/>{devCode && <p className="dev-code">Mode local · code de test : <strong>{devCode}</strong></p>}<button className="button button-gold full" disabled={loading || code.length !== 6} onClick={handleVerify}>{loading ? <Loader2 className="spin" size={17}/> : <>Entrer dans le club <ArrowRight size={17}/></>}</button><button className="auth-resend" onClick={() => setStep('phone')}>Modifier le numéro</button></>}{error && <p className="auth-error">{error}</p>}<div className="auth-trust"><ShieldCheck size={16}/><span>Vos données sont chiffrées et protégées.</span></div></>}</div><p className="auth-footer">En continuant, vous acceptez les <a>conditions du club</a>.</p></div>
}
