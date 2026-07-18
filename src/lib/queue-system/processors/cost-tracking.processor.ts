/**
 * CostTrackingProcessor — restored 2026-07-18; never committed originally; minimal
 * implementation of the interface consumed by src/lib/queue-system/index.ts
 * (constructor() + createProcessor()) and re-exported by ./index.ts.
 *
 * Aggregates the cost figures the job data already carries (CostTrackingJobData.cost
 * is computed upstream by CostCalculator) into in-memory per-service totals and logs
 * them. Honest limit: totals are per-process and not persisted; a restart resets
 * them. A DB-backed sink can replace the accumulate() body without changing the
 * consumed interface.
 */

import { Job } from 'bull';
import { CostTrackingJobData, JobResult, JobProcessor } from '../types';

export class CostTrackingProcessor {
  private totalsByService: Map<string, { cost: number; entries: number }> = new Map();

  createProcessor(): JobProcessor<CostTrackingJobData> {
    return async (job: Job<CostTrackingJobData>): Promise<JobResult> => {
      const { service, operation, cost, usage, repositoryId } = job.data;

      const entry = this.totalsByService.get(service) ?? { cost: 0, entries: 0 };
      entry.cost += cost;
      entry.entries += 1;
      this.totalsByService.set(service, entry);

      console.log(
        `[CostTracking] ${service}/${operation}${repositoryId ? ` (${repositoryId})` : ''}: ` +
        `$${cost.toFixed(4)} (${usage.tokens ?? 0} tokens); ` +
        `running ${service} total: $${entry.cost.toFixed(4)} over ${entry.entries} entries`
      );

      return {
        success: true,
        data: {
          service,
          recordedCost: cost,
          runningTotal: entry.cost,
          entries: entry.entries
        }
      };
    };
  }

  /** Current in-memory totals (copy). */
  getTotals(): Record<string, { cost: number; entries: number }> {
    return Object.fromEntries(
      [...this.totalsByService.entries()].map(([k, v]) => [k, { ...v }])
    );
  }
}
