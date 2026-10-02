import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { Socket } from 'socket.io-client';
import { GameState, ChatMessage, ServerToClientEvents, ClientToServerEvents, ConnectionStatus } from '../types/game';
import toast from 'react-hot-toast';
import { fastCache } from '../utils/cache';
import { isNative, onNetworkChange, onAppStateChange } from '../utils/mobile';
import {
  IGameTransport,
  OnlineSocketTransport,
  LocalHostTransport,
  LocalClientTransport,
  TransportEvents
} from '../utils/gameTransport';

export type GameMode = 'online' | 'local' | null;

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
  gameMode: GameMode;
  setGameMode: (mode: GameMode) => void;
  startLocalHost: (hostName: string) => void;
  joinLocalGame: (hostIp: string, playerName: string, roomCode?: string) => void;
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
  SERVER_URL: 'bingo_custom_server_url',
  GAME_MODE: 'bingo_game_mode'
};

export const GameProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [gameMode, setGameModeState] = useState<GameMode>(null);
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
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connected');

  // Smart Server URL resolution
  const [currentServerUrl, setCurrentServerUrl] = useState<string>(() => {
    const cached = fastCache.get<string>(STORAGE_KEYS.SERVER_URL);
    if (cached) return cached;
    if (import.meta.env.VITE_SERVER_URL) return import.meta.env.VITE_SERVER_URL;
    if (isNative) {
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

  const transportRef = useRef<IGameTransport | null>(null);
  const [socketInstance, setSocketInstance] = useState<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);

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

  const setGameMode = (mode: GameMode) => {
    if (transportRef.current) {
      transportRef.current.disconnect();
      transportRef.current = null;
    }
    setSocketInstance(null);
    setGameState(null);
    setMessages([]);
    setError(null);
    setGameModeState(mode);
  };

  // Reusable event callbacks for any active transport (Online or Local)
  const createTransportEvents = (): TransportEvents => ({
    onRoomUpdate: (state) => {
      setGameState(state);
      setError(null);
      if (state.roomId) {
        fastCache.set(STORAGE_KEYS.ROOM_ID, state.roomId);
        sessionStorage.setItem(STORAGE_KEYS.ROOM_ID, state.roomId);
      }
    },
    onChatMessage: (msg) => {
      setMessages((prev) => [...prev.slice(-99), msg]);
    },
    onSessionInit: (data) => {
      setPlayerId(data.playerId);
      fastCache.set(STORAGE_KEYS.PLAYER_ID, data.playerId);
      fastCache.set(STORAGE_KEYS.RECONNECT_TOKEN, data.reconnectToken);
      sessionStorage.setItem(STORAGE_KEYS.PLAYER_ID, data.playerId);
      sessionStorage.setItem(STORAGE_KEYS.RECONNECT_TOKEN, data.reconnectToken);

      if (data.roomId) {
        fastCache.set(STORAGE_KEYS.ROOM_ID, data.roomId);
        sessionStorage.setItem(STORAGE_KEYS.ROOM_ID, data.roomId);
      }
    },
    onPlayerJoined: (data) => {
      toast.success(`${data.player.name} joined the room!`, { id: `joined-${data.player.id}` });
    },
    onPlayerReconnected: (data) => {
      toast.success(`${data.player.name} reconnected`, { id: `reconnected-${data.player.id}` });
    },
    onRoomKicked: (data) => {
      toast.error(data.reason || 'You were removed from the room by the host.', { id: 'kicked-alert', duration: 5000 });
      fastCache.remove(STORAGE_KEYS.ROOM_ID);
      fastCache.remove(STORAGE_KEYS.PLAYER_ID);
      fastCache.remove(STORAGE_KEYS.RECONNECT_TOKEN);
      sessionStorage.removeItem(STORAGE_KEYS.ROOM_ID);
      sessionStorage.removeItem(STORAGE_KEYS.PLAYER_ID);
      sessionStorage.removeItem(STORAGE_KEYS.RECONNECT_TOKEN);
      setPlayerId(null);
      setGameState(null);
      setMessages([]);
    },
    onTurnTimeout: (data) => {
      toast(`${data.name}'s turn timed out!`, { icon: '⏰', id: 'turn-timeout', duration: 2500 });
    },
    onError: (msg) => {
      setError(msg);
      toast.error(msg, { id: 'game-error', duration: 4000 });
    },
    onConnectionChange: (status) => {
      setConnectionStatus(status);
    }
  });

  // Connect Online transport ONLY when in Online mode
  useEffect(() => {
    if (gameMode !== 'online') return;

    const events = createTransportEvents();
    const onlineTransport = new OnlineSocketTransport(currentServerUrl, events);
    transportRef.current = onlineTransport;

    onlineTransport.connect().then(() => {
      setSocketInstance(onlineTransport.getSocket());

      // Auto-reconnect online if room credentials cached
      const savedRoomId = fastCache.get<string>(STORAGE_KEYS.ROOM_ID) || sessionStorage.getItem(STORAGE_KEYS.ROOM_ID);
      const savedPlayerId = fastCache.get<string>(STORAGE_KEYS.PLAYER_ID) || sessionStorage.getItem(STORAGE_KEYS.PLAYER_ID);
      const savedToken = fastCache.get<string>(STORAGE_KEYS.RECONNECT_TOKEN) || sessionStorage.getItem(STORAGE_KEYS.RECONNECT_TOKEN);

      if (savedRoomId && savedPlayerId && savedToken) {
        onlineTransport.reconnectRoom(savedRoomId, savedPlayerId, savedToken);
      }
    });

    const cleanupNetwork = onNetworkChange(({ connected }) => {
      if (!connected) {
        setConnectionStatus('disconnected');
        toast.error('No network connection.', { id: 'network-offline' });
      }
    });

    const cleanupAppState = onAppStateChange((isActive) => {
      if (isActive && gameMode === 'online') {
        const sock = onlineTransport.getSocket();
        if (sock && !sock.connected) {
          sock.connect();
        }
      }
    });

    return () => {
      cleanupNetwork();
      cleanupAppState();
      onlineTransport.disconnect();
      transportRef.current = null;
      setSocketInstance(null);
    };
  }, [gameMode, currentServerUrl]);

  // Start Local Host
  const startLocalHost = async (hostName: string) => {
    if (transportRef.current) {
      transportRef.current.disconnect();
    }

    const events = createTransportEvents();
    const hostTransport = new LocalHostTransport(events);
    transportRef.current = hostTransport;

    await hostTransport.connect();
    hostTransport.createRoom(hostName);
  };

  // Join Local Game via IP
  const joinLocalGame = async (hostIp: string, name: string, roomCode?: string) => {
    if (transportRef.current) {
      transportRef.current.disconnect();
    }

    const events = createTransportEvents();
    const clientTransport = new LocalClientTransport(hostIp, 8765, events);
    transportRef.current = clientTransport;

    await clientTransport.connect();
    clientTransport.joinRoom(roomCode || 'LOCAL1', name);
  };

  const createRoom = (name: string) => {
    fastCache.remove(STORAGE_KEYS.ROOM_ID);
    fastCache.remove(STORAGE_KEYS.PLAYER_ID);
    fastCache.remove(STORAGE_KEYS.RECONNECT_TOKEN);
    sessionStorage.removeItem(STORAGE_KEYS.ROOM_ID);
    sessionStorage.removeItem(STORAGE_KEYS.PLAYER_ID);
    sessionStorage.removeItem(STORAGE_KEYS.RECONNECT_TOKEN);
    transportRef.current?.createRoom(name);
  };

  const joinRoom = (roomId: string, name: string) => {
    transportRef.current?.joinRoom(roomId, name);
  };

  const reconnectRoom = (roomId: string, reconnectId: string, token: string) => {
    transportRef.current?.reconnectRoom(roomId, reconnectId, token);
  };

  const setPlayerReady = (ready: boolean): Promise<{ success: boolean; error?: string }> => {
    if (!transportRef.current) return Promise.resolve({ success: false, error: 'Not connected' });
    return transportRef.current.setPlayerReady(ready);
  };

  const startGame = (): Promise<{ success: boolean; error?: string }> => {
    if (!transportRef.current) return Promise.resolve({ success: false, error: 'Not connected' });
    return transportRef.current.startGame();
  };

  const setRounds = (rounds: number) => {
    transportRef.current?.setRounds(rounds);
  };

  const markNumber = (r: number, c: number) => {
    transportRef.current?.markNumber(r, c);
  };

  const setBoard = (board: number[][]) => {
    transportRef.current?.setBoard(board);
  };

  const sendMessage = (text: string) => {
    transportRef.current?.sendMessage(text);
  };

  const addBot = (): Promise<{ success: boolean; error?: string }> => {
    if (!transportRef.current) return Promise.resolve({ success: false, error: 'Not connected' });
    return transportRef.current.addBot();
  };

  const kickPlayer = (targetPlayerId: string): Promise<{ success: boolean; error?: string }> => {
    if (!transportRef.current) return Promise.resolve({ success: false, error: 'Not connected' });
    return transportRef.current.kickPlayer(targetPlayerId);
  };

  const removePlayer = (targetPlayerId: string) => {
    kickPlayer(targetPlayerId);
  };

  const leaveRoom = () => {
    transportRef.current?.leaveRoom();
    fastCache.remove(STORAGE_KEYS.ROOM_ID);
    fastCache.remove(STORAGE_KEYS.PLAYER_ID);
    fastCache.remove(STORAGE_KEYS.RECONNECT_TOKEN);
    sessionStorage.removeItem(STORAGE_KEYS.ROOM_ID);
    sessionStorage.removeItem(STORAGE_KEYS.PLAYER_ID);
    sessionStorage.removeItem(STORAGE_KEYS.RECONNECT_TOKEN);
    setPlayerId(null);
    setGameState(null);
    setMessages([]);
  };

  const resetRoom = () => {
    transportRef.current?.resetRoom();
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
        socket: socketInstance,
        gameState,
        messages,
        error,
        playerName,
        playerId,
        connectionStatus,
        isBackendMissing,
        serverUrl: currentServerUrl,
        gameMode,
        setGameMode,
        startLocalHost,
        joinLocalGame,
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
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
};
