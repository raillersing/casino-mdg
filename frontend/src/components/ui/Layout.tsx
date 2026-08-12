import { ReactNode } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { Bell, CircleUserRound, Compass, Dices, Home, LogIn, Menu, WalletCards } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useGameStore } from '@stores/gameStore'

export function Layout({ children }: { children: ReactNode }) {
  const user = useGameStore((state) => state.user)
  const { i18n, t } = useTranslation()
  const navItems = [
    { to: '/', label: t('nav.home'), icon: Home },
    { to: '/lobby', label: t('nav.play'), icon: Compass },
    { to: '/games/test', label: t('nav.testGames'), icon: Dices },
    { to: '/wallet', label: t('nav.wallet'), icon: WalletCards },
    { to: '/profile', label: t('nav.profile'), icon: CircleUserRound },
  ]
  const language = i18n.language.startsWith('mg') ? 'MG' : 'FR'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/" className="brand-lockup">
          <span className="brand-mark">♠</span>
          <span><strong>MDG</strong><small>GAME CLUB</small></span>
        </Link>
        <div className="sidebar-label">{t('nav.navigation')}</div>
        <nav className="sidebar-nav">
          {navItems.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><Icon size={18} />{label}</NavLink>)}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-promo"><span className="eyebrow">{t('social.club')}</span><strong>{t('promo.title')}</strong><p>{t('promo.body')}</p><Link to="/lobby" className="text-link">{t('games.create')} →</Link></div>
        <div className="sidebar-user">
          {user ? <><div className="avatar avatar-sm">{user.displayName[0]}</div><div><strong>{user.displayName}</strong><small>{t('profile.level', { level: user.level })}</small></div></> : <><div className="avatar avatar-sm muted">?</div><div><strong>{t('profile.visitor')}</strong><small>{t('profile.discovery')}</small></div></>}
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark">♠</span><strong>MDG</strong></div>
          <div className="breadcrumbs"><span>MDG Game Club</span><span className="slash">/</span><span className="current">{location.pathname === '/lobby' ? t('nav.lobby') : location.pathname === '/wallet' ? t('nav.wallet') : location.pathname === '/profile' ? t('nav.profile') : location.pathname === '/games/test' ? t('testGames.breadcrumb') : t('nav.home')}</span></div>
          <div className="topbar-actions"><button className="language-toggle" onClick={() => void i18n.changeLanguage(language === 'FR' ? 'mg' : 'fr')} aria-label={t('a11y.changeLanguage')}>{language}</button><button className="icon-button" aria-label={t('a11y.notifications')}><Bell size={18} /><i /></button>{user ? <Link to="/profile" className="top-avatar avatar" aria-label={t('a11y.openProfile')}>{user.displayName[0]}</Link> : <Link to="/auth" className="login-link"><LogIn size={16} /> {t('nav.login')}</Link>}<button className="icon-button mobile-menu" aria-label={t('a11y.openMenu')}><Menu size={20} /></button></div>
        </header>
        <main className="content">{children}</main>
        <nav className="mobile-nav">{navItems.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => isActive ? 'active' : ''}><Icon size={19}/><span>{label}</span></NavLink>)}</nav>
      </div>
    </div>
  )
}
