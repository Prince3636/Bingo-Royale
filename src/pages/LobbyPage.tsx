import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../contexts/GameContext';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, Play, LogOut, Copy, RefreshCw, Trash2, CheckCircle2, 
  Clock, Bot, Shield, BookOpen, Sparkles, Check, MessageSquare, 
  Send, X, Plus, Edit3
} from 'lucide-react';
import { generateBingoBoard } from '../utils/bingo';
import toast from 'react-hot-toast';
import { sound } from '../utils/sound';

// Track room notifications globally to prevent duplicate messages across StrictMode mounts (Requirement 1)
const notifiedRoomSet = new Set<string>();

export const LobbyPage: React.FC = () => {
  const { 
    gameState, messages, sendMessage, startGame, addBot, kickPlayer, 
    leaveRoom, socket, playerId, playerName, setBoard, setPlayerReady, setRounds, showNotification 
  } = useGame();

  const [localBoard, setLocalBoard] = useState<number[][]>(
    Array(5).fill(null).map(() => Array(5).fill(0))
  );
  const [copied, setCopied] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatText, setChatText] = useState('');
  const [lastReadMessageCount, setLastReadMessageCount] = useState(0);
  const [isAddBotModalOpen, setIsAddBotModalOpen] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<'board' | 'players'>('board');
  const [isReadying, setIsReadying] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Reliable player & host resolution — match by ID or socket only
  const myPlayer = gameState?.players.find(p => 
    (playerId && p.id === playerId) || 
    (socket?.id && p.socketId === socket.id)
  );

  const isHost = Boolean(myPlayer?.isHost);

  // Show join/create notification only once per room (Requirement 1)
  useEffect(() => {
    if (!gameState?.roomId || notifiedRoomSet.has(gameState.roomId)) return;
    notifiedRoomSet.add(gameState.roomId);
    if (isHost) {
      showNotification('Room Ready', `Room ${gameState.roomId} created! Select rounds, add players, and start when ready.`);
    } else {
      showNotification('Joined Room', `You joined room ${gameState.roomId}! Fill your board and click Ready.`);
    }
  }, [gameState?.roomId, isHost]);

  // Sync initial board from server if local board is empty
  useEffect(() => {
    if (myPlayer?.board && Array.isArray(myPlayer.board) && myPlayer.board.length === 5) {
      const hasLocalNumbers = localBoard.flat().some(n => n !== 0);
      if (!hasLocalNumbers) {
        setLocalBoard(myPlayer.board);
      }
    }
  }, [myPlayer?.board]);

  useEffect(() => {
    if (isChatOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setLastReadMessageCount(messages.length);
    }
  }, [messages, isChatOpen]);

  const unreadCount = messages.length - lastReadMessageCount;

  if (!gameState) return null;

  const filledCount = localBoard.flat().filter(n => n !== 0).length;
  const isMyBoardFull = filledCount === 25;
  const isPlayerMarkedReady = Boolean(myPlayer?.ready);

  // When player modifies board, automatically un-ready on server (Requirement 5)
  const handleCellClick = (r: number, c: number) => {
    sound.playPop();
    if (myPlayer?.ready) {
      setPlayerReady(false);
    }

    const currentVal = localBoard[r][c];
    if (currentVal !== 0) {
      // Clear clicked cell
      const newBoard = localBoard.map((row, rIdx) => 
        row.map((cell, cIdx) => (rIdx === r && cIdx === c ? 0 : cell))
      );
      setLocalBoard(newBoard);
      return;
    }

    // Find next available number in order 1-25
    const usedNumbers = localBoard.flat().filter(n => n !== 0);
    for (let i = 1; i <= 25; i++) {
      if (!usedNumbers.includes(i)) {
        const newBoard = localBoard.map((row, rIdx) => 
          row.map((cell, cIdx) => (rIdx === r && cIdx === c ? i : cell))
        );
        setLocalBoard(newBoard);
        break;
      }
    }
  };

  const fillRandom = () => {
    sound.playPop();
    if (myPlayer?.ready) {
      setPlayerReady(false);
    }
    const newBoard = generateBingoBoard();
    setLocalBoard(newBoard);
    setBoard(newBoard);
    toast.success('Board randomized! Click READY when set.', { id: 'board-rnd', icon: '🎲' });
  };

  const clearBoard = () => {
    sound.playPop();
    if (myPlayer?.ready) {
      setPlayerReady(false);
    }
    const emptyBoard = Array(5).fill(null).map(() => Array(5).fill(0));
    setLocalBoard(emptyBoard);
  };

  // Authoritative ready toggle for non-host human player (Requirements 2, 3, 4)
  const handleToggleReady = async () => {
    sound.playPop();
    if (!myPlayer) return;

    if (!myPlayer.ready) {
      // Trying to become READY
      if (!isMyBoardFull) {
        toast.error('Please complete a valid Bingo board before readying up.', { id: 'ready-err' });
        return;
      }
      setIsReadying(true);
      setBoard(localBoard);
      await setPlayerReady(true);
      setIsReadying(false);
    } else {
      // Trying to become NOT READY
      setIsReadying(true);
      await setPlayerReady(false);
      setIsReadying(false);
    }
  };

  const copyRoomId = () => {
    sound.playPop();
    navigator.clipboard.writeText(gameState.roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success(`Copied room code: ${gameState.roomId}`, { id: 'copy-room' });
  };

  const confirmExit = () => {
    sound.playPop();
    toast.custom((t) => (
      <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-sm w-full bg-panel border-3 border-fg-base arcade-shadow-lg p-5 rounded-2xl`}>
        <h3 className="text-base font-black uppercase italic tracking-wider text-fg-base mb-1.5 border-b-2 border-card-border pb-2">
          Leave Room?
        </h3>
        <p className="text-xs font-mono text-fg-base opacity-75 mb-4">
          Are you sure you want to leave room <span className="font-bold">{gameState.roomId}</span>?
        </p>
        <div className="flex gap-2">
          <button 
            onClick={() => toast.dismiss(t.id)} 
            className="flex-1 py-2.5 px-3 rounded-lg border-2 border-fg-base font-bold uppercase text-xs hover:bg-black/5 dark:hover:bg-white/5"
          >
            Stay
          </button>
          <button 
            onClick={() => { toast.dismiss(t.id); leaveRoom(); }} 
            className="flex-1 py-2.5 px-3 rounded-lg bg-arcade-crimson text-white border-2 border-fg-base font-bold uppercase text-xs hover:opacity-90"
          >
            Leave
          </button>
        </div>
      </div>
    ), { duration: 15000 });
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim()) return;
    sendMessage(chatText.trim());
    setChatText('');
  };

  const sendQuickChip = (msg: string) => {
    sound.playPop();
    sendMessage(msg);
  };

  // Ready states
  const readyPlayersCount = gameState.players.filter(p => p.ready || p.isBot).length;
  const allPlayersReady = gameState.players.length >= 2 && gameState.players.every(p => p.ready || p.isBot);

  return (
    <div className="min-h-[100dvh] bg-bg-base text-fg-base flex flex-col font-sans relative pb-24 lg:pb-8">
      {/* 1. Top Header */}
      <header className="sticky top-0 z-30 bg-panel/95 backdrop-blur-md border-b-2 border-fg-base px-3 sm:px-6 py-2.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          {/* Room Code Badge */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-panel border-2 border-fg-base arcade-shadow-sm">
              <span className="text-[10px] font-mono font-bold uppercase text-arcade-amber">ROOM:</span>
              <span className="font-mono font-black text-sm sm:text-base tracking-widest uppercase">{gameState.roomId}</span>
              <button 
                onClick={copyRoomId} 
                className="ml-1 p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded transition-colors text-fg-base"
                title="Copy Room Code"
              >
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              </button>
            </div>
            
            <div className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-panel border border-card-border text-[11px] font-mono">
              <Users size={12} className="text-arcade-amber" />
              <span>{gameState.players.length}/5 Players</span>
            </div>
          </div>

          {/* Action buttons (Quit + Theme spacer) */}
          <div className="flex items-center gap-2 pr-24 sm:pr-28">
            <button 
              onClick={confirmExit}
              className="px-2.5 sm:px-3 py-1.5 rounded-lg border-2 border-fg-base text-arcade-crimson hover:bg-red-500/10 font-bold uppercase text-xs flex items-center gap-1.5 transition-colors"
            >
              <LogOut size={13} />
              <span className="hidden xs:inline">Exit</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto w-full p-3 sm:p-6 flex-1">
        
        {/* ROUND CONTROLS: Only Host can select rounds; Non-hosts see read-only badge */}
        <div className="mb-4 p-3 sm:p-4 rounded-2xl bg-panel border-2 border-fg-base arcade-shadow">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase">
                <Shield size={14} className="text-arcade-cyan" />
                <span>Match Rounds:</span>
              </div>
              
              {isHost ? (
                /* Host Interactive Selector */
                <div className="flex gap-1.5">
                  {[1, 3, 5].map(r => (
                    <button
                      key={r}
                      onClick={() => {
                        sound.playPop();
                        setRounds(r);
                      }}
                      className={`px-3 py-1.5 rounded-lg border-2 font-mono font-black text-xs uppercase tracking-wider transition-all cursor-pointer ${
                        gameState.targetRounds === r
                          ? 'border-fg-base bg-fg-base text-bg-base shadow-sm scale-105'
                          : 'border-card-border bg-panel hover:border-arcade-amber'
                      }`}
                    >
                      {r} {r === 1 ? 'Round' : 'Rounds'}
                    </button>
                  ))}
                </div>
              ) : (
                /* Non-Host Informational Badge */
                <span className="px-3 py-1 rounded-lg border border-card-border bg-panel text-arcade-amber font-mono font-bold text-xs">
                  🏆 {gameState.targetRounds} {gameState.targetRounds === 1 ? 'Round' : 'Rounds'} (Selected by Host)
                </span>
              )}
            </div>

            {/* Sub-info: Who is host & ready count */}
            <div className="text-xs font-mono opacity-70 flex items-center gap-2">
              <span>Host: <strong className="text-arcade-amber uppercase">{gameState.players.find(p => p.isHost)?.name || 'Host'}</strong></span>
              <span>•</span>
              <span className="text-emerald-500 font-bold">Ready: {readyPlayersCount}/{gameState.players.length}</span>
            </div>
          </div>
        </div>

        {/* Mobile View Tab Switcher (< lg screens) */}
        <div className="lg:hidden flex border-2 border-fg-base rounded-xl p-1 bg-panel arcade-shadow-sm mb-4">
          <button
            onClick={() => { sound.playPop(); setActiveMobileTab('board'); }}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
              activeMobileTab === 'board'
                ? 'bg-fg-base text-bg-base'
                : 'text-fg-base opacity-70 hover:opacity-100'
            }`}
          >
            <span>🎲 My Board</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
              isPlayerMarkedReady 
                ? 'bg-emerald-500 text-white font-bold' 
                : isMyBoardFull 
                ? 'bg-arcade-amber text-black font-bold' 
                : 'bg-black/10 dark:bg-white/10'
            }`}>
              {isPlayerMarkedReady ? '✓ Ready' : `${filledCount}/25`}
            </span>
          </button>
          
          <button
            onClick={() => { sound.playPop(); setActiveMobileTab('players'); }}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
              activeMobileTab === 'players'
                ? 'bg-fg-base text-bg-base'
                : 'text-fg-base opacity-70 hover:opacity-100'
            }`}
          >
            <Users size={14} />
            <span>Players ({gameState.players.length}/5)</span>
          </button>
        </div>

        {/* 2-Column Desktop Grid / Tabbed Mobile View */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          
          {/* LEFT COLUMN: Players Roster & Rules (Hidden on mobile if tab is 'board') */}
          <div className={`lg:col-span-5 space-y-4 ${activeMobileTab === 'board' ? 'hidden lg:block' : 'block'}`}>
            <div className="bg-panel border-2 border-fg-base rounded-2xl p-4 arcade-shadow">
              <div className="flex items-center justify-between pb-2 mb-3 border-b-2 border-card-border">
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-arcade-amber" />
                  <h2 className="font-black uppercase tracking-wider text-xs sm:text-sm italic">
                    Room Players ({gameState.players.length}/5)
                  </h2>
                </div>
                <div className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  Ready: {readyPlayersCount}/{gameState.players.length}
                </div>
              </div>

              {/* Player list with clear ready ticks */}
              <div className="space-y-2">
                {gameState.players.map((player) => {
                  const isReady = player.ready || player.isBot;
                  const isMe = player.id === myPlayer?.id;

                  return (
                    <div 
                      key={player.id}
                      className={`flex items-center justify-between p-2.5 rounded-xl border-2 transition-all ${
                        isMe 
                          ? 'border-arcade-amber bg-arcade-amber/10' 
                          : 'border-card-border bg-panel'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-8 h-8 rounded-lg border-2 border-fg-base flex items-center justify-center font-black text-xs shrink-0 ${
                          player.isBot ? 'bg-panel text-fg-base' : 'bg-arcade-amber text-black'
                        }`}>
                          {player.isBot ? <Bot size={15} /> : player.name[0].toUpperCase()}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs sm:text-sm uppercase tracking-tight truncate max-w-[110px] sm:max-w-[140px]">
                              {player.name}
                            </span>
                            {isMe && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-fg-base text-bg-base uppercase">
                                YOU
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-mono opacity-50 flex items-center gap-1">
                            {player.isHost ? 'HOST' : player.isBot ? 'COMPUTER BOT' : 'PLAYER'}
                          </div>
                        </div>
                      </div>

                      {/* Ready Tick Indicator & Host Kick Control */}
                      <div className="flex items-center gap-2 shrink-0">
                        {/* Status Indicator (Requirement 16) */}
                        {!player.connected ? (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-500/15 border border-zinc-500/40 text-zinc-400 font-mono font-bold text-[10px] uppercase">
                            OFFLINE
                          </span>
                        ) : player.isHost ? (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-arcade-amber/15 border border-arcade-amber/40 text-arcade-amber font-mono font-bold text-[10px] uppercase">
                            HOST
                          </span>
                        ) : player.isBot ? (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-mono font-bold text-[10px] uppercase">
                            <CheckCircle2 size={12} className="text-emerald-500" />
                            <span>BOT READY</span>
                          </span>
                        ) : player.ready ? (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-mono font-bold text-[10px] uppercase">
                            <CheckCircle2 size={12} className="text-emerald-500" />
                            <span>READY</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-arcade-amber/15 border border-arcade-amber/40 text-arcade-amber font-mono font-bold text-[10px] uppercase animate-pulse">
                            <Clock size={11} />
                            <span>NOT READY</span>
                          </span>
                        )}

                        {/* Kick / Remove Button for Host (Requirements 10, 12, 13, 14) */}
                        {isHost && !player.isHost && (
                          <button
                            onClick={() => { sound.playPop(); kickPlayer(player.id); }}
                            className="px-2 py-0.5 rounded text-[10px] font-mono text-arcade-crimson hover:bg-red-500/10 font-bold uppercase border border-red-500/30 active:scale-90 transition-all cursor-pointer"
                            title={player.isBot ? "Remove Bot" : "Kick player"}
                          >
                            ✕ {player.isBot ? 'Remove' : 'Kick'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Empty Player Slots with + Icon for Host to Add Bot */}
                {Array.from({ length: Math.max(0, 5 - gameState.players.length) }).map((_, idx) => {
                  // Only host gets clickable + Add Bot on the first empty slot
                  const isFirstEmptySlot = idx === 0;
                  const canHostAddBot = isHost && isFirstEmptySlot;

                  if (canHostAddBot) {
                    return (
                      <button
                        key="add-bot-slot"
                        onClick={() => { sound.playPop(); setIsAddBotModalOpen(true); }}
                        className="w-full p-2.5 rounded-xl border-2 border-dashed border-arcade-amber/80 hover:border-arcade-amber bg-arcade-amber/5 hover:bg-arcade-amber/10 flex items-center justify-between transition-all group cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg border-2 border-arcade-amber flex items-center justify-center font-bold text-arcade-amber group-hover:scale-110 transition-transform">
                            <Plus size={16} />
                          </div>
                          <div>
                            <span className="text-xs font-black uppercase tracking-wide text-arcade-amber block">
                              + Add Computer Bot
                            </span>
                            <span className="text-[10px] font-mono opacity-60">Tap to open bot popup</span>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-arcade-amber text-black">
                          Add Bot
                        </span>
                      </button>
                    );
                  }

                  return (
                    <div key={`empty-${idx}`} className="p-2.5 rounded-xl border-2 border-dashed border-card-border/60 flex items-center gap-2.5 opacity-40">
                      <div className="w-8 h-8 rounded-lg border-2 border-dashed border-card-border flex items-center justify-center font-mono text-xs">
                        +
                      </div>
                      <span className="text-xs font-mono uppercase tracking-wide">Waiting for player...</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Game Rules Card */}
            <div className="bg-panel border-2 border-fg-base rounded-2xl p-4 arcade-shadow text-xs font-mono space-y-2">
              <h3 className="font-black uppercase tracking-wider text-xs sm:text-sm mb-2 font-sans italic flex items-center gap-2">
                <BookOpen size={16} className="text-arcade-purple" />
                <span>Bingo Rules</span>
              </h3>
              <ul className="space-y-1.5 opacity-80">
                <li>• 5x5 board with numbers 1 to 25 uniquely arranged.</li>
                <li>• Complete 5 lines (Row/Col/Diag) to claim B-I-N-G-O!</li>
                <li>• Target: Best of {gameState.targetRounds} {gameState.targetRounds === 1 ? 'round' : 'rounds'}.</li>
                <li>• Host can add bots via "+" slot and start when all players are ready.</li>
              </ul>
            </div>
          </div>

          {/* RIGHT COLUMN: 5x5 Board Setup & Ready / Start Controls (Hidden on mobile if tab is 'players') */}
          <div className={`lg:col-span-7 space-y-4 ${activeMobileTab === 'players' ? 'hidden lg:block' : 'block'}`}>
            <div className="bg-panel border-2 border-fg-base rounded-2xl p-4 sm:p-6 arcade-shadow relative">
              
              {/* Header with Quick Actions */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b-2 border-card-border">
                <div>
                  <h2 className="font-black uppercase tracking-tight text-base sm:text-lg italic flex items-center gap-2">
                    <Sparkles size={18} className="text-arcade-amber" />
                    <span>Setup Your 5x5 Board</span>
                  </h2>
                  <p className="text-[11px] font-mono opacity-60">
                    Tap boxes or use Randomize to place numbers 1-25.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={clearBoard}
                    className="px-2.5 py-1.5 rounded-lg border-2 border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10 text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-1 transition-colors"
                  >
                    <Trash2 size={12} />
                    <span>Clear</span>
                  </button>
                  <button
                    onClick={fillRandom}
                    className="px-3.5 py-1.5 rounded-lg bg-arcade-amber text-black border-2 border-fg-base font-bold text-xs uppercase tracking-wider arcade-shadow-sm hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5"
                  >
                    <RefreshCw size={13} />
                    <span>Randomize</span>
                  </button>
                </div>
              </div>

              {/* Progress Indicator */}
              <div className="mb-3">
                <div className="flex justify-between items-center text-xs font-mono font-bold mb-1">
                  <span className="flex items-center gap-1.5">
                    {isMyBoardFull ? (
                      <CheckCircle2 size={15} className="text-emerald-500" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-arcade-amber animate-pulse" />
                    )}
                    <span>{isMyBoardFull ? 'All 25 Numbers Placed!' : 'Numbers Filled:'}</span>
                  </span>
                  <span className={isMyBoardFull ? 'text-emerald-500' : 'text-arcade-amber'}>
                    {filledCount} / 25
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-300 ${isMyBoardFull ? 'bg-emerald-500' : 'bg-arcade-amber'}`}
                    style={{ width: `${(filledCount / 25) * 100}%` }}
                  />
                </div>
              </div>

              {/* 5x5 Grid Builder */}
              <div className="w-full max-w-[340px] sm:max-w-[400px] mx-auto my-2">
                <div className="grid grid-cols-5 gap-1.5 sm:gap-2.5 p-2 sm:p-3 rounded-2xl bg-bg-base border-2 border-fg-base arcade-shadow-sm">
                  {localBoard.map((row, rIdx) => 
                    row.map((num, cIdx) => (
                      <button
                        key={`${rIdx}-${cIdx}`}
                        onClick={() => handleCellClick(rIdx, cIdx)}
                        className={`aspect-square rounded-xl border-2 border-fg-base flex items-center justify-center font-black text-sm sm:text-lg transition-all active:scale-90 ${
                          num !== 0 
                            ? 'bg-fg-base text-bg-base shadow-inner scale-[0.98]' 
                            : 'bg-panel text-fg-base hover:border-arcade-amber hover:bg-arcade-amber/10 opacity-70 hover:opacity-100'
                        }`}
                      >
                        {num !== 0 ? num : ''}
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Ready / Start Controls */}
              <div className="mt-4 pt-3 border-t-2 border-card-border">
                {isHost ? (
                  /* Host: NO ready button — only START GAME (Requirements 6, 7, 17) */
                  (() => {
                    const unreadyHumanPlayers = gameState.players.filter(p => !p.isBot && !p.isHost && !p.ready);
                    const canStartGame = gameState.players.length >= 2 && unreadyHumanPlayers.length === 0;

                    const getStartButtonLabel = () => {
                      if (gameState.players.length < 2) {
                        return 'Need at least 2 players';
                      }
                      if (unreadyHumanPlayers.length === 1) {
                        return `Waiting for ${unreadyHumanPlayers[0].name}`;
                      }
                      if (unreadyHumanPlayers.length > 1) {
                        return `${unreadyHumanPlayers.length} players not ready`;
                      }
                      return 'START GAME';
                    };

                    return (
                      <button
                        onClick={() => { sound.playVictory(); startGame(); }}
                        disabled={!canStartGame}
                        className="w-full py-4 px-6 bg-fg-base text-bg-base font-black text-xl uppercase tracking-widest rounded-xl arcade-shadow hover:scale-[1.01] active:translate-y-0.5 transition-all flex items-center justify-center gap-3 disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed group cursor-pointer"
                      >
                        <Play size={24} fill="currentColor" className="text-arcade-amber group-hover:scale-110 transition-transform" />
                        <span>{getStartButtonLabel()}</span>
                      </button>
                    );
                  })()
                ) : (
                  /* Non-host: Driven by player.ready from authoritative room state (Requirements 2, 3, 4) */
                  myPlayer?.ready ? (
                    <button
                      onClick={handleToggleReady}
                      disabled={isReadying}
                      className="w-full py-4 px-6 bg-red-600 hover:bg-red-700 text-white font-black text-xl uppercase tracking-widest rounded-xl arcade-shadow hover:scale-[1.01] active:translate-y-0.5 transition-all flex items-center justify-center gap-3 cursor-pointer shadow-md"
                    >
                      <X size={24} className="text-white" />
                      <span>{isReadying ? 'Updating...' : 'NOT READY'}</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleToggleReady}
                      disabled={!isMyBoardFull || isReadying}
                      className={`w-full py-4 px-6 font-black text-xl uppercase tracking-widest rounded-xl arcade-shadow transition-all flex items-center justify-center gap-3 ${
                        isMyBoardFull && !isReadying
                          ? 'bg-emerald-500 hover:bg-emerald-600 text-white hover:scale-[1.01] active:translate-y-0.5 cursor-pointer shadow-md'
                          : 'bg-panel text-fg-base opacity-40 cursor-not-allowed'
                      }`}
                    >
                      <CheckCircle2 size={24} className="text-white" />
                      <span>
                        {isReadying
                          ? 'Updating...'
                          : isMyBoardFull
                          ? 'READY'
                          : `Fill All 25 Boxes (${filledCount}/25)`}
                      </span>
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 2. ADD BOT POPUP MODAL (Clean, simple, dismiss on click outside) */}
      <AnimatePresence>
        {isAddBotModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsAddBotModalOpen(false)}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-panel border-3 border-fg-base rounded-2xl arcade-shadow-lg p-5 flex flex-col"
            >
              <div className="flex items-center justify-between pb-3 mb-3 border-b-2 border-card-border">
                <div className="flex items-center gap-2">
                  <Bot size={20} className="text-arcade-amber" />
                  <h3 className="font-black uppercase text-sm sm:text-base italic tracking-wider">
                    Add Computer Bot
                  </h3>
                </div>
                <button 
                  onClick={() => setIsAddBotModalOpen(false)}
                  className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3 mb-5 text-xs font-mono">
                <p className="opacity-80">
                  Add an intelligent AI bot to fill an empty slot in your room.
                </p>
                <div className="p-3 rounded-xl bg-bg-base/70 border border-card-border space-y-1">
                  <div className="flex justify-between">
                    <span className="opacity-60">Board Status:</span>
                    <span className="text-emerald-500 font-bold">Auto-Filled (1-25)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-60">Player Status:</span>
                    <span className="text-emerald-500 font-bold">Instant READY ✓</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-60">Room Occupancy:</span>
                    <span className="font-bold">{gameState.players.length}/5 Players</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setIsAddBotModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border-2 border-fg-base text-xs font-bold uppercase hover:bg-black/5 dark:hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    sound.playPop();
                    addBot();
                    setIsAddBotModalOpen(false);
                    toast.success('Bot added to room! ✓', { id: 'bot-added', icon: '🤖' });
                  }}
                  disabled={gameState.players.length >= 5}
                  className="flex-1 py-2.5 rounded-xl bg-arcade-amber text-black border-2 border-fg-base text-xs font-black uppercase tracking-wider arcade-shadow-sm hover:scale-105 active:scale-95 disabled:opacity-50"
                >
                  + Add Bot
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. Floating Chat Button for Lobby */}
      <button 
        onClick={() => { sound.playPop(); setIsChatOpen(!isChatOpen); }}
        className="fixed bottom-20 lg:bottom-6 right-4 sm:right-6 w-12 h-12 sm:w-14 sm:h-14 bg-fg-base text-bg-base rounded-2xl flex items-center justify-center arcade-shadow z-40 active:scale-90 transition-transform cursor-pointer"
        title="Open Room Chat"
        aria-label="Open Room Chat"
      >
        <MessageSquare size={22} className="text-arcade-amber" />
        {unreadCount > 0 && !isChatOpen && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-arcade-crimson rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-fg-base text-white animate-bounce">
            {unreadCount}
          </span>
        )}
      </button>

      {/* 4. In-Lobby Slide-over Chat (Compact size & outside click auto-closes) */}
      <AnimatePresence>
        {isChatOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsChatOpen(false)}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-end sm:p-4"
          >
            <motion.div 
              initial={{ y: 50, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 50, opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-sm h-[70vh] max-h-[500px] bg-panel border-t-2 sm:border-2 border-fg-base rounded-t-3xl sm:rounded-2xl arcade-shadow-lg flex flex-col overflow-hidden"
            >
              {/* Chat Header */}
              <div className="p-3 border-b-2 border-card-border flex items-center justify-between bg-fg-base text-bg-base">
                <div className="flex items-center gap-2">
                  <MessageSquare size={16} className="text-arcade-amber" />
                  <h3 className="font-black uppercase text-xs italic tracking-wider">Room Lobby Chat</h3>
                </div>
                <button 
                  onClick={() => setIsChatOpen(false)}
                  className="p-1 rounded hover:bg-white/10 text-xs font-mono uppercase cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Quick Instruction Chips */}
              <div className="p-2.5 bg-bg-base/70 border-b border-card-border">
                <p className="text-[10px] font-mono opacity-60 mb-1.5 uppercase font-bold">Quick Instructions:</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => sendQuickChip("Sabhi board bhar lo jaldi! 🎲")}
                    className="px-2 py-1 rounded-md bg-panel border border-card-border text-[10px] font-mono hover:border-arcade-amber active:scale-95 cursor-pointer"
                  >
                    🎲 Fill Board
                  </button>
                  <button
                    onClick={() => sendQuickChip("Ready karo sabhi! ⚡")}
                    className="px-2 py-1 rounded-md bg-panel border border-card-border text-[10px] font-mono hover:border-arcade-amber active:scale-95 cursor-pointer"
                  >
                    ⚡ Ready karo!
                  </button>
                  <button
                    onClick={() => sendQuickChip("Randomize button dabao! 🎯")}
                    className="px-2 py-1 rounded-md bg-panel border border-card-border text-[10px] font-mono hover:border-arcade-amber active:scale-95 cursor-pointer"
                  >
                    🎯 Randomize dabao
                  </button>
                  <button
                    onClick={() => sendQuickChip("Match start hone wala hai! 🚀")}
                    className="px-2 py-1 rounded-md bg-panel border border-card-border text-[10px] font-mono hover:border-arcade-amber active:scale-95 cursor-pointer"
                  >
                    🚀 Starting soon!
                  </button>
                </div>
              </div>

              {/* Chat Message List */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2 font-mono text-xs bg-bg-base/40">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-50 italic text-center p-4">
                    <MessageSquare size={28} className="mb-2 opacity-40" />
                    <span>No messages yet. Chat with players before starting!</span>
                  </div>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className="p-2.5 rounded-xl bg-panel border border-card-border">
                      <span className="font-black text-[10px] text-arcade-amber uppercase block leading-tight">
                        {m.sender}
                      </span>
                      <span className="text-fg-base break-words text-xs">{m.text}</span>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input */}
              <form onSubmit={handleSendChat} className="p-3 border-t-2 border-card-border flex gap-2 bg-panel">
                <input 
                  type="text"
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  placeholder="Tell players to ready up..."
                  maxLength={100}
                  className="flex-1 px-3 py-2 rounded-lg border-2 border-card-border font-mono text-xs focus:outline-none focus:border-arcade-amber bg-panel text-fg-base"
                />
                <button 
                  type="submit" 
                  className="px-3.5 py-2 bg-fg-base text-bg-base rounded-lg hover:opacity-90 active:scale-95 transition-all cursor-pointer"
                >
                  <Send size={15} />
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 5. Sticky Bottom Action Bar (Mobile & Tablet) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-panel/95 backdrop-blur-md border-t-2 border-fg-base p-2.5 px-4 arcade-shadow-lg">
        <div className="max-w-md mx-auto">
          {isHost ? (
            (() => {
              const unreadyHumanPlayers = gameState.players.filter(p => !p.isBot && !p.isHost && !p.ready);
              const canStartGame = gameState.players.length >= 2 && unreadyHumanPlayers.length === 0;

              const getStartButtonLabel = () => {
                if (gameState.players.length < 2) return 'Need at least 2 players';
                if (unreadyHumanPlayers.length === 1) return `Waiting for ${unreadyHumanPlayers[0].name}`;
                if (unreadyHumanPlayers.length > 1) return `${unreadyHumanPlayers.length} players not ready`;
                return 'START GAME';
              };

              return (
                <button
                  onClick={() => { sound.playVictory(); startGame(); }}
                  disabled={!canStartGame}
                  className="w-full py-3 px-4 bg-fg-base text-bg-base font-black text-sm sm:text-base uppercase tracking-wider rounded-xl arcade-shadow flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed active:translate-y-0.5 transition-all"
                >
                  <Play size={18} fill="currentColor" className="text-arcade-amber" />
                  <span>{getStartButtonLabel()}</span>
                </button>
              );
            })()
          ) : (
            <button
              onClick={handleToggleReady}
              disabled={isReadying || (!isMyBoardFull && !myPlayer?.ready)}
              className={`w-full py-3 px-4 font-black text-sm uppercase tracking-wider rounded-xl arcade-shadow flex items-center justify-center gap-2 active:translate-y-0.5 transition-all ${
                myPlayer?.ready
                  ? 'bg-red-600 text-white border-2 border-fg-base hover:bg-red-700'
                  : isMyBoardFull
                  ? 'bg-emerald-500 text-white border-2 border-fg-base'
                  : 'bg-panel text-fg-base border-2 border-fg-base opacity-40 cursor-not-allowed'
              }`}
            >
              {myPlayer?.ready ? <X size={16} /> : <CheckCircle2 size={16} />}
              <span>
                {isReadying
                  ? 'Updating...'
                  : myPlayer?.ready
                  ? 'NOT READY'
                  : isMyBoardFull
                  ? 'READY'
                  : `Fill board (${filledCount}/25)`}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
