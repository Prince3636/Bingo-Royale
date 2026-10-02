import { GameState, Player, ChatMessage, SessionInitPayload } from '../types/game';
import { checkBingo, generateBingoBoard } from './bingo';

export interface LocalRoomManagerCallbacks {
  broadcast: (event: string, data: any) => void;
  sendToClient: (clientId: string, event: string, data: any) => void;
  onRoomStateChange?: (state: GameState | null) => void;
}

export class LocalRoomManager {
  private room: GameState | null = null;
  private clientToPlayer: Map<string, string> = new Map(); // clientId -> playerId
  private playerTokens: Map<string, string> = new Map(); // playerId -> reconnectToken
  private playerClient: Map<string, string> = new Map(); // playerId -> clientId
  private callbacks: LocalRoomManagerCallbacks;
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  private disconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  private readonly TURN_TIME_LIMIT_SECONDS = 15;
  private readonly MAX_PLAYERS = 5;
  private readonly RECONNECT_GRACE_MS = 45000;

  constructor(callbacks: LocalRoomManagerCallbacks) {
    this.callbacks = callbacks;
  }

  public getRoomState(): GameState | null {
    return this.room;
  }

  public createRoom(hostName: string, hostPlayerId?: string): { room: GameState; playerId: string; token: string } {
    this.destroy();

    const cleanName = hostName.trim().slice(0, 30) || 'Host';
    const roomId = 'LOCAL_' + Math.random().toString(36).substring(2, 6).toUpperCase();
    const playerId = hostPlayerId || `p_${Math.random().toString(36).substring(2, 10)}`;
    const token = `tok_${Math.random().toString(36).substring(2, 14)}`;

    const hostPlayer: Player = {
      id: playerId,
      socketId: 'host_local',
      name: cleanName,
      isHost: true,
      isBot: false,
      board: generateBingoBoard(),
      marked: Array(5).fill(null).map(() => Array(5).fill(false)),
      completedLines: 0,
      score: 0,
      connected: true,
      ready: true
    };
    hostPlayer.marked[2][2] = true;

    this.room = {
      roomId,
      players: [hostPlayer],
      drawnNumbers: [],
      currentTurn: null,
      status: 'waiting',
      winner: null,
      currentRound: 1,
      targetRounds: 1,
      overallWinner: null,
      lastActivity: Date.now()
    };

    this.playerTokens.set(playerId, token);
    this.clientToPlayer.set('host_local', playerId);
    this.playerClient.set(playerId, 'host_local');

    this.notifyState();
    return { room: this.room, playerId, token };
  }

  public joinRoom(
    clientId: string,
    playerName: string,
    explicitPlayerId?: string,
    reconnectToken?: string
  ): { success: boolean; error?: string; playerId?: string; token?: string } {
    if (!this.room) {
      return { success: false, error: 'Local game room does not exist' };
    }

    if (explicitPlayerId && reconnectToken) {
      const reconnectResult = this.reconnectPlayer(clientId, explicitPlayerId, reconnectToken);
      if (reconnectResult.success) {
        return reconnectResult;
      }
    }

    if (this.room.status !== 'waiting') {
      return { success: false, error: 'Game already in progress' };
    }

    if (this.room.players.length >= this.MAX_PLAYERS) {
      return { success: false, error: 'Room is full (max 5 players)' };
    }

    const cleanName = playerName.trim().slice(0, 30) || 'Player';
    const nameTaken = this.room.players.some(p => p.name.toLowerCase() === cleanName.toLowerCase());
    if (nameTaken) {
      return { success: false, error: `Name "${cleanName}" is already taken` };
    }

    const playerId = `p_${Math.random().toString(36).substring(2, 10)}`;
    const token = `tok_${Math.random().toString(36).substring(2, 14)}`;

    const newPlayer: Player = {
      id: playerId,
      socketId: clientId,
      name: cleanName,
      isHost: false,
      isBot: false,
      board: generateBingoBoard(),
      marked: Array(5).fill(null).map(() => Array(5).fill(false)),
      completedLines: 0,
      score: 0,
      connected: true,
      ready: false
    };
    newPlayer.marked[2][2] = true;

    this.room.players.push(newPlayer);
    this.room.lastActivity = Date.now();
    this.clientToPlayer.set(clientId, playerId);
    this.playerClient.set(playerId, clientId);
    this.playerTokens.set(playerId, token);

    // Send session init to the joined client
    const initPayload: SessionInitPayload = {
      sessionId: clientId,
      playerId,
      reconnectToken: token,
      roomId: this.room.roomId
    };
    this.callbacks.sendToClient(clientId, 'session-init', initPayload);

    // Announce player joined to others
    this.callbacks.broadcast('player:joined', { player: { id: playerId, name: cleanName } });

    this.notifyState();
    return { success: true, playerId, token };
  }

