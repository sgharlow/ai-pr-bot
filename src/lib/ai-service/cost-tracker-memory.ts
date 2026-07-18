/**
 * InMemoryCostTracker — restored 2026-07-18; never committed originally; minimal
 * implementation of the interface consumed by src/lib/ai-service/enhanced-ai-service.ts:
 * trackUsage(repository, usage, operation, prNumber, metadata) and clear().
 *
 * Records usage entries in memory for observability within a process lifetime.
 * Honest limit: nothing is persisted; a restart loses history. A DB-backed tracker
 * can swap in behind the same interface.
 */

import { TokenUsage } from './types';

export interface CostUsageRecord {
  repository: string;
  usage: TokenUsage;
  operation: string;
  prNumber?: number;
  metadata?: Record<string, unknown>;
  recordedAt: Date;
}

export class InMemoryCostTracker {
  private records: CostUsageRecord[] = [];

  async trackUsage(
    repository: string,
    usage: TokenUsage,
    operation: string,
    prNumber?: number,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    this.records.push({
      repository,
      usage,
      operation,
      ...(prNumber !== undefined ? { prNumber } : {}),
      ...(metadata !== undefined ? { metadata } : {}),
      recordedAt: new Date()
    });
  }

  /** All recorded entries (copy). */
  getRecords(): CostUsageRecord[] {
    return [...this.records];
  }

  /** Total estimated cost across all recorded entries, in USD. */
  getTotalCost(): number {
    return this.records.reduce((sum, r) => sum + r.usage.estimatedCost, 0);
  }

  /** Total estimated cost for one repository, in USD. */
  getRepositoryCost(repository: string): number {
    return this.records
      .filter(r => r.repository === repository)
      .reduce((sum, r) => sum + r.usage.estimatedCost, 0);
  }

  clear(): void {
    this.records = [];
  }
}
