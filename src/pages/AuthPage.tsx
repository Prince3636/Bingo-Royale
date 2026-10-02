import React, { useState } from 'react';
import { useGame } from '../contexts/GameContext';
import { Trophy, Plus, LogIn, Users, Sparkles, ArrowLeft, Gamepad2, Wifi, WifiOff, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { sound } from '../utils/sound';

export const AuthPage: React.FC = () => {
  const { playerName, setPlayerName, createRoom, joinRoom, error, setError, connectionStatus } = useGame();
  const [roomId, setRoomId] = useState('');
  const [mode, setMode] = useState<'initial' | 'create' | 'join'>('initial');

  const isConnected = connectionStatus === 'connected';

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    sound.playPop();
    if (!isConnected) return setError('Connecting to server... Please wait a second.');
    if (!playerName.trim()) return setError('Please enter your nickname');
    createRoom(playerName.trim());
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    sound.playPop();
    const cleanName = playerName.trim();
    const cleanRoomId = roomId.trim().toUpperCase();
    
    if (!isConnected) return setError('Connecting to server... Please wait a second.');
    if (!cleanName) return setError('Please enter your nickname');
    if (!cleanRoomId) return setError('Please enter a 6-letter Room Code');
    joinRoom(cleanRoomId, cleanName);
  };

  const setModeWithSound = (newMode: 'initial' | 'create' | 'join') => {
    sound.playPop();
    setError(null);
    setMode(newMode);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-bg-base p-4 sm:p-6 font-sans relative overflow-x-hidden">
      {/* Background Decorative Ambient Gradients */}
      <div className="absolute top-1/4 -left-20 w-72 h-72 bg-arcade-amber/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-72 h-72 bg-arcade-purple/10 rounded-full blur-3xl pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-[440px] bg-panel border-3 border-fg-base arcade-shadow-lg p-5 sm:p-8 relative z-10 rounded-2xl"
      >
        {/* Top Header & Branding */}
        <div className="flex items-center gap-3.5 mb-5 sm:mb-6">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-arcade-amber border-2 border-fg-base arcade-shadow-sm flex items-center justify-center shrink-0 text-black">
            <Trophy className="w-6 h-6 sm:w-8 sm:h-8" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase tracking-wider text-arcade-amber">
              <Sparkles size={12} />
              <span>Multiplayer Battle</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight uppercase italic leading-none text-fg-base">
              Bingo Royale
            </h1>
          </div>
        </div>

        {/* Server Connection Status Badge */}
        <div className="mb-5 flex items-center justify-between px-3 py-1.5 rounded-lg bg-panel border border-card-border text-[11px] font-mono">
          <div className="flex items-center gap-2">
            {isConnected ? (
              <>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">Server Online</span>
              </>
            ) : (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-arcade-amber animate-pulse" />
                <span className="font-semibold text-arcade-amber">
                  {connectionStatus === 'reconnecting' ? 'Reconnecting...' : 'Connecting...'}
                </span>
              </>
            )}
          </div>
          <span className="text-fg-base opacity-50 flex items-center gap-1">
            {isConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
            <span>v2.0</span>
          </span>
        </div>

        {/* Error Alert Box with Dismiss Button */}
        {error && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-5 p-3 rounded-xl bg-red-500/10 border-2 border-red-500/40 text-red-600 dark:text-red-400 text-xs font-mono font-bold flex items-center justify-between gap-2"
          >
            <span className="flex-1 leading-snug">⚠️ {error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="p-1 rounded-md hover:bg-red-500/20 text-red-600 dark:text-red-400 transition-colors shrink-0"
              aria-label="Dismiss error"
            >
              <X size={15} />
            </button>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {mode === 'initial' && (
            <motion.div 
              key="initial-view"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-3.5"
            >
              <button 
                onClick={() => setModeWithSound('create')}
                className="w-full py-4 px-5 bg-fg-base text-bg-base font-black text-base sm:text-lg uppercase tracking-wider rounded-xl arcade-shadow hover:scale-[1.01] active:translate-y-0.5 transition-all flex items-center justify-center gap-3 group"
              >
                <Plus size={22} className="text-arcade-amber group-hover:rotate-90 transition-transform duration-200" />
                <span>Create New Room</span>
              </button>

              <button 
                onClick={() => setModeWithSound('join')}
                className="w-full py-4 px-5 bg-panel border-2 border-fg-base text-fg-base font-black text-base sm:text-lg uppercase tracking-wider rounded-xl arcade-shadow hover:scale-[1.01] active:translate-y-0.5 transition-all flex items-center justify-center gap-3"
              >
                <LogIn size={22} className="text-arcade-amber" />
                <span>Join with Code</span>
              </button>

              <div className="pt-2 flex items-center justify-center gap-4 text-[11px] font-mono opacity-60 text-center">
                <span className="flex items-center gap-1">
                  <Gamepad2 size={13} /> 1-5 Players
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Users size={13} /> Bots Supported
                </span>
              </div>
            </motion.div>
          )}

          {(mode === 'create' || mode === 'join') && (
            <motion.form 
              key="form-view"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              onSubmit={mode === 'create' ? handleCreate : handleJoin} 
              className="space-y-4"
            >
              <div>
                <label className="block text-[11px] font-mono font-bold uppercase tracking-wider opacity-70 mb-1.5">
                  Your Nickname
                </label>
                <input 
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="e.g. PixelKing"
                  maxLength={24}
                  className="w-full px-4 py-3.5 rounded-xl border-2 border-fg-base font-mono text-base focus:outline-none focus:border-arcade-amber bg-panel text-fg-base transition-colors"
                  autoFocus
                />
              </div>

              {mode === 'join' && (
                <div>
                  <label className="block text-[11px] font-mono font-bold uppercase tracking-wider opacity-70 mb-1.5">
                    Room Code (6 Characters)
                  </label>
                  <input 
                    type="text"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                    placeholder="e.g. BINGO1"
                    maxLength={10}
                    className="w-full px-4 py-3.5 rounded-xl border-2 border-fg-base font-mono text-base tracking-widest uppercase focus:outline-none focus:border-arcade-amber bg-panel text-fg-base transition-colors"
                  />
                </div>
              )}

              <div className="flex gap-2.5 pt-1">
                <button 
                  type="button"
                  onClick={() => setModeWithSound('initial')}
                  className="px-4 py-3.5 rounded-xl border-2 border-fg-base font-bold uppercase tracking-wider text-xs sm:text-sm hover:bg-black/5 dark:hover:bg-white/5 active:translate-y-0.5 transition-all flex items-center justify-center gap-1.5"
                >
                  <ArrowLeft size={16} />
                  <span>Back</span>
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3.5 px-4 bg-fg-base text-bg-base font-black uppercase tracking-wider text-sm sm:text-base rounded-xl arcade-shadow hover:scale-[1.01] active:translate-y-0.5 transition-all flex items-center justify-center gap-2"
                >
                  {mode === 'create' ? (
                    <>
                      <Plus size={18} className="text-arcade-amber" />
                      <span>Create Room</span>
                    </>
                  ) : (
                    <>
                      <LogIn size={18} className="text-arcade-amber" />
                      <span>Join Room</span>
                    </>
                  )}
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Footer Tagline */}
      <p className="mt-6 text-xs font-mono text-fg-base opacity-40 text-center">
        Real-time Authoritative Multiplayer • Designed for Mobile & Desktop
      </p>
    </div>
  );
};

