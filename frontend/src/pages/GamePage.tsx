import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export function GamePage() {
  const { gameType, tableId } = useParams()
  const { t } = useTranslation()
  return (
    <div className="text-center py-12">
      <h1 className="text-2xl font-bold capitalize">{t(`games.${gameType}`)}</h1>
      <p className="text-surface-400">Table: {tableId}</p>
      <div className="mt-8 p-8 bg-surface-800 rounded-xl border border-surface-700">
        <p className="text-surface-400">Game canvas will be rendered here (PixiJS)</p>
      </div>
    </div>
  )
}