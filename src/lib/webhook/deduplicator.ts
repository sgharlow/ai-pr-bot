/**
 * WebhookDeduplicator — restored 2026-07-18; never committed originally; minimal
 * implementation of the interface consumed by src/lib/webhook/service.ts:
 * isDuplicate(), markAsProcessed(), connect(), disconnect().
 *
 * In-memory TTL map keyed by the GitHub delivery GUID (x-github-delivery), which is
 * unique per delivery attempt. Falls back to a hash of eventType+payload when the
 * header is missing. Mirrors the rate-limiter pattern: FAIL-OPEN — an internal
 * deduplicator error must never block webhook ingestion (worst case a duplicate PR
 * review is posted; GitHub retries deliveries and dropping events is worse).
 *
 * Honest limit: single-instance only. Multiple API replicas would need a shared
 * store (e.g. Redis SETNX with TTL) behind this same interface.
 */

import { createHash } from 'crypto';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // GitHub redeliveries are same-day in practice
const MAX_ENTRIES = 10_000; // bound memory; oldest entries evicted first

export class WebhookDeduplicator {
  private seen: Map<string, number> = new Map(); // key -> expiry epoch ms

  constructor(private ttlMs: number = DEFAULT_TTL_MS) {}

  async connect(): Promise<void> {
    // In-memory implementation: nothing to connect. Kept so a Redis-backed
    // implementation can swap in without changing service.ts.
  }

  async isDuplicate(deliveryId: string, eventType: string, payload: unknown): Promise<boolean> {
    try {
      const key = this.key(deliveryId, eventType, payload);
      const expiry = this.seen.get(key);
      if (expiry === undefined) {
        return false;
      }
      if (expiry < Date.now()) {
        this.seen.delete(key);
        return false;
      }
      return true;
    } catch {
      // Fail open: never block ingestion on deduplicator internals.
      return false;
    }
  }

  async markAsProcessed(deliveryId: string, eventType: string, payload: unknown): Promise<void> {
    try {
      const key = this.key(deliveryId, eventType, payload);
      if (this.seen.size >= MAX_ENTRIES) {
        // Maps iterate in insertion order; drop the oldest entry.
        const oldest = this.seen.keys().next().value;
        if (oldest !== undefined) {
          this.seen.delete(oldest);
        }
      }
      this.seen.set(key, Date.now() + this.ttlMs);
    } catch {
      // Fail open (see header).
    }
  }

  async disconnect(): Promise<void> {
    this.seen.clear();
  }

  private key(deliveryId: string, eventType: string, payload: unknown): string {
    if (deliveryId) {
      return deliveryId;
    }
    return createHash('sha256')
      .update(eventType + ':' + JSON.stringify(payload ?? null))
      .digest('hex');
  }
}
