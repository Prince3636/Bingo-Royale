/**
 * Dual-tier Memory & Persistent Cache Manager
 * - Tier 1: In-memory Map (avoids synchronous disk I/O during game loop)
 * - Tier 2: LocalStorage persistence (strictly whitelisted non-sensitive user preferences)
 * 
 * SECURITY AUDIT ENFORCEMENT:
 * Sensitive credentials (reconnect tokens, session secrets, room states) are NEVER
 * persisted to unencrypted disk storage. They are kept in volatile RAM / active session only.
 */

interface CacheEntry<T> {
  value: T;
  expiry?: number; // timestamp in ms
}

// Whitelist of keys permitted to be written to persistent localStorage.
// Sensitive authentication tokens (e.g. reconnect tokens) MUST NOT be added here.
const PERSISTENT_STORAGE_WHITELIST = new Set<string>([
  'bingo_player_name',
  'bingo_sfx_muted',
  'bingo_theme',
  'bingo_custom_server_url'
]);

const MAX_MEM_CACHE_SIZE = 50;

class FastCacheManager {
  private memCache: Map<string, CacheEntry<unknown>> = new Map();
  private prefix = 'br_cache_';

  /**
   * Set a key-value pair.
   * If the key is in PERSISTENT_STORAGE_WHITELIST, it will also be persisted to localStorage.
   * Otherwise, it remains strictly in memory for security and privacy.
   */
  public set<T>(key: string, value: T, ttlSeconds?: number): void {
    const expiry = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    const entry: CacheEntry<T> = { value, expiry };

    // Evict oldest entry if size limit reached
    if (this.memCache.size >= MAX_MEM_CACHE_SIZE && !this.memCache.has(key)) {
      const oldestKey = this.memCache.keys().next().value;
      if (oldestKey) this.memCache.delete(oldestKey);
    }

    // Tier 1: In-memory
    this.memCache.set(key, entry);

    // Tier 2: Persistent storage (whitelisted non-sensitive keys only)
    if (PERSISTENT_STORAGE_WHITELIST.has(key)) {
      try {
        localStorage.setItem(`${this.prefix}${key}`, JSON.stringify(entry));
      } catch (err) {
        console.warn('[Cache] Storage write error:', err);
      }
    }
  }

  /**
   * Retrieve cached value.
   * Checks in-memory cache first, then falls back to localStorage if key is whitelisted.
   */
  public get<T>(key: string, defaultValue: T | null = null): T | null {
    // 1. In-memory lookup
    if (this.memCache.has(key)) {
      const entry = this.memCache.get(key) as CacheEntry<T>;
      if (!entry.expiry || entry.expiry > Date.now()) {
        return entry.value;
      }
      this.memCache.delete(key);
    }

    // 2. Persistent storage lookup (whitelisted keys only)
    if (PERSISTENT_STORAGE_WHITELIST.has(key)) {
      try {
        const raw = localStorage.getItem(`${this.prefix}${key}`);
        if (!raw) return defaultValue;

        const entry = JSON.parse(raw) as CacheEntry<T>;
        if (entry.expiry && entry.expiry <= Date.now()) {
          localStorage.removeItem(`${this.prefix}${key}`);
          return defaultValue;
        }

        this.memCache.set(key, entry);
        return entry.value;
      } catch {
        return defaultValue;
      }
    }

    return defaultValue;
  }

  /**
   * Remove item from memory and persistent cache
   */
  public remove(key: string): void {
    this.memCache.delete(key);
    if (PERSISTENT_STORAGE_WHITELIST.has(key)) {
      try {
        localStorage.removeItem(`${this.prefix}${key}`);
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Clear all cached items
   */
  public clear(): void {
    this.memCache.clear();
    try {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith(this.prefix)) {
          localStorage.removeItem(k);
        }
      });
    } catch {
      // Ignore
    }
  }
}

export const fastCache = new FastCacheManager();
