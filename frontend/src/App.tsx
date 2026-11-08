import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { Layout } from "@components/ui/Layout";
import { GamesPage } from "@pages/GamesPage";
import { HomePage } from "@pages/HomePage";
import { LobbyPage } from "@pages/LobbyPage";
import { GamePage } from "@pages/GamePage";
import { WalletPage } from "@pages/WalletPage";
import { ProfilePage } from "@pages/ProfilePage";
import { AuthPage } from "@pages/AuthPage";
import { NotFoundPage } from "@pages/NotFoundPage";
import { SupportPage } from "@pages/SupportPage";
import { BackofficePage } from "@pages/BackofficePage";
import { ClubsPage } from "@pages/ClubsPage";

function PlayRedirect() {
  const { gameType } = useParams();
  return <Navigate to={gameType ? `/lobby/${gameType}` : "/lobby"} replace />;
}

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/games" element={<GamesPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/lobby" element={<LobbyPage />} />
        <Route path="/lobby/:gameType" element={<LobbyPage />} />
        <Route path="/play/:gameType" element={<PlayRedirect />} />
        <Route path="/game/:gameType/:tableId" element={<GamePage />} />
        <Route path="/wallet" element={<WalletPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/backoffice" element={<BackofficePage />} />
        <Route path="/casino" element={<Navigate to="/lobby" replace />} />
        <Route path="/games/test" element={<Navigate to="/lobby" replace />} />
        <Route
          path="/games/hasard"
          element={<Navigate to="/lobby" replace />}
        />
        <Route path="/clubs" element={<ClubsPage />} />
        {/* Redirect old play hub route to lobby */}
        <Route path="/play" element={<Navigate to="/lobby" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  );
}

export default App;