  public reconnectPlayer(
    clientId: string,
    playerId: string,
    reconnectToken: string
  ): { success: boolean; error?: string; playerId?: string; token?: string } {
    if (!this.room) {
      return { success: false, error: 'Local game room does not exist' };
    }

    const expectedToken = this.playerTokens.get(playerId);
    if (!expectedToken || expectedToken !== reconnectToken) {
      return { success: false, error: 'Invalid reconnect authentication token' };
    }

    const player = this.room.players.find(p => p.id === playerId);
    if (!player) {
      return { success: false, error: 'Player record not found' };
    }

    // Cancel disconnect timer
    if (this.disconnectTimers.has(playerId)) {
      clearTimeout(this.disconnectTimers.get(playerId)!);
      this.disconnectTimers.delete(playerId);
    }

    player.connected = true;
    player.socketId = clientId;
    delete player.disconnectedAt;
    this.room.lastActivity = Date.now();

    this.clientToPlayer.set(clientId, playerId);
    this.playerClient.set(playerId, clientId);

    const initPayload: SessionInitPayload = {
      sessionId: clientId,
      playerId,
      reconnectToken,
      roomId: this.room.roomId
    };
    this.callbacks.sendToClient(clientId, 'session-init', initPayload);
    this.callbacks.broadcast('player:reconnected', { player: { id: playerId, name: player.name } });

    this.notifyState();
    return { success: true, playerId, token: reconnectToken };
  }

  public handleClientDisconnect(clientId: string): void {
    const playerId = this.clientToPlayer.get(clientId);
    if (!playerId || !this.room) return;

    this.clientToPlayer.delete(clientId);
    const player = this.room.players.find(p => p.id === playerId);
    if (!player) return;

    player.connected = false;
    player.socketId = null;
    player.disconnectedAt = Date.now();
    this.room.lastActivity = Date.now();

    this.notifyState();

    // Auto-advance if active turn player disconnected
    if (this.room.status === 'playing' && this.room.currentTurn === playerId) {
      setTimeout(() => {
        if (this.room && this.room.status === 'playing' && this.room.currentTurn === playerId) {
          const p = this.room.players.find(x => x.id === playerId);
          if (p && !p.connected) {
            this.advanceTurn();
          }
        }
      }, 8000);
    }

    // Grace timer to remove player if they don't reconnect
    if (this.disconnectTimers.has(playerId)) {
      clearTimeout(this.disconnectTimers.get(playerId)!);
    }

    const timer = setTimeout(() => {
      this.disconnectTimers.delete(playerId);
      this.finalizePlayerDisconnect(playerId);
    }, this.RECONNECT_GRACE_MS);

    this.disconnectTimers.set(playerId, timer);
  }

  private finalizePlayerDisconnect(playerId: string): void {
    if (!this.room) return;
    const playerIdx = this.room.players.findIndex(p => p.id === playerId);
    if (playerIdx === -1) return;

    const player = this.room.players[playerIdx];
    if (player.connected) return;

    this.room.players.splice(playerIdx, 1);
    this.playerTokens.delete(playerId);
    this.playerClient.delete(playerId);

    if (this.room.players.filter(p => !p.isBot).length === 0) {
      this.destroy();
      return;
    }

    this.notifyState();
  }

  public setPlayerReady(playerId: string, ready: boolean): { success: boolean; error?: string } {
    if (!this.room || this.room.status !== 'waiting') {
      return { success: false, error: 'Room not in waiting state' };
    }
    const player = this.room.players.find(p => p.id === playerId);
    if (!player) return { success: false, error: 'Player not found' };

    player.ready = ready;
    this.room.lastActivity = Date.now();
    this.notifyState();
    return { success: true };
  }

