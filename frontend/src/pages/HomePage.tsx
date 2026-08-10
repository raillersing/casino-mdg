import { useTranslation } from 'react-i18next'

export function HomePage() {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      <div className="text-center py-12">
        <h1 className="text-4xl font-bold text-gradient mb-4">{t('app.name')}</h1>
        <p className="text-surface-400 text-lg">{t('app.tagline')}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {['poker', 'belote', 'rami'].map((game) => (
          <div key={game} className="card-hover cursor-pointer">
            <h3 className="text-lg font-semibold capitalize text-white">{t(`games.${game}`)}</h3>
            <p className="text-surface-400 text-sm mt-2">Click to play</p>
          </div>
        ))}
      </div>
    </div>
  )
}