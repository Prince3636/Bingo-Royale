import dotenv from 'dotenv';
dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
const rawClientUrl = process.env.CLIENT_URL?.trim() || '';

// In production, warn if CLIENT_URL is wildcard or missing
if (isProduction && (!rawClientUrl || rawClientUrl === '*')) {
  console.warn(
    '[SECURITY WARNING] Running in production with CLIENT_URL="*" or empty! Set CLIENT_URL to your explicit frontend domain (e.g., https://your-app.vercel.app).'
  );
}

export const config = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  isProduction,
  PORT: parseInt(process.env.PORT || '3000', 10),
  
  // Explicit CORS client URL(s) - comma separated
  CLIENT_URL: rawClientUrl || (isProduction ? '' : '*'),
  
  // Redis URL for horizontal multi-instance scaling
  REDIS_URL: process.env.REDIS_URL?.trim() || '',
  
  // Scalability and gameplay limits
  MIN_PLAYERS_TO_START: parseInt(process.env.MIN_PLAYERS_TO_START || '2', 10),
  MAX_PLAYERS_PER_ROOM: parseInt(process.env.MAX_PLAYERS_PER_ROOM || '5', 10),
  TURN_TIME_LIMIT_SECONDS: parseInt(process.env.TURN_TIME_LIMIT_SECONDS || '15', 10),
  MAX_ACTIVE_ROOMS: parseInt(process.env.MAX_ACTIVE_ROOMS || '1000', 10),
  ROOM_TTL_MS: parseInt(process.env.ROOM_TTL_MS || '7200000', 10), // 2 hours
  INACTIVE_ROOM_TIMEOUT_MS: parseInt(process.env.INACTIVE_ROOM_TIMEOUT_MS || '1800000', 10), // 30 mins
  RECONNECT_GRACE_PERIOD_MS: parseInt(process.env.RECONNECT_GRACE_PERIOD_MS || '60000', 10), // 60s
  
  // Rate limiting (per-window limits)
  RATE_LIMIT: {
    CREATE_ROOM_PER_MIN: parseInt(process.env.RATE_LIMIT_CREATE_ROOM_PER_MIN || '10', 10),
    JOIN_ROOM_PER_MIN: parseInt(process.env.RATE_LIMIT_JOIN_ROOM_PER_MIN || '20', 10),
    RECONNECT_PER_MIN: parseInt(process.env.RATE_LIMIT_RECONNECT_PER_MIN || '20', 10),
    CHAT_PER_SEC: parseInt(process.env.RATE_LIMIT_CHAT_PER_SEC || '2', 10),
    ACTIONS_PER_SEC: parseInt(process.env.RATE_LIMIT_ACTIONS_PER_SEC || '6', 10)
  },

  // Chat limits
  MAX_CHAT_MESSAGE_LENGTH: parseInt(process.env.MAX_CHAT_MESSAGE_LENGTH || '150', 10),
  MAX_ROOM_CHAT_HISTORY: parseInt(process.env.MAX_ROOM_CHAT_HISTORY || '50', 10),
  
  // Network / Socket limits
  MAX_HTTP_PAYLOAD_BYTES: 20 * 1024, // 20KB
  MAX_SOCKET_PAYLOAD_BYTES: 50 * 1024, // 50KB
  SOCKET_PING_TIMEOUT: parseInt(process.env.SOCKET_PING_TIMEOUT || '20000', 10),
  SOCKET_PING_INTERVAL: parseInt(process.env.SOCKET_PING_INTERVAL || '25000', 10)
};