  public setBoard(playerId: string, board: number[][]): { success: boolean; error?: string } {
    if (!this.room || this.room.status !== 'waiting') return { success: false, error: 'Cannot set board' };
    const player = this.room.players.find(p => p.id === playerId);
    if (!player || player.isBot) return { success: false, error: 'Player not found' };

    player.board = board;
    player.ready = false; // changing board unreadies
    this.room.lastActivity = Date.now();
    this.notifyState();
    return { success: true };
  }

  public setRounds(playerId: string, rounds: number): { success: boolean; error?: string } {
    if (!this.room || this.room.status !== 'waiting') return { success: false, error: 'Invalid state' };
    const player = this.room.players.find(p => p.id === playerId);
    if (!player || !player.isHost) return { success: false, error: 'Only host can set rounds' };

    this.room.targetRounds = Math.max(1, Math.min(5, rounds));
    this.room.lastActivity = Date.now();
    this.notifyState();
    return { success: true };
  }

  public startGame(playerId: string): { success: boolean; error?: string } {
    if (!this.room || this.room.status !== 'waiting') {
      return { success: false, error: 'Room not in waiting state' };
    }
    const player = this.room.players.find(p => p.id === playerId);
    if (!player || !player.isHost) {
      return { success: false, error: 'Only host can start the game' };
    }

    const unreadyPlayer = this.room.players.find(p => !p.isBot && !p.isHost && !p.ready);
    if (unreadyPlayer) {
      return { success: false, error: `${unreadyPlayer.name} is not ready yet` };
    }

    this.room.status = 'playing';
    this.room.drawnNumbers = [];
    this.room.winner = null;
    this.room.lastActivity = Date.now();

    const connectedPlayers = this.room.players.filter(p => p.connected || p.isBot);
    const initialPlayer = connectedPlayers[Math.floor(Math.random() * connectedPlayers.length)] || this.room.players[0];
    this.room.currentTurn = initialPlayer.id;

    this.room.turnId = 1;
    this.room.turnStartedAt = Date.now();
    this.room.turnDeadline = this.room.turnStartedAt + (this.TURN_TIME_LIMIT_SECONDS * 1000);

    this.scheduleTurnTimer(this.room.turnId, initialPlayer.id);
    this.notifyState();

    if (initialPlayer.isBot) {
      this.scheduleBotTurn();
    }

    return { success: true };
  }

