import { GameProvider, useGame } from './contexts/GameContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { AuthPage } from './pages/AuthPage';
import { LobbyPage } from './pages/LobbyPage';
import { GamePage } from './pages/GamePage';
import { Moon, Sun } from 'lucide-react';
import { Toaster } from 'react-hot-toast';

function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      className="fixed top-4 right-4 z-50 p-3 bg-panel border-2 border-fg-base shadow-[4px_4px_0px_0px_rgba(var(--shadow-color),1)] hover:scale-105 transition-transform"
      title="Toggle Theme"
    >
      {isDark ? <Sun size={20} className="text-fg-base" /> : <Moon size={20} className="text-fg-base" />}
    </button>
  );
}

function GameRouter() {
  const { gameState } = useGame();

  return (
    <>
      {!gameState && <AuthPage />}
      {gameState?.status === 'waiting' && <LobbyPage />}
      {gameState && gameState.status !== 'waiting' && <GamePage />}
    </>
  );
}

function ConnectionStatusBar() {
  const { connectionStatus } = useGame();
  if (connectionStatus === 'connected') return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 py-1.5 px-4 bg-yellow-400 text-black border-t-2 border-black font-mono text-xs text-center font-bold uppercase flex items-center justify-center gap-2 shadow-lg">
      <div className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
      {connectionStatus === 'reconnecting' ? 'Network disrupted. Reconnecting to game...' : 'Disconnected from server. Attempting reconnect...'}
    </div>
  );
}

function BackendMissingBanner() {
  const { isBackendMissing } = useGame();
  if (!isBackendMissing) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 py-2 px-4 bg-red-600 text-white font-mono text-xs text-center font-bold uppercase shadow-lg">
      ⚠️ Missing VITE_SERVER_URL in production! Set VITE_SERVER_URL in your Vercel environment variables pointing to your Render backend.
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <GameProvider>
        <BackendMissingBanner />
        <ThemeToggle />
        <ConnectionStatusBar />
        <Toaster position="top-center" />
        <GameRouter />
      </GameProvider>
    </ThemeProvider>
  );
}
