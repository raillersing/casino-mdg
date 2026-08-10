import { useTranslation } from 'react-i18next'

export function AuthPage() {
  const { t } = useTranslation()
  return (
    <div className="max-w-md mx-auto py-12">
      <div className="card">
        <h2 className="text-xl font-bold text-center mb-6">{t('auth.login')}</h2>
        <div className="space-y-4">
          <input type="email" placeholder={t('auth.email')} className="input-field" />
          <input type="password" placeholder={t('auth.password')} className="input-field" />
          <button className="btn-primary w-full">{t('auth.login')}</button>
        </div>
      </div>
    </div>
  )
}