  public markNumber(playerId: string, r: number, c: number): { success: boolean; error?: string } {
    if (!this.room || this.room.status !== 'playing' || this.room.winner) {
      return { success: false, error: 'Game not active' };
    }

    const player = this.room.players.find(p => p.id === playerId);
    if (!player || !player.connected) return { success: false, error: 'Player disconnected' };

    const num = player.board[r]?.[c];
    if (typeof num !== 'number') return { success: false, error: 'Invalid cell' };

    const isMyTurn = this.room.currentTurn === player.id;

    if (isMyTurn) {
      if (!this.room.drawnNumbers.includes(num)) {
        this.clearTurnTimer();

        this.room.drawnNumbers.push(num);
        this.room.lastActivity = Date.now();

        // Mark for ALL players who have this number
        this.room.players.forEach(p => {
          for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 5; col++) {
              if (p.board[row][col] === num) {
                p.marked[row][col] = true;
              }
            }
          }
          p.completedLines = checkBingo(p.marked);
        });

        // Check winner: active player first
        if (player.completedLines >= 5 && !this.room.winner) {
          this.handleRoundWinner(player);
        }
        if (!this.room.winner) {
          for (const p of this.room.players) {
            if (p.id !== player.id && p.completedLines >= 5) {
              this.handleRoundWinner(p);
              break;
            }
          }
        }

        if (!this.room.winner && this.room.status === 'playing') {
          this.advanceTurn();
        } else {
          this.notifyState();
        }
        return { success: true };
      } else if (!player.marked[r][c]) {
        player.marked[r][c] = true;
        player.completedLines = checkBingo(player.marked);
        if (player.completedLines >= 5 && !this.room.winner) {
          this.handleRoundWinner(player);
        }
        this.notifyState();
        return { success: true };
      }
    } else {
      // Not my turn: can only mark if already drawn
      if (this.room.drawnNumbers.includes(num) && !player.marked[r][c]) {
        player.marked[r][c] = true;
        player.completedLines = checkBingo(player.marked);
        if (player.completedLines >= 5 && !this.room.winner) {
          this.handleRoundWinner(player);
        }
        this.notifyState();
        return { success: true };
      }
    }

    return { success: false, error: 'Invalid move' };
  }

  private handleRoundWinner(winnerPlayer: Player): void {
    if (!this.room) return;
    this.clearTurnTimer();
    this.clearBotTimer();

    winnerPlayer.score += 1;
    this.room.winner = winnerPlayer;
    this.room.lastActivity = Date.now();

    if (this.room.currentRound >= this.room.targetRounds) {
      this.room.status = 'finished';
      const sorted = [...this.room.players].sort((a, b) => b.score - a.score);
      this.room.overallWinner = sorted[0] || winnerPlayer;
    }
  }

  public advanceTurn(): void {
    if (!this.room || this.room.status !== 'playing' || this.room.winner) return;
    this.clearTurnTimer();
    this.clearBotTimer();

    const activePlayers = this.room.players.filter(p => p.connected || p.isBot);
    if (activePlayers.length === 0) return;

    const currentIdx = activePlayers.findIndex(p => p.id === this.room!.currentTurn);
    const nextIdx = (currentIdx + 1) % activePlayers.length;
    const nextPlayer = activePlayers[nextIdx];

    this.room.currentTurn = nextPlayer.id;
    this.room.turnId = (this.room.turnId || 0) + 1;
    this.room.turnStartedAt = Date.now();
    this.room.turnDeadline = this.room.turnStartedAt + (this.TURN_TIME_LIMIT_SECONDS * 1000);

    this.scheduleTurnTimer(this.room.turnId, nextPlayer.id);
    this.notifyState();

    if (nextPlayer.isBot) {
      this.scheduleBotTurn();
    }
  }

  private scheduleTurnTimer(turnId: number, playerId: string): void {
    this.clearTurnTimer();
    this.turnTimer = setTimeout(() => {
      if (this.room && this.room.status === 'playing' && this.room.turnId === turnId && this.room.currentTurn === playerId) {
        const timedOutPlayer = this.room.players.find(p => p.id === playerId);
        this.callbacks.broadcast('game:turn-timeout', {
          playerId,
          name: timedOutPlayer?.name || 'Player'
        });
        this.advanceTurn();
      }
    }, this.TURN_TIME_LIMIT_SECONDS * 1000);
  }

  private clearTurnTimer(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
  }

  private scheduleBotTurn(): void {
    this.clearBotTimer();
    this.botTimer = setTimeout(() => {
      if (!this.room || this.room.status !== 'playing' || this.room.winner) return;
      const bot = this.room.players.find(p => p.id === this.room!.currentTurn && p.isBot);
      if (!bot) return;

      const uncalledNums: number[] = [];
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          const n = bot.board[r][c];
          if (!this.room.drawnNumbers.includes(n)) {
            uncalledNums.push(n);
          }
        }
      }

      if (uncalledNums.length > 0) {
        const pick = uncalledNums[Math.floor(Math.random() * uncalledNums.length)];
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 5; c++) {
            if (bot.board[r][c] === pick) {
              this.markNumber(bot.id, r, c);
              return;
            }
          }
        }
      }
    }, 1800);
  }

  private clearBotTimer(): void {
    if (this.botTimer) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }
  }

  public addBot(playerId: string): { success: boolean; error?: string } {
    if (!this.room || this.room.status !== 'waiting') return { success: false, error: 'Cannot add bot' };
    const player = this.room.players.find(p => p.id === playerId);
    if (!player || !player.isHost) return { success: false, error: 'Only host can add bots' };

    if (this.room.players.length >= this.MAX_PLAYERS) return { success: false, error: 'Room is full' };

    const botNum = this.room.players.filter(p => p.isBot).length + 1;
    const botId = `bot_${Math.random().toString(36).substring(2, 7)}`;
    const botPlayer: Player = {
      id: botId,
      socketId: `bot_socket_${botId}`,
      name: `Bot ${botNum}`,
      isHost: false,
      isBot: true,
      board: generateBingoBoard(),
      marked: Array(5).fill(null).map(() => Array(5).fill(false)),
      completedLines: 0,
      score: 0,
      connected: true,
      ready: true
    };
    botPlayer.marked[2][2] = true;

    this.room.players.push(botPlayer);
    this.room.lastActivity = Date.now();
    this.notifyState();
    return { success: true };
  }

  public kickPlayer(hostPlayerId: string, targetPlayerId: string): { success: boolean; error?: string } {
    if (!this.room || this.room.status !== 'waiting') return { success: false, error: 'Cannot kick' };
    const host = this.room.players.find(p => p.id === hostPlayerId);
    if (!host || !host.isHost) return { success: false, error: 'Only host can kick players' };

    const targetIdx = this.room.players.findIndex(p => p.id === targetPlayerId);
    if (targetIdx === -1) return { success: false, error: 'Player not found' };

    const target = this.room.players[targetIdx];
    const targetClientId = this.playerClient.get(targetPlayerId);

    this.room.players.splice(targetIdx, 1);
    this.playerTokens.delete(targetPlayerId);
    this.playerClient.delete(targetPlayerId);

    if (targetClientId) {
      this.clientToPlayer.delete(targetClientId);
      this.callbacks.sendToClient(targetClientId, 'room:kicked', { reason: 'Removed by host' });
    }

    this.notifyState();
    return { success: true };
  }

  public sendMessage(senderName: string, text: string): void {
    if (!this.room) return;
    const cleanText = text.trim().slice(0, 150);
    if (!cleanText) return;

    const message: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sender: senderName,
      text: cleanText,
      timestamp: Date.now()
    };

    this.callbacks.broadcast('chat-message', message);
  }

  public resetRoom(hostPlayerId: string): { success: boolean; error?: string } {
    if (!this.room) return { success: false, error: 'No room' };
    const host = this.room.players.find(p => p.id === hostPlayerId);
    if (!host || !host.isHost) return { success: false, error: 'Only host can reset room' };

    this.clearTurnTimer();
    this.clearBotTimer();

    this.room.status = 'waiting';
    this.room.drawnNumbers = [];
    this.room.winner = null;
    this.room.currentTurn = null;
    this.room.currentRound = 1;
    this.room.overallWinner = null;
    this.room.lastActivity = Date.now();

    this.room.players.forEach(p => {
      p.board = generateBingoBoard();
      p.marked = Array(5).fill(null).map(() => Array(5).fill(false));
      p.marked[2][2] = true;
      p.completedLines = 0;
      p.ready = p.isHost || p.isBot;
    });

    this.notifyState();
    return { success: true };
  }

  public leaveRoom(playerId: string): void {
    if (!this.room) return;
    const playerIdx = this.room.players.findIndex(p => p.id === playerId);
    if (playerIdx === -1) return;

    const player = this.room.players[playerIdx];
    this.room.players.splice(playerIdx, 1);
    this.playerTokens.delete(playerId);
    this.playerClient.delete(playerId);

    if (player.isHost || this.room.players.filter(p => !p.isBot).length === 0) {
      this.callbacks.broadcast('error', 'Host ended the local game room.');
      this.destroy();
      return;
    }

    this.notifyState();
  }

  public destroy(): void {
    this.clearTurnTimer();
    this.clearBotTimer();
    for (const timer of this.disconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.disconnectTimers.clear();
    this.clientToPlayer.clear();
    this.playerClient.clear();
    this.playerTokens.clear();
    this.room = null;
    this.callbacks.onRoomStateChange?.(null);
  }

  private notifyState(): void {
    if (!this.room) return;
    const snapshot: GameState = JSON.parse(JSON.stringify(this.room));
    this.callbacks.broadcast('room-update', snapshot);
    this.callbacks.onRoomStateChange?.(snapshot);
  }
}
