import React, { useState, useEffect } from 'react';
import { useGame } from '../contexts/GameContext';
import { LocalServer, DiscoveredHost } from '../utils/localServer';
import { Wifi, Plus, Search, ArrowLeft, RefreshCw, Smartphone, Laptop, Radio, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { sound } from '../utils/sound';

export const LocalLobbyPage: React.FC = () => {
  const {
    playerName,
    setPlayerName,
    startLocalHost,
    joinLocalGame,
    error,
    setError,
    setGameMode,
    connectionStatus
  } = useGame();

  const [activeTab, setActiveTab] = useState<'create' | 'join' | 'manual'>('join');
  const [discoveredHosts, setDiscoveredHosts] = useState<DiscoveredHost[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [manualIp, setManualIp] = useState('192.168.43.1');
  const [myLocalIp, setMyLocalIp] = useState<string>('');
  const [isHotspot, setIsHotspot] = useState<boolean>(false);

  useEffect(() => {
    // Detect local IP to guide the user
    LocalServer.getLocalIp().then((res) => {
      if (res?.ip) {
        setMyLocalIp(res.ip);
        setIsHotspot(res.isHotspot);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab === 'join') {
      startScanning();
    } else {
      stopScanning();
    }

    return () => {
      stopScanning();
    };
  }, [activeTab]);

  const startScanning = async () => {
    setIsScanning(true);
    setDiscoveredHosts([]);

    try {
      await LocalServer.startDiscovery();
      const listener = await LocalServer.addListener('hostDiscovered', (host) => {
        setDiscoveredHosts((prev) => {
          const exists = prev.some((h) => h.ip === host.ip && h.port === host.port);
          if (exists) {
            return prev.map((h) => (h.ip === host.ip ? host : h));
          }
          return [...prev, host];
        });
      });

      return () => {
        listener.remove();
      };
    } catch (err) {
      console.warn('[LocalLobby] Discovery start error:', err);
    }
  };

  const stopScanning = async () => {
    setIsScanning(false);
    try {
      await LocalServer.stopDiscovery();
    } catch {}
  };

  const handleCreateLocalGame = () => {
    sound.playPop();
    const cleanName = playerName.trim();
    if (!cleanName) {
      return setError('Please enter your nickname');
    }
    startLocalHost(cleanName);
  };

  const handleJoinDiscovered = (host: DiscoveredHost) => {
    sound.playPop();
    const cleanName = playerName.trim();
    if (!cleanName) {
      return setError('Please enter your nickname');
    }
    joinLocalGame(host.ip, cleanName, host.roomCode);
  };

  const handleManualJoin = (e: React.FormEvent) => {
    e.preventDefault();
    sound.playPop();
    const cleanName = playerName.trim();
    const cleanIp = manualIp.trim();

    if (!cleanName) return setError('Please enter your nickname');
    if (!cleanIp) return setError('Please enter the Host IP address');

    joinLocalGame(cleanIp, cleanName);
  };

  const handleBackToMode = () => {
    sound.playPop();
    stopScanning();
    setGameMode(null);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-bg-base p-4 sm:p-6 font-sans relative overflow-x-hidden select-none">
      {/* Background Ambient Glows */}
      <div className="absolute top-1/4 -left-20 w-72 h-72 bg-arcade-purple/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-72 h-72 bg-arcade-amber/15 rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-[460px] bg-panel border-3 border-fg-base arcade-shadow-lg p-5 sm:p-7 relative z-10 rounded-2xl"
      >
        {/* Header with Back button */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b-2 border-card-border">
          <button
            type="button"
            onClick={handleBackToMode}
            className="p-2 rounded-xl border-2 border-fg-base hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all flex items-center gap-1.5 text-xs font-mono font-bold"
          >
            <ArrowLeft size={16} />
            <span>Modes</span>
          </button>

          <div className="text-right">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-arcade-amber flex items-center gap-1 justify-end">
              <Radio size={12} className="animate-pulse" />
              <span>Offline LAN</span>
            </span>
            <h2 className="text-base sm:text-lg font-black uppercase italic tracking-tight text-fg-base">
              Local Multiplayer
            </h2>
          </div>
        </div>

        {/* Nickname Input Field */}
        <div className="mb-4">
          <label className="block text-[11px] font-mono font-bold uppercase tracking-wider opacity-70 mb-1">
            Your Nickname
          </label>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="e.g. HotspotHero"
            maxLength={24}
            className="w-full px-3.5 py-2.5 rounded-xl border-2 border-fg-base font-mono text-sm sm:text-base focus:outline-none focus:border-arcade-amber bg-panel text-fg-base transition-colors"
          />
        </div>

        {/* Tabs: Join Games / Create Host / Manual IP */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-black/5 dark:bg-white/5 rounded-xl border-2 border-card-border mb-4 font-mono text-xs font-bold uppercase">
          <button
            type="button"
            onClick={() => setActiveTab('join')}
            className={`py-2 rounded-lg transition-all text-center ${
              activeTab === 'join'
                ? 'bg-fg-base text-bg-base arcade-shadow-sm font-black'
                : 'text-fg-base opacity-70 hover:opacity-100'
            }`}
          >
            Find Games
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('create')}
            className={`py-2 rounded-lg transition-all text-center ${
              activeTab === 'create'
                ? 'bg-fg-base text-bg-base arcade-shadow-sm font-black'
                : 'text-fg-base opacity-70 hover:opacity-100'
            }`}
          >
            Host Game
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`py-2 rounded-lg transition-all text-center ${
              activeTab === 'manual'
                ? 'bg-fg-base text-bg-base arcade-shadow-sm font-black'
                : 'text-fg-base opacity-70 hover:opacity-100'
            }`}
          >
            Direct IP
          </button>
        </div>

        {/* Error Alert Box */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border-2 border-red-500/40 text-red-600 dark:text-red-400 text-xs font-mono font-bold flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span className="flex-1">{error}</span>
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* TAB 1: DISCOVER LOCAL GAMES */}
          {activeTab === 'join' && (
            <motion.div
              key="join-tab"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-3"
            >
              <div className="flex items-center justify-between text-xs font-mono opacity-80 pb-1">
                <span className="flex items-center gap-1.5 font-bold">
                  {isScanning ? (
                    <>
                      <RefreshCw size={13} className="animate-spin text-arcade-amber" />
                      <span>Scanning Wi-Fi / Hotspot...</span>
                    </>
                  ) : (
                    <span>Available Local Hosts</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={startScanning}
                  className="px-2 py-1 rounded bg-black/5 dark:bg-white/10 hover:bg-black/10 text-[11px] font-bold"
                >
                  Rescan
                </button>
              </div>

              {discoveredHosts.length === 0 ? (
                <div className="p-6 rounded-xl border-2 border-dashed border-card-border text-center space-y-2">
                  <Wifi size={28} className="mx-auto opacity-30 text-arcade-amber animate-pulse" />
                  <p className="text-xs font-mono opacity-70">
                    No local games found yet on this Wi-Fi or Hotspot.
                  </p>
                  <p className="text-[11px] font-mono text-arcade-amber opacity-90">
                    Ask Player 1 to tap <strong>"Host Game"</strong> or connect to their Mobile Hotspot!
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {discoveredHosts.map((host) => (
                    <div
                      key={`${host.ip}:${host.port}`}
                      className="p-3 rounded-xl border-2 border-fg-base bg-panel flex items-center justify-between gap-3 arcade-shadow-sm"
                    >
                      <div>
                        <div className="flex items-center gap-1.5 font-black uppercase text-sm text-fg-base">
                          <span>{host.hostName}&apos;s Game</span>
                        </div>
                        <div className="text-[11px] font-mono opacity-60 flex items-center gap-2 mt-0.5">
                          <span>IP: {host.ip}</span>
                          <span>•</span>
                          <span>
                            {host.players}/{host.maxPlayers} Players
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleJoinDiscovered(host)}
                        className="py-2 px-4 rounded-lg bg-arcade-amber text-black font-black uppercase text-xs border-2 border-fg-base hover:brightness-105 active:scale-95"
                      >
                        Join
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* TAB 2: CREATE LOCAL HOST */}
          {activeTab === 'create' && (
            <motion.div
              key="create-tab"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-4"
            >
              <div className="p-4 rounded-xl bg-arcade-purple/10 border-2 border-arcade-purple/30 space-y-2 text-xs font-mono">
                <div className="flex items-center gap-2 text-arcade-purple font-bold">
                  <Smartphone size={16} />
                  <span>How to Host over Hotspot:</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 opacity-80 text-[11px]">
                  <li>Turn ON your phone&apos;s Mobile Hotspot.</li>
                  <li>Have friends connect their phones to your Hotspot Wi-Fi.</li>
                  <li>Click &quot;Create Host&quot; below to start the game!</li>
                </ol>
                {myLocalIp && (
                  <div className="pt-2 border-t border-arcade-purple/20 text-[11px] font-mono text-arcade-amber font-bold">
                    Your IP: {myLocalIp} {isHotspot ? '(Hotspot detected)' : ''}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleCreateLocalGame}
                className="w-full py-4 px-5 bg-fg-base text-bg-base font-black text-base uppercase tracking-wider rounded-xl arcade-shadow hover:scale-[1.01] active:translate-y-0.5 transition-all flex items-center justify-center gap-2"
              >
                <Plus size={20} className="text-arcade-amber" />
                <span>Create &amp; Become Host</span>
              </button>
            </motion.div>
          )}

          {/* TAB 3: DIRECT IP FALLBACK */}
          {activeTab === 'manual' && (
            <motion.form
              key="manual-tab"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              onSubmit={handleManualJoin}
              className="space-y-3.5"
            >
              <div>
                <label className="block text-[11px] font-mono font-bold uppercase tracking-wider opacity-70 mb-1">
                  Host Device IP Address
                </label>
                <input
                  type="text"
                  value={manualIp}
                  onChange={(e) => setManualIp(e.target.value)}
                  placeholder="192.168.43.1"
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-fg-base font-mono text-sm focus:outline-none focus:border-arcade-amber bg-panel text-fg-base transition-colors"
                />
                <p className="text-[10px] font-mono opacity-60 mt-1">
                  Default Android Hotspot IP is usually <strong>192.168.43.1</strong>
                </p>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 px-4 bg-arcade-amber text-black font-black uppercase tracking-wider text-sm rounded-xl border-2 border-fg-base arcade-shadow hover:brightness-105 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Wifi size={18} />
                <span>Connect to Host IP</span>
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
