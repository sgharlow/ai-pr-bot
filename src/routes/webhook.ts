import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { WebhookService } from '../lib/webhook/service';

export async function webhookRoutes(fastify: FastifyInstance, options: any): Promise<void> {
  // Debug logging
  console.log('[webhookRoutes] Options received:', Object.keys(options || {}));
  console.log('[webhookRoutes] options.queueManager available:', !!options?.queueManager);
  console.log('[webhookRoutes] fastify.queueManager available:', !!(fastify as any).queueManager);
  
  // Create webhook service with queue manager from options
  const webhookService = new WebhookService({
    queueManager: options.queueManager || (fastify as any).queueManager
  });
  // Configure raw body parsing for webhook signature validation
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    try {
      const json = JSON.parse(body as string);
      done(null, json);
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // GitHub webhook endpoint
  fastify.post('/github', {
    config: {
      rawBody: true
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    await webhookService.processWebhook(request, reply);
  });
  
  // Health check for webhooks
  fastify.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    const health = await webhookService.healthCheck();
    
    const statusCode = health.status === 'healthy' ? 200 : 503;
    reply.code(statusCode).send({
      service: 'webhook',
      ...health,
      timestamp: new Date().toISOString(),
    });
  });

  // Cleanup on server shutdown
  fastify.addHook('onClose', async () => {
    await webhookService.cleanup();
  });
}