
import React, { useState, useRef, useEffect } from 'react';
import { useGame } from '../contexts/GameContext';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Trophy, MessageSquare, Hash, ChevronRight, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';

export const GamePage: React.FC = () => {
  const { gameState, messages, sendMessage, drawNumber, markNumber, socket, leaveRoom, showNotification } = useGame();
  const [chatText, setChatText] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [lastReadMessageCount, setLastReadMessageCount] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (gameState?.winner) {
      if (gameState.status === 'finished' && gameState.overallWinner) {
        showNotification('GAME OVER!', `The overall winner is ${gameState.overallWinner.name} with ${gameState.overallWinner.score} wins!`, 9999999);
      } else {
        showNotification('BINGO!', `${gameState.winner.name} won this round!`, 9999999);
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

  const myPlayer = gameState.players.find(p => p.id === socket?.id);
  const isMyTurn = gameState.currentTurn === socket?.id;
  const currentPlayer = gameState.players.find(p => p.id === gameState.currentTurn);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim()) return;
    sendMessage(chatText);
    setChatText('');
  };

  const confirmExit = () => {
    toast.custom((t) => (
      <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-sm w-full bg-panel border-4 border-fg-base shadow-[8px_8px_0px_0px_rgba(var(--shadow-color),0.2)] pointer-events-auto flex flex-col p-4`}>
        <h3 className="text-lg font-black uppercase italic tracking-tighter text-fg-base mb-2 border-b-2 border-fg-base pb-2">Quit Game?</h3>
        <p className="font-mono text-sm text-fg-base mb-4">Are you sure you want to quit? You will be removed from the game.</p>
        <div className="flex gap-2">
          <button onClick={() => toast.dismiss(t.id)} className="flex-1 py-2 border-2 border-fg-base font-bold uppercase text-xs">Stay</button>
          <button onClick={() => { toast.dismiss(t.id); leaveRoom(); }} className="flex-1 py-2 bg-red-500 text-white border-2 border-fg-base font-bold uppercase text-xs">Quit</button>
        </div>
      </div>
    ), { duration: 9999999 });
  };

  return (
    <div className="min-h-screen bg-bg-base flex flex-col font-sans">
      {/* Header */}
      <header className="bg-fg-base text-bg-base p-3 sm:p-4 flex justify-between items-center border-b-4 border-fg-base sticky top-0 z-30">
        <div className="flex items-center gap-2 sm:gap-4">
          <h1 className="text-lg sm:text-2xl font-black italic uppercase tracking-tighter shrink-0">Bingo Royale</h1>
          <div className="flex items-center gap-2 px-2 py-0.5 sm:px-3 sm:py-1 bg-bg-base text-fg-base font-mono text-[10px] sm:text-xs font-bold uppercase">
            R: {gameState.currentRound}/{gameState.targetRounds}
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-1 sm:gap-2 font-bold uppercase text-[10px] sm:text-sm">
            <Hash size={14} className="sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Drawn:</span> {gameState.drawnNumbers.length}
          </div>
          <button onClick={confirmExit} className="flex items-center gap-1 text-[10px] sm:text-xs uppercase font-bold hover:underline">
            <LogOut size={12} className="sm:w-3.5 sm:h-3.5" /> Quit
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row p-4 gap-6 overflow-hidden relative">
        {/* Left: Players */}
        <div className="w-full lg:w-64 flex flex-col gap-4 sm:gap-6">
          {/* Player List */}
            <div className="bg-panel border-2 border-fg-base p-3 sm:p-4 shadow-[4px_4px_0px_0px_rgba(var(--shadow-color),1)]">
              <h3 className="font-bold uppercase text-xs sm:text-sm mb-3 sm:mb-4 border-b-2 border-fg-base pb-1 italic">Players</h3>
              <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
                {gameState.players.map(p => (
                  <div 
                    key={p.id} 
                    className={`flex items-center justify-between p-2 border-2 transition-all shrink-0 w-[140px] lg:w-full ${gameState.currentTurn === p.id ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/30' : 'border-transparent'}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border border-fg-base flex items-center justify-center text-[8px] sm:text-[10px] font-bold ${p.isBot ? 'bg-gray-200 dark:bg-gray-700' : 'bg-yellow-400 text-black'}`}>
                        {p.name[0].toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <span className={`text-[10px] sm:text-sm font-bold uppercase truncate max-w-[60px] sm:max-w-[80px] ${p.id === socket?.id ? 'underline' : ''}`}>{p.name}</span>
                        <span className="text-[8px] font-mono opacity-50">{p.isBot ? 'BOT' : 'PLAYER'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-2">
                      <div className="flex flex-col items-end">
                        {p.id === socket?.id && (
                          <div className="flex gap-0.5 sm:gap-1 mb-0.5 sm:mb-1">
                            {['B', 'I', 'N', 'G', 'O'].map((letter, i) => {
                              const isLit = p.completedLines > i;
                              return (
                                <div 
                                  key={letter} 
                                  className={`w-3 h-3 sm:w-4 sm:h-4 border border-fg-base flex items-center justify-center text-[8px] sm:text-[10px] font-bold ${isLit ? 'bg-red-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'}`} 
                                >
                                  {letter}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <span className="text-[8px] sm:text-[10px] font-bold text-yellow-600">Wins: {p.score}</span>
                      </div>
                      {gameState.currentTurn === p.id && <motion.div animate={{ opacity: [0, 1] }} transition={{ repeat: Infinity }} className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-yellow-400 rounded-full" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
        </div>

        {/* Chat Toggle Button */}
        <button 
          onClick={() => setIsChatOpen(!isChatOpen)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-fg-base text-bg-base rounded-full flex items-center justify-center shadow-[4px_4px_0px_0px_rgba(var(--shadow-color),0.2)] z-40 hover:scale-110 transition-transform"
        >
          <MessageSquare size={24} />
          {unreadCount > 0 && !isChatOpen && (
            <div className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-fg-base text-white">
              {unreadCount}
            </div>
          )}
        </button>

        {/* Chat Overlay */}
        <AnimatePresence>
          {isChatOpen && (
            <motion.div 
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              className="fixed top-0 right-0 h-full w-full max-w-sm bg-panel border-l-4 border-fg-base shadow-2xl z-50 flex flex-col"
            >
              <div className="p-4 border-b-2 border-fg-base flex items-center justify-between bg-fg-base text-bg-base">
                <div className="flex items-center gap-2">
                  <MessageSquare size={18} />
                  <h3 className="font-bold uppercase text-sm italic">Chat Room</h3>
                </div>
                <button onClick={() => setIsChatOpen(false)} className="text-xs font-mono uppercase hover:underline">Close [X]</button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-sm bg-bg-base">
                {messages.map((m, idx) => (
                  <div key={m.id} className="break-words p-2 bg-panel border-2 border-fg-base text-fg-base">
                    <span className="font-bold text-fg-base uppercase text-xs block mb-1">{m.sender}</span>
                    <span className="opacity-90">{m.text}</span>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <form onSubmit={handleSend} className="p-4 border-t-2 border-fg-base flex gap-2 bg-panel">
                <input 
                  type="text"
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  placeholder="TYPE MESSAGE..."
                  className="flex-1 p-3 font-mono text-sm border-2 border-fg-base focus:outline-none focus:bg-yellow-50 dark:focus:bg-yellow-900 bg-panel text-fg-base"
                />
                <button type="submit" className="p-3 bg-fg-base text-bg-base hover:opacity-90 transition-all">
                  <Send size={18} />
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Center: Board & Controls */}
        <div className="flex-1 flex flex-col items-center justify-center gap-6 overflow-y-auto py-4 sm:py-8">
          
          {gameState.status === 'finished' && gameState.overallWinner ? (
            <div className="w-full max-w-xl bg-panel border-4 border-fg-base p-8 sm:p-12 text-center shadow-[12px_12px_0px_0px_rgba(var(--shadow-color),1)] animate-in fade-in zoom-in duration-500">
              <div className="w-20 h-20 sm:w-24 sm:h-24 bg-yellow-400 border-4 border-fg-base mx-auto flex items-center justify-center mb-6">
                <Trophy size={40} className="text-black sm:w-12 sm:h-12" />
              </div>
              <h2 className="text-3xl sm:text-5xl font-black italic uppercase tracking-tighter mb-2 text-fg-base">CHAMPION!</h2>
              <p className="text-xl sm:text-2xl font-bold uppercase mb-2 text-fg-base">{gameState.overallWinner.name}</p>
              <p className="font-mono text-sm uppercase opacity-50 mb-8 text-fg-base">Total Wins: {gameState.overallWinner.score}</p>
              <button 
                onClick={leaveRoom}
                className="w-full py-4 bg-fg-base text-bg-base font-black uppercase tracking-widest hover:opacity-90 transition-all border-2 border-transparent hover:border-fg-base"
              >
                Back to Menu
              </button>
            </div>
          ) : (
            <>
              {/* Last Called Number */}
              <div className="w-full max-w-xl bg-panel border-2 border-fg-base p-4 shadow-[4px_4px_0px_0px_rgba(var(--shadow-color),1)] text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-yellow-400" />
                <h3 className="text-[10px] sm:text-xs font-mono uppercase opacity-50 mb-1 italic">Last Called Number</h3>
                <div className="text-6xl sm:text-8xl font-black italic text-fg-base leading-none py-2">
                  {gameState.drawnNumbers.length > 0 ? gameState.drawnNumbers[gameState.drawnNumbers.length - 1] : '--'}
                </div>
                {gameState.drawnNumbers.length > 0 && (
                  <div className="text-[10px] font-mono uppercase opacity-30 mt-1">
                    Total Called: {gameState.drawnNumbers.length}
                  </div>
                )}
              </div>

              {/* Turn Indicator */}
              <div className="w-full max-w-xl flex items-center justify-between bg-panel border-2 border-fg-base p-3 sm:p-4 shadow-[4px_4px_0px_0px_rgba(var(--shadow-color),1)]">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="text-[10px] sm:text-xs font-mono uppercase opacity-50">Turn</div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-fg-base text-bg-base flex items-center justify-center font-bold italic text-xs sm:text-base">
                      {currentPlayer?.name[0].toUpperCase()}
                    </div>
                    <span className="font-black uppercase italic text-sm sm:text-xl truncate max-w-[100px] sm:max-w-none">{currentPlayer?.name}</span>
                  </div>
                </div>
                {isMyTurn && gameState.status === 'playing' && (
                  <div className="flex items-center gap-2 text-yellow-600 font-bold animate-pulse">
                    <ChevronRight size={18} /> Your Turn: Pick a number!
                  </div>
                )}
              </div>

              {/* Bingo Board */}
              <div className="relative w-full flex justify-center px-2">
                 <div className="grid grid-cols-5 gap-1.5 sm:gap-4 p-3 sm:p-4 bg-panel border-4 border-fg-base shadow-[8px_8px_0px_0px_rgba(var(--shadow-color),1)] sm:shadow-[12px_12px_0px_0px_rgba(var(--shadow-color),1)]">
                    {/* Headers */}
                    {['B', 'I', 'N', 'G', 'O'].map((letter, idx) => {
                      const isCompleted = (myPlayer?.completedLines || 0) > idx;
                      return (
                        <div 
                          key={letter} 
                          className={`w-10 h-10 sm:w-16 sm:h-16 flex items-center justify-center text-xl sm:text-3xl font-black italic border-b-4 border-fg-base transition-all ${isCompleted ? 'bg-red-500 text-white border-red-700' : 'text-fg-base'}`}
                        >
                          {letter}
                        </div>
                      );
                    })}
                    {/* Cells */}
                    {myPlayer?.board.map((row, rIdx) => 
                      row.map((num, cIdx) => {
                        const isMarked = myPlayer.marked[rIdx][cIdx];
                        const isDrawn = gameState.drawnNumbers.includes(num);
                        const isLastDrawn = gameState.drawnNumbers[gameState.drawnNumbers.length - 1] === num;
                        
                        // Can mark if it's already drawn OR if it's my turn (to call it)
                        const canMark = !isMarked && (isDrawn || isMyTurn);
                        
                        return (
                          <button 
                            key={`${rIdx}-${cIdx}`}
                            onClick={() => markNumber(rIdx, cIdx)}
                            disabled={!canMark}
                            className={`
                              w-10 h-10 sm:w-16 sm:h-16 border-2 border-fg-base flex items-center justify-center font-bold text-base sm:text-xl transition-all relative
                              ${isMarked ? 'bg-fg-base text-bg-base cursor-default' : 'bg-panel text-fg-base cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800'}
                              ${isLastDrawn ? 'ring-2 sm:ring-4 ring-yellow-400 ring-inset' : ''}
                              ${!isMarked && isMyTurn && !isDrawn ? 'border-yellow-400 border-dashed' : ''}
                            `}
                          >
                            {num}
                            {isMarked && (
                              <motion.div 
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                              >
                                <div className="w-full h-0.5 sm:h-1 bg-red-500 rotate-45 opacity-50" />
                                <div className="w-full h-0.5 sm:h-1 bg-red-500 -rotate-45 absolute opacity-50" />
                              </motion.div>
                            )}
                          </button>
                        );
                      })
                    )}
                 </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};
