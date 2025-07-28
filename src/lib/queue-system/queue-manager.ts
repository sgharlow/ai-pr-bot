import Bull, { Job, JobOptions, Queue } from 'bull';
import { EventEmitter } from 'events';
import {
  JobType,
  JobData,
  JobResult,
  JobStatus,
  JobPriority,
  QueueConfig,
  QueueMetrics,
  IQueueManager,
  JobProcessor,
  QueueEvents
} from './types';

/**
 * Queue manager for handling asynchronous job processing
 */
export class QueueManager extends EventEmitter implements IQueueManager {
  private queues: Map<JobType, Queue> = new Map();
  private processors: Map<JobType, JobProcessor<any>> = new Map();
  private config: QueueConfig;
  private isShuttingDown = false;

  constructor(config: QueueConfig) {
    super();
    this.config = config;
    this.initializeQueues();
  }

  /**
   * Initialize all queues
   */
  private initializeQueues(): void {
    Object.values(JobType).forEach(type => {
      const queue = this.createQueue(type);
      this.queues.set(type, queue);
      this.setupQueueEvents(type, queue);
    });
  }

  /**
   * Create a queue with configuration
   */
  private createQueue(type: JobType): Queue {
    const queueConfig = this.config.queues[type] || {};
    const defaultOptions = this.config.defaultJobOptions || {};

    const queue = new Bull(type, {
      redis: this.config.redis,
      defaultJobOptions: {
        ...defaultOptions,
        removeOnComplete: true,
        removeOnFail: false,
        attempts: queueConfig.retryOptions?.attempts || 3,
        backoff: queueConfig.retryOptions?.backoff || {
          type: 'exponential',
          delay: 2000
        }
      }
    });

    // Set concurrency
    if (queueConfig.concurrency) {
      queue.concurrency = queueConfig.concurrency;
    }

    // Set rate limiting
    if (queueConfig.rateLimit) {
      queue.limiter = {
        max: queueConfig.rateLimit.max,
        duration: queueConfig.rateLimit.duration
      };
    }

    return queue;
  }

  /**
   * Setup event listeners for a queue
   */
  private setupQueueEvents(type: JobType, queue: Queue): void {
    queue.on('completed', (job: Job, result: JobResult) => {
      this.emit('job:completed', {
        jobId: job.id.toString(),
        type,
        result
      });
    });

    queue.on('failed', (job: Job, error: Error) => {
      this.emit('job:failed', {
        jobId: job.id.toString(),
        type,
        error,
        attemptsMade: job.attemptsMade
      });
    });

    queue.on('active', (job: Job) => {
      this.emit('job:started', {
        jobId: job.id.toString(),
        type
      });
    });

    queue.on('stalled', (job: Job) => {
      this.emit('queue:stalled', {
        queue: type,
        jobId: job.id.toString()
      });
    });

    queue.on('error', (error: Error) => {
      this.emit('queue:error', {
        queue: type,
        error
      });
    });

    queue.on('drained', () => {
      this.emit('queue:drained', {
        queue: type
      });
    });
  }

  /**
   * Register a job processor
   */
  registerProcessor<T extends JobData>(
    type: JobType,
    processor: JobProcessor<T>
  ): void {
    if (this.processors.has(type)) {
      throw new Error(`Processor already registered for job type: ${type}`);
    }

    this.processors.set(type, processor);
    
    const queue = this.queues.get(type);
    if (!queue) {
      throw new Error(`Queue not found for job type: ${type}`);
    }

    const queueConfig = this.config.queues[type] || {};
    const concurrency = queueConfig.concurrency || 1;

    queue.process(concurrency, async (job: Job<T>) => {
      try {
        // Update progress
        await job.progress(0);

        // Process the job
        const result = await processor(job);

        // Update progress
        await job.progress(100);

        return result;
      } catch (error) {
        // Log error for debugging
        console.error(`Job ${job.id} failed:`, error);
        
        // Re-throw to trigger retry logic
        throw error;
      }
    });
  }

  /**
   * Add a job to the queue
   */
  async addJob<T extends JobData>(
    type: JobType,
    data: T,
    options?: JobOptions
  ): Promise<Job<T>> {
    if (this.isShuttingDown) {
      throw new Error('Queue manager is shutting down');
    }

    const queue = this.queues.get(type);
    if (!queue) {
      throw new Error(`Queue not found for job type: ${type}`);
    }

    const queueConfig = this.config.queues[type] || {};
    const defaultPriority = queueConfig.defaultPriority || JobPriority.NORMAL;

    const jobOptions: JobOptions = {
      priority: defaultPriority,
      ...options,
      timestamp: Date.now()
    };

    const job = await queue.add(data, jobOptions);

    this.emit('job:created', {
      jobId: job.id.toString(),
      type,
      data
    });

    return job;
  }

  /**
   * Get a job by ID
   */
  async getJob(jobId: string): Promise<Job | null> {
    for (const queue of this.queues.values()) {
      const job = await queue.getJob(jobId);
      if (job) {
        return job;
      }
    }
    return null;
  }

