
export type GameStatus = 'waiting' | 'playing' | 'finished';

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  isBot: boolean;
  board: number[][];
  marked: boolean[][];
  completedLines: number;
  score: number;
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
}

export interface ServerToClientEvents {
  'room-update': (state: GameState) => void;
  'game-state-update': (state: GameState) => void;
  'chat-message': (message: ChatMessage) => void;
  'error': (message: string) => void;
}

export interface ClientToServerEvents {
  'create-room': (name: string) => void;
  'join-room': (roomId: string, name: string) => void;
  'start-game': (roomId: string) => void;
  'set-rounds': (roomId: string, rounds: number) => void;
  'draw-number': (roomId: string) => void;
  'mark-number': (roomId: string, r: number, c: number) => void;
  'set-board': (roomId: string, board: number[][]) => void;
  'send-message': (roomId: string, text: string) => void;
  'add-bot': (roomId: string) => void;
  'remove-player': (roomId: string, playerId: string) => void;
  'leave-room': (roomId: string) => void;
}
