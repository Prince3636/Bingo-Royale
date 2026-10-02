import React from 'react';
import { useGame } from '../contexts/GameContext';
import { Trophy, Globe, Wifi, Sparkles, Gamepad2, Users, Smartphone, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { sound } from '../utils/sound';
import { isNative } from '../utils/mobile';

export const ModeSelectionPage: React.FC = () => {
  const { setGameMode, playerName, setPlayerName } = useGame();

  const handleSelectMode = (mode: 'online' | 'local') => {
    sound.playPop();
    setGameMode(mode);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-bg-base p-4 sm:p-6 font-sans relative overflow-x-hidden select-none">
      {/* Background Decorative Ambient Gradients */}
      <div className="absolute top-1/4 -left-20 w-72 h-72 bg-arcade-amber/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-72 h-72 bg-arcade-purple/10 rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-[460px] bg-panel border-3 border-fg-base arcade-shadow-lg p-5 sm:p-8 relative z-10 rounded-2xl"
      >
        {/* Top Header & Branding */}
        <div className="flex items-center gap-3.5 mb-6">
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

        {/* Nickname Input Quick Field */}
        <div className="mb-5">
          <label className="block text-[11px] font-mono font-bold uppercase tracking-wider opacity-70 mb-1.5">
            Your Nickname
          </label>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="e.g. PixelKing"
            maxLength={24}
            className="w-full px-4 py-3 rounded-xl border-2 border-fg-base font-mono text-base focus:outline-none focus:border-arcade-amber bg-panel text-fg-base transition-colors"
          />
        </div>

        {/* Mode Selection Cards */}
        <div className="space-y-3.5">
          {/* ONLINE GAME OPTION */}
          <button
            type="button"
            onClick={() => handleSelectMode('online')}
            className="w-full p-4 rounded-xl border-2 border-fg-base bg-panel hover:bg-black/5 dark:hover:bg-white/5 active:scale-[0.99] arcade-shadow transition-all text-left flex items-start gap-4 group"
          >
            <div className="w-11 h-11 rounded-lg bg-arcade-amber text-black border-2 border-fg-base flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
              <Globe size={22} />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h3 className="font-black uppercase tracking-tight text-base sm:text-lg text-fg-base flex items-center gap-2">
                  Online Game
                </h3>
                <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  Global Cloud
                </span>
              </div>
              <p className="text-xs font-mono text-fg-base opacity-75 mt-0.5 leading-relaxed">
                Play with friends or random players worldwide over the Internet via cloud server.
              </p>
            </div>
          </button>

          {/* LOCAL GAME OPTION */}
          <button
            type="button"
            onClick={() => handleSelectMode('local')}
            className="w-full p-4 rounded-xl border-2 border-fg-base bg-panel hover:bg-black/5 dark:hover:bg-white/5 active:scale-[0.99] arcade-shadow transition-all text-left flex items-start gap-4 group"
          >
            <div className="w-11 h-11 rounded-lg bg-arcade-purple text-white border-2 border-fg-base flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
              <Wifi size={22} className="text-arcade-amber" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h3 className="font-black uppercase tracking-tight text-base sm:text-lg text-fg-base flex items-center gap-2">
                  Local / Hotspot
                </h3>
                <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-arcade-amber/15 text-arcade-amber border border-arcade-amber/40">
                  Offline Ready
                </span>
              </div>
              <p className="text-xs font-mono text-fg-base opacity-75 mt-0.5 leading-relaxed">
                Play with friends on the same Wi-Fi or Mobile Hotspot without using Internet data.
              </p>
            </div>
          </button>
        </div>

        {/* Feature Badges */}
        <div className="mt-6 pt-4 border-t-2 border-card-border flex items-center justify-around text-[11px] font-mono opacity-70 text-center">
          <span className="flex items-center gap-1">
            <Gamepad2 size={13} /> 1-5 Players
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <Smartphone size={13} /> Hotspot Support
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <ShieldCheck size={13} /> Authoritative
          </span>
        </div>
      </motion.div>

      {/* Footer Tagline */}
      <p className="mt-5 text-xs font-mono text-fg-base opacity-40 text-center">
        Bingo Royale Multiplayer • Designed for Mobile APK & Web
      </p>
    </div>
  );
};
