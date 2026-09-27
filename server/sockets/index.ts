import { Server as SocketIOServer, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { ClientToServerEvents, ServerToClientEvents } from '../../src/types/game';
import { RoomManager } from '../room-manager';
import { MemoryGameStateStore, RedisGameStateStore, IGameStateStore } from '../game-store';
import { RateLimiter } from '../rate-limiter';
import { config } from '../config';
import { logger } from '../logger';

export let roomManagerInstance: RoomManager | null = null;
let redisPubClient: ReturnType<typeof createClient> | null = null;
let redisSubClient: ReturnType<typeof createClient> | null = null;
let gameStateStore: IGameStateStore | null = null;

export const setupSocketHandlers = async (
  io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>
): Promise<RoomManager> => {
  // Initialize state store
  if (config.REDIS_URL) {
    try {
      logger.info('Initializing Redis for Socket.IO Adapter and GameStateStore...', {
        redisUrl: config.REDIS_URL.replace(/:\/\/[^@]+@/, '://***@')
      });

      redisPubClient = createClient({ url: config.REDIS_URL });
      redisSubClient = redisPubClient.duplicate();

      redisPubClient.on('error', (err) => logger.error('Redis Pub Client Error', { error: err.message }));
      redisSubClient.on('error', (err) => logger.error('Redis Sub Client Error', { error: err.message }));

      await Promise.all([redisPubClient.connect(), redisSubClient.connect()]);
      io.adapter(createAdapter(redisPubClient, redisSubClient));

      const redisStore = new RedisGameStateStore(config.REDIS_URL);
      await redisStore.init();
      gameStateStore = redisStore;
      logger.info('Socket.IO Redis Adapter and RedisGameStateStore connected successfully');
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to initialize Redis adapter/store, falling back to in-memory store', { error: errorMsg });
      gameStateStore = new MemoryGameStateStore();
    }
  } else {
    logger.info('Running in single-instance mode (In-Memory room adapter and state store)');
    gameStateStore = new MemoryGameStateStore();
  }

  const roomManager = new RoomManager(io, gameStateStore);
  roomManagerInstance = roomManager;

  // Granular Rate Limiters
  const createRoomLimiter = new RateLimiter(config.RATE_LIMIT.CREATE_ROOM_PER_MIN, 60000);
  const joinRoomLimiter = new RateLimiter(config.RATE_LIMIT.JOIN_ROOM_PER_MIN, 60000);
  const reconnectLimiter = new RateLimiter(config.RATE_LIMIT.RECONNECT_PER_MIN, 60000);
  const chatRateLimiter = new RateLimiter(config.RATE_LIMIT.CHAT_PER_SEC, 1000);
  const actionRateLimiter = new RateLimiter(config.RATE_LIMIT.ACTIONS_PER_SEC, 1000);

  io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
    logger.info('Socket connected', { socketId: socket.id, address: socket.handshake.address });

    // Helper: Safely handle socket errors without crashing
    const safeHandle = async (actionName: string, fn: () => Promise<unknown> | unknown) => {
      try {
        await fn();
      } catch (err: unknown) {
        logger.error(`Error in ${actionName}`, { socketId: socket.id, error: String(err) });
        socket.emit('error', 'An internal server error occurred. Please try again.');
      }
    };

    // Create Room
    socket.on('create-room', (name) => {
      safeHandle('create-room', async () => {
        if (!createRoomLimiter.isAllowed(socket.id)) {
          return socket.emit('error', 'Room creation limit reached. Please wait a minute.');
        }
        await roomManager.createRoom(socket, name);
      });
    });

    // Join Room
    socket.on('join-room', (roomId, name, explicitPlayerId, reconnectToken) => {
      safeHandle('join-room', async () => {
        if (!joinRoomLimiter.isAllowed(socket.id)) {
          return socket.emit('error', 'Too many join attempts. Please slow down.');
        }
        await roomManager.joinRoom(socket, roomId, name, explicitPlayerId, reconnectToken);
      });
    });

    // Reconnect Room
    socket.on('reconnect-room', (roomId, playerId, reconnectToken) => {
      safeHandle('reconnect-room', async () => {
        if (!reconnectLimiter.isAllowed(socket.id)) {
          return socket.emit('error', 'Too many reconnect attempts. Please wait.');
        }
        if (!reconnectToken) {
          return socket.emit('error', 'Missing reconnect authentication token');
        }
        await roomManager.reconnectPlayer(socket, roomId, playerId, reconnectToken);
      });
    });

    // Start Game
    socket.on('start-game', (roomId) => {
      safeHandle('start-game', async () => {
        if (!actionRateLimiter.isAllowed(socket.id)) return;
        await roomManager.startGame(socket, roomId);
      });
    });

    // Set Rounds
    socket.on('set-rounds', (roomId, rounds) => {
      safeHandle('set-rounds', async () => {
        if (!actionRateLimiter.isAllowed(socket.id)) return;
        await roomManager.setRounds(socket, roomId, rounds);
      });
    });

    // Set Board
    socket.on('set-board', (roomId, board) => {
      safeHandle('set-board', async () => {
        if (!actionRateLimiter.isAllowed(socket.id)) return;
        await roomManager.setBoard(socket, roomId, board);
      });
    });

    // Mark / Call Number
    socket.on('mark-number', (roomId, r, c) => {
      safeHandle('mark-number', async () => {
        if (!actionRateLimiter.isAllowed(socket.id)) {
          return socket.emit('error', 'Action rate limit exceeded. Please wait a moment.');
        }
        await roomManager.markNumber(socket, roomId, r, c);
      });
    });

    // Add Bot
    socket.on('add-bot', (roomId) => {
      safeHandle('add-bot', async () => {
        if (!actionRateLimiter.isAllowed(socket.id)) return;
        await roomManager.addBot(socket, roomId);
      });
    });

    // Remove Player
    socket.on('remove-player', (roomId, playerId) => {
      safeHandle('remove-player', async () => {
        if (!actionRateLimiter.isAllowed(socket.id)) return;
        await roomManager.removePlayer(socket, roomId, playerId);
      });
    });

    // Leave Room
    socket.on('leave-room', (roomId) => {
      safeHandle('leave-room', async () => {
        await roomManager.leaveRoom(socket, roomId);
      });
    });

    // Send Chat Message
    socket.on('send-message', (roomId, text) => {
      safeHandle('send-message', async () => {
        if (!chatRateLimiter.isAllowed(socket.id)) {
          return socket.emit('error', 'Chat rate limit exceeded. Please slow down.');
        }
        await roomManager.sendMessage(socket, roomId, text);
      });
    });

    // Ping / Pong
    socket.on('ping', () => {
      socket.emit('pong', Date.now());
    });

    // Disconnect
    socket.on('disconnect', (reason) => {
      logger.info('Socket disconnected', { socketId: socket.id, reason });
      createRoomLimiter.reset(socket.id);
      joinRoomLimiter.reset(socket.id);
      reconnectLimiter.reset(socket.id);
      chatRateLimiter.reset(socket.id);
      actionRateLimiter.reset(socket.id);

      safeHandle('disconnect', async () => {
        await roomManager.handleSocketDisconnect(socket);
      });
    });
  });

  return roomManager;
};

export const closeRedisConnections = async (): Promise<void> => {
  if (redisPubClient && redisPubClient.isOpen) {
    await redisPubClient.quit();
  }
  if (redisSubClient && redisSubClient.isOpen) {
    await redisSubClient.quit();
  }
  if (gameStateStore) {
    await gameStateStore.close();
  }
};
