import { useTranslation } from 'react-i18next'

export function ProfilePage() {
  const { t } = useTranslation()
  return <div className="text-center py-12"><h1 className="text-2xl font-bold">{t('nav.profile')}</h1><p className="text-surface-400">User profile</p></div>