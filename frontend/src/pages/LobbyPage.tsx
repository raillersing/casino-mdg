import { useTranslation } from 'react-i18next'

export function LobbyPage() {
  const { t } = useTranslation()
  return <div className="text-center py-12"><h1 className="text-2xl font-bold">{t('nav.lobby')}</h1><p className="text-surface-400">Game lobby — tables list here</p></div>