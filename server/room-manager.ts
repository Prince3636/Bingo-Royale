import crypto from 'crypto';
import { Server, Socket } from 'socket.io';
import { GameState, Player, ChatMessage, ClientToServerEvents, ServerToClientEvents, AckCallback } from '../src/types/game';
import { generateBingoBoard, checkBingo } from '../src/utils/bingo';
import { IGameStateStore, MemoryGameStateStore } from './game-store';
import { config } from './config';
import { logger } from './logger';

export class RoomManager {
  private io: Server<ClientToServerEvents, ServerToClientEvents>;
  private store: IGameStateStore;
  private socketToPlayer: Map<string, { roomId: string; playerId: string }> = new Map();
  private disconnectTimers: Map<string, NodeJS.Timeout> = new Map();
  private botTimers: Map<string, NodeJS.Timeout> = new Map();
  private roundTimers: Map<string, NodeJS.Timeout> = new Map();
  private turnTimers: Map<string, NodeJS.Timeout> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor(
    io: Server<ClientToServerEvents, ServerToClientEvents>,
    store: IGameStateStore = new MemoryGameStateStore()
  ) {
    this.io = io;
    this.store = store;

    // Periodic sweep for abandoned or expired rooms
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredRooms().catch(err => {
        logger.error('Error during room cleanup sweep', { error: String(err) });
      });
    }, 60000);
    this.cleanupInterval.unref();
  }

  public generateId(length: number = 6): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.randomBytes(length);
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[bytes[i] % chars.length];
    }
    return result;
  }

  public generateSecureToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  public async getRoom(roomId: string): Promise<GameState | null> {
    return await this.store.getRoom(roomId);
  }

  public async getActiveRoomCount(): Promise<number> {
    return await this.store.getRoomCount();
  }

  public validateBoard(board: unknown): board is number[][] {
    if (!Array.isArray(board) || board.length !== 5) return false;
    const seen = new Set<number>();
    for (let r = 0; r < 5; r++) {
      const row = board[r];
      if (!Array.isArray(row) || row.length !== 5) return false;
      for (let c = 0; c < 5; c++) {
        const val = row[c];
        if (typeof val !== 'number' || !Number.isInteger(val) || val < 1 || val > 25) {
          return false;
        }
        seen.add(val);
      }
    }
    return seen.size === 25;
  }

  public isValidBoardStructure(board: unknown): board is number[][] {
    if (!Array.isArray(board) || board.length !== 5) return false;
    for (let r = 0; r < 5; r++) {
      const row = board[r];
      if (!Array.isArray(row) || row.length !== 5) return false;
      for (let c = 0; c < 5; c++) {
        const val = row[c];
        if (typeof val !== 'number' || !Number.isInteger(val) || val < 0 || val > 25) {
          return false;
        }
      }
    }
    return true;
  }

  public async createRoom(socket: Socket, playerName: string): Promise<GameState | null> {
    const roomCount = await this.store.getRoomCount();
    if (roomCount >= config.MAX_ACTIVE_ROOMS) {
      socket.emit('error', 'Server at maximum room capacity. Please try again later.');
      return null;
    }

    const cleanName = (typeof playerName === 'string' ? playerName : '').trim().slice(0, 30);
    if (!cleanName) {
      socket.emit('error', 'Player name cannot be empty');
      return null;
    }

    const roomId = this.generateId(6);
    const playerId = `p_${crypto.randomUUID()}`;
    const reconnectToken = this.generateSecureToken();

    const hostBoard = Array(5).fill(null).map(() => Array(5).fill(0));
    const marked = Array(5).fill(null).map(() => Array(5).fill(false));
    marked[2][2] = true; // Free center space

    const host: Player = {
      id: playerId,
      socketId: socket.id,
      name: cleanName,
      isHost: true,
      isBot: false,
      board: hostBoard,
      marked,
      completedLines: 0,
      score: 0,
      connected: true,
      ready: false
    };

    const room: GameState = {
      roomId,
      players: [host],
      drawnNumbers: [],
      currentTurn: playerId,
      status: 'waiting',
      winner: null,
      currentRound: 1,
      targetRounds: 1,
      overallWinner: null,
      lastActivity: Date.now()
    };

    await this.store.saveRoom(roomId, room, config.ROOM_TTL_MS);
    await this.store.savePlayerToken(roomId, playerId, reconnectToken, config.ROOM_TTL_MS);

    this.socketToPlayer.set(socket.id, { roomId, playerId });
    socket.join(roomId);

    socket.emit('session-init', {
      sessionId: socket.id,
      playerId,
      reconnectToken,
      roomId
    });
    socket.emit('room-update', room);

    logger.info('Room created', { roomId, playerId, playerName: cleanName });
    return room;
  }

  public async joinRoom(
    socket: Socket,
    roomIdInput: string,
    playerName: string,
    explicitPlayerId?: string,
    reconnectToken?: string
  ): Promise<GameState | null> {
    const cleanRoomId = (typeof roomIdInput === 'string' ? roomIdInput : '').trim().toUpperCase();
    const cleanName = (typeof playerName === 'string' ? playerName : '').trim().slice(0, 30);

    const room = await this.store.getRoom(cleanRoomId);
    if (!room) {
      socket.emit('error', `Room ${cleanRoomId} not found`);
      return null;
    }

    // Check if player is attempting reconnection
    if (explicitPlayerId && reconnectToken) {
      return await this.reconnectPlayer(socket, cleanRoomId, explicitPlayerId, reconnectToken);
    }

    if (room.status !== 'waiting') {
      socket.emit('error', 'Game already in progress or completed');
      return null;
    }

    if (room.players.length >= config.MAX_PLAYERS_PER_ROOM) {
      socket.emit('error', 'Room is full (max 5 players)');
      return null;
    }

    if (!cleanName) {
      socket.emit('error', 'Player name cannot be empty');
      return null;
    }

    // Reject duplicate player names in the same room
    const nameTaken = room.players.some(
      p => p.name.trim().toLowerCase() === cleanName.toLowerCase()
    );
    if (nameTaken) {
      socket.emit('error', `Name "${cleanName}" is already taken in this room. Please choose a different name.`);
      return null;
    }

    const playerId = `p_${crypto.randomUUID()}`;
    const newReconnectToken = this.generateSecureToken();
    const board = Array(5).fill(null).map(() => Array(5).fill(0));
    const marked = Array(5).fill(null).map(() => Array(5).fill(false));
    marked[2][2] = true;

    const player: Player = {
      id: playerId,
      socketId: socket.id,
      name: cleanName,
      isHost: false,
      isBot: false,
      board,
      marked,
      completedLines: 0,
      score: 0,
      connected: true,
      ready: false
    };

    room.players.push(player);
    room.lastActivity = Date.now();

    await this.store.saveRoom(cleanRoomId, room, config.ROOM_TTL_MS);
    await this.store.savePlayerToken(cleanRoomId, playerId, newReconnectToken, config.ROOM_TTL_MS);

    this.socketToPlayer.set(socket.id, { roomId: cleanRoomId, playerId });
    socket.join(cleanRoomId);

    socket.emit('session-init', {
      sessionId: socket.id,
      playerId,
      reconnectToken: newReconnectToken,
      roomId: cleanRoomId
    });
    this.io.to(cleanRoomId).emit('room-update', room);
    socket.to(cleanRoomId).emit('player:joined', { player: { id: playerId, name: cleanName } });

    logger.info('Player joined room', { roomId: cleanRoomId, playerId, name: cleanName });
    return room;
  }

  public async reconnectPlayer(
    socket: Socket,
    roomId: string,
    playerId: string,
    reconnectToken: string
  ): Promise<GameState | null> {
    const cleanRoomId = (typeof roomId === 'string' ? roomId : '').trim().toUpperCase();
    const room = await this.store.getRoom(cleanRoomId);
    if (!room) {
      socket.emit('error', 'Room not found for reconnection');
      return null;
    }

    // Authenticate reconnect token
    const expectedToken = await this.store.getPlayerToken(cleanRoomId, playerId);
    if (!expectedToken || expectedToken !== reconnectToken) {
      logger.warn('Unauthorized reconnect attempt', { roomId: cleanRoomId, playerId });
      socket.emit('error', 'Unauthorized reconnection token. Session rejected.');
      return null;
    }

    const player = room.players.find(p => p.id === playerId);
    if (!player) {
      socket.emit('error', 'Player session expired or not found');
      return null;
    }

    // Cancel pending disconnect grace timer
    const timerKey = `${cleanRoomId}:${playerId}`;
    if (this.disconnectTimers.has(timerKey)) {
      clearTimeout(this.disconnectTimers.get(timerKey)!);
      this.disconnectTimers.delete(timerKey);
      logger.info('Cancelled disconnect grace timer for reconnecting player', { roomId: cleanRoomId, playerId });
    }

    // Update player socket mapping
    player.socketId = socket.id;
    player.connected = true;
    delete player.disconnectedAt;
    room.lastActivity = Date.now();

    await this.store.saveRoom(cleanRoomId, room, config.ROOM_TTL_MS);

    this.socketToPlayer.set(socket.id, { roomId: cleanRoomId, playerId });
    socket.join(cleanRoomId);

    socket.emit('session-init', {
      sessionId: socket.id,
      playerId,
      reconnectToken,
      roomId: cleanRoomId
    });
    this.io.to(cleanRoomId).emit('room-update', room);
    socket.to(cleanRoomId).emit('player:reconnected', { player: { id: player.id, name: player.name } });

    logger.info('Player reconnected successfully', { roomId: cleanRoomId, playerId, name: player.name });
    return room;
  }

  public async setBoard(socket: Socket, roomId: string, board: unknown): Promise<void> {
    const room = await this.store.getRoom(roomId);
    if (!room || room.status !== 'waiting') return;

    const mapping = this.socketToPlayer.get(socket.id);
    if (!mapping || mapping.roomId !== roomId) return;

    const player = room.players.find(p => p.id === mapping.playerId);
    if (!player || player.isBot) return;

    if (!this.isValidBoardStructure(board)) {
      socket.emit('error', 'Invalid Bingo board structure: Must be 5x5 containing integers 0-25');
      return;
    }

    player.board = board;
    // Changing board after ready automatically un-readies player (Requirement 5)
    player.ready = false;
    room.lastActivity = Date.now();
    await this.store.saveRoom(roomId, room, config.ROOM_TTL_MS);
    this.io.to(roomId).emit('room-update', room);
  }

  public async setPlayerReady(
    socket: Socket,
    roomId: string,
    ready: boolean,
    callback?: AckCallback
  ): Promise<{ success: boolean; error?: string }> {
    const room = await this.store.getRoom(roomId);
    if (!room) {
      const err = 'Room not found';
      socket.emit('error', err);
      callback?.({ success: false, error: err });
      return { success: false, error: err };
    }

    if (room.status !== 'waiting') {
      const err = 'Game has already started';
      socket.emit('error', err);
      callback?.({ success: false, error: err });
      return { success: false, error: err };
    }

    const mapping = this.socketToPlayer.get(socket.id);
    if (!mapping || mapping.roomId !== roomId) {
      const err = 'Player not recognized in this room';
      socket.emit('error', err);
      callback?.({ success: false, error: err });
      return { success: false, error: err };
    }

    const player = room.players.find(p => p.id === mapping.playerId);
    if (!player || player.isBot) {
      const err = 'Invalid player';
      socket.emit('error', err);
      callback?.({ success: false, error: err });
      return { success: false, error: err };
    }

    if (player.isHost) {
      const err = 'Host does not toggle ready status';
      socket.emit('error', err);
      callback?.({ success: false, error: err });
      return { success: false, error: err };
    }

    if (!player.connected) {
      const err = 'Player is disconnected';
      socket.emit('error', err);
      callback?.({ success: false, error: err });
      return { success: false, error: err };
    }

    if (ready) {
      // Validate board before becoming ready (Requirement 4)
      if (!this.validateBoard(player.board)) {
        const err = 'Please complete a valid Bingo board before readying up.';
        socket.emit('error', err);
        callback?.({ success: false, error: err });
        return { success: false, error: err };
      }
    }

    player.ready = Boolean(ready);
    room.lastActivity = Date.now();
    await this.store.saveRoom(roomId, room, config.ROOM_TTL_MS);
    this.io.to(roomId).emit('room-update', room);

    logger.info('Player ready state updated', { roomId, playerId: player.id, ready: player.ready });
    callback?.({ success: true });
    return { success: true };
  }

  public async setRounds(socket: Socket, roomId: string, rounds: unknown): Promise<void> {
    const room = await this.store.getRoom(roomId);
    if (!room || room.status !== 'waiting') return;

    const mapping = this.socketToPlayer.get(socket.id);
    if (!mapping || mapping.roomId !== roomId) return;

    const player = room.players.find(p => p.id === mapping.playerId);
    if (!player || !player.isHost) return;

    if (typeof rounds !== 'number' || ![1, 3, 5].includes(rounds)) return;

    room.targetRounds = rounds;
    room.lastActivity = Date.now();
    await this.store.saveRoom(roomId, room, config.ROOM_TTL_MS);
    this.io.to(roomId).emit('room-update', room);
  }

  public async startGame(
    socket: Socket,
    roomId: string,
    callback?: AckCallback
  ): Promise<{ success: boolean; error?: string }> {
    const room = await this.store.getRoom(roomId);
    if (!room) {
      const err = 'Room not found';
      socket.emit('error', err);
      callback?.({ success: false, error: err });
      return { success: false, error: err };
    }

    if (room.status !== 'waiting') {
      const err = 'Game already started';
      callback?.({ success: false, error: err });
      return { success: false, error: err };
    }

    const mapping = this.socketToPlayer.get(socket.id);
    if (!mapping || mapping.roomId !== roomId) {
      const err = 'Player not recognized';
      socket.emit('error', err);
      callback?.({ success: false, error: err });
      return { success: false, error: err };
    }

    const player = room.players.find(p => p.id === mapping.playerId);
    if (!player || !player.isHost) {
      const err = 'Only the host can start the game';
      socket.emit('error', err);
      callback?.({ success: false, error: err });
      return { success: false, error: err };
    }

    if (room.players.length < config.MIN_PLAYERS_TO_START) {
      const err = `Cannot start game with fewer than ${config.MIN_PLAYERS_TO_START} players`;
      socket.emit('error', err);
      callback?.({ success: false, error: err });
      return { success: false, error: err };
    }

    // Strictly enforce: ALL non-host human players must have clicked "Ready"
    const unreadyPlayer = room.players.find(p => !p.isBot && !p.isHost && !p.ready);
    if (unreadyPlayer) {
      const err = `${unreadyPlayer.name} is not ready yet. All players must click Ready before starting.`;
      socket.emit('error', err);
      callback?.({ success: false, error: err });
      return { success: false, error: err };
    }

    // Validate that ALL players (host, humans, bots) have complete valid boards
    for (const p of room.players) {
      if (!this.validateBoard(p.board)) {
        const err = `${p.name} does not have a complete valid Bingo board`;
        socket.emit('error', err);
        callback?.({ success: false, error: err });
        return { success: false, error: err };
      }
    }

    // Validate no disconnected human players block game start
    const disconnectedPlayer = room.players.find(p => !p.isBot && !p.connected);
    if (disconnectedPlayer) {
      const err = `${disconnectedPlayer.name} is offline. Please wait for them to reconnect or remove them.`;
      socket.emit('error', err);
      callback?.({ success: false, error: err });
      return { success: false, error: err };
    }

    // Atomic state transition
    room.status = 'playing';
    room.drawnNumbers = [];
    room.winner = null;
    room.lastActivity = Date.now();

    // Select random connected player to start
    const connectedPlayers = room.players.filter(p => p.connected || p.isBot);
    const initialPlayer = connectedPlayers[Math.floor(Math.random() * connectedPlayers.length)] || room.players[0];
    room.currentTurn = initialPlayer.id;

    // Start server-authoritative turn timer (Requirement 18, 19, 20)
    room.turnId = 1;
    room.turnStartedAt = Date.now();
    room.turnDeadline = room.turnStartedAt + (config.TURN_TIME_LIMIT_SECONDS * 1000);

    this.clearTurnTimer(roomId);
    this.scheduleTurnTimer(roomId, room.turnId, initialPlayer.id);

    await this.store.saveRoom(roomId, room, config.ROOM_TTL_MS);
    this.io.to(roomId).emit('room-update', room);
    logger.info('Game started', { roomId, currentTurn: room.currentTurn, rounds: room.targetRounds });

    if (initialPlayer.isBot) {
      this.scheduleBotTurn(roomId);
    }

    callback?.({ success: true });
    return { success: true };
  }

  public clearTurnTimer(roomId: string): void {
    if (this.turnTimers.has(roomId)) {
      clearTimeout(this.turnTimers.get(roomId)!);
      this.turnTimers.delete(roomId);
    }
  }

  private scheduleTurnTimer(roomId: string, turnId: number, playerId: string): void {
    this.clearTurnTimer(roomId);

    const timer = setTimeout(() => {
      this.handleTurnTimeout(roomId, turnId, playerId).catch(err => {
        logger.error('Error handling turn timeout', { roomId, error: String(err) });
      });
    }, config.TURN_TIME_LIMIT_SECONDS * 1000);

    this.turnTimers.set(roomId, timer);
  }

  public async handleTurnTimeout(roomId: string, turnId: number, playerId: string): Promise<void> {
    const room = await this.store.getRoom(roomId);
    if (!room || room.status !== 'playing' || room.winner) return;

    // Atomically verify turnId and currentTurn to prevent race condition (Requirement 20)
    if (room.turnId !== turnId || room.currentTurn !== playerId) return;

    const timedOutPlayer = room.players.find(p => p.id === playerId);
    logger.info('Turn timeout triggered', { roomId, playerId, playerName: timedOutPlayer?.name });

    this.io.to(roomId).emit('game:turn-timeout', {
      playerId,
      name: timedOutPlayer?.name || 'Player'
    });

    await this.advanceTurn(roomId, room);
    await this.store.saveRoom(roomId, room, config.ROOM_TTL_MS);
    this.io.to(roomId).emit('room-update', room);
  }

  public async markNumber(socket: Socket, roomId: string, r: unknown, c: unknown): Promise<void> {
    const room = await this.store.getRoom(roomId);
    if (!room || room.status !== 'playing' || room.winner) return;

    // Strict boundary & type checks
    if (typeof r !== 'number' || typeof c !== 'number' || !Number.isInteger(r) || !Number.isInteger(c)) return;
    if (r < 0 || r >= 5 || c < 0 || c >= 5) return;

    const mapping = this.socketToPlayer.get(socket.id);
    if (!mapping || mapping.roomId !== roomId) return;

    const player = room.players.find(p => p.id === mapping.playerId);
    if (!player || !player.connected) return;

    const num = player.board[r][c];
    const isMyTurn = room.currentTurn === player.id;

    if (isMyTurn) {
      // Validate turn deadline with small network jitter tolerance (Requirement 20)
      if (room.turnDeadline && Date.now() > room.turnDeadline + 500) {
        logger.warn('Move rejected: turn timer expired', { roomId, playerId: player.id });
        return;
      }

      if (!room.drawnNumbers.includes(num)) {
        // Clear turn timer as valid move has been executed
        this.clearTurnTimer(roomId);

        // Calling new number
        room.drawnNumbers.push(num);
        room.lastActivity = Date.now();

        // Mark for ALL players who have this number
        room.players.forEach(p => {
          for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 5; col++) {
              if (p.board[row][col] === num) {
                p.marked[row][col] = true;
              }
            }
          }
          p.completedLines = checkBingo(p.marked);
        });

        // Check winner: current-turn player gets priority, then others
        if (player.completedLines >= 5 && !room.winner) {
          this.handleRoundWinner(roomId, room, player);
        }
        if (!room.winner) {
          for (const p of room.players) {
            if (p.id !== player.id && p.completedLines >= 5) {
              this.handleRoundWinner(roomId, room, p);
              break;
            }
          }
        }

        if (!room.winner && room.status === 'playing') {
          await this.advanceTurn(roomId, room);
        }

        await this.store.saveRoom(roomId, room, config.ROOM_TTL_MS);
        this.io.to(roomId).emit('room-update', room);
      } else if (!player.marked[r][c]) {
        // Marking already drawn number on turn
        player.marked[r][c] = true;
        player.completedLines = checkBingo(player.marked);
        if (player.completedLines >= 5 && !room.winner) {
          this.handleRoundWinner(roomId, room, player);
        }
        room.lastActivity = Date.now();
        await this.store.saveRoom(roomId, room, config.ROOM_TTL_MS);
        this.io.to(roomId).emit('room-update', room);
      }
    } else {
      // Not my turn: can only mark if already drawn
      if (room.drawnNumbers.includes(num) && !player.marked[r][c]) {
        player.marked[r][c] = true;
        player.completedLines = checkBingo(player.marked);
        if (player.completedLines >= 5 && !room.winner) {
          this.handleRoundWinner(roomId, room, player);
        }
        room.lastActivity = Date.now();
        await this.store.saveRoom(roomId, room, config.ROOM_TTL_MS);
        this.io.to(roomId).emit('room-update', room);
      }
    }
  }

  private async advanceTurn(roomId: string, room: GameState): Promise<void> {
    this.clearTurnTimer(roomId);

    if (room.status !== 'playing' || room.winner) return;

    const eligiblePlayers = room.players.filter(p => p.connected || p.isBot);
    if (eligiblePlayers.length === 0) return;

    const currentIdx = eligiblePlayers.findIndex(p => p.id === room.currentTurn);
    const nextIdx = (currentIdx + 1) % eligiblePlayers.length;
    const nextPlayer = eligiblePlayers[nextIdx];

    room.currentTurn = nextPlayer.id;
    room.turnId = (room.turnId || 0) + 1;
    room.turnStartedAt = Date.now();
    room.turnDeadline = room.turnStartedAt + (config.TURN_TIME_LIMIT_SECONDS * 1000);

    this.scheduleTurnTimer(roomId, room.turnId, nextPlayer.id);

    if (nextPlayer.isBot) {
      this.scheduleBotTurn(roomId);
    }
  }

  private scheduleBotTurn(roomId: string): void {
    if (this.botTimers.has(roomId)) {
      clearTimeout(this.botTimers.get(roomId)!);
      this.botTimers.delete(roomId);
    }

    const timer = setTimeout(() => {
      this.executeBotTurn(roomId).catch(err => {
        logger.error('Error executing bot turn', { roomId, error: String(err) });
      });
    }, 1500);

    this.botTimers.set(roomId, timer);
  }

  private async executeBotTurn(roomId: string): Promise<void> {
    const room = await this.store.getRoom(roomId);
    if (!room || room.status !== 'playing' || room.winner) return;

    const bot = room.players.find(p => p.id === room.currentTurn && p.isBot);
    if (!bot) return;

    const unmarkedCoords: { r: number; c: number }[] = [];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (!bot.marked[r][c]) {
          unmarkedCoords.push({ r, c });
        }
      }
    }

    if (unmarkedCoords.length === 0) return;

    const availableNumbers = unmarkedCoords.filter(
      coord => !room.drawnNumbers.includes(bot.board[coord.r][coord.c])
    );

    const chosenCoord = availableNumbers.length > 0
      ? availableNumbers[Math.floor(Math.random() * availableNumbers.length)]
      : unmarkedCoords[Math.floor(Math.random() * unmarkedCoords.length)];

    const chosenNum = bot.board[chosenCoord.r][chosenCoord.c];

    if (!room.drawnNumbers.includes(chosenNum)) {
      // Clear turn timer as bot valid move executed
      this.clearTurnTimer(roomId);

      room.drawnNumbers.push(chosenNum);
      room.lastActivity = Date.now();

      room.players.forEach(p => {
        for (let row = 0; row < 5; row++) {
          for (let col = 0; col < 5; col++) {
            if (p.board[row][col] === chosenNum) {
              p.marked[row][col] = true;
            }
          }
        }
        p.completedLines = checkBingo(p.marked);
      });

      // Check winner: bot (current turn) gets priority, then others
      if (bot.completedLines >= 5 && !room.winner) {
        this.handleRoundWinner(roomId, room, bot);
      }
      if (!room.winner) {
        for (const p of room.players) {
          if (p.id !== bot.id && p.completedLines >= 5) {
            this.handleRoundWinner(roomId, room, p);
            break;
          }
        }
      }
    }

    if (!room.winner && room.status === 'playing') {
      await this.advanceTurn(roomId, room);
    }

    await this.store.saveRoom(roomId, room, config.ROOM_TTL_MS);
    this.io.to(roomId).emit('room-update', room);
  }

  private handleRoundWinner(roomId: string, room: GameState, player: Player): void {
    if (room.winner) return; // Prevent race conditions

    this.clearTurnTimer(roomId);
    player.score++;
    // Store winner as a shallow copy to prevent stale data from later mutations
    room.winner = { ...player };
    room.lastActivity = Date.now();

    if (this.botTimers.has(roomId)) {
      clearTimeout(this.botTimers.get(roomId)!);
      this.botTimers.delete(roomId);
    }

    logger.info('Round won', { roomId, winnerId: player.id, name: player.name, round: room.currentRound });

    if (room.currentRound < room.targetRounds) {
      const timer = setTimeout(() => {
        this.startNextRound(roomId).catch(err => {
          logger.error('Error starting next round', { roomId, error: String(err) });
        });
      }, 5000);
      this.roundTimers.set(roomId, timer);
    } else {
      const sorted = [...room.players].sort((a, b) => b.score - a.score);
      room.overallWinner = { ...(sorted[0] || player) };
      room.status = 'finished';
      logger.info('Game finished', { roomId, overallWinner: room.overallWinner.name });
    }
  }

  private async startNextRound(roomId: string): Promise<void> {
    const room = await this.store.getRoom(roomId);
    if (!room) return;

    room.currentRound++;
    room.winner = null;
    room.drawnNumbers = [];
    room.lastActivity = Date.now();

    room.players.forEach(p => {
      p.board = generateBingoBoard();
      p.marked = Array(5).fill(null).map(() => Array(5).fill(false));
      p.marked[2][2] = true;
      p.completedLines = 0;
    });

    const activePlayers = room.players.filter(p => p.connected || p.isBot);
    const nextTurnPlayer = activePlayers[Math.floor(Math.random() * activePlayers.length)] || room.players[0];
    room.currentTurn = nextTurnPlayer.id;
    room.turnId = (room.turnId || 0) + 1;
    room.turnStartedAt = Date.now();
    room.turnDeadline = room.turnStartedAt + (config.TURN_TIME_LIMIT_SECONDS * 1000);

    this.scheduleTurnTimer(roomId, room.turnId, nextTurnPlayer.id);

    await this.store.saveRoom(roomId, room, config.ROOM_TTL_MS);
    this.io.to(roomId).emit('room-update', room);

    if (nextTurnPlayer.isBot) {
      this.scheduleBotTurn(roomId);
    }
  }

  public async addBot(
    socket: Socket,
    roomId: string,
    callback?: AckCallback
  ): Promise<{ success: boolean; error?: string }> {
    const room = await this.store.getRoom(roomId);
    if (!room) {
      callback?.({ success: false, error: 'Room not found' });
      return { success: false, error: 'Room not found' };
    }

    if (room.status !== 'waiting') {
      const err = 'Cannot add bots after game has started';
      socket.emit('error', err);
      callback?.({ success: false, error: err });
      return { success: false, error: err };
    }

    const mapping = this.socketToPlayer.get(socket.id);
    if (!mapping || mapping.roomId !== roomId) {
      callback?.({ success: false, error: 'Unauthorized' });
      return { success: false, error: 'Unauthorized' };
    }

    const requester = room.players.find(p => p.id === mapping.playerId);
    if (!requester || !requester.isHost) {
      const err = 'Only the host can add bots';
      socket.emit('error', err);
      callback?.({ success: false, error: err });
      return { success: false, error: err };
    }

    if (room.players.length >= config.MAX_PLAYERS_PER_ROOM) {
      const err = `Room is full (max ${config.MAX_PLAYERS_PER_ROOM} players)`;
      socket.emit('error', err);
      callback?.({ success: false, error: err });
      return { success: false, error: err };
    }

    const botId = `bot_${this.generateId(5)}`;
    // Generate unique bot name that won't collide after remove+re-add
    const existingBotNames = new Set(room.players.filter(p => p.isBot).map(p => p.name));
    let botNumber = 1;
    while (existingBotNames.has(`Bot ${botNumber}`)) {
      botNumber++;
    }
    const botBoard = generateBingoBoard();
    const marked = Array(5).fill(null).map(() => Array(5).fill(false));
    marked[2][2] = true;

    const bot: Player = {
      id: botId,
      socketId: null,
      name: `Bot ${botNumber}`,
      isHost: false,
      isBot: true,
      board: botBoard,
      marked,
      completedLines: 0,
      score: 0,
      connected: true,
      ready: true
    };

    room.players.push(bot);
    room.lastActivity = Date.now();
    await this.store.saveRoom(roomId, room, config.ROOM_TTL_MS);
    this.io.to(roomId).emit('room-update', room);
    logger.info('Bot added', { roomId, botId });
    callback?.({ success: true });
    return { success: true };
  }

  public async kickPlayer(
    socket: Socket,
    roomId: string,
    targetPlayerId: string,
    callback?: AckCallback
  ): Promise<{ success: boolean; error?: string }> {
    const room = await this.store.getRoom(roomId);
    if (!room) {
      callback?.({ success: false, error: 'Room not found' });
      return { success: false, error: 'Room not found' };
    }

    if (room.status !== 'waiting') {
      const err = 'Cannot remove players after game has started';
      socket.emit('error', err);
      callback?.({ success: false, error: err });
      return { success: false, error: err };
    }

    const mapping = this.socketToPlayer.get(socket.id);
    if (!mapping || mapping.roomId !== roomId) {
      callback?.({ success: false, error: 'Unauthorized' });
      return { success: false, error: 'Unauthorized' };
    }

    const requester = room.players.find(p => p.id === mapping.playerId);
    if (!requester || !requester.isHost) {
      const err = 'Only the host can remove players or bots';
      socket.emit('error', err);
      callback?.({ success: false, error: err });
      return { success: false, error: err };
    }

    const targetIdx = room.players.findIndex(p => p.id === targetPlayerId);
    if (targetIdx === -1) {
      const err = 'Target player not found in room';
      socket.emit('error', err);
      callback?.({ success: false, error: err });
      return { success: false, error: err };
    }

    const target = room.players[targetIdx];
    if (target.isHost) {
      const err = 'Host cannot kick themselves';
      socket.emit('error', err);
      callback?.({ success: false, error: err });
      return { success: false, error: err };
    }

    // Clean bot timers if target is a bot
    if (target.isBot && this.botTimers.has(roomId)) {
      clearTimeout(this.botTimers.get(roomId)!);
      this.botTimers.delete(roomId);
    }

    // Invalidate target's reconnect token permanently (Requirement 13)
    await this.store.deletePlayerToken(roomId, targetPlayerId);

    // Notify and disconnect target socket if connected
    if (target.socketId) {
      const targetSocket = this.io.sockets.sockets.get(target.socketId);
      if (targetSocket) {
        targetSocket.emit('room:kicked', { reason: 'You have been removed from the room by the host.' });
        targetSocket.leave(roomId);
      }
      this.socketToPlayer.delete(target.socketId);
    }

    const timerKey = `${roomId}:${targetPlayerId}`;
    if (this.disconnectTimers.has(timerKey)) {
      clearTimeout(this.disconnectTimers.get(timerKey)!);
      this.disconnectTimers.delete(timerKey);
    }

    room.players.splice(targetIdx, 1);
    room.lastActivity = Date.now();

    await this.store.saveRoom(roomId, room, config.ROOM_TTL_MS);
    this.io.to(roomId).emit('room-update', room);
    logger.info('Player kicked by host', { roomId, targetPlayerId, name: target.name });

    callback?.({ success: true });
    return { success: true };
  }

  public async removePlayer(socket: Socket, roomId: string, targetPlayerId: string, callback?: AckCallback): Promise<void> {
    await this.kickPlayer(socket, roomId, targetPlayerId, callback);
  }

  public async resetRoom(socket: Socket, roomId: string): Promise<void> {
    const room = await this.store.getRoom(roomId);
    if (!room) return;

    const mapping = this.socketToPlayer.get(socket.id);
    if (!mapping || mapping.roomId !== roomId) return;

    const player = room.players.find(p => p.id === mapping.playerId);
    if (!player || !player.isHost) return;

    this.clearTurnTimer(roomId);
    if (this.botTimers.has(roomId)) {
      clearTimeout(this.botTimers.get(roomId)!);
      this.botTimers.delete(roomId);
    }
    if (this.roundTimers.has(roomId)) {
      clearTimeout(this.roundTimers.get(roomId)!);
      this.roundTimers.delete(roomId);
    }

    room.status = 'waiting';
    room.winner = null;
    room.overallWinner = null;
    room.currentRound = 1;
    room.drawnNumbers = [];
    room.currentTurn = player.id;
    room.lastActivity = Date.now();

    room.players.forEach(p => {
      p.score = 0;
      p.completedLines = 0;
      p.board = generateBingoBoard();
      p.marked = Array(5).fill(null).map(() => Array(5).fill(false));
      p.marked[2][2] = true;
      p.ready = p.isBot ? true : false;
    });

    await this.store.saveRoom(roomId, room, config.ROOM_TTL_MS);
    this.io.to(roomId).emit('room-update', room);
    logger.info('Room reset for new game, all old records cleared', { roomId });
  }

  public async leaveRoom(socket: Socket, roomId: string): Promise<void> {
    const room = await this.store.getRoom(roomId);
    if (!room) return;

    const mapping = this.socketToPlayer.get(socket.id);
    if (!mapping || mapping.roomId !== roomId) return;

    const playerIdx = room.players.findIndex(p => p.id === mapping.playerId);
    if (playerIdx === -1) return;

    const player = room.players[playerIdx];
    const isHost = player.isHost;

    room.players.splice(playerIdx, 1);
    this.socketToPlayer.delete(socket.id);
    socket.leave(roomId);

    await this.store.deletePlayerToken(roomId, player.id);

    const timerKey = `${roomId}:${player.id}`;
    if (this.disconnectTimers.has(timerKey)) {
      clearTimeout(this.disconnectTimers.get(timerKey)!);
      this.disconnectTimers.delete(timerKey);
    }

    const remainingHumans = room.players.filter(p => !p.isBot);
    if (remainingHumans.length === 0) {
      await this.destroyRoom(roomId);
      return;
    }

    if (isHost) {
      const newHost = remainingHumans.find(p => p.connected) || remainingHumans[0];
      if (newHost) newHost.isHost = true;
    }

    if (room.currentTurn === player.id) {
      await this.advanceTurn(roomId, room);
    }

    room.lastActivity = Date.now();
    await this.store.saveRoom(roomId, room, config.ROOM_TTL_MS);
    this.io.to(roomId).emit('room-update', room);
    logger.info('Player left room explicitly', { roomId, playerId: player.id });
  }

  public async handleSocketDisconnect(socket: Socket): Promise<void> {
    const mapping = this.socketToPlayer.get(socket.id);
    if (!mapping) return;

    this.socketToPlayer.delete(socket.id);
    const { roomId, playerId } = mapping;
    const room = await this.store.getRoom(roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === playerId);
    if (!player) return;

    player.connected = false;
    player.socketId = null;
    player.disconnectedAt = Date.now();

    logger.info('Player disconnected, entering grace period', {
      roomId,
      playerId,
      graceMs: config.RECONNECT_GRACE_PERIOD_MS
    });

    await this.store.saveRoom(roomId, room, config.ROOM_TTL_MS);
    this.io.to(roomId).emit('room-update', room);

    // If active turn player disconnected, advance turn after 10s if not back
    if (room.status === 'playing' && room.currentTurn === playerId) {
      setTimeout(async () => {
        const currentRoom = await this.store.getRoom(roomId);
        if (currentRoom && currentRoom.status === 'playing' && currentRoom.currentTurn === playerId) {
          const p = currentRoom.players.find(x => x.id === playerId);
          if (p && !p.connected) {
            logger.info('Advancing turn past disconnected player', { roomId, playerId });
            await this.advanceTurn(roomId, currentRoom);
            await this.store.saveRoom(roomId, currentRoom, config.ROOM_TTL_MS);
            this.io.to(roomId).emit('room-update', currentRoom);
          }
        }
      }, 10000);
    }

    const timerKey = `${roomId}:${playerId}`;
    if (this.disconnectTimers.has(timerKey)) {
      clearTimeout(this.disconnectTimers.get(timerKey)!);
    }

    const timer = setTimeout(() => {
      this.disconnectTimers.delete(timerKey);
      this.finalizePlayerDisconnect(roomId, playerId).catch(err => {
        logger.error('Error finalizing player disconnect', { roomId, playerId, error: String(err) });
      });
    }, config.RECONNECT_GRACE_PERIOD_MS);

    this.disconnectTimers.set(timerKey, timer);
  }

  private async finalizePlayerDisconnect(roomId: string, playerId: string): Promise<void> {
    const room = await this.store.getRoom(roomId);
    if (!room) return;

    const playerIdx = room.players.findIndex(p => p.id === playerId);
    if (playerIdx === -1) return;

    const player = room.players[playerIdx];
    if (player.connected) return;

    logger.info('Player grace period expired, removing player', { roomId, playerId });
    const isHost = player.isHost;
    room.players.splice(playerIdx, 1);
    await this.store.deletePlayerToken(roomId, playerId);

    const remainingHumans = room.players.filter(p => !p.isBot);
    if (remainingHumans.length === 0) {
      await this.destroyRoom(roomId);
      return;
    }

    if (isHost) {
      const nextHost = remainingHumans.find(p => p.connected) || remainingHumans[0];
      if (nextHost) nextHost.isHost = true;
    }

    if (room.currentTurn === playerId) {
      await this.advanceTurn(roomId, room);
    }

    room.lastActivity = Date.now();
    await this.store.saveRoom(roomId, room, config.ROOM_TTL_MS);
    this.io.to(roomId).emit('room-update', room);
  }

  public async sendMessage(socket: Socket, roomId: string, rawText: unknown): Promise<void> {
    const room = await this.store.getRoom(roomId);
    if (!room) return;

    const mapping = this.socketToPlayer.get(socket.id);
    if (!mapping || mapping.roomId !== roomId) return;

    const player = room.players.find(p => p.id === mapping.playerId);
    if (!player) return;

    if (typeof rawText !== 'string') return;

    // Sanitize & escape HTML
    const sanitized = rawText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .trim()
      .slice(0, config.MAX_CHAT_MESSAGE_LENGTH);

    if (!sanitized) return;

    const message: ChatMessage = {
      id: crypto.randomUUID(),
      sender: player.name,
      text: sanitized,
      timestamp: Date.now()
    };

    room.lastActivity = Date.now();
    await this.store.saveRoom(roomId, room, config.ROOM_TTL_MS);
    this.io.to(roomId).emit('chat-message', message);
  }

  public async destroyRoom(roomId: string): Promise<void> {
    logger.info('Destroying room', { roomId });

    this.clearTurnTimer(roomId);
    if (this.botTimers.has(roomId)) {
      clearTimeout(this.botTimers.get(roomId)!);
      this.botTimers.delete(roomId);
    }
    if (this.roundTimers.has(roomId)) {
      clearTimeout(this.roundTimers.get(roomId)!);
      this.roundTimers.delete(roomId);
    }

    await this.store.deleteRoom(roomId);
  }

  private async cleanupExpiredRooms(): Promise<void> {
    const roomIds = await this.store.getAllRoomIds();
    const now = Date.now();

    for (const roomId of roomIds) {
      const room = await this.store.getRoom(roomId);
      if (!room) continue;

      const isExpired = now - room.lastActivity > config.ROOM_TTL_MS;
      const isInactive = now - room.lastActivity > config.INACTIVE_ROOM_TIMEOUT_MS;
      const noConnectedHumans = room.players.filter(p => !p.isBot && p.connected).length === 0;

      if (isExpired || (isInactive && noConnectedHumans)) {
        logger.info('Sweeping expired/inactive room', { roomId, isExpired, isInactive });
        await this.destroyRoom(roomId);
      }
    }
  }

  public shutdown(): void {
    logger.info('RoomManager shutting down, cleaning all timers and rooms');
    clearInterval(this.cleanupInterval);
    this.turnTimers.forEach(t => clearTimeout(t));
    this.botTimers.forEach(t => clearTimeout(t));
    this.roundTimers.forEach(t => clearTimeout(t));
    this.disconnectTimers.forEach(t => clearTimeout(t));
    this.turnTimers.clear();
    this.botTimers.clear();
    this.roundTimers.clear();
    this.disconnectTimers.clear();
    this.socketToPlayer.clear();
    this.store.close().catch(err => {
      logger.error('Error closing store', { error: String(err) });
    });
  }
}
