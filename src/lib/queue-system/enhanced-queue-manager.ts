/**
 * EnhancedQueueManager — restored 2026-07-18; never committed originally; minimal
 * implementation of the interface consumed by src/lib/queue-system/index.ts
 * (constructor(config, monitoringConfig?), registerProcessor via the base class)
 * and src/worker.ts (close()).
 *
 * Extends the committed QueueManager. The "enhanced" monitoring surface that gave
 * this class its name (job-monitor / job-status-tracker / metrics-aggregator
 * modules) was never committed; this restoration keeps the monitoring config and
 * exposes the base class's real getQueueMetrics() as the metrics source instead of
 * fabricating a monitoring stack.
 */

import { QueueManager } from './queue-manager';
import { QueueConfig, QueueMetrics, JobType } from './types';

export interface MonitoringConfig {
  /** Collect metrics (base getQueueMetrics remains available either way) */
  enableMetrics?: boolean;

  /** Expose health checks (base isHealthy remains available either way) */
  enableHealthCheck?: boolean;

  /** Port a metrics endpoint would bind to (no HTTP server is started here) */
  metricsPort?: number;
}

export class EnhancedQueueManager extends QueueManager {
  private monitoringConfig: MonitoringConfig;

  constructor(config: QueueConfig, monitoringConfig?: MonitoringConfig) {
    super(config);
    this.monitoringConfig = monitoringConfig ?? config.monitoring ?? {};
  }

  getMonitoringConfig(): MonitoringConfig {
    return { ...this.monitoringConfig };
  }

  /** Convenience metrics snapshot backed by the base class's real counters. */
  async getMetricsSnapshot(type?: JobType): Promise<QueueMetrics[]> {
    return this.getQueueMetrics(type);
  }

  /**
   * Graceful shutdown alias — worker.ts calls close() (matching bull's Queue
   * naming); the base class implements the actual teardown as shutdown().
   */
  async close(): Promise<void> {
    await this.shutdown();
  }
}
