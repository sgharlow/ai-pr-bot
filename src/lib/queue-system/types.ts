import { Job, JobOptions } from 'bull';
import { PluginResult } from '../plugin-system/types';

// Temporary Finding type until code-analysis is implemented
export interface Finding {
  id: string;
  type: 'security' | 'performance' | 'style' | 'bug';
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  file: string;
  line: number;
  column: number;
  rule: string;
  suggestion?: string;
  autoFixable: boolean;
  confidence: number;
  source: 'semgrep' | 'ai' | 'plugin';
}

/**
 * Job types in the queue system
 */
export enum JobType {
  PR_ANALYSIS = 'pr-analysis',
  CODE_ANALYSIS = 'code-analysis',
  FIX_GENERATION = 'fix-generation',
  NOTIFICATION = 'notification',
  COMMENT_POSTING = 'comment-posting',
  COST_TRACKING = 'cost-tracking'
}

/**
 * Job priority levels
 */
export enum JobPriority {
  CRITICAL = 1,
  HIGH = 10,
  NORMAL = 20,
  LOW = 30
}

/**
 * Job status
 */
export enum JobStatus {
  WAITING = 'waiting',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DELAYED = 'delayed',
  PAUSED = 'paused'
}

/**
 * Base job data interface
 */
export interface BaseJobData {
  id: string;
  timestamp: Date;
  retryCount?: number;
  metadata?: Record<string, any>;
}

/**
 * PR analysis job data
 */
export interface PRAnalysisJobData extends BaseJobData {
  repository: {
    owner: string;
    name: string;
    fullName: string;
  };
  pullRequest: {
    number: number;
    title: string;
    author: string;
    baseBranch: string;
    headBranch: string;
    sha: string;
  };
  installationId?: number;
  webhookPayload?: any;
  configuration?: {
    enablePrivacyGuard?: boolean;
    enableTreeSitter?: boolean;
    enableSemgrep?: boolean;
    enableAI?: boolean;
    enableAutoFix?: boolean;
    costLimit?: number;
  };
}

/**
 * Code analysis job data
 */
export interface CodeAnalysisJobData extends BaseJobData {
  repositoryId: string;
  pullRequestId: string;
  files: Array<{
    path: string;
    content: string;
    patch: string;
    language?: string;
  }>;
  configuration?: {
    enablePrivacyGuard?: boolean;
    enableTreeSitter?: boolean;
    enableSemgrep?: boolean;
    pluginNames?: string[];
  };
}

/**
 * Fix generation job data
 */
export interface FixGenerationJobData extends BaseJobData {
  repositoryId: string;
  pullRequestId: string;
  findings: Finding[];
  analysisResults?: PluginResult[];
  configuration?: {
    maxFixes?: number;
    autoApply?: boolean;
    createPR?: boolean;
    validateWithCI?: boolean;
  };
}

/**
 * Notification job data
 */
export interface NotificationJobData extends BaseJobData {
  type: 'slack' | 'discord' | 'email' | 'webhook';
  channel?: string;
  recipients?: string[];
  template: string;
  data: {
    repository?: string;
    pullRequest?: string;
    summary?: string;
    findings?: Finding[];
    metrics?: Record<string, any>;
    url?: string;
  };
  priority?: 'high' | 'normal' | 'low';
}

/**
 * Comment posting job data
 */
export interface CommentPostingJobData extends BaseJobData {
  repositoryId: string;
  pullRequestId: string;
  comments: Array<{
    path: string;
    line: number;
    side?: 'LEFT' | 'RIGHT';
    body: string;
    severity?: string;
  }>;
  summary?: string;
  deleteOutdated?: boolean;
}

/**
 * Cost tracking job data
 */
export interface CostTrackingJobData extends BaseJobData {
  service: 'openai' | 'semgrep' | 'other';
  operation: string;
  usage: {
    tokens?: number;
    requests?: number;
    duration?: number;
  };
  cost: number;
  repositoryId?: string;
  userId?: string;
}

/**
 * Job data union type
 */
export type JobData = 
  | PRAnalysisJobData
  | CodeAnalysisJobData
  | FixGenerationJobData
  | NotificationJobData
  | CommentPostingJobData
  | CostTrackingJobData;

/**
 * Job result interface
 */
export interface JobResult<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
  metrics?: {
    duration: number;
    retries: number;
    memoryUsed?: number;
  };
}

/**
 * Queue configuration
 */
export interface QueueConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    tls?: boolean;
  };
  defaultJobOptions?: JobOptions;
  queues: {
    [key in JobType]?: {
      concurrency?: number;
      rateLimit?: {
        max: number;
        duration: number;
      };
      defaultPriority?: JobPriority;
      retryOptions?: {
        attempts?: number;
        backoff?: {
          type: 'exponential' | 'fixed';
          delay: number;
        };
      };
    };
  };
  monitoring?: {
    enableMetrics?: boolean;
    enableHealthCheck?: boolean;
    metricsPort?: number;
  };
}

/**
 * Queue metrics
 */
export interface QueueMetrics {
  queueName: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
  processingRate: number;
  errorRate: number;
  avgProcessingTime: number;
  memoryUsage: number;
}

/**
 * Job processor function type
 */
export type JobProcessor<T extends JobData> = (job: Job<T>) => Promise<JobResult>;

/**
 * Queue event types
 */
export interface QueueEvents {
  'job:created': { jobId: string; type: JobType; data: JobData };
  'job:started': { jobId: string; type: JobType };
  'job:completed': { jobId: string; type: JobType; result: JobResult };
  'job:failed': { jobId: string; type: JobType; error: Error; attemptsMade: number };
  'job:retrying': { jobId: string; type: JobType; attempt: number; delay: number };
  'job:removed': { jobId: string; type: JobType };
  'queue:error': { queue: string; error: Error };
  'queue:stalled': { queue: string; jobId: string };
  'queue:drained': { queue: string };
}

/**
 * Queue manager interface
 */
export interface IQueueManager {
  addJob<T extends JobData>(
    type: JobType,
    data: T,
    options?: JobOptions
  ): Promise<Job<T>>;
  
  getJob(jobId: string): Promise<Job | null>;
  
  getJobs(
    type: JobType,
    status: JobStatus[],
    start?: number,
    end?: number
  ): Promise<Job[]>;
  
  removeJob(jobId: string): Promise<void>;
  
  pauseQueue(type: JobType): Promise<void>;
  
  resumeQueue(type: JobType): Promise<void>;
  
  getQueueMetrics(type?: JobType): Promise<QueueMetrics[]>;
  
  shutdown(): Promise<void>;
}

/**
 * Job retry strategy
 */
export interface RetryStrategy {
  shouldRetry(error: Error, attemptsMade: number): boolean;
  getDelay(attemptsMade: number): number;
  getMaxAttempts(): number;
}

/**
 * Job progress data
 */
export interface JobProgress {
  current: number;
  total: number;
  stage: string;
  message?: string;
  details?: Record<string, any>;
}