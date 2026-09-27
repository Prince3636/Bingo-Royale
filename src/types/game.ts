export type GameStatus = 'waiting' | 'playing' | 'finished';

export interface Player {
  id: string; // Public persistent player ID
  socketId: string | null; // Current active Socket ID (null if temporarily offline)
  name: string;
  isHost: boolean;
  isBot: boolean;
  board: number[][];
  marked: boolean[][];
  completedLines: number;
  score: number;
  connected: boolean;
  disconnectedAt?: number;
}

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
}

export interface GameState {
  roomId: string;
  players: Player[];
  drawnNumbers: number[];
  currentTurn: string | null;
  status: GameStatus;
  winner: Player | null;
  currentRound: number;
  targetRounds: number;
  overallWinner: Player | null;
  lastActivity: number;
}

export interface SessionInitPayload {
  sessionId: string;
  playerId: string;
  reconnectToken: string; // Secret authentication token for reconnects
  roomId?: string;
}

export interface ServerToClientEvents {
  'room-update': (state: GameState) => void;
  'game-state-update': (state: GameState) => void;
  'chat-message': (message: ChatMessage) => void;
  'error': (message: string) => void;
  'session-init': (data: SessionInitPayload) => void;
  'pong': (timestamp: number) => void;
}

export interface ClientToServerEvents {
  'create-room': (name: string, playerId?: string, reconnectToken?: string) => void;
  'join-room': (roomId: string, name: string, playerId?: string, reconnectToken?: string) => void;
  'reconnect-room': (roomId: string, playerId: string, reconnectToken: string) => void;
  'start-game': (roomId: string) => void;
  'set-rounds': (roomId: string, rounds: number) => void;
  'draw-number': (roomId: string) => void;
  'mark-number': (roomId: string, r: number, c: number) => void;
  'set-board': (roomId: string, board: number[][]) => void;
  'send-message': (roomId: string, text: string) => void;
  'add-bot': (roomId: string) => void;
  'remove-player': (roomId: string, playerId: string) => void;
  'leave-room': (roomId: string) => void;
  'ping': () => void;
}
