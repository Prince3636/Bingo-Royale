import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { setupSocketHandlers, closeRedisConnections, roomManagerInstance } from './sockets/index';
import { config } from './config';
import { logger } from './logger';
import { ClientToServerEvents, ServerToClientEvents } from '../src/types/game';

// Catch unhandled errors at the process level to prevent silent exits
process.on('uncaughtException', (err) => {
  logger.error('CRITICAL: Uncaught Exception caught at process level', { error: err.message, stack: err.stack });
});

process.on('unhandledRejection', (reason) => {
  logger.error('CRITICAL: Unhandled Promise Rejection', { reason: String(reason) });
});

async function startServer() {
  const app = express();
  const httpServer = createServer(app);

  // Parse CORS allowlist
  const parsedOrigins = config.CLIENT_URL
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const corsValidator = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow non-browser requests (e.g. mobile app, curl, healthcheck probes)
    if (!origin) return callback(null, true);

    // Development mode allows localhost
    if (!config.isProduction) {
      if (origin.includes('localhost') || origin.includes('127.0.0.1') || config.CLIENT_URL === '*') {
        return callback(null, true);
      }
    }

    // Strict production check against allowed origins
    if (parsedOrigins.length > 0 && parsedOrigins.includes(origin)) {
      return callback(null, true);
    }

    logger.warn('CORS request blocked from origin', { origin });
    callback(new Error(`CORS blocked request from origin: ${origin}`));
  };

  const corsOptions: cors.CorsOptions = {
    origin: corsValidator,
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true
  };

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));

  app.use(cors(corsOptions));
  app.use(express.json({ limit: config.MAX_HTTP_PAYLOAD_BYTES }));

  // Socket.IO Server configuration
  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: (origin, callback) => {
        corsValidator(origin, (err, allow) => {
          callback(err, allow || false);
        });
      },
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: config.SOCKET_PING_TIMEOUT,
    pingInterval: config.SOCKET_PING_INTERVAL,
    maxHttpBufferSize: config.MAX_SOCKET_PAYLOAD_BYTES,
    connectTimeout: 45000,
    allowUpgrades: true
  });

  const roomManager = await setupSocketHandlers(io);

  // Health check endpoint (Liveness)
  app.get('/health', async (req, res) => {
    try {
      const activeRooms = await roomManager.getActiveRoomCount();
      res.status(200).json({
        status: 'ok',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        activeRooms,
        connectedSockets: io.engine.clientsCount,
        environment: config.NODE_ENV
      });
    } catch {
      res.status(500).json({ status: 'error', message: 'Healthcheck failed' });
    }
  });

  // Readiness check endpoint (Readiness)
  app.get('/ready', async (req, res) => {
    try {
      const activeRooms = await roomManager.getActiveRoomCount();
      const isUnderCapacity = activeRooms < config.MAX_ACTIVE_ROOMS;
      if (!isUnderCapacity) {
        return res.status(503).json({ ready: false, reason: 'Max room capacity reached' });
      }
      res.status(200).json({ ready: true, activeRooms });
    } catch (err) {
      res.status(503).json({ ready: false, error: String(err) });
    }
  });

  // Version and deployment metadata
  app.get('/version', (req, res) => {
    res.status(200).json({
      version: '1.2.0',
      commit: process.env.RENDER_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || 'local-build',
      environment: config.NODE_ENV,
      features: {
        roundSelection: true,
        botCapacity: 5,
        authoritativeReady: true,
        turnTimer: 15
      }
    });
  });

  // Vite development middleware or static production serving
  if (!config.isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Graceful shutdown
  let isShuttingDown = false;
  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    io.emit('error', 'Server is restarting for maintenance. Please wait...');
    io.close(() => {
      logger.info('Socket.IO engine closed');
    });

    roomManager.shutdown();
    await closeRedisConnections();

    httpServer.close(() => {
      logger.info('HTTP server closed. Exiting process.');
      process.exit(0);
    });

    setTimeout(() => {
      logger.warn('Forcing process exit after timeout');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  httpServer.listen(config.PORT, '0.0.0.0', () => {
    logger.info(`Server listening on 0.0.0.0:${config.PORT} [${config.NODE_ENV}]`);
  });
}

startServer().catch((err) => {
  logger.error('Fatal: Failed to start server', { error: String(err) });
  process.exit(1);
});
