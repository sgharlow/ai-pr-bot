// NOTE (repair 2026-07-18): this barrel previously re-exported four modules that
// were never committed and have zero consumers anywhere in the repo — job-monitor,
// job-status-tracker, metrics-aggregator, retry-strategies. Those re-exports were
// removed rather than fabricating a monitoring stack. It also branched on
// hard-forced demo flags (`process.env.DEMO_MODE === 'true' || true`) between the
// EnhancedDemoProcessorSimple path and never-committed DemoProcessor /
// EnhancedDemoProcessor / PRAnalysisProcessor modules; only the branch that could
// ever execute — EnhancedDemoProcessorSimple (in ./processors/pr-processor.ts) —
// is kept, with the original intent documented at the registration site.
export * from './types';
export * from './queue-manager';
export * from './enhanced-queue-manager';
export * from './processors';

import { QueueManager } from './queue-manager';
import { EnhancedQueueManager, MonitoringConfig } from './enhanced-queue-manager';
import { QueueConfig, JobType } from './types';
import {
  CodeAnalysisProcessor,
  FixGenerationProcessor,
  NotificationProcessor,
  CommentPostingProcessor,
  CostTrackingProcessor,
  EnhancedDemoProcessorSimple
} from './processors';

interface QueueSystemDependencies {
  githubClient: any;
  diffAnalyzer: any;
  codeAnalyzer: any;
  fixGenerator: any;
  fixValidator: any;
  slackClient?: any;
  discordClient?: any;
  aiService?: any;
}

/**
 * Register all job processors on a queue manager.
 * Shared by both factories below (their bodies were identical apart from the
 * concrete manager class).
 */
function registerProcessors(
  queueManager: QueueManager,
  dependencies: QueueSystemDependencies
): void {
  // HACKATHON DEMO: the original hard-forced demo mode for PR analysis
  // (USE_DEMO_MODE / USE_ENHANCED_DEMO were `|| true`); the demo processor is the
  // only PR_ANALYSIS processor that ever existed in the repo.
  const enhancedDemoProcessor = new EnhancedDemoProcessorSimple(
    dependencies.githubClient
  );
  queueManager.registerProcessor(
    JobType.PR_ANALYSIS,
    enhancedDemoProcessor.createProcessor()
  );

  // Register code analysis processor
  const codeAnalysisProcessor = new CodeAnalysisProcessor(
    dependencies.codeAnalyzer,
    queueManager
  );
  queueManager.registerProcessor(
    JobType.CODE_ANALYSIS,
    codeAnalysisProcessor.createProcessor()
  );

  // Register fix generation processor
  const fixGenerationProcessor = new FixGenerationProcessor(
    dependencies.fixGenerator,
    dependencies.fixValidator,
    queueManager
  );
  queueManager.registerProcessor(
    JobType.FIX_GENERATION,
    fixGenerationProcessor.createProcessor()
  );

  // Register notification processor
  const notificationProcessor = new NotificationProcessor(
    dependencies.slackClient,
    dependencies.discordClient
  );
  queueManager.registerProcessor(
    JobType.NOTIFICATION,
    notificationProcessor.createProcessor()
  );

  // Register comment posting processor
  const commentPostingProcessor = new CommentPostingProcessor(
    dependencies.githubClient
  );
  queueManager.registerProcessor(
    JobType.COMMENT_POSTING,
    commentPostingProcessor.createProcessor()
  );

  // Register cost tracking processor
  const costTrackingProcessor = new CostTrackingProcessor();
  queueManager.registerProcessor(
    JobType.COST_TRACKING,
    costTrackingProcessor.createProcessor()
  );
}

/**
 * Create and configure the queue system
 */
export function createQueueSystem(
  config: QueueConfig,
  dependencies: QueueSystemDependencies
): QueueManager {
  const queueManager = new QueueManager(config);
  registerProcessors(queueManager, dependencies);
  return queueManager;
}

/**
 * Create and configure the enhanced queue system with monitoring
 */
export function createEnhancedQueueSystem(
  config: QueueConfig,
  dependencies: QueueSystemDependencies,
  monitoringConfig?: MonitoringConfig
): EnhancedQueueManager {
  const queueManager = new EnhancedQueueManager(config, monitoringConfig);
  registerProcessors(queueManager, dependencies);
  return queueManager;
}

/**
 * Default queue configuration
 */
export const defaultQueueConfig: QueueConfig = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    ...(process.env.REDIS_PASSWORD !== undefined ? { password: process.env.REDIS_PASSWORD } : {}),
    db: parseInt(process.env.REDIS_DB || '0'),
    tls: process.env.REDIS_TLS === 'true'
  },
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  },
  queues: {
    [JobType.PR_ANALYSIS]: {
      concurrency: 5,
      rateLimit: {
        max: 100,
        duration: 60000 // 1 minute
      },
      defaultPriority: 20
    },
    [JobType.CODE_ANALYSIS]: {
      concurrency: 3,
      defaultPriority: 20,
      retryOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000
        }
      }
    },
    [JobType.FIX_GENERATION]: {
      concurrency: 2,
      defaultPriority: 10,
      retryOptions: {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 10000
        }
      }
    },
    [JobType.NOTIFICATION]: {
      concurrency: 10,
      defaultPriority: 30,
      retryOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 1000
        }
      }
    },
    [JobType.COMMENT_POSTING]: {
      concurrency: 5,
      rateLimit: {
        max: 30,
        duration: 60000 // GitHub rate limiting
      },
      defaultPriority: 20
    },
    [JobType.COST_TRACKING]: {
      concurrency: 10,
      defaultPriority: 30,
      retryOptions: {
        attempts: 3,
        backoff: {
          type: 'fixed',
          delay: 1000
        }
      }
    }
  },
  monitoring: {
    enableMetrics: true,
    enableHealthCheck: true,
    metricsPort: 9090
  }
};
