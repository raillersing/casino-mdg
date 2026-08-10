import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useGameStore } from '@stores/gameStore'

export function Layout({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const user = useGameStore((state) => state.user)

  return (
    <div className="min-h-screen bg-surface-900">
      <header className="glass sticky top-0 z-50 border-b border-surface-700/50">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-xl font-bold text-gradient">{t('app.name')}</span>
          </Link>
          <nav className="flex items-center gap-4">
            <Link to="/lobby" className="text-sm text-surface-400 hover:text-white transition-colors">{t('nav.lobby')}</Link>
            <Link to="/wallet" className="text-sm text-surface-400 hover:text-white transition-colors">{t('nav.wallet')}</Link>
            {user ? (
              <Link to="/profile" className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-brand-primary/20 flex items-center justify-center text-brand-primary text-sm font-bold">
                  {user.displayName[0]?.toUpperCase()}
                </div>
              </Link>
            ) : (
              <Link to="/auth" className="btn-primary text-sm">{t('nav.login')}</Link>
            )}
          </nav>
        </div>
      </header>
      
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
