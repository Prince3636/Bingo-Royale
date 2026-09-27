import { createClient } from 'redis';
import { GameState } from '../src/types/game';
import { logger } from './logger';

export interface IGameStateStore {
  getRoom(roomId: string): Promise<GameState | null>;
  saveRoom(roomId: string, state: GameState, ttlMs?: number): Promise<void>;
  deleteRoom(roomId: string): Promise<void>;
  getRoomCount(): Promise<number>;
  getAllRoomIds(): Promise<string[]>;
  savePlayerToken(roomId: string, playerId: string, token: string, ttlMs?: number): Promise<void>;
  getPlayerToken(roomId: string, playerId: string): Promise<string | null>;
  deletePlayerToken(roomId: string, playerId: string): Promise<void>;
  close(): Promise<void>;
}

/**
 * High-performance In-Memory State Store for single-instance deployments.
 */
export class MemoryGameStateStore implements IGameStateStore {
  private rooms: Map<string, { state: GameState; expiresAt: number }> = new Map();
  private tokens: Map<string, { token: string; expiresAt: number }> = new Map();

  public async getRoom(roomId: string): Promise<GameState | null> {
    const entry = this.rooms.get(roomId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.rooms.delete(roomId);
      return null;
    }
    return entry.state;
  }

  public async saveRoom(roomId: string, state: GameState, ttlMs: number = 7200000): Promise<void> {
    this.rooms.set(roomId, {
      state,
      expiresAt: Date.now() + ttlMs
    });
  }

  public async deleteRoom(roomId: string): Promise<void> {
    this.rooms.delete(roomId);
  }

  public async getRoomCount(): Promise<number> {
    const now = Date.now();
    let count = 0;
    for (const [id, entry] of this.rooms.entries()) {
      if (now <= entry.expiresAt) count++;
      else this.rooms.delete(id);
    }
    return count;
  }

  public async getAllRoomIds(): Promise<string[]> {
    const now = Date.now();
    const ids: string[] = [];
    for (const [id, entry] of this.rooms.entries()) {
      if (now <= entry.expiresAt) ids.push(id);
      else this.rooms.delete(id);
    }
    return ids;
  }

  public async savePlayerToken(roomId: string, playerId: string, token: string, ttlMs: number = 7200000): Promise<void> {
    this.tokens.set(`${roomId}:${playerId}`, {
      token,
      expiresAt: Date.now() + ttlMs
    });
  }

  public async getPlayerToken(roomId: string, playerId: string): Promise<string | null> {
    const entry = this.tokens.get(`${roomId}:${playerId}`);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.tokens.delete(`${roomId}:${playerId}`);
      return null;
    }
    return entry.token;
  }

  public async deletePlayerToken(roomId: string, playerId: string): Promise<void> {
    this.tokens.delete(`${roomId}:${playerId}`);
  }

  public async close(): Promise<void> {
    this.rooms.clear();
    this.tokens.clear();
  }
}

/**
 * Distributed Redis State Store for multi-instance horizontal scaling.
 */
export class RedisGameStateStore implements IGameStateStore {
  private client: ReturnType<typeof createClient>;

  constructor(redisUrl: string) {
    this.client = createClient({ url: redisUrl });
    this.client.on('error', (err) => logger.error('RedisGameStateStore Error', { error: err.message }));
  }

  public async init(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
      logger.info('Connected to Redis for distributed game state store');
    }
  }

  public async getRoom(roomId: string): Promise<GameState | null> {
    const data = await this.client.get(`bingo:room:${roomId}`);
    if (!data) return null;
    try {
      return JSON.parse(String(data)) as GameState;
    } catch {
      return null;
    }
  }

  public async saveRoom(roomId: string, state: GameState, ttlMs: number = 7200000): Promise<void> {
    const key = `bingo:room:${roomId}`;
    const serialized = JSON.stringify(state);
    await this.client.set(key, serialized, { PX: ttlMs });
    await this.client.sAdd('bingo:active_rooms', roomId);
  }

  public async deleteRoom(roomId: string): Promise<void> {
    await this.client.del(`bingo:room:${roomId}`);
    await this.client.sRem('bingo:active_rooms', roomId);
  }

  public async getRoomCount(): Promise<number> {
    const card = await this.client.sCard('bingo:active_rooms');
    return Number(card);
  }

  public async getAllRoomIds(): Promise<string[]> {
    const members = await this.client.sMembers('bingo:active_rooms');
    return Array.from(members).map(m => String(m));
  }

  public async savePlayerToken(roomId: string, playerId: string, token: string, ttlMs: number = 7200000): Promise<void> {
    const key = `bingo:token:${roomId}:${playerId}`;
    await this.client.set(key, token, { PX: ttlMs });
  }

  public async getPlayerToken(roomId: string, playerId: string): Promise<string | null> {
    const token = await this.client.get(`bingo:token:${roomId}:${playerId}`);
    return token ? String(token) : null;
  }

  public async deletePlayerToken(roomId: string, playerId: string): Promise<void> {
    await this.client.del(`bingo:token:${roomId}:${playerId}`);
  }

  public async close(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }
}
