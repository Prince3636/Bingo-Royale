import React, { useState } from 'react';
import { useGame } from '../contexts/GameContext';
import { Trophy, Plus, LogIn } from 'lucide-react';

export const AuthPage: React.FC = () => {
  const { playerName, setPlayerName, createRoom, joinRoom, error, setError, connectionStatus } = useGame();
  const [roomId, setRoomId] = useState('');
  const [mode, setMode] = useState<'initial' | 'create' | 'join'>('initial');

  const isConnected = connectionStatus === 'connected';

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected) return setError('Not connected to server. Please wait...');
    if (!playerName.trim()) return setError('Please enter your name');
    createRoom(playerName);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = playerName.trim();
    const cleanRoomId = roomId.trim().toUpperCase();
    
    if (!isConnected) return setError('Not connected to server. Please wait...');
    if (!cleanName) return setError('Please enter your name');
    if (!cleanRoomId) return setError('Please enter a Room ID');
    joinRoom(cleanRoomId, cleanName);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base p-4 font-sans">
      <div className="w-full max-w-md bg-panel border-2 border-fg-base shadow-[8px_8px_0px_0px_rgba(var(--shadow-color),1)] p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-fg-base flex items-center justify-center rounded-sm shrink-0">
            <Trophy className="text-bg-base w-6 h-6 sm:w-8 sm:h-8" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tighter uppercase italic leading-none">Bingo Royale</h1>
        </div>

        <div className="mb-4 flex items-center gap-2">
          <div 
            className={`w-2.5 h-2.5 rounded-full ${
              isConnected 
                ? 'bg-green-500' 
                : connectionStatus === 'reconnecting' 
                ? 'bg-yellow-500 animate-ping' 
                : 'bg-red-500 animate-pulse'
            }`} 
          />
          <span className="text-[10px] font-mono uppercase opacity-75">
            {isConnected 
              ? 'Server Connected' 
              : connectionStatus === 'reconnecting'
              ? 'Reconnecting to Server...'
              : 'Connecting to Server...'}
          </span>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-100 dark:bg-red-950/50 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-300 text-sm font-mono uppercase italic">
            {error}
          </div>
        )}

        {mode === 'initial' && (
          <div className="space-y-4">
            <button 
              onClick={() => setMode('create')}
              className="w-full py-4 bg-fg-base text-bg-base font-bold text-xl uppercase tracking-widest hover:opacity-90 transition-all flex items-center justify-center gap-2"
            >
              <Plus size={24} /> Create Room
            </button>
            <button 
              onClick={() => setMode('join')}
              className="w-full py-4 border-2 border-fg-base text-fg-base font-bold text-xl uppercase tracking-widest hover:bg-fg-base hover:text-bg-base transition-all flex items-center justify-center gap-2"
            >
              <LogIn size={24} /> Join Room
            </button>
          </div>
        )}

        {(mode === 'create' || mode === 'join') && (
          <form onSubmit={mode === 'create' ? handleCreate : handleJoin} className="space-y-6">
            <div>
              <label className="block text-xs font-mono uppercase opacity-50 mb-1">Your Name</label>
              <input 
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="ENTER NAME..."
                maxLength={30}
                className="w-full p-4 border-2 border-fg-base font-mono text-lg focus:outline-none focus:bg-yellow-50 dark:focus:bg-yellow-900 bg-panel text-fg-base"
                autoFocus
              />
            </div>

            {mode === 'join' && (
              <div>
                <label className="block text-xs font-mono uppercase opacity-50 mb-1">Room ID</label>
                <input 
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  placeholder="ROOM CODE..."
                  maxLength={10}
                  className="w-full p-4 border-2 border-fg-base font-mono text-lg focus:outline-none focus:bg-yellow-50 dark:focus:bg-yellow-900 bg-panel text-fg-base uppercase"
                />
              </div>
            )}

            <div className="flex gap-4">
              <button 
                type="button"
                onClick={() => setMode('initial')}
                className="flex-1 py-4 border-2 border-fg-base font-bold uppercase tracking-widest hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Back
              </button>
              <button 
                type="submit"
                className="flex-[2] py-4 bg-fg-base text-bg-base font-bold uppercase tracking-widest hover:opacity-90"
              >
                {mode === 'create' ? 'Create' : 'Join'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
