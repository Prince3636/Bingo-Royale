import { useState } from 'react';
import { GameProvider, useGame } from './contexts/GameContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { AuthPage } from './pages/AuthPage';
import { LobbyPage } from './pages/LobbyPage';
import { GamePage } from './pages/GamePage';
import { Moon, Sun, Volume2, VolumeX } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import { sound } from './utils/sound';

export function QuickControls() {
  const { isDark, toggleTheme } = useTheme();
  const [isMuted, setIsMuted] = useState(() => sound.getMuted());

  const handleToggleSound = () => {
    const next = sound.toggleMute();
    setIsMuted(next);
  };

  return (
    <div className="fixed top-3 right-3 sm:top-4 sm:right-4 z-50 flex items-center gap-1.5 sm:gap-2">
      <button
        onClick={handleToggleSound}
        className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-panel border-2 border-fg-base flex items-center justify-center arcade-shadow-sm hover:scale-105 active:scale-95 transition-all"
        title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
        aria-label="Toggle Sound"
      >
        {isMuted ? (
          <VolumeX size={17} className="text-fg-base opacity-60" />
        ) : (
          <Volume2 size={17} className="text-arcade-amber font-bold" />
        )}
      </button>

      <button
        onClick={toggleTheme}
        className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-panel border-2 border-fg-base flex items-center justify-center arcade-shadow-sm hover:scale-105 active:scale-95 transition-all"
        title="Toggle Theme"
        aria-label="Toggle Theme"
      >
        {isDark ? (
          <Sun size={17} className="text-arcade-amber" />
        ) : (
          <Moon size={17} className="text-fg-base" />
        )}
      </button>
    </div>
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
    <div className="fixed bottom-0 left-0 right-0 z-50 py-1.5 px-4 bg-arcade-amber text-black border-t-2 border-fg-base font-mono text-xs text-center font-bold uppercase flex items-center justify-center gap-2 shadow-lg backdrop-blur-md">
      <div className="w-2 h-2 rounded-full bg-arcade-crimson animate-ping" />
      {connectionStatus === 'reconnecting' ? 'Network interrupted. Reconnecting to room...' : 'Disconnected from server. Retrying...'}
    </div>
  );
}

function BackendMissingBanner() {
  const { isBackendMissing } = useGame();
  if (!isBackendMissing) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 py-2 px-4 bg-arcade-crimson text-white font-mono text-xs text-center font-bold uppercase shadow-lg">
      ⚠️ Missing VITE_SERVER_URL in production! Set VITE_SERVER_URL in your Vercel environment variables pointing to your Render backend.
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <GameProvider>
        <BackendMissingBanner />
        <QuickControls />
        <ConnectionStatusBar />
        <Toaster 
          position="top-center"
          toastOptions={{
            duration: 3500,
            style: {
              background: 'var(--panel-bg)',
              color: 'var(--fg-color)',
              border: '2px solid var(--fg-color)',
              boxShadow: '4px 4px 0px 0px rgba(var(--shadow-color),1)',
              fontWeight: 700,
              fontSize: '13px',
              fontFamily: 'var(--font-sans)',
            },
          }}
        />
        <GameRouter />
      </GameProvider>
    </ThemeProvider>
  );
}

