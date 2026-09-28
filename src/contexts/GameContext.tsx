/// <reference types="vite/client" />
import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import { GameState, ChatMessage, ClientToServerEvents, ServerToClientEvents } from '../types/game';

type ConnectionStatus = 'connected' | 'connecting' | 'reconnecting' | 'disconnected';

interface GameContextType {
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null;
  gameState: GameState | null;
  messages: ChatMessage[];
  error: string | null;
  playerName: string;
  playerId: string | null;
  connectionStatus: ConnectionStatus;
  isBackendMissing: boolean;
  setPlayerName: (name: string) => void;
  createRoom: (name: string) => void;
  joinRoom: (roomId: string, name: string) => void;
  reconnectRoom: (roomId: string, playerId: string, token: string) => void;
  setPlayerReady: (ready: boolean) => Promise<{ success: boolean; error?: string }>;
  startGame: () => Promise<{ success: boolean; error?: string }>;
  setRounds: (rounds: number) => void;
  markNumber: (r: number, c: number) => void;
  setBoard: (board: number[][]) => void;
  sendMessage: (text: string) => void;
  addBot: () => Promise<{ success: boolean; error?: string }>;
  kickPlayer: (targetPlayerId: string) => Promise<{ success: boolean; error?: string }>;
  removePlayer: (playerId: string) => void;
  leaveRoom: () => void;
  resetRoom: () => void;
  setError: (err: string | null) => void;
  showNotification: (title: string, message: string, duration?: number) => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

const STORAGE_KEYS = {
  PLAYER_ID: 'bingo_player_id',
  RECONNECT_TOKEN: 'bingo_reconnect_token',
  PLAYER_NAME: 'bingo_player_name',
  ROOM_ID: 'bingo_room_id'
};

export const GameProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [playerName, setPlayerNameState] = useState<string>(() => {
    return sessionStorage.getItem(STORAGE_KEYS.PLAYER_NAME) || '';
  });
  const [playerId, setPlayerId] = useState<string | null>(() => {
    return sessionStorage.getItem(STORAGE_KEYS.PLAYER_ID) || null;
  });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');

