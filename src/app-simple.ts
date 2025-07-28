import Fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from './config/environment';
import { webhookRoutes } from './routes/webhook';
import { apiRoutes } from './routes/api';
import { GitHubClient } from './lib/github/client';
import { EnhancedAIService } from './lib/ai-service/enhanced-ai-service';
import { WebhookService } from './lib/webhook/service';

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

  // Initialize services
  const githubClient = new GitHubClient();
  const aiService = new EnhancedAIService({
    apiKey: config.OPENAI_API_KEY || '',
    model: config.OPENAI_MODEL || 'gpt-4',
    maxTokens: 4000,
    temperature: 0.2
  });
  const webhookService = new WebhookService(githubClient, aiService);

  // Store services on app instance
  app.decorate('githubClient', githubClient);
  app.decorate('aiService', aiService);
  app.decorate('webhookService', webhookService);

  // Health check
  app.get('/health', async (request, reply) => {
    reply.send({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        api: 'healthy'
      }
    });
  });

  // Metrics endpoint
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
      name: 'AI Code Review Bot API (Simple Mode)',
      version: '0.1.0',
      status: 'running',
      endpoints: {
        health: '/health',
        metrics: '/metrics',
        webhook: '/webhook/github (POST)',
        api: '/api/*'
      }
    });
  });

  // Register routes
  await app.register(webhookRoutes, { 
    prefix: '/webhook',
    webhookService 
  });

  await app.register(apiRoutes, { prefix: '/api' });

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

  return app;
}