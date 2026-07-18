/**
 * RetryManager — restored 2026-07-18; never committed originally; minimal
 * implementation of the interface consumed by src/lib/ai-service/enhanced-ai-service.ts:
 * new RetryManager(config?), executeWithRetry(fn, context), getRetryStats(), reset().
 *
 * Exponential backoff with decorrelated jitter, driven entirely by the RetryConfig
 * shape already defined in AIServiceConfig.retry (types.ts). Retries any thrown
 * error up to maxAttempts — attempts are bounded, so retrying a non-transient error
 * costs at most (maxAttempts - 1) extra calls; distinguishing transient HTTP codes
 * would be invented precision the original never committed.
 */

export interface RetryConfig {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  jitterFactor?: number;
}

export interface RetryContext {
  operation: string;
  metadata?: Record<string, unknown>;
}

export interface RetryStats {
  totalOperations: number;
  totalAttempts: number;
  totalRetries: number;
  failedOperations: number;
  lastError?: string;
}

const DEFAULTS: Required<RetryConfig> = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  jitterFactor: 0.1
};

export class RetryManager {
  private config: Required<RetryConfig>;
  private stats: RetryStats = {
    totalOperations: 0,
    totalAttempts: 0,
    totalRetries: 0,
    failedOperations: 0
  };

  constructor(config?: RetryConfig) {
    this.config = { ...DEFAULTS, ...(config ?? {}) };
  }

  async executeWithRetry<T>(fn: () => Promise<T>, context: RetryContext): Promise<T> {
    this.stats.totalOperations++;
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      this.stats.totalAttempts++;
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        this.stats.lastError = error instanceof Error ? error.message : String(error);

        if (attempt >= this.config.maxAttempts) {
          break;
        }

        this.stats.totalRetries++;
        const delay = this.getDelay(attempt);
        console.warn(
          `[RetryManager] ${context.operation}: attempt ${attempt}/${this.config.maxAttempts} failed ` +
          `(${this.stats.lastError}); retrying in ${delay}ms`
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    this.stats.failedOperations++;
    throw lastError instanceof Error
      ? lastError
      : new Error(`${context.operation} failed after ${this.config.maxAttempts} attempts: ${String(lastError)}`);
  }

  getRetryStats(): RetryStats {
    return { ...this.stats };
  }

  reset(): void {
    this.stats = {
      totalOperations: 0,
      totalAttempts: 0,
      totalRetries: 0,
      failedOperations: 0
    };
  }

  private getDelay(attempt: number): number {
    const exponential = this.config.initialDelay * Math.pow(this.config.backoffMultiplier, attempt - 1);
    const capped = Math.min(exponential, this.config.maxDelay);
    const jitter = capped * this.config.jitterFactor * Math.random();
    return Math.round(capped + jitter);
  }
}