  // Check if deployed to production without VITE_SERVER_URL
  const isBackendMissing = Boolean(
    import.meta.env.PROD &&
    (!import.meta.env.VITE_SERVER_URL || import.meta.env.VITE_SERVER_URL.includes('localhost'))
  );

  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);

  const setPlayerName = (name: string) => {
    setPlayerNameState(name);
    sessionStorage.setItem(STORAGE_KEYS.PLAYER_NAME, name);
  };

  useEffect(() => {
    // Resolve Server URL
    const serverUrl = import.meta.env.VITE_SERVER_URL || window.location.origin;

    if (isBackendMissing) {
      console.error(
        '[DEPLOYMENT WARNING] VITE_SERVER_URL is missing or set to localhost in production build! ' +
        'Set VITE_SERVER_URL to your deployed backend URL in Vercel settings.'
      );
    }

    const newSocket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: true
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setConnectionStatus('connected');
      setError(null);

      // Auto-reconnect using saved credentials and secret reconnect token
      const savedRoomId = sessionStorage.getItem(STORAGE_KEYS.ROOM_ID);
      const savedPlayerId = sessionStorage.getItem(STORAGE_KEYS.PLAYER_ID);
      const savedToken = sessionStorage.getItem(STORAGE_KEYS.RECONNECT_TOKEN);

      if (savedRoomId && savedPlayerId && savedToken) {
        console.log(`Re-authenticating session to room ${savedRoomId}`);
        newSocket.emit('reconnect-room', savedRoomId, savedPlayerId, savedToken);
      }
    });

    newSocket.on('connect_error', (err) => {
      setConnectionStatus('connecting');
      setError(`Server connection error: ${err.message}`);
    });

    newSocket.on('reconnect_attempt', () => {
      setConnectionStatus('reconnecting');
    });

    newSocket.on('disconnect', () => {
      setConnectionStatus('disconnected');
    });

    newSocket.on('session-init', (data) => {
      setPlayerId(data.playerId);
      sessionStorage.setItem(STORAGE_KEYS.PLAYER_ID, data.playerId);
      sessionStorage.setItem(STORAGE_KEYS.RECONNECT_TOKEN, data.reconnectToken);
      if (data.roomId) {
        sessionStorage.setItem(STORAGE_KEYS.ROOM_ID, data.roomId);
      }
    });

    newSocket.on('room-update', (state) => {
      setGameState(state);
      setError(null);
      if (state.roomId) {
        sessionStorage.setItem(STORAGE_KEYS.ROOM_ID, state.roomId);
      }
    });

    newSocket.on('chat-message', (msg) => {
      setMessages((prev) => [...prev.slice(-99), msg]);
    });

    // Authoritative single-event notifications for joined and reconnected players
    newSocket.on('player:joined', (data) => {
      toast.success(`${data.player.name} joined the room!`, { id: `joined-${data.player.id}` });
    });

    newSocket.on('player:reconnected', (data) => {
      toast.success(`${data.player.name} reconnected`, { id: `reconnected-${data.player.id}` });
    });

    newSocket.on('room:kicked', (data) => {
      toast.error(data.reason || 'You were removed from the room by the host.', { id: 'kicked-alert', duration: 6000 });
      sessionStorage.removeItem(STORAGE_KEYS.ROOM_ID);
      sessionStorage.removeItem(STORAGE_KEYS.PLAYER_ID);
      sessionStorage.removeItem(STORAGE_KEYS.RECONNECT_TOKEN);
      setPlayerId(null);
      setGameState(null);
      setMessages([]);
    });

    newSocket.on('game:turn-timeout', (data) => {
      toast(`${data.name}'s turn timed out!`, { icon: '⏰', id: 'turn-timeout', duration: 2500 });
    });

    newSocket.on('error', (msg) => {
      setError(msg);
      toast.error(msg, { id: 'game-error', duration: 4000 });
    });

    return () => {
      newSocket.disconnect();
      socketRef.current = null;
    };
  }, [isBackendMissing]);

  const createRoom = (name: string) => {
    // Reset any old session keys when creating a fresh room
    sessionStorage.removeItem(STORAGE_KEYS.ROOM_ID);
    sessionStorage.removeItem(STORAGE_KEYS.PLAYER_ID);
    sessionStorage.removeItem(STORAGE_KEYS.RECONNECT_TOKEN);
    socketRef.current?.emit('create-room', name);
  };

  const joinRoom = (roomId: string, name: string) => {
    const cleanRoomId = roomId.trim().toUpperCase();
    const savedRoomId = sessionStorage.getItem(STORAGE_KEYS.ROOM_ID);
    const isSameRoom = savedRoomId === cleanRoomId;
    
    // Only pass saved credentials if reconnecting to the same room
    const savedPlayerId = isSameRoom ? sessionStorage.getItem(STORAGE_KEYS.PLAYER_ID) || undefined : undefined;
    const savedToken = isSameRoom ? sessionStorage.getItem(STORAGE_KEYS.RECONNECT_TOKEN) || undefined : undefined;
    socketRef.current?.emit('join-room', cleanRoomId, name, savedPlayerId, savedToken);
  };

  const reconnectRoom = (roomId: string, reconnectId: string, token: string) => {
    socketRef.current?.emit('reconnect-room', roomId, reconnectId, token);
  };

  const setPlayerReady = (ready: boolean): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      if (!gameState || !socketRef.current) {
        resolve({ success: false, error: 'Not connected to room' });
        return;
      }
      socketRef.current.emit('player:set-ready', { roomId: gameState.roomId, ready }, (res) => {
        if (!res?.success) {
          toast.error(res?.error || 'Failed to update ready status', { id: 'ready-err' });
          resolve({ success: false, error: res?.error });
        } else {
          resolve({ success: true });
        }
      });
    });
  };

  const startGame = (): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      if (!gameState || !socketRef.current) {
        resolve({ success: false, error: 'Not connected' });
        return;
      }
      socketRef.current.emit('game:start', gameState.roomId, (res) => {
        if (!res?.success) {
          toast.error(res?.error || 'Cannot start game', { id: 'start-err' });
          resolve({ success: false, error: res?.error });
        } else {
          resolve({ success: true });
        }
      });
    });
  };

  const setRounds = (rounds: number) => {
    if (gameState) socketRef.current?.emit('set-rounds', gameState.roomId, rounds);
  };

  const markNumber = (r: number, c: number) => {
    if (gameState) socketRef.current?.emit('mark-number', gameState.roomId, r, c);
  };

  const setBoard = (board: number[][]) => {
    if (gameState) socketRef.current?.emit('set-board', gameState.roomId, board);
  };

  const sendMessage = (text: string) => {
    if (gameState) socketRef.current?.emit('send-message', gameState.roomId, text);
  };

  const addBot = (): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      if (!gameState || !socketRef.current) {
        resolve({ success: false, error: 'Not connected' });
        return;
      }
      socketRef.current.emit('room:add-bot', gameState.roomId, (res) => {
        if (!res?.success) {
          toast.error(res?.error || 'Failed to add bot', { id: 'bot-err' });
          resolve({ success: false, error: res?.error });
        } else {
          toast.success('Bot added to room! ✓', { id: 'bot-added', icon: '🤖' });
          resolve({ success: true });
        }
      });
    });
  };

  const kickPlayer = (targetPlayerId: string): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      if (!gameState || !socketRef.current) {
        resolve({ success: false, error: 'Not connected' });
        return;
      }
      socketRef.current.emit('room:kick-player', { roomId: gameState.roomId, targetPlayerId }, (res) => {
        if (!res?.success) {
          toast.error(res?.error || 'Failed to remove player', { id: 'kick-err' });
          resolve({ success: false, error: res?.error });
        } else {
          toast.success('Player removed from room', { id: 'kick-success' });
          resolve({ success: true });
        }
      });
    });
  };

  const removePlayer = (targetPlayerId: string) => {
    kickPlayer(targetPlayerId);
  };

  const leaveRoom = () => {
    if (gameState) {
      socketRef.current?.emit('leave-room', gameState.roomId);
      sessionStorage.removeItem(STORAGE_KEYS.ROOM_ID);
      sessionStorage.removeItem(STORAGE_KEYS.PLAYER_ID);
      sessionStorage.removeItem(STORAGE_KEYS.RECONNECT_TOKEN);
      setPlayerId(null);
      setGameState(null);
      setMessages([]);
    }
  };

  const resetRoom = () => {
    if (gameState) {
      socketRef.current?.emit('reset-room', gameState.roomId);
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
            className="text-fg-base hover:text-red-500 transition-colors font-bold text-xs"
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
        playerId,
        connectionStatus,
        isBackendMissing,
        setPlayerName,
        createRoom,
        joinRoom,
        reconnectRoom,
        setPlayerReady,
        startGame,
        setRounds,
        markNumber,
        setBoard,
        sendMessage,
        addBot,
        kickPlayer,
        removePlayer,
        leaveRoom,
        resetRoom,
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
