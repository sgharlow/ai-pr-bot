/**
 * WebhookRateLimiter — restored 2026-07-18.
 *
 * service.ts has imported this module since the Jan 2026 "Sync local changes" commit, but the
 * file itself was never committed (the repo did not compile). This is the minimal in-memory
 * sliding-window implementation of the interface service.ts consumes: checkRateLimit(),
 * connect(), disconnect(). Per-identifier window; fail-open is intentional — a rate-limiter
 * bug must not take down webhook ingestion (GitHub retries deliveries).
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number; // epoch ms when the current window resets
  error?: string;
}

export class WebhookRateLimiter {
  private hits: Map<string, number[]> = new Map();

  constructor(
    private maxPerWindow: number = 100,
    private windowMs: number = 60_000,
  ) {}

  async connect(): Promise<void> {
    // In-memory implementation: nothing to connect. Kept so a Redis-backed
    // implementation can swap in without changing service.ts.
  }

  async checkRateLimit(identifier: string): Promise<RateLimitResult> {
    try {
      const now = Date.now();
      const windowStart = now - this.windowMs;
      const recent = (this.hits.get(identifier) ?? []).filter((t) => t > windowStart);
      const allowed = recent.length < this.maxPerWindow;
      if (allowed) {
        recent.push(now);
      }
      this.hits.set(identifier, recent);
      return {
        allowed,
        remaining: Math.max(0, this.maxPerWindow - recent.length),
        resetTime: (recent[0] ?? now) + this.windowMs,
        error: allowed ? undefined : `Rate limit of ${this.maxPerWindow}/min exceeded`,
      };
    } catch {
      // Fail open: never block webhook ingestion on limiter internals.
      return { allowed: true, remaining: this.maxPerWindow, resetTime: Date.now() + this.windowMs };
    }
  }

  async disconnect(): Promise<void> {
    this.hits.clear();
  }
}
