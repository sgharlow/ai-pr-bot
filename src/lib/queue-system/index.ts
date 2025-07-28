export * from './types';
export * from './queue-manager';
export * from './enhanced-queue-manager';
export * from './job-monitor';
export * from './job-status-tracker';
export * from './metrics-aggregator';
export * from './retry-strategies';
export * from './processors';

import { QueueManager } from './queue-manager';
import { EnhancedQueueManager, MonitoringConfig } from './enhanced-queue-manager';
import { QueueConfig, JobType } from './types';
import { 
  PRAnalysisProcessor,
  CodeAnalysisProcessor,
  FixGenerationProcessor,
  NotificationProcessor,
  CommentPostingProcessor,
  CostTrackingProcessor
} from './processors';
import { DemoProcessor } from './processors/demo-processor';
import { EnhancedDemoProcessor } from './processors/enhanced-demo-processor';
import { EnhancedDemoProcessorSimple } from './processors/enhanced-demo-processor-simple';

/**
 * Create and configure the queue system
 */
export function createQueueSystem(
  config: QueueConfig,
  dependencies: {
    githubClient: any;
    diffAnalyzer: any;
    codeAnalyzer: any;
    fixGenerator: any;
    fixValidator: any;
    slackClient?: any;
    discordClient?: any;
    aiService?: any;
  }
): QueueManager {
  const queueManager = new QueueManager(config);

  // HACKATHON DEMO: Use enhanced demo processor
  const USE_DEMO_MODE = process.env.DEMO_MODE === 'true' || true; // Force demo mode
  const USE_ENHANCED_DEMO = process.env.ENHANCED_DEMO === 'true' || true; // Use enhanced demo
  
  if (USE_DEMO_MODE) {
    if (USE_ENHANCED_DEMO) {
      // Use enhanced demo processor (simplified version for hackathon)
      const enhancedDemoProcessor = new EnhancedDemoProcessorSimple(
        dependencies.githubClient
      );
      queueManager.registerProcessor(
        JobType.PR_ANALYSIS,
        enhancedDemoProcessor.createProcessor()
      );
    } else {
      // Use simple demo processor
      const demoProcessor = new DemoProcessor(dependencies.githubClient);
      queueManager.registerProcessor(
        JobType.PR_ANALYSIS,
        demoProcessor.createProcessor()
      );
    }
  } else {
    // Register PR analysis processor
    const prAnalysisProcessor = new PRAnalysisProcessor(
      dependencies.githubClient,
      dependencies.diffAnalyzer,
      queueManager
    );
    queueManager.registerProcessor(
      JobType.PR_ANALYSIS,
      prAnalysisProcessor.createProcessor()
    );
  }

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

  return queueManager;
}

/**
 * Create and configure the enhanced queue system with monitoring
 */
export function createEnhancedQueueSystem(
  config: QueueConfig,
  dependencies: {
    githubClient: any;
    diffAnalyzer: any;
    codeAnalyzer: any;
    fixGenerator: any;
    fixValidator: any;
    slackClient?: any;
    discordClient?: any;
    aiService?: any;
  },
  monitoringConfig?: MonitoringConfig
): EnhancedQueueManager {
  const queueManager = new EnhancedQueueManager(config, monitoringConfig);

  // HACKATHON DEMO: Use enhanced demo processor
  const USE_DEMO_MODE = process.env.DEMO_MODE === 'true' || true; // Force demo mode
  const USE_ENHANCED_DEMO = process.env.ENHANCED_DEMO === 'true' || true; // Use enhanced demo
  
  if (USE_DEMO_MODE) {
    if (USE_ENHANCED_DEMO) {
      // Use enhanced demo processor (simplified version for hackathon)
      const enhancedDemoProcessor = new EnhancedDemoProcessorSimple(
        dependencies.githubClient
      );
      queueManager.registerProcessor(
        JobType.PR_ANALYSIS,
        enhancedDemoProcessor.createProcessor()
      );
    } else {
      // Use simple demo processor
      const demoProcessor = new DemoProcessor(dependencies.githubClient);
      queueManager.registerProcessor(
        JobType.PR_ANALYSIS,
        demoProcessor.createProcessor()
      );
    }
  } else {
    // Register PR analysis processor
    const prAnalysisProcessor = new PRAnalysisProcessor(
      dependencies.githubClient,
      dependencies.diffAnalyzer,
      queueManager
    );
    queueManager.registerProcessor(
      JobType.PR_ANALYSIS,
      prAnalysisProcessor.createProcessor()
    );
  }

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

  return queueManager;
}

/**
 * Default queue configuration
 */
export const defaultQueueConfig: QueueConfig = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
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