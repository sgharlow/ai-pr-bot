import { FastifyRequest, FastifyReply } from 'fastify';
import { WebhookValidator } from './validator';
import { WebhookDeduplicator } from './deduplicator';
import { WebhookRateLimiter } from './rate-limiter';
import { WebhookEvent } from './types';
import { IQueueManager, JobType, JobPriority } from '../queue-system/types';

interface WebhookServiceDependencies {
  queueManager?: IQueueManager;
}

export class WebhookService {
  private validator: WebhookValidator;
  private deduplicator: WebhookDeduplicator;
  private rateLimiter: WebhookRateLimiter;
  private queueManager?: IQueueManager;

  constructor(dependencies?: WebhookServiceDependencies) {
    this.validator = new WebhookValidator();
    this.deduplicator = new WebhookDeduplicator();
    this.rateLimiter = new WebhookRateLimiter();
    this.queueManager = dependencies?.queueManager;
    
    // Debug logging
    console.log('[WebhookService] Constructor called with queueManager:', !!this.queueManager);
    if (!this.queueManager) {
      console.error('[WebhookService] WARNING: Queue manager not provided in constructor!');
    }
  }

  /**
   * Processes incoming GitHub webhook
   */
  async processWebhook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Extract headers and payload
      const signature = request.headers['x-hub-signature-256'] as string;
      const eventType = request.headers['x-github-event'] as string;
      const deliveryId = request.headers['x-github-delivery'] as string;
      const payload = request.body as WebhookEvent;
      const rawPayload = JSON.stringify(payload);
      
      console.log('[WebhookService] Processing webhook:', { eventType, deliveryId, hasSignature: !!signature });

      // Rate limiting check
      const rateLimitResult = await this.rateLimiter.checkRateLimit(
        this.getIdentifier(request, payload)
      );

      if (!rateLimitResult.allowed) {
        reply.code(429).send({
          error: 'Rate limit exceeded',
          message: rateLimitResult.error,
          resetTime: rateLimitResult.resetTime,
          remaining: rateLimitResult.remaining
        });
        return;
      }

      // Validate signature
      const signatureValidation = this.validator.validateSignature(rawPayload, signature);
      if (!signatureValidation.isValid) {
        request.log.warn({
          deliveryId,
          eventType,
          error: signatureValidation.error
        }, 'Webhook signature validation failed');
        
        reply.code(401).send({
          error: 'Unauthorized',
          message: signatureValidation.error
        });
        return;
      }

      // Validate payload structure
      const payloadValidation = this.validator.validatePayload(payload);
      if (!payloadValidation.isValid) {
        request.log.warn({
          deliveryId,
          eventType,
          error: payloadValidation.error
        }, 'Webhook payload validation failed');
        
        reply.code(400).send({
          error: 'Bad Request',
          message: payloadValidation.error
        });
        return;
      }

      // Check if event is relevant
      if (!this.validator.isRelevantEvent(eventType, payload)) {
        request.log.info({
          deliveryId,
          eventType,
          action: payload.action
        }, 'Ignoring irrelevant webhook event');
        
        reply.code(200).send({
          status: 'ignored',
          reason: 'Event not relevant for processing'
        });
        return;
      }

      // Check for duplicates
      const isDuplicate = await this.deduplicator.isDuplicate(deliveryId, eventType, payload);
      if (isDuplicate) {
        request.log.info({
          deliveryId,
          eventType
        }, 'Duplicate webhook event detected');
        
        reply.code(200).send({
          status: 'duplicate',
          message: 'Event already processed'
        });
        return;
      }

      // Mark as processed
      await this.deduplicator.markAsProcessed(deliveryId, eventType, payload);

      // Create processed event for queuing
      const processedEvent = {
        type: eventType,
        action: payload.action,
        repository: payload.repository?.full_name,
        pullRequest: eventType === 'pull_request' ? {
          number: (payload as any).pull_request?.number,
          title: (payload as any).pull_request?.title,
          url: (payload as any).pull_request?.html_url,
          diffUrl: (payload as any).pull_request?.diff_url,
          author: (payload as any).pull_request?.user?.login
        } : undefined,
        installationId: (payload as any).installation?.id,
        payload
      };

      // Log successful processing
      const processingTime = Date.now() - startTime;
      request.log.info({
        deliveryId,
        eventType,
        action: payload.action,
        repository: payload.repository?.full_name,
        processingTime
      }, 'Webhook processed successfully');

      // Queue for analysis
      await this.queueForAnalysis(processedEvent);

      reply.code(200).send({
        status: 'accepted',
        deliveryId,
        eventType,
        processingTime
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error('[WebhookService] Error:', error);
      request.log.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Webhook processing failed');
      
      reply.code(500).send({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to process webhook'
      });
    }
  }

  /**
   * Gets identifier for rate limiting (repository-based)
   */
  private getIdentifier(request: FastifyRequest, payload: WebhookEvent): string {
    // Use repository full name for rate limiting
    if (payload.repository) {
      return payload.repository.full_name;
    }
    
    // Fallback to IP address
    return request.ip;
  }

  /**
   * Health check for webhook service
   */
  async healthCheck(): Promise<{ status: string; services: Record<string, string> }> {
    const services: Record<string, string> = {};

    try {
      await this.deduplicator.connect();
      services['deduplicator'] = 'healthy';
    } catch (error) {
      services['deduplicator'] = 'unhealthy';
    }

    try {
      await this.rateLimiter.connect();
      services['rateLimiter'] = 'healthy';
    } catch (error) {
      services['rateLimiter'] = 'unhealthy';
    }

    const allHealthy = Object.values(services).every(status => status === 'healthy');

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      services
    };
  }

  /**
   * Queue event for analysis
   */
  private async queueForAnalysis(event: any): Promise<void> {
    // Only queue PR events
    if (event.type !== 'pull_request') {
      return;
    }

    // Only queue opened, reopened, and synchronize actions
    if (!['opened', 'reopened', 'synchronize'].includes(event.action)) {
      return;
    }

    // Check if queue manager is available
    if (!this.queueManager) {
      console.error('ERROR: Queue manager not available, skipping analysis queue');
      console.error('This should not happen - check webhook route setup');
      // Don't just return - this causes the webhook to succeed without queueing
      // For now, we'll just log a warning and continue
      console.warn('WARNING: PR will not be analyzed because queue manager is missing');
      return;
    }
    
    console.log(`Queueing PR #${event.pullRequest.number} for analysis...`);

    try {
      // Queue the job
      await this.queueManager.addJob(
        JobType.PR_ANALYSIS,
        {
          prNumber: event.pullRequest.number,
          prTitle: event.pullRequest.title,
          repository: {
            owner: event.repository.split('/')[0],
            name: event.repository.split('/')[1],
            fullName: event.repository
          },
          pullRequest: {
            number: event.pullRequest.number,
            title: event.pullRequest.title,
            url: event.pullRequest.url,
            diffUrl: event.pullRequest.diffUrl,
            author: event.pullRequest.author
          },
          installationId: event.installationId,
          action: event.action,
          timestamp: new Date().toISOString()
        },
        {
          priority: JobPriority.HIGH,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000
          }
        }
      );

      console.log(`Queued PR #${event.pullRequest.number} for analysis`);
    } catch (error) {
      console.error('Failed to queue PR for analysis:', error);
      throw error;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await Promise.all([
      this.deduplicator.disconnect(),
      this.rateLimiter.disconnect()
    ]);
  }
}