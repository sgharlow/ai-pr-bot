import Fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { PrismaClient } from '@prisma/client';
import { config } from './config/environment';
import { apiRoutes } from './routes/api';
import { webhookRoutes } from './routes/webhook';
import { createEnhancedQueueSystem } from './lib/queue-system';
import { GitHubClient } from './lib/github/client';
import { EnhancedAIService } from './lib/ai-service/enhanced-ai-service';
import { DiffAnalyzer } from './lib/github/diff-analyzer-simple';
import { CodeAnalyzer } from './lib/code-analysis/analyzer/code-analyzer';
import { FixGenerator } from './lib/auto-fix/fix-generator';
import { FixValidator } from './lib/auto-fix/fix-validator';

export async function createApp(options: FastifyServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger || {
      level: config.LOG_LEVEL
    }
  });

  // Register plugins
  await app.register(cors, {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3002']
  });

  await app.register(helmet, {
    contentSecurityPolicy: false
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute'
  });

  // Initialize services with lazy loading
  let prisma: PrismaClient | null = null;
  
  const getPrisma = async () => {
    if (!prisma) {
      try {
        prisma = new PrismaClient();
        await prisma.$connect();
      } catch (error) {
        app.log.error('Failed to connect to database:', error);
      }
    }
    return prisma;
  };

  // Initialize GitHub client
  const githubClient = new GitHubClient();

  // Initialize AI service
  const aiService = new EnhancedAIService({
    apiKey: config.OPENAI_API_KEY || '',
    model: config.OPENAI_MODEL || 'gpt-4',
    maxTokens: 4000,
    temperature: 0.2
  });

  // Initialize queue system dependencies
  const diffAnalyzer = new DiffAnalyzer(githubClient);
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
          defaultPriority: 20
        }
      }
    },
    {
      githubClient,
      diffAnalyzer,
      codeAnalyzer,
      fixGenerator,
      fixValidator,
      aiService  // Add AI service for enhanced demo
    }
  );

  // Store services on app instance
  app.decorate('getPrisma', getPrisma);
  app.decorate('prisma', prisma);
  app.decorate('queueManager', queueManager);
  app.decorate('githubClient', githubClient);
  app.decorate('aiService', aiService);

  // Simple health check that doesn't require database
  app.get('/health', async (request, reply) => {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        api: 'healthy',
        database: 'unknown'
      }
    };

    // Try to check database but don't fail if it's not available
    try {
      const db = await getPrisma();
      if (db) {
        await db.$queryRaw`SELECT 1`;
        health.services.database = 'healthy';
      }
    } catch (error) {
      health.services.database = 'unhealthy';
    }

    reply.send(health);
  });

  // Basic metrics endpoint
  app.get('/metrics', async (request, reply) => {
    reply.send({
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    });
  });

  // Root endpoint
  app.get('/', async (request, reply) => {
    reply.send({
      name: 'AI Code Review Bot API',
      version: '1.0.0',
      status: 'running',
      endpoints: {
        health: '/health',
        metrics: '/metrics',
        webhook: '/webhook (POST)',
        api: '/api/*'
      }
    });
  });

  // Register webhook routes with queue manager in options
  await app.register(webhookRoutes, { 
    prefix: '/webhook',
    queueManager 
  });

  // Register API routes from routes/api.ts
  await app.register(apiRoutes);
  
  // Additional API routes
  app.register(async function additionalRoutes(app) {
    app.get('/api/status', async (request, reply) => {
      reply.send({
        status: 'operational',
        message: 'API is running'
      });
    });
  });

  // Error handler
  app.setErrorHandler((error, request, reply) => {
    app.log.error(error);
    
    const statusCode = error.statusCode || 500;
    const message = statusCode === 500 
      ? 'Internal Server Error' 
      : error.message;

    reply.status(statusCode).send({
      error: message,
      statusCode
    });
  });

  // Graceful shutdown
  app.addHook('onClose', async (instance) => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  return app;
}

// Export types
export type AppInstance = FastifyInstance & {
  getPrisma: () => Promise<PrismaClient | null>;
};