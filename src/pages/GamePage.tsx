import React, { useState, useRef, useEffect } from 'react';
import { useGame } from '../contexts/GameContext';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Trophy, MessageSquare, LogOut, Sparkles, X, History, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { sound } from '../utils/sound';

export const GamePage: React.FC = () => {
  const { gameState, messages, sendMessage, markNumber, socket, playerId, leaveRoom, resetRoom, showNotification } = useGame();
  const [chatText, setChatText] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [lastReadMessageCount, setLastReadMessageCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number>(15);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const prevTurnRef = useRef<string | null>(null);
  const prevDrawnCountRef = useRef<number>(0);

  const myPlayer = gameState?.players.find(p => p.id === playerId || (socket?.id && p.socketId === socket.id));
  const isMyTurn = !!(myPlayer && gameState?.currentTurn === myPlayer.id);
  const currentPlayer = gameState?.players.find(p => p.id === gameState?.currentTurn);

  // Synchronized countdown timer driven by authoritative server turnDeadline (Requirements 18, 21, 33)
  useEffect(() => {
    if (!gameState?.turnDeadline || gameState.status !== 'playing') return;

    const updateTimer = () => {
      const remainingMs = gameState.turnDeadline! - Date.now();
      const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
      setTimeLeft(seconds);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 200);
    return () => clearInterval(interval);
  }, [gameState?.turnDeadline, gameState?.turnId, gameState?.status]);

  // Sound triggers on turn changes and number draws
  useEffect(() => {
    if (gameState?.status === 'playing') {
      if (isMyTurn && prevTurnRef.current !== myPlayer?.id) {
        sound.playYourTurn();
      }
      prevTurnRef.current = gameState.currentTurn;

      if (gameState.drawnNumbers.length > prevDrawnCountRef.current) {
        sound.playDraw();
      }
      prevDrawnCountRef.current = gameState.drawnNumbers.length;
    }
  }, [gameState?.currentTurn, gameState?.drawnNumbers.length, isMyTurn, myPlayer?.id, gameState?.status]);

  useEffect(() => {
    if (gameState?.winner) {
      sound.playVictory();
      if (gameState.status === 'finished' && gameState.overallWinner) {
        showNotification('🏆 CHAMPION!', `${gameState.overallWinner.name} won the championship with ${gameState.overallWinner.score} wins!`, 12000);
      } else {
        showNotification('🎉 BINGO!', `${gameState.winner.name} won this round!`, 8000);
      }
    }
  }, [gameState?.status, gameState?.winner?.id]);

  useEffect(() => {
    if (isChatOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setLastReadMessageCount(messages.length);
    }
  }, [messages, isChatOpen]);

  const unreadCount = messages.length - lastReadMessageCount;

  if (!gameState) return null;

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim()) return;
    sendMessage(chatText.trim());
    setChatText('');
  };

  const handleCellClick = (r: number, c: number, num: number, canMark: boolean) => {
    if (!canMark) return;
    sound.playPop();
    markNumber(r, c);
  };

  const confirmExit = () => {
    sound.playPop();
    toast.custom((t) => (
      <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-sm w-full bg-panel border-3 border-fg-base arcade-shadow-lg p-5 rounded-2xl`}>
        <h3 className="text-base font-black uppercase italic tracking-wider text-fg-base mb-1.5 border-b-2 border-card-border pb-2">
          Quit Match?
        </h3>
        <p className="text-xs font-mono text-fg-base opacity-75 mb-4">
          Are you sure you want to quit? You will forfeit your spot in this match.
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
            Quit
          </button>
        </div>
      </div>
    ), { duration: 15000 });
  };

  const lastDrawnNumber = gameState.drawnNumbers.length > 0 
    ? gameState.drawnNumbers[gameState.drawnNumbers.length - 1] 
    : null;

  const recentDrawnNumbers = [...gameState.drawnNumbers].reverse().slice(0, 8);

  return (
    <div className="h-[100dvh] max-h-[100dvh] bg-bg-base text-fg-base flex flex-col font-sans overflow-hidden select-none">
      {/* 1. Sleek Compact Header */}
      <header className="shrink-0 bg-panel/95 backdrop-blur-md border-b-2 border-fg-base px-3 sm:px-6 py-2 flex items-center justify-between z-30">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-arcade-amber border-2 border-fg-base flex items-center justify-center font-black text-black text-xs sm:text-sm">
            B
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-black italic uppercase tracking-tight leading-none">
              Bingo Royale
            </h1>
            <div className="flex items-center gap-1.5 text-[10px] font-mono opacity-60">
              <span>RM: {gameState.roomId}</span>
              <span>•</span>
              <span className="font-bold text-arcade-amber">
                Round {gameState.currentRound}/{gameState.targetRounds}
              </span>
            </div>
          </div>
        </div>

        {/* Center / Right controls */}
        <div className="flex items-center gap-2 pr-24 sm:pr-28">
          <button
            onClick={() => { sound.playPop(); setIsHistoryOpen(!isHistoryOpen); }}
            className={`px-2.5 py-1 rounded-lg border-2 border-fg-base text-[11px] font-mono font-bold uppercase flex items-center gap-1 transition-all ${
              isHistoryOpen ? 'bg-fg-base text-bg-base' : 'bg-panel hover:bg-black/5 dark:hover:bg-white/5'
            }`}
            title="Drawn Numbers History"
          >
            <History size={13} />
            <span className="hidden xs:inline">Drawn:</span>
            <span>{gameState.drawnNumbers.length}</span>
          </button>

          <button
            onClick={confirmExit}
            className="px-2.5 py-1 rounded-lg border-2 border-fg-base text-arcade-crimson hover:bg-red-500/10 text-[11px] font-bold uppercase flex items-center gap-1 transition-colors"
            title="Quit Match"
          >
            <LogOut size={13} />
            <span className="hidden sm:inline">Quit</span>
          </button>
        </div>
      </header>

      {/* 2. Main Game Viewport (Fitted to screen) */}
      <main className="flex-1 flex flex-col lg:flex-row p-2 sm:p-4 gap-3 lg:gap-6 overflow-hidden max-w-7xl mx-auto w-full">
        
        {/* Left Sidebar on Desktop (Players & Leaderboard) */}
        <aside className="hidden lg:flex w-72 flex-col gap-4 shrink-0">
          <div className="bg-panel border-2 border-fg-base rounded-2xl p-4 arcade-shadow flex-1 flex flex-col">
            <div className="flex items-center justify-between pb-2 mb-3 border-b-2 border-card-border">
              <h2 className="font-black uppercase tracking-wider text-xs italic flex items-center gap-1.5">
                <Trophy size={14} className="text-arcade-amber" />
                <span>Players & Scores</span>
              </h2>
              <span className="text-[10px] font-mono opacity-50">{gameState.players.length}/5</span>
            </div>

            <div className="space-y-2 flex-1 overflow-y-auto pr-1">
              {gameState.players.map(p => {
                const isCurrentTurn = gameState.currentTurn === p.id;
                const isMe = p.id === myPlayer?.id;

                return (
                  <div 
                    key={p.id}
                    className={`p-3 rounded-xl border-2 transition-all ${
                      isCurrentTurn 
                        ? 'border-arcade-amber bg-arcade-amber/15 shadow-sm' 
                        : 'border-card-border bg-panel'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-7 h-7 rounded-lg border-2 border-fg-base flex items-center justify-center font-black text-xs ${
                          p.isBot ? 'bg-panel text-fg-base' : 'bg-arcade-amber text-black'
                        }`}>
                          {p.name[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <span className={`text-xs font-bold uppercase truncate block ${isMe ? 'text-arcade-amber' : ''}`}>
                            {p.name} {isMe && '(YOU)'}
                          </span>
                          <span className="text-[9px] font-mono opacity-50 block">
                            {p.isBot ? 'BOT' : p.connected ? 'ONLINE' : 'OFFLINE'}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-mono font-black text-arcade-amber">
                          {p.score} {p.score === 1 ? 'Win' : 'Wins'}
                        </span>
                      </div>
                    </div>

                    {/* B-I-N-G-O Lines Progress Indicator for Player */}
                    <div className="flex items-center justify-between pt-1 border-t border-card-border/60">
                      <span className="text-[9px] font-mono opacity-60">Lines:</span>
                      <div className="flex gap-1">
                        {['B', 'I', 'N', 'G', 'O'].map((letter, i) => {
                          const isLit = p.completedLines > i;
                          return (
                            <span 
                              key={letter}
                              className={`w-4 h-4 rounded text-[9px] font-mono font-black flex items-center justify-center border ${
                                isLit 
                                  ? 'bg-arcade-crimson text-white border-red-700 animate-pulse' 
                                  : 'bg-black/5 dark:bg-white/5 text-fg-base/40 border-card-border'
                              }`}
                            >
                              {letter}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Center: Interactive Arena (Turn HUD, Last Ball, 5x5 Board) */}
        <div className="flex-1 flex flex-col items-center justify-between sm:justify-center gap-2 sm:gap-4 overflow-y-auto px-1">
          
          {/* Winner / Champion Screen Overlay */}
          {gameState.status === 'finished' && gameState.overallWinner ? (
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-full max-w-md bg-panel border-3 border-fg-base rounded-2xl p-6 sm:p-8 text-center arcade-shadow-lg my-auto"
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-arcade-amber border-3 border-fg-base rounded-2xl mx-auto flex items-center justify-center mb-4 text-black arcade-shadow">
                <Trophy size={36} />
              </div>
              <div className="inline-block px-3 py-1 rounded-full bg-arcade-amber/20 text-arcade-amber font-mono text-xs font-bold uppercase mb-2">
                Match Complete
              </div>
              <h2 className="text-2xl sm:text-4xl font-black uppercase italic tracking-tight mb-1">
                {gameState.overallWinner.name} Wins!
              </h2>
              <p className="text-xs font-mono opacity-70 mb-6">
                Championship Winner with {gameState.overallWinner.score} Total Wins
              </p>
              <div className="flex flex-col gap-2.5">
                {myPlayer?.isHost ? (
                  <button 
                    onClick={() => {
                      sound.playPop();
                      resetRoom();
                    }}
                    className="w-full py-3.5 bg-arcade-amber text-black font-black uppercase tracking-wider rounded-xl arcade-shadow hover:scale-[1.01] active:translate-y-0.5 transition-all flex items-center justify-center gap-2"
                  >
                    <Sparkles size={18} />
                    <span>Play Again (Clear & Reset)</span>
                  </button>
                ) : (
                  <div className="py-2.5 px-3 rounded-xl bg-black/5 dark:bg-white/5 border border-card-border font-mono text-xs opacity-75">
                    Waiting for host to start a new match...
                  </div>
                )}
                <button 
                  onClick={leaveRoom}
                  className="w-full py-3 bg-panel border-2 border-fg-base text-fg-base font-bold uppercase tracking-wider rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-all"
                >
                  Leave Room
                </button>
              </div>
            </motion.div>
          ) : (
            <>
              {/* Compact Unified Game HUD (Mobile & Desktop) */}
              <div className="w-full max-w-[360px] sm:max-w-[440px] bg-panel border-2 border-fg-base rounded-2xl p-2.5 sm:p-3 arcade-shadow flex items-center justify-between gap-3 shrink-0">
                {/* Last Called Ball Badge */}
                <div className="flex items-center gap-2.5">
                  <div className="relative">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-arcade-amber border-2 border-fg-base flex flex-col items-center justify-center text-black font-black leading-none arcade-shadow-sm">
                      <span className="text-[8px] font-mono uppercase tracking-tighter opacity-70">CALLED</span>
                      <span className="text-xl sm:text-2xl italic">
                        {lastDrawnNumber !== null ? lastDrawnNumber : '--'}
                      </span>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="text-[10px] font-mono uppercase opacity-50 font-bold">Current Turn</div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-black uppercase text-xs sm:text-sm truncate max-w-[120px] sm:max-w-[150px]">
                        {currentPlayer?.name}
                      </span>
                      {isMyTurn && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-arcade-amber text-black uppercase animate-pulse">
                          YOU
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Turn Action Badge & Server-Authoritative Turn Timer */}
                <div className="flex items-center gap-2">
                  <div 
                    id="turn-timer"
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border-2 font-mono font-bold text-xs transition-colors ${
                      timeLeft <= 5 
                        ? 'border-red-500 bg-red-500/10 text-red-500 animate-pulse' 
                        : 'border-card-border bg-black/5 dark:bg-white/5 text-fg-base'
                    }`}
                    title={isMyTurn ? "Your turn timer" : `${currentPlayer?.name || 'Current player'}'s turn timer`}
                  >
                    <Clock size={14} className={timeLeft <= 5 ? 'text-red-500' : 'opacity-70'} />
                    <span>
                      {timeLeft === 0 ? "Time's up!" : `${timeLeft}s`}
                    </span>
                  </div>

                  {isMyTurn ? (
                    <motion.div 
                      animate={{ scale: [1, 1.05, 1] }} 
                      transition={{ repeat: Infinity, duration: 1.2 }}
                      className="px-2.5 py-1.5 rounded-xl bg-arcade-amber text-black font-black uppercase text-[10px] sm:text-xs tracking-wider flex items-center gap-1 shadow-sm whitespace-nowrap"
                    >
                      <Sparkles size={13} />
                      <span>Pick a Number!</span>
                    </motion.div>
                  ) : (
                    <div className="hidden sm:block px-2.5 py-1 rounded-lg bg-black/5 dark:bg-white/5 border border-card-border text-[10px] font-mono opacity-70 whitespace-nowrap">
                      Waiting...
                    </div>
                  )}
                </div>
              </div>

              {/* Mobile Player Progress Avatars (< lg screens) */}
              <div className="lg:hidden w-full max-w-[360px] sm:max-w-[440px] flex items-center gap-2 overflow-x-auto pb-1 shrink-0">
                {gameState.players.map(p => {
                  const isCurrentTurn = gameState.currentTurn === p.id;
                  const isMe = p.id === myPlayer?.id;

                  return (
                    <div 
                      key={p.id}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-xl border shrink-0 transition-all ${
                        isCurrentTurn 
                          ? 'border-arcade-amber bg-arcade-amber/20 font-bold' 
                          : 'border-card-border bg-panel opacity-80'
                      }`}
                    >
                      <span className={`w-4 h-4 rounded-full text-[9px] font-mono font-bold flex items-center justify-center ${
                        p.isBot ? 'bg-panel text-fg-base' : 'bg-arcade-amber text-black'
                      }`}>
                        {p.name[0].toUpperCase()}
                      </span>
                      <span className="text-[10px] uppercase truncate max-w-[55px]">
                        {isMe ? 'YOU' : p.name}
                      </span>
                      {/* Lines indicator */}
                      <span className="text-[9px] font-mono font-bold text-arcade-crimson">
                        {p.completedLines}L
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* 3. The 5x5 BINGO Board (Perfect fluid responsive fit!) */}
              <div className="w-full flex justify-center items-center my-auto">
                <div className="w-full max-w-[min(90vw,350px)] sm:max-w-[420px] bg-panel border-3 border-fg-base rounded-2xl p-2.5 sm:p-4 arcade-shadow-lg">
                  {/* B-I-N-G-O Headers */}
                  <div className="grid grid-cols-5 gap-1.5 sm:gap-2.5 mb-1.5 sm:mb-2.5">
                    {['B', 'I', 'N', 'G', 'O'].map((letter, idx) => {
                      const isCompleted = (myPlayer?.completedLines || 0) > idx;
                      return (
                        <div 
                          key={letter}
                          className={`aspect-[1.3/1] rounded-lg sm:rounded-xl border-2 flex items-center justify-center text-base sm:text-2xl font-black italic tracking-wider transition-all duration-300 ${
                            isCompleted 
                              ? 'bg-arcade-crimson text-white border-red-700 shadow-md scale-105 glow-crimson' 
                              : 'bg-panel text-fg-base border-fg-base opacity-75'
                          }`}
                        >
                          {letter}
                        </div>
                      );
                    })}
                  </div>

                  {/* 5x5 Cells Grid */}
                  <div className="grid grid-cols-5 gap-1.5 sm:gap-2.5">
                    {myPlayer?.board.map((row, rIdx) => 
                      row.map((num, cIdx) => {
                        const isMarked = myPlayer.marked[rIdx][cIdx];
                        const isDrawn = gameState.drawnNumbers.includes(num);
                        const isLastDrawn = lastDrawnNumber === num;
                        
                        // Can mark if it's already drawn OR if it's my turn (to pick & call it)
                        const canMark = !isMarked && (isDrawn || isMyTurn);

                        return (
                          <button
                            key={`${rIdx}-${cIdx}`}
                            onClick={() => handleCellClick(rIdx, cIdx, num, canMark)}
                            disabled={!canMark}
                            className={`
                              aspect-square rounded-lg sm:rounded-xl border-2 flex items-center justify-center font-black text-sm sm:text-xl transition-all relative
                              ${isMarked 
                                ? 'bg-fg-base text-bg-base border-fg-base shadow-inner scale-[0.98]' 
                                : canMark
                                ? 'bg-panel text-fg-base border-fg-base hover:scale-105 active:scale-95 cursor-pointer hover:border-arcade-amber' 
                                : 'bg-panel text-fg-base border-card-border opacity-60 cursor-not-allowed'
                              }
                              ${!isMarked && isMyTurn && !isDrawn ? 'border-arcade-amber border-dashed bg-arcade-amber/10 animate-pulse' : ''}
                              ${!isMarked && isDrawn ? 'ring-2 ring-arcade-amber ring-offset-1 bg-arcade-amber/20 font-black' : ''}
                              ${isLastDrawn && !isMarked ? 'glow-amber scale-105' : ''}
                            `}
                          >
                            <span>{num}</span>

                            {/* Marked Cross Indicator */}
                            {isMarked && (
                              <motion.div 
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                              >
                                <div className="w-[85%] h-1 bg-arcade-crimson rotate-45 rounded-full" />
                                <div className="w-[85%] h-1 bg-arcade-crimson -rotate-45 absolute rounded-full" />
                              </motion.div>
                            )}

                            {/* Ready to mark beacon indicator */}
                            {!isMarked && isDrawn && (
                              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-arcade-amber animate-ping" />
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Recent Drawn Numbers Ticker */}
              <div className="w-full max-w-[360px] sm:max-w-[440px] flex items-center gap-1.5 px-2 py-1 rounded-xl bg-panel border border-card-border text-[11px] font-mono overflow-x-auto shrink-0">
                <span className="opacity-50 font-bold shrink-0">Recent:</span>
                {recentDrawnNumbers.length > 0 ? (
                  recentDrawnNumbers.map((num, i) => (
                    <span 
                      key={i}
                      className={`px-1.5 py-0.5 rounded font-black shrink-0 ${
                        i === 0 ? 'bg-arcade-amber text-black' : 'bg-black/5 dark:bg-white/5 text-fg-base'
                      }`}
                    >
                      {num}
                    </span>
                  ))
                ) : (
                  <span className="opacity-40 italic">No numbers called yet</span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right Sidebar on Desktop (Chat & Full History) */}
        <aside className="hidden lg:flex w-80 flex-col gap-4 shrink-0">
          <div className="bg-panel border-2 border-fg-base rounded-2xl arcade-shadow flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b-2 border-card-border flex items-center justify-between bg-fg-base text-bg-base">
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-arcade-amber" />
                <h3 className="font-black uppercase text-xs tracking-wider italic">Match Chat</h3>
              </div>
              <span className="text-[10px] font-mono opacity-70">{messages.length} msgs</span>
            </div>

            {/* Chat Messages Log */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 font-mono text-xs bg-bg-base/50">
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center opacity-40 italic text-center p-4">
                  Send a message to your opponents!
                </div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className="p-2 rounded-xl bg-panel border border-card-border">
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
            <form onSubmit={handleSend} className="p-2.5 border-t-2 border-card-border flex gap-2 bg-panel">
              <input 
                type="text"
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                placeholder="Say something..."
                maxLength={100}
                className="flex-1 px-3 py-2 rounded-lg border-2 border-card-border font-mono text-xs focus:outline-none focus:border-arcade-amber bg-panel text-fg-base"
              />
              <button 
                type="submit" 
                className="px-3 py-2 bg-fg-base text-bg-base rounded-lg hover:opacity-90 active:scale-95 transition-all"
              >
                <Send size={14} />
              </button>
            </form>
          </div>
        </aside>
      </main>

      {/* Floating Chat Button for Mobile (< lg screens) */}
      <button 
        onClick={() => { sound.playPop(); setIsChatOpen(!isChatOpen); }}
        className="lg:hidden fixed bottom-4 right-4 w-12 h-12 bg-fg-base text-bg-base rounded-2xl flex items-center justify-center arcade-shadow z-40 active:scale-90 transition-transform"
        title="Open Chat"
        aria-label="Open Chat"
      >
        <MessageSquare size={20} className="text-arcade-amber" />
        {unreadCount > 0 && !isChatOpen && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-arcade-crimson rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-fg-base text-white animate-bounce">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Mobile Chat Slide-over Drawer */}
      <AnimatePresence>
        {isChatOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsChatOpen(false)}
            className="lg:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-end sm:p-4"
          >
            <motion.div 
              initial={{ y: 50, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 50, opacity: 0, scale: 1 }}
              transition={{ type: 'spring', damping: 25, stiffness: 280 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-sm h-[70vh] max-h-[500px] bg-panel border-t-2 sm:border-2 border-fg-base rounded-t-3xl sm:rounded-2xl arcade-shadow-lg flex flex-col overflow-hidden"
            >
              <div className="p-3.5 border-b-2 border-card-border flex items-center justify-between bg-fg-base text-bg-base">
                <div className="flex items-center gap-2">
                  <MessageSquare size={16} className="text-arcade-amber" />
                  <h3 className="font-black uppercase text-xs italic tracking-wider">Live Chat</h3>
                </div>
                <button 
                  onClick={() => setIsChatOpen(false)}
                  className="p-1 rounded hover:bg-white/10 text-xs font-mono uppercase"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2 font-mono text-xs bg-bg-base/50">
                {messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center opacity-40 italic text-center p-4">
                    No chat messages yet.
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

              <form onSubmit={handleSend} className="p-3 border-t-2 border-card-border flex gap-2 bg-panel">
                <input 
                  type="text"
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  placeholder="Type a message..."
                  maxLength={100}
                  className="flex-1 px-3 py-2 rounded-lg border-2 border-card-border font-mono text-xs focus:outline-none focus:border-arcade-amber bg-panel text-fg-base"
                />
                <button 
                  type="submit" 
                  className="px-3.5 py-2 bg-fg-base text-bg-base rounded-lg hover:opacity-90 active:scale-95 transition-all"
                >
                  <Send size={15} />
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History Slide-over Drawer */}
      <AnimatePresence>
        {isHistoryOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex justify-center items-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md bg-panel border-3 border-fg-base rounded-2xl arcade-shadow-lg p-5 flex flex-col max-h-[80vh]"
            >
              <div className="flex items-center justify-between pb-3 mb-3 border-b-2 border-card-border">
                <div className="flex items-center gap-2">
                  <History size={18} className="text-arcade-amber" />
                  <h3 className="font-black uppercase text-sm italic tracking-wider">
                    Drawn Numbers History ({gameState.drawnNumbers.length}/25)
                  </h3>
                </div>
                <button 
                  onClick={() => setIsHistoryOpen(false)}
                  className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {gameState.drawnNumbers.length === 0 ? (
                  <p className="text-center font-mono text-xs opacity-50 py-8">
                    No numbers have been drawn yet in this round.
                  </p>
                ) : (
                  <div className="grid grid-cols-5 gap-2 p-1">
                    {gameState.drawnNumbers.map((num, idx) => (
                      <div 
                        key={idx}
                        className={`aspect-square rounded-xl border-2 flex flex-col items-center justify-center font-black ${
                          idx === gameState.drawnNumbers.length - 1 
                            ? 'border-arcade-amber bg-arcade-amber text-black shadow-sm' 
                            : 'border-card-border bg-panel text-fg-base'
                        }`}
                      >
                        <span className="text-[9px] font-mono opacity-50">#{idx + 1}</span>
                        <span className="text-base sm:text-lg">{num}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

