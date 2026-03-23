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

export default function App() {
  return (
    <ThemeProvider>
      <GameProvider>
        <ThemeToggle />
        <Toaster position="top-center" />
        <GameRouter />
      </GameProvider>
    </ThemeProvider>
  );
}
