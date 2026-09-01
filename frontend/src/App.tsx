import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "@components/ui/Layout";
import { HomePage } from "@pages/HomePage";
import { LobbyPage } from "@pages/LobbyPage";
import { GamePage } from "@pages/GamePage";
import { WalletPage } from "@pages/WalletPage";
import { ProfilePage } from "@pages/ProfilePage";
import { AuthPage } from "@pages/AuthPage";
import { NotFoundPage } from "@pages/NotFoundPage";
import { SupportPage } from "@pages/SupportPage";
import { BackofficePage } from "@pages/BackofficePage";
import { TestGamesPage } from "@pages/TestGamesPage";
import { ClubsPage } from "@pages/ClubsPage";
import { PlayHubPage } from "@pages/PlayHubPage";

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/lobby" element={<LobbyPage />} />
        <Route path="/lobby/:gameType" element={<LobbyPage />} />
        <Route path="/play/:gameType" element={<PlayHubPage />} />
        <Route path="/game/:gameType/:tableId" element={<GamePage />} />
        <Route path="/wallet" element={<WalletPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/backoffice" element={<BackofficePage />} />
        <Route path="/games/test" element={<TestGamesPage />} />
        <Route path="/casino" element={<TestGamesPage />} />
        <Route path="/games/hasard" element={<TestGamesPage />} />
        <Route path="/clubs" element={<ClubsPage />} />
        {/* Redirect old play hub route to lobby */}
        <Route path="/play" element={<Navigate to="/lobby" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  );
}

export default App;
