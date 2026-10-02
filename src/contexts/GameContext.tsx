import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { GameState, ChatMessage, ServerToClientEvents, ClientToServerEvents, ConnectionStatus } from '../types/game';
import toast from 'react-hot-toast';
import { fastCache } from '../utils/cache';
import { isNative, onNetworkChange, onAppStateChange } from '../utils/mobile';

interface GameContextType {
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null;
  gameState: GameState | null;
  messages: ChatMessage[];
  error: string | null;
  playerName: string;
  playerId: string | null;
  connectionStatus: ConnectionStatus;
  isBackendMissing: boolean;
  serverUrl: string;
  setCustomServerUrl: (url: string) => void;
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
  ROOM_ID: 'bingo_room_id',
  SERVER_URL: 'bingo_custom_server_url'
};

export const GameProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setErrorState] = useState<string | null>(null);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setError = (err: string | null) => {
    setErrorState(err);
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = null;
    }
    if (err) {
      errorTimeoutRef.current = setTimeout(() => {
        setErrorState(null);
      }, 5000);
    }
  };

  // Fast Memory + Persistent Cache for Player details
  const [playerName, setPlayerNameState] = useState<string>(() => {
    return fastCache.get<string>(STORAGE_KEYS.PLAYER_NAME) || sessionStorage.getItem(STORAGE_KEYS.PLAYER_NAME) || '';
  });
  const [playerId, setPlayerId] = useState<string | null>(() => {
    return fastCache.get<string>(STORAGE_KEYS.PLAYER_ID) || sessionStorage.getItem(STORAGE_KEYS.PLAYER_ID) || null;
  });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');

  // Smart Server URL resolution
  const [currentServerUrl, setCurrentServerUrl] = useState<string>(() => {
    const cached = fastCache.get<string>(STORAGE_KEYS.SERVER_URL);
    if (cached) return cached;
    if (import.meta.env.VITE_SERVER_URL) return import.meta.env.VITE_SERVER_URL;
    if (isNative) {
      // In native Android APK, default fallback if none provided
      return 'https://bingo-royale.onrender.com';
    }
    return window.location.origin;
  });

  const isBackendMissing = Boolean(
    import.meta.env.PROD &&
    !fastCache.get<string>(STORAGE_KEYS.SERVER_URL) &&
    (!import.meta.env.VITE_SERVER_URL || import.meta.env.VITE_SERVER_URL.includes('localhost')) &&
    !isNative
  );

  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);

  const setPlayerName = (name: string) => {
    setPlayerNameState(name);
    fastCache.set(STORAGE_KEYS.PLAYER_NAME, name);
    sessionStorage.setItem(STORAGE_KEYS.PLAYER_NAME, name);
  };

  const setCustomServerUrl = (url: string) => {
    const clean = url.trim().replace(/\/$/, '');
    fastCache.set(STORAGE_KEYS.SERVER_URL, clean);
    setCurrentServerUrl(clean);
  };

  useEffect(() => {
    const serverUrl = currentServerUrl;

    if (isBackendMissing) {
      console.warn(
        '[DEPLOYMENT WARNING] VITE_SERVER_URL is missing or set to localhost in production build!'
      );
    }

    const newSocket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 50,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 30000,
      autoConnect: true
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setConnectionStatus('connected');
      setError(null);

      // Auto-reconnect using saved credentials from fast cache
      const savedRoomId = fastCache.get<string>(STORAGE_KEYS.ROOM_ID) || sessionStorage.getItem(STORAGE_KEYS.ROOM_ID);
      const savedPlayerId = fastCache.get<string>(STORAGE_KEYS.PLAYER_ID) || sessionStorage.getItem(STORAGE_KEYS.PLAYER_ID);
      const savedToken = fastCache.get<string>(STORAGE_KEYS.RECONNECT_TOKEN) || sessionStorage.getItem(STORAGE_KEYS.RECONNECT_TOKEN);

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
      fastCache.set(STORAGE_KEYS.PLAYER_ID, data.playerId);
      fastCache.set(STORAGE_KEYS.RECONNECT_TOKEN, data.reconnectToken);
      sessionStorage.setItem(STORAGE_KEYS.PLAYER_ID, data.playerId);
      sessionStorage.setItem(STORAGE_KEYS.RECONNECT_TOKEN, data.reconnectToken);

      if (data.roomId) {
        fastCache.set(STORAGE_KEYS.ROOM_ID, data.roomId);
        sessionStorage.setItem(STORAGE_KEYS.ROOM_ID, data.roomId);
      }
    });

    newSocket.on('room-update', (state) => {
      setGameState(state);
      setError(null);
      if (state.roomId) {
        fastCache.set(STORAGE_KEYS.ROOM_ID, state.roomId);
        sessionStorage.setItem(STORAGE_KEYS.ROOM_ID, state.roomId);
      }
    });

    newSocket.on('chat-message', (msg) => {
      setMessages((prev) => [...prev.slice(-99), msg]);
    });

    newSocket.on('player:joined', (data) => {
      toast.success(`${data.player.name} joined the room!`, { id: `joined-${data.player.id}` });
    });

    newSocket.on('player:reconnected', (data) => {
      toast.success(`${data.player.name} reconnected`, { id: `reconnected-${data.player.id}` });
    });

    newSocket.on('room:kicked', (data) => {
      toast.error(data.reason || 'You were removed from the room by the host.', { id: 'kicked-alert', duration: 6000 });
      fastCache.remove(STORAGE_KEYS.ROOM_ID);
      fastCache.remove(STORAGE_KEYS.PLAYER_ID);
      fastCache.remove(STORAGE_KEYS.RECONNECT_TOKEN);
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

    // Mobile network listener to auto-reconnect when device comes back online
    const cleanupNetwork = onNetworkChange(({ connected }) => {
      if (connected) {
        if (!newSocket.connected) {
          setConnectionStatus('reconnecting');
          newSocket.connect();
        }
      } else {
        setConnectionStatus('disconnected');
        toast.error('No internet connection. Waiting for network...', { id: 'network-offline' });
      }
    });

    // Mobile app lifecycle listener: auto-reconnect when app returns from background or unlock
    const cleanupAppState = onAppStateChange((isActive) => {
      if (isActive && !newSocket.connected) {
        setConnectionStatus('reconnecting');
        newSocket.connect();
      }
    });

    return () => {
      cleanupNetwork();
      cleanupAppState();
      newSocket.disconnect();
      socketRef.current = null;
    };
  }, [currentServerUrl, isBackendMissing]);

  const createRoom = (name: string) => {
    fastCache.remove(STORAGE_KEYS.ROOM_ID);
    fastCache.remove(STORAGE_KEYS.PLAYER_ID);
    fastCache.remove(STORAGE_KEYS.RECONNECT_TOKEN);
    sessionStorage.removeItem(STORAGE_KEYS.ROOM_ID);
    sessionStorage.removeItem(STORAGE_KEYS.PLAYER_ID);
    sessionStorage.removeItem(STORAGE_KEYS.RECONNECT_TOKEN);
    socketRef.current?.emit('create-room', name);
  };

  const joinRoom = (roomId: string, name: string) => {
    const cleanRoomId = roomId.trim().toUpperCase();
    const savedRoomId = fastCache.get<string>(STORAGE_KEYS.ROOM_ID) || sessionStorage.getItem(STORAGE_KEYS.ROOM_ID);
    const isSameRoom = savedRoomId === cleanRoomId;
    
    const savedPlayerId = isSameRoom ? (fastCache.get<string>(STORAGE_KEYS.PLAYER_ID) || sessionStorage.getItem(STORAGE_KEYS.PLAYER_ID) || undefined) : undefined;
    const savedToken = isSameRoom ? (fastCache.get<string>(STORAGE_KEYS.RECONNECT_TOKEN) || sessionStorage.getItem(STORAGE_KEYS.RECONNECT_TOKEN) || undefined) : undefined;
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
        resolve({ success: false, error: 'Not connected to room' });
        return;
      }
      socketRef.current.emit('start-game', gameState.roomId, (res) => {
        if (!res?.success) {
          toast.error(res?.error || 'Failed to start game', { id: 'start-err' });
          resolve({ success: false, error: res?.error });
        } else {
          resolve({ success: true });
        }
      });
    });
  };

  const setRounds = (rounds: number) => {
    if (gameState) {
      socketRef.current?.emit('set-rounds', gameState.roomId, rounds);
    }
  };

  const markNumber = (r: number, c: number) => {
    if (gameState) {
      socketRef.current?.emit('mark-number', gameState.roomId, r, c);
    }
  };

  const setBoard = (board: number[][]) => {
    if (gameState) {
      socketRef.current?.emit('set-board', gameState.roomId, board);
    }
  };

  const sendMessage = (text: string) => {
    if (gameState && text.trim()) {
      socketRef.current?.emit('send-message', gameState.roomId, text.trim());
    }
  };

  const addBot = (): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      if (!gameState || !socketRef.current) {
        resolve({ success: false, error: 'Not in room' });
        return;
      }
      socketRef.current.emit('add-bot', gameState.roomId, (res) => {
        if (!res?.success) {
          toast.error(res?.error || 'Could not add bot', { id: 'bot-err' });
          resolve({ success: false, error: res?.error });
        } else {
          toast.success('Bot player joined!', { id: 'bot-ok' });
          resolve({ success: true });
        }
      });
    });
  };

  const kickPlayer = (targetPlayerId: string): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      if (!gameState || !socketRef.current) {
        resolve({ success: false, error: 'Not in room' });
        return;
      }
      socketRef.current.emit('room:kick-player', { roomId: gameState.roomId, targetPlayerId }, (res) => {
        if (!res?.success) {
          toast.error(res?.error || 'Could not remove player', { id: 'kick-err' });
          resolve({ success: false, error: res?.error });
        } else {
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
      fastCache.remove(STORAGE_KEYS.ROOM_ID);
      sessionStorage.removeItem(STORAGE_KEYS.ROOM_ID);
      setGameState(null);
      setMessages([]);
    }
  };

  const resetRoom = () => {
    if (gameState) {
      socketRef.current?.emit('reset-room', gameState.roomId);
    }
  };

  const showNotification = (title: string, message: string, duration: number = 3500) => {
    toast.custom((t) => (
      <div
        onClick={() => toast.dismiss(t.id)}
        className={`${
          t.visible ? 'animate-enter' : 'animate-leave'
        } max-w-sm w-full bg-panel border-3 border-fg-base shadow-[6px_6px_0px_0px_rgba(var(--shadow-color),0.3)] pointer-events-auto flex flex-col p-3.5 rounded-xl cursor-pointer active:scale-98 transition-transform select-none`}
      >
        <div className="flex justify-between items-center mb-1.5 border-b-2 border-card-border pb-1.5">
          <h3 className="text-sm font-black uppercase italic tracking-wider text-fg-base flex items-center gap-1.5">
            🔔 {title}
          </h3>
          <button
            onClick={(e) => {
              e.stopPropagation();
              toast.dismiss(t.id);
            }}
            className="w-7 h-7 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-arcade-crimson hover:text-white flex items-center justify-center font-bold text-xs transition-colors shrink-0"
            aria-label="Close notification"
          >
            ✕
          </button>
        </div>
        <p className="font-mono text-xs text-fg-base opacity-90 leading-relaxed">{message}</p>
        <div className="text-[10px] font-mono text-arcade-amber opacity-75 mt-1">Tap anywhere to close</div>
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
        serverUrl: currentServerUrl,
        setCustomServerUrl,
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
