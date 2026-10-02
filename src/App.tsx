import React, { useState, useEffect } from 'react';
import { GameProvider, useGame } from './contexts/GameContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { AuthPage } from './pages/AuthPage';
import { LobbyPage } from './pages/LobbyPage';
import { GamePage } from './pages/GamePage';
import { ModeSelectionPage } from './pages/ModeSelectionPage';
import { LocalLobbyPage } from './pages/LocalLobbyPage';
import { Moon, Sun, Volume2, VolumeX, Server, X, AlertTriangle } from 'lucide-react';
import { Toaster, toast } from 'react-hot-toast';
import { sound } from './utils/sound';
import { initMobileApp, setBackHandler, isNative } from './utils/mobile';

export function QuickControls() {
  const { isDark, toggleTheme } = useTheme();
  const { serverUrl, setCustomServerUrl, connectionStatus } = useGame();
  const [isMuted, setIsMuted] = useState(() => sound.getMuted());
  const [showSettings, setShowSettings] = useState(false);
  const [inputUrl, setInputUrl] = useState(serverUrl);

  const handleToggleSound = () => {
    const next = sound.toggleMute();
    setIsMuted(next);
  };

  const handleSaveServer = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputUrl.trim()) {
      setCustomServerUrl(inputUrl.trim());
      setShowSettings(false);
      toast.success('Server URL saved. Reconnecting...');
    }
  };

  const isDev = import.meta.env.DEV || (typeof window !== 'undefined' && window.sessionStorage.getItem('br_dev_mode') === 'true');

  return (
    <>
      <div className="fixed top-3 right-3 sm:top-4 sm:right-4 z-50 flex items-center gap-1.5 sm:gap-2">
        {/* Server status & settings toggle (restricted to DEV/debug mode) */}
        {isDev && (
          <button
            onClick={() => {
              setInputUrl(serverUrl);
              setShowSettings(true);
            }}
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-panel border-2 border-fg-base flex items-center justify-center arcade-shadow-sm hover:scale-105 active:scale-95 transition-all ${
              connectionStatus === 'connected' ? 'text-arcade-emerald' : 'text-arcade-amber animate-pulse'
            }`}
            title="Dev Server Settings"
            aria-label="Dev Server Settings"
          >
            <Server size={17} />
          </button>
        )}

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

      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-panel border-4 border-fg-base arcade-shadow-lg p-5 rounded-none relative">
            <button
              onClick={() => setShowSettings(false)}
              className="absolute top-3 right-3 text-fg-base hover:text-arcade-crimson"
            >
              <X size={20} />
            </button>

            <h3 className="text-lg font-black uppercase tracking-tight text-fg-base mb-1 flex items-center gap-2">
              <Server size={18} className="text-arcade-amber" /> Server Connection
            </h3>
            <p className="text-xs font-mono opacity-80 mb-4">
              {isNative ? 'Android Mobile Client' : 'Web Browser Client'}
            </p>

            <form onSubmit={handleSaveServer} className="space-y-3">
              <div>
                <label className="block text-xs font-bold font-mono uppercase mb-1">Backend URL</label>
                <input
                  type="url"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="https://bingo-royale.onrender.com"
                  required
                  className="w-full px-3 py-2 text-xs font-mono bg-panel-subtle border-2 border-fg-base focus:outline-none focus:border-arcade-amber"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2 bg-arcade-amber text-black font-black uppercase text-xs border-2 border-fg-base arcade-shadow-sm hover:brightness-105 active:scale-95"
                >
                  Save & Connect
                </button>
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="py-2 px-3 bg-panel-subtle text-fg-base font-bold text-xs border-2 border-fg-base"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function GameRouter() {
  const { gameState, leaveRoom, gameMode, setGameMode } = useGame();
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  useEffect(() => {
    // Intercept Android hardware back button
    if (!gameState) {
      if (gameMode) {
        setBackHandler(() => {
          setGameMode(null);
          return true;
        });
      } else {
        setBackHandler(null);
      }
      return;
    }

    setBackHandler(() => {
      // If modal already open, back button cancels the modal
      if (showLeaveConfirm) {
        setShowLeaveConfirm(false);
        return true;
      }
      // Open the in-app confirmation modal
      setShowLeaveConfirm(true);
      return true;
    });

    return () => {
      setBackHandler(null);
    };
  }, [gameState, showLeaveConfirm, gameMode]);

  const handleConfirmLeave = () => {
    setShowLeaveConfirm(false);
    leaveRoom();
  };

  const isPlaying = gameState && gameState.status !== 'waiting';

  return (
    <>
      {!gameMode && <ModeSelectionPage />}
      {gameMode === 'online' && !gameState && <AuthPage />}
      {gameMode === 'local' && !gameState && <LocalLobbyPage />}
      {gameState?.status === 'waiting' && <LobbyPage />}
      {gameState && gameState.status !== 'waiting' && <GamePage />}

      {/* Android Back-button Leave Confirmation Modal */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-panel border-4 border-fg-base arcade-shadow-lg p-5 rounded-none relative">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-arcade-crimson text-white border-2 border-fg-base">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight text-fg-base">
                  {isPlaying ? 'Leave Game?' : 'Leave Lobby?'}
                </h3>
                <p className="text-xs font-mono opacity-80">
                  {isPlaying
                    ? 'Leaving an active match will forfeit your current round!'
                    : 'Are you sure you want to exit to the home screen?'}
                </p>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleConfirmLeave}
                className="flex-1 py-2.5 bg-arcade-crimson text-white font-black uppercase text-xs border-2 border-fg-base arcade-shadow-sm hover:brightness-105 active:scale-95"
              >
                Yes, Leave
              </button>
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="flex-1 py-2.5 bg-panel-subtle text-fg-base font-black uppercase text-xs border-2 border-fg-base hover:bg-fg-base hover:text-bg-base active:scale-95"
              >
                Stay
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ConnectionStatusBar() {
  const { connectionStatus, gameMode } = useGame();
  if (connectionStatus === 'connected' || !gameMode) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 py-1.5 px-4 bg-arcade-amber text-black border-t-2 border-fg-base font-mono text-xs text-center font-bold uppercase flex items-center justify-center gap-2 shadow-lg backdrop-blur-md">
      <div className="w-2 h-2 rounded-full bg-arcade-crimson animate-ping" />
      {connectionStatus === 'reconnecting' ? 'Network interrupted. Reconnecting...' : 'Connecting to game...'}
    </div>
  );
}

function BackendMissingBanner() {
  const { isBackendMissing, gameMode } = useGame();
  if (!isBackendMissing || gameMode !== 'online') return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 py-2 px-4 bg-arcade-crimson text-white font-mono text-xs text-center font-bold uppercase shadow-lg">
      ⚠️ Missing VITE_SERVER_URL in production! Set VITE_SERVER_URL in your Vercel environment variables pointing to your Render backend.
    </div>
  );
}

export default function App() {
  useEffect(() => {
    initMobileApp();
  }, []);

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
