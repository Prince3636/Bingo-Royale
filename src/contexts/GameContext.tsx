
/// <reference types="vite/client" />
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import { GameState, ChatMessage, ClientToServerEvents, ServerToClientEvents } from '../types/game';

interface GameContextType {
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null;
  gameState: GameState | null;
  messages: ChatMessage[];
  error: string | null;
  playerName: string;
  setPlayerName: (name: string) => void;
  createRoom: (name: string) => void;
  joinRoom: (roomId: string, name: string) => void;
  startGame: () => void;
  setRounds: (rounds: number) => void;
  drawNumber: () => void;
  markNumber: (r: number, c: number) => void;
  setBoard: (board: number[][]) => void;
  sendMessage: (text: string) => void;
  addBot: () => void;
  removePlayer: (playerId: string) => void;
  leaveRoom: () => void;
  setError: (err: string | null) => void;
  showNotification: (title: string, message: string, duration?: number) => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState('');

  useEffect(() => {
    console.log('Initializing socket connection...');
    
    // In AI Studio, the backend is on the same host/port as the frontend.
    // We use window.location.origin to ensure it points to the correct host.
    const newSocket = io(window.location.origin, {
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 20000,
      autoConnect: true
    });

    newSocket.on('connect', () => {
      console.log('Socket connected successfully:', newSocket.id);
      setError(null);
    });

    newSocket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
      setError(`Connection error: ${err.message}`);
    });

    newSocket.on('reconnect_attempt', (attempt) => {
      console.log(`Socket reconnection attempt ${attempt}`);
    });

    newSocket.on('room-update', (state) => {
      console.log('Room updated:', state);
      setGameState(state);
      setError(null);
    });

    newSocket.on('chat-message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    newSocket.on('error', (msg) => {
      setError(msg);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const createRoom = (name: string) => {
    socket?.emit('create-room', name);
  };

  const joinRoom = (roomId: string, name: string) => {
    socket?.emit('join-room', roomId, name);
  };

  const startGame = () => {
    if (gameState) socket?.emit('start-game', gameState.roomId);
  };

  const setRounds = (rounds: number) => {
    if (gameState) socket?.emit('set-rounds', gameState.roomId, rounds);
  };

  const drawNumber = () => {
    if (gameState) socket?.emit('draw-number', gameState.roomId);
  };

  const markNumber = (r: number, c: number) => {
    if (gameState) socket?.emit('mark-number', gameState.roomId, r, c);
  };

  const setBoard = (board: number[][]) => {
    if (gameState) socket?.emit('set-board', gameState.roomId, board);
  };

  const sendMessage = (text: string) => {
    if (gameState) socket?.emit('send-message', gameState.roomId, text);
  };

  const addBot = () => {
    if (gameState) socket?.emit('add-bot', gameState.roomId);
  };

  const removePlayer = (playerId: string) => {
    if (gameState) socket?.emit('remove-player', gameState.roomId, playerId);
  };

  const leaveRoom = () => {
    if (gameState) {
      socket?.emit('leave-room', gameState.roomId);
      setGameState(null);
      setMessages([]);
    }
  };

  const showNotification = (title: string, message: string, duration: number = 8000) => {
    toast.custom((t) => (
      <div
        className={`${
          t.visible ? 'animate-enter' : 'animate-leave'
        } max-w-sm w-full bg-panel border-4 border-fg-base shadow-[8px_8px_0px_0px_rgba(var(--shadow-color),0.2)] pointer-events-auto flex flex-col p-4`}
      >
        <div className="flex justify-between items-start mb-2 border-b-2 border-fg-base pb-2">
          <h3 className="text-lg font-black uppercase italic tracking-tighter text-fg-base">{title}</h3>
          <button
            onClick={() => toast.dismiss(t.id)}
            className="text-fg-base hover:text-red-500 transition-colors"
          >
            [X]
          </button>
        </div>
        <p className="font-mono text-sm text-fg-base">{message}</p>
      </div>
    ), { duration });
  };

  return (
    <GameContext.Provider
      value={{
        socket,
        gameState,
        messages,
        error,
        playerName,
        setPlayerName,
        createRoom,
        joinRoom,
        startGame,
        setRounds,
        drawNumber,
        markNumber,
        setBoard,
        sendMessage,
        addBot,
        removePlayer,
        leaveRoom,
        setError,
        showNotification
      }}
    >
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within a GameProvider');
  return context;
};
