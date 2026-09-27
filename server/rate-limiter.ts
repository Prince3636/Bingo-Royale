/**
 * High-performance sliding window rate limiter per socket / key.
 * Automatically cleans up expired timestamps to prevent memory leaks.
 */
export class RateLimiter {
  private windows: Map<string, number[]> = new Map();
  private maxEvents: number;
  private windowMs: number;

  constructor(maxEvents: number, windowMs: number = 1000) {
    this.maxEvents = maxEvents;
    this.windowMs = windowMs;

    // Periodic cleanup of stale entries every 60 seconds
    const timer = setInterval(() => {
      this.cleanup();
    }, 60000);
    timer.unref();
  }

  public isAllowed(key: string): boolean {
    const now = Date.now();
    const timestamps = this.windows.get(key) || [];
    const validTimestamps = timestamps.filter(t => now - t < this.windowMs);

    if (validTimestamps.length >= this.maxEvents) {
      this.windows.set(key, validTimestamps);
      return false;
    }

    validTimestamps.push(now);
    this.windows.set(key, validTimestamps);
    return true;
  }

  public reset(key: string): void {
    this.windows.delete(key);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, timestamps] of this.windows.entries()) {
      const valid = timestamps.filter(t => now - t < this.windowMs);
      if (valid.length === 0) {
        this.windows.delete(key);
      } else {
        this.windows.set(key, valid);
      }
    }
  }

  public destroy(): void {
    this.windows.clear();
  }
}
