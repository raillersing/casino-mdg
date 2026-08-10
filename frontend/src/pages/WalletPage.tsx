import { useTranslation } from 'react-i18next'

export function WalletPage() {
  const { t } = useTranslation()
  return <div className="text-center py-12"><h1 className="text-2xl font-bold">{t('nav.wallet')}</h1><p className="text-surface-400">Wallet management</p></div>