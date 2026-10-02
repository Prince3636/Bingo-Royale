export type GameStatus = 'waiting' | 'playing' | 'finished';
export type ConnectionStatus = 'connected' | 'connecting' | 'reconnecting' | 'disconnected';

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
  ready: boolean;
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
  turnStartedAt?: number;
  turnDeadline?: number;
  turnId?: number;
}

export interface SessionInitPayload {
  sessionId: string;
  playerId: string;
  reconnectToken: string; // Secret authentication token for reconnects
  roomId?: string;
}

export interface ServerToClientEvents {
  'room-update': (state: GameState) => void;
  'chat-message': (message: ChatMessage) => void;
  'error': (message: string) => void;
  'session-init': (data: SessionInitPayload) => void;
  'pong': (timestamp: number) => void;
  'player:joined': (data: { player: { id: string; name: string } }) => void;
  'player:reconnected': (data: { player: { id: string; name: string } }) => void;
  'room:kicked': (data: { reason: string }) => void;
  'game:turn-timeout': (data: { playerId: string; name: string }) => void;
}

export type AckCallback = (response: { success: boolean; error?: string }) => void;

export interface ClientToServerEvents {
  'create-room': (name: string, playerId?: string, reconnectToken?: string) => void;
  'join-room': (roomId: string, name: string, playerId?: string, reconnectToken?: string) => void;
  'reconnect-room': (roomId: string, playerId: string, reconnectToken: string) => void;
  'start-game': (roomId: string) => void;
  'game:start': (roomId: string, callback?: AckCallback) => void;
  'player:set-ready': (payload: { roomId: string; ready: boolean; board?: number[][] }, callback?: AckCallback) => void;
  'set-rounds': (roomId: string, rounds: number) => void;
  'room:set-rounds': (payload: { roomId: string; rounds: number }, callback?: AckCallback) => void;
  'mark-number': (roomId: string, r: number, c: number) => void;
  'set-board': (roomId: string, board: number[][]) => void;
  'send-message': (roomId: string, text: string) => void;
  'add-bot': (roomId: string) => void;
  'room:add-bot': (roomId: string, callback?: AckCallback) => void;
  'remove-player': (roomId: string, playerId: string) => void;
  'room:kick-player': (payload: { roomId: string; targetPlayerId: string }, callback?: AckCallback) => void;
  'leave-room': (roomId: string) => void;
  'reset-room': (roomId: string) => void;
  'ping': () => void;
}