  /**
   * Get jobs by type and status
   */
  async getJobs(
    type: JobType,
    statuses: JobStatus[],
    start = 0,
    end = -1
  ): Promise<Job[]> {
    const queue = this.queues.get(type);
    if (!queue) {
      throw new Error(`Queue not found for job type: ${type}`);
    }

    const jobs: Job[] = [];
    
    for (const status of statuses) {
      let statusJobs: Job[] = [];
      
      switch (status) {
        case JobStatus.WAITING:
          statusJobs = await queue.getWaiting(start, end);
          break;
        case JobStatus.ACTIVE:
          statusJobs = await queue.getActive(start, end);
          break;
        case JobStatus.COMPLETED:
          statusJobs = await queue.getCompleted(start, end);
          break;
        case JobStatus.FAILED:
          statusJobs = await queue.getFailed(start, end);
          break;
        case JobStatus.DELAYED:
          statusJobs = await queue.getDelayed(start, end);
          break;
        case JobStatus.PAUSED:
          statusJobs = await queue.getPaused(start, end);
          break;
      }
      
      jobs.push(...statusJobs);
    }

    return jobs;
  }

  /**
   * Remove a job
   */
  async removeJob(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
    if (job) {
      await job.remove();
      this.emit('job:removed', {
        jobId,
        type: job.queue.name as JobType
      });
    }
  }

  /**
   * Pause a queue
   */
  async pauseQueue(type: JobType): Promise<void> {
    const queue = this.queues.get(type);
    if (!queue) {
      throw new Error(`Queue not found for job type: ${type}`);
    }
    await queue.pause();
  }

  /**
   * Resume a queue
   */
  async resumeQueue(type: JobType): Promise<void> {
    const queue = this.queues.get(type);
    if (!queue) {
      throw new Error(`Queue not found for job type: ${type}`);
    }
    await queue.resume();
  }

  /**
   * Get queue metrics
   */
  async getQueueMetrics(type?: JobType): Promise<QueueMetrics[]> {
    const metrics: QueueMetrics[] = [];
    const queuesToCheck = type 
      ? [this.queues.get(type)].filter(Boolean) as Queue[]
      : Array.from(this.queues.values());

    for (const queue of queuesToCheck) {
      const [
        waitingCount,
        activeCount,
        completedCount,
        failedCount,
        delayedCount,
        isPaused
      ] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
        queue.isPaused()
      ]);

      // Calculate rates (simplified - in production, you'd track over time)
      const completed = await queue.getCompleted(0, 100);
      const failed = await queue.getFailed(0, 100);
      
      const totalProcessed = completed.length + failed.length;
      const errorRate = totalProcessed > 0 ? failed.length / totalProcessed : 0;
      
      // Calculate average processing time
      let totalTime = 0;
      let processedWithTime = 0;
      
      for (const job of completed) {
        if (job.finishedOn && job.processedOn) {
          totalTime += job.finishedOn - job.processedOn;
          processedWithTime++;
        }
      }
      
      const avgProcessingTime = processedWithTime > 0 
        ? totalTime / processedWithTime 
        : 0;

      metrics.push({
        queueName: queue.name,
        waiting: waitingCount,
        active: activeCount,
        completed: completedCount,
        failed: failedCount,
        delayed: delayedCount,
        paused: isPaused,
        processingRate: totalProcessed,
        errorRate,
        avgProcessingTime,
        memoryUsage: process.memoryUsage().heapUsed
      });
    }

    return metrics;
  }

  /**
   * Clean old jobs
   */
  async cleanJobs(type: JobType, grace: number): Promise<void> {
    const queue = this.queues.get(type);
    if (!queue) {
      throw new Error(`Queue not found for job type: ${type}`);
    }

    await queue.clean(grace, 'completed');
    await queue.clean(grace, 'failed');
  }

  /**
   * Retry failed jobs
   */
  async retryFailedJobs(type: JobType): Promise<number> {
    const queue = this.queues.get(type);
    if (!queue) {
      throw new Error(`Queue not found for job type: ${type}`);
    }

    const failed = await queue.getFailed();
    let retried = 0;

    for (const job of failed) {
      try {
        await job.retry();
        retried++;
        
        this.emit('job:retrying', {
          jobId: job.id.toString(),
          type,
          attempt: job.attemptsMade + 1,
          delay: 0
        });
      } catch (error) {
        console.error(`Failed to retry job ${job.id}:`, error);
      }
    }

    return retried;
  }

  /**
   * Shutdown the queue manager
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;

    // Close all queues
    const closePromises = Array.from(this.queues.values()).map(queue => 
      queue.close()
    );

    await Promise.all(closePromises);
    
    this.queues.clear();
    this.processors.clear();
    this.removeAllListeners();
  }

  /**
   * Check if all queues are healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      for (const queue of this.queues.values()) {
        await queue.isReady();
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get queue by type
   */
  getQueue(type: JobType): Queue | undefined {
    return this.queues.get(type);
  }
}