import { Routes, Route } from 'react-router-dom'
import { Layout } from '@components/ui/Layout'
import { HomePage } from '@pages/HomePage'
import { LobbyPage } from '@pages/LobbyPage'
import { GamePage } from '@pages/GamePage'
import { WalletPage } from '@pages/WalletPage'
import { ProfilePage } from '@pages/ProfilePage'
import { AuthPage } from '@pages/AuthPage'
import { NotFoundPage } from '@pages/NotFoundPage'
import { SupportPage } from '@pages/SupportPage'
import { BackofficePage } from '@pages/BackofficePage'
import { TestGamesPage } from '@pages/TestGamesPage'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/lobby" element={<LobbyPage />} />
        <Route path="/game/:gameType/:tableId" element={<GamePage />} />
        <Route path="/wallet" element={<WalletPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/backoffice" element={<BackofficePage />} />
        <Route path="/games/test" element={<TestGamesPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  )
}

export default App
