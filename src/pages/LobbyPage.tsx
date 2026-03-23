
import React, { useState, useEffect } from 'react';
import { useGame } from '../contexts/GameContext';
import { motion } from 'motion/react';
import { Users, Play, UserPlus, LogOut, Copy, RefreshCw, Edit3, X } from 'lucide-react';
import { generateBingoBoard } from '../utils/bingo';
import toast from 'react-hot-toast';

export const LobbyPage: React.FC = () => {
  const { gameState, startGame, addBot, removePlayer, leaveRoom, socket, setBoard, setRounds, showNotification } = useGame();
  const [localBoard, setLocalBoard] = useState<number[][]>(
    Array(5).fill(null).map(() => Array(5).fill(0))
  );

  const myPlayer = gameState?.players.find(p => p.id === socket?.id);

  useEffect(() => {
    showNotification('Welcome!', `You have joined room ${gameState.roomId}. Fill your board to start!`);
  }, []);

  if (!gameState) return null;

  const isHost = gameState.players.find(p => p.isHost)?.id === socket?.id;

  const handleCellClick = (r: number, c: number) => {
    const currentVal = localBoard[r][c];
    if (currentVal !== 0) {
      // Clear cell
      const newBoard = localBoard.map((row, rIdx) => 
        row.map((cell, cIdx) => (rIdx === r && cIdx === c ? 0 : cell))
      );
      setLocalBoard(newBoard);
      setBoard(newBoard);
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
        setBoard(newBoard);
        break;
      }
    }
  };

  const fillRandom = () => {
    const usedNumbers = localBoard.flat().filter(n => n !== 0);
    const remainingNumbers = Array.from({ length: 25 }, (_, i) => i + 1).filter(n => !usedNumbers.includes(n));
    
    // Shuffle remaining
    for (let i = remainingNumbers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remainingNumbers[i], remainingNumbers[j]] = [remainingNumbers[j], remainingNumbers[i]];
    }

    let remainingIdx = 0;
    const newBoard = localBoard.map(row => 
      row.map(cell => {
        if (cell === 0 && remainingIdx < remainingNumbers.length) {
          return remainingNumbers[remainingIdx++];
        }
        return cell;
      })
    );
    
    setLocalBoard(newBoard);
    setBoard(newBoard);
  };

  const clearBoard = () => {
    const emptyBoard = Array(5).fill(null).map(() => Array(5).fill(0));
    setLocalBoard(emptyBoard);
    setBoard(emptyBoard);
  };

  const isBoardFull = localBoard.flat().every(n => n !== 0);

  const copyRoomId = () => {
    navigator.clipboard.writeText(gameState.roomId);
    showNotification('Copied!', 'Room ID has been copied to your clipboard.', 3000);
  };

  const confirmExit = () => {
    toast.custom((t) => (
      <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-sm w-full bg-panel border-4 border-fg-base shadow-[8px_8px_0px_0px_rgba(var(--shadow-color),0.2)] pointer-events-auto flex flex-col p-4`}>
        <h3 className="text-lg font-black uppercase italic tracking-tighter text-fg-base mb-2 border-b-2 border-fg-base pb-2">Leave Room?</h3>
        <p className="font-mono text-sm text-fg-base mb-4">Are you sure you want to leave this room? Your progress will be lost.</p>
        <div className="flex gap-2">
          <button onClick={() => toast.dismiss(t.id)} className="flex-1 py-2 border-2 border-fg-base font-bold uppercase text-xs">Stay</button>
          <button onClick={() => { toast.dismiss(t.id); leaveRoom(); }} className="flex-1 py-2 bg-red-500 text-white border-2 border-fg-base font-bold uppercase text-xs">Leave</button>
        </div>
      </div>
    ), { duration: 9999999 });
  };

  return (
    <div className="min-h-screen bg-bg-base p-4 md:p-8 font-sans relative">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 sm:mb-12 gap-4">
          <div className="w-full sm:w-auto">
            <div className="flex items-center gap-2 text-[10px] sm:text-xs font-mono uppercase opacity-50 mb-1">
              <Users size={14} /> Lobby
            </div>
            <h1 className="text-3xl sm:text-5xl font-black tracking-tighter uppercase italic break-words">Room: {gameState.roomId}</h1>
          </div>
          <div className="flex w-full sm:w-auto gap-2 sm:gap-3">
            <button 
              onClick={copyRoomId}
              className="flex-1 sm:flex-none p-3 sm:p-4 border-2 border-fg-base bg-panel hover:bg-gray-50 dark:hover:bg-gray-800 transition-all flex items-center justify-center gap-2 font-bold uppercase text-xs sm:text-sm"
            >
              <Copy size={16} /> <span className="sm:inline">Copy ID</span>
            </button>
            <button 
              onClick={confirmExit}
              className="flex-1 sm:flex-none p-3 sm:p-4 border-2 border-fg-base bg-red-500 text-white hover:bg-red-600 transition-all flex items-center justify-center gap-2 font-bold uppercase text-xs sm:text-sm shadow-[4px_4px_0px_0px_rgba(var(--shadow-color),1)]"
            >
              <LogOut size={16} /> <span className="sm:inline">Exit</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <h2 className="text-xl font-bold uppercase italic border-b-2 border-fg-base pb-2">Players ({gameState.players.length}/5)</h2>
            <div className="space-y-3">
              {gameState.players.map((player, idx) => (
                <motion.div 
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: idx * 0.1 }}
                  key={player.id}
                  className={`p-4 border-2 border-fg-base flex justify-between items-center ${player.isBot ? 'bg-gray-100 dark:bg-gray-800 italic' : 'bg-panel'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full border-2 border-fg-base flex items-center justify-center font-bold ${player.isBot ? 'bg-gray-300 dark:bg-gray-700' : 'bg-yellow-400 text-black'}`}>
                      {player.name[0].toUpperCase()}
                    </div>
                    <span className="font-bold uppercase tracking-tight">
                      {player.name} {player.id === socket?.id && '(YOU)'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {player.isHost && (
                      <span className="text-[10px] font-mono bg-fg-base text-bg-base px-2 py-1 uppercase">Host</span>
                    )}
                    {isHost && !player.isHost && (
                      <button 
                        onClick={() => removePlayer(player.id)}
                        className="p-1 hover:bg-red-100 dark:hover:bg-red-900 text-red-500 transition-all rounded"
                        title="Remove Player"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
              {Array.from({ length: 5 - gameState.players.length }).map((_, idx) => (
                <div key={`empty-${idx}`} className="p-4 border-2 border-dashed border-fg-base opacity-30 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-dashed border-fg-base" />
                  <span className="font-mono text-sm uppercase">Waiting for player...</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col justify-center gap-6">
            {/* Board Setup */}
            <div className="p-6 bg-panel border-2 border-fg-base shadow-[8px_8px_0px_0px_rgba(var(--shadow-color),1)]">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold uppercase italic">Setup Your Board</h3>
                <div className="flex gap-2">
                  <button 
                    onClick={clearBoard}
                    className="flex items-center gap-1 text-[10px] font-mono uppercase bg-red-50 dark:bg-red-900/30 px-2 py-1 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 border border-red-200 dark:border-red-800"
                  >
                    Clear
                  </button>
                  <button 
                    onClick={fillRandom}
                    className="flex items-center gap-1 text-[10px] font-mono uppercase bg-gray-100 dark:bg-gray-800 px-2 py-1 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600"
                  >
                    <RefreshCw size={12} /> {localBoard.flat().some(n => n !== 0) ? 'Fill Remaining' : 'Randomize'}
                  </button>
                </div>
              </div>
              
              <div className="grid grid-cols-5 gap-1 sm:gap-2 mb-4">
                {localBoard.map((row, rIdx) => 
                  row.map((num, cIdx) => (
                    <button
                      key={`${rIdx}-${cIdx}`}
                      onClick={() => handleCellClick(rIdx, cIdx)}
                      className={`aspect-square border-2 border-fg-base flex items-center justify-center font-bold text-sm sm:text-lg transition-all ${num !== 0 ? 'bg-fg-base text-bg-base' : 'bg-panel hover:bg-yellow-50 dark:hover:bg-yellow-900/30'}`}
                    >
                      {num !== 0 ? num : ''}
                    </button>
                  ))
                )}
              </div>

              <div className="bg-gray-50 dark:bg-gray-800 p-3 border border-dashed border-gray-300 dark:border-gray-600 text-center">
                <p className="text-[10px] font-mono uppercase opacity-70">
                  {isBoardFull 
                    ? "Board Complete! Ready to play." 
                    : `Click empty boxes to fill numbers 1-25 in order. (${localBoard.flat().filter(n => n !== 0).length}/25)`}
                </p>
              </div>
            </div>

            <div className="p-6 bg-panel border-2 border-fg-base shadow-[8px_8px_0px_0px_rgba(var(--shadow-color),1)]">
              <h3 className="font-bold uppercase mb-4 italic">Game Settings</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-mono uppercase opacity-50 mb-2">Number of Rounds</label>
                  <div className="flex gap-2">
                    {[1, 3, 5].map(r => (
                      <button
                        key={r}
                        onClick={() => isHost && setRounds(r)}
                        disabled={!isHost}
                        className={`flex-1 py-2 border-2 border-fg-base font-bold transition-all ${gameState.targetRounds === r ? 'bg-fg-base text-bg-base' : 'bg-panel hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                      >
                        {r} {r === 1 ? 'Round' : 'Rounds'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 bg-panel border-2 border-fg-base shadow-[8px_8px_0px_0px_rgba(var(--shadow-color),1)]">
              <h3 className="font-bold uppercase mb-4 italic">Game Rules</h3>
              <ul className="space-y-2 font-mono text-sm">
                <li>• 5x5 Grid with numbers 1-25</li>
                <li>• Complete 5 lines (Row/Col/Diag) to win a round</li>
                <li>• Best of {gameState.targetRounds} rounds wins the game!</li>
                <li>• Manual marking: Click drawn numbers on your board!</li>
              </ul>
            </div>

            {isHost && (
              <div className="space-y-4">
                <button 
                  onClick={addBot}
                  disabled={gameState.players.length >= 5}
                  className="w-full py-4 border-2 border-fg-base bg-panel hover:bg-gray-50 dark:hover:bg-gray-800 transition-all flex items-center justify-center gap-2 font-bold uppercase tracking-widest disabled:opacity-50"
                >
                  <UserPlus size={20} /> Add Bot
                </button>
                <button 
                  onClick={startGame}
                  disabled={gameState.players.length < 2 || !isBoardFull}
                  className="w-full py-6 bg-fg-base text-bg-base hover:opacity-90 transition-all flex items-center justify-center gap-3 font-black text-2xl uppercase tracking-widest shadow-[8px_8px_0px_0px_rgba(var(--shadow-color),0.3)] disabled:opacity-50"
                >
                  <Play size={24} fill="currentColor" /> Start Game
                </button>
                {(gameState.players.length < 2 || !isBoardFull) && (
                  <p className="text-center font-mono text-xs uppercase opacity-50 italic">
                    {gameState.players.length < 2 ? "Need at least 2 players" : "Fill your board to start"}
                  </p>
                )}
              </div>
            )}
            {!isHost && (
              <div className="p-6 bg-yellow-100 dark:bg-yellow-900/30 border-2 border-fg-base text-center">
                <p className="font-bold uppercase italic">Waiting for host to start...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
