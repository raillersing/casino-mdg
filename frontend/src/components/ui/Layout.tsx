import { ReactNode } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { Bell, CircleUserRound, Compass, Home, LogIn, Menu, WalletCards } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useGameStore } from '@stores/gameStore'

const navItems = [
  { to: '/', label: 'Accueil', icon: Home },
  { to: '/lobby', label: 'Jouer', icon: Compass },
  { to: '/wallet', label: 'Portefeuille', icon: WalletCards },
  { to: '/profile', label: 'Profil', icon: CircleUserRound },
]

export function Layout({ children }: { children: ReactNode }) {
  const user = useGameStore((state) => state.user)
  const { i18n } = useTranslation()
  const language = i18n.language.startsWith('mg') ? 'MG' : 'FR'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/" className="brand-lockup">
          <span className="brand-mark">♠</span>
          <span><strong>MDG</strong><small>GAME CLUB</small></span>
        </Link>
        <div className="sidebar-label">Navigation</div>
        <nav className="sidebar-nav">
          {navItems.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><Icon size={18} />{label}</NavLink>)}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-promo"><span className="eyebrow">Club privilege</span><strong>Jouez avec vos proches.</strong><p>Créez une table privée et invitez votre cercle.</p><Link to="/lobby" className="text-link">Créer une table →</Link></div>
        <div className="sidebar-user">
          {user ? <><div className="avatar avatar-sm">{user.displayName[0]}</div><div><strong>{user.displayName}</strong><small>Joueur niveau {user.level}</small></div></> : <><div className="avatar avatar-sm muted">?</div><div><strong>Visiteur</strong><small>Mode découverte</small></div></>}
        </div>
      </aside>
      <section className="main-shell">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark">♠</span><strong>MDG</strong></div>
          <div className="breadcrumbs"><span>MDG Game Club</span><span className="slash">/</span><span className="current">{location.pathname === '/lobby' ? 'Lobby' : location.pathname === '/wallet' ? 'Portefeuille' : location.pathname === '/profile' ? 'Profil' : 'Accueil'}</span></div>
          <div className="topbar-actions"><button className="language-toggle" onClick={() => void i18n.changeLanguage(language === 'FR' ? 'mg' : 'fr')} aria-label="Changer de langue">{language}</button><button className="icon-button" aria-label="Notifications"><Bell size={18} /><i /></button>{user ? <Link to="/profile" className="top-avatar avatar" aria-label="Ouvrir le profil">{user.displayName[0]}</Link> : <Link to="/auth" className="login-link"><LogIn size={16} /> Se connecter</Link>}<button className="icon-button mobile-menu" aria-label="Ouvrir le menu"><Menu size={20} /></button></div>
        </header>
        <main className="content">{children}</main>
        <nav className="mobile-nav">{navItems.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => isActive ? 'active' : ''}><Icon size={19}/><span>{label}</span></NavLink>)}</nav>
      </section>
    </div>
  )
}
