import { config } from './config/environment';
import { createEnhancedQueueSystem, JobType, JobPriority } from './lib/queue-system';
import { GitHubClient } from './lib/github/client';
import { EnhancedAIService } from './lib/ai-service/enhanced-ai-service';
import { DiffAnalyzer } from './lib/github/diff-analyzer-simple';
import { CodeAnalyzer } from './lib/code-analysis/analyzer';
import { FixGenerator } from './lib/auto-fix/fix-generator';
import { FixValidator } from './lib/auto-fix/fix-validator';

async function startWorker() {
  console.log('Starting simple worker...');
  
  // Initialize GitHub client — GitHubAuth defaults pull app id/key/client creds from config
  const githubClient = new GitHubClient();

  // Initialize AI service
  const aiService = new EnhancedAIService({
    apiKey: config.OPENAI_API_KEY || '',
    model: config.OPENAI_MODEL || 'gpt-4',
    maxTokens: 4000,
    temperature: 0.2
  });

  // Initialize queue system dependencies
  const diffAnalyzer = new DiffAnalyzer();
  const codeAnalyzer = new CodeAnalyzer();
  const fixGenerator = new FixGenerator(aiService);
  const fixValidator = new FixValidator();

  // Create queue system
  const queueManager = createEnhancedQueueSystem(
    {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0'),
        tls: process.env.REDIS_TLS === 'true'
      },
      queues: {
        'pr-analysis': {
          concurrency: 2,
          defaultPriority: JobPriority.NORMAL
        },
        'code-analysis': {
          concurrency: 3,
          defaultPriority: JobPriority.HIGH
        },
        'fix-generation': {
          concurrency: 1,
          defaultPriority: JobPriority.HIGH
        },
        'comment-posting': {
          concurrency: 2,
          defaultPriority: JobPriority.NORMAL
        }
      }
    },
    {
      githubClient,
      diffAnalyzer,
      codeAnalyzer,
      fixGenerator,
      fixValidator
    }
  );

  console.log('Worker started successfully');
  
  // Get queue names from the queue manager
  const queueNames = Object.values(JobType);
  console.log('Available job types:', queueNames);
  
  // The processors are automatically started when registered by createEnhancedQueueSystem
  console.log('Job processors are running and listening for jobs...');
  console.log('Worker is ready to process jobs from Redis queues');

  // Handle shutdown gracefully
  process.on('SIGINT', async () => {
    console.log('Shutting down worker...');
    await queueManager.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('Shutting down worker...');
    await queueManager.close();
    process.exit(0);
  });
}

// Start the worker
startWorker().catch(error => {
  console.error('Failed to start worker:', error);
  process.exit(1);
});