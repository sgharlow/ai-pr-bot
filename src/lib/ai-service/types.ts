import { z } from 'zod';
import { AnalysisFinding } from '../code-analysis/analyzer/types';

/**
 * AI Service configuration
 */
export interface AIServiceConfig {
  /**
   * OpenAI API key
   */
  apiKey: string;
  
  /**
   * Model to use (e.g., 'gpt-4-turbo-preview')
   */
  model?: string;
  
  /**
   * Temperature for response generation (0-2)
   */
  temperature?: number;
  
  /**
   * Maximum tokens to generate
   */
  maxTokens?: number;
  
  /**
   * Maximum tokens for context window
   */
  contextWindowSize?: number;
  
  /**
   * Cost limit per request in USD
   */
  costLimit?: number;
  
  /**
   * Enable function calling
   */
  enableFunctionCalling?: boolean;
  
  /**
   * Maximum number of retries
   */
  maxRetries?: number;
  
  /**
   * Delay between retries in milliseconds
   */
  retryDelay?: number;
  
  /**
   * Enable token optimization
   */
  enableTokenOptimization?: boolean;
  
  /**
   * Enable enhanced context management
   */
  enableEnhancedContext?: boolean;
  
  /**
   * Priority-based analysis
   */
  prioritizeSecurityIssues?: boolean;
  
  /**
   * Retry configuration
   */
  retry?: {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffMultiplier?: number;
    jitterFactor?: number;
  };
}

/**
 * Code review request
 */
export interface CodeReviewRequest {
  /**
   * Pull request metadata
   */
  pullRequest: {
    number: number;
    title: string;
    description?: string;
    author: string;
    repository: string;
  };
  
  /**
   * Code changes to review
   */
  changes: CodeChange[];
  
  /**
   * Analysis findings from static analyzers
   */
  findings: AnalysisFinding[];
  
  /**
   * Additional context
   */
  context?: {
    branch?: string;
    baseBranch?: string;
    commit?: string;
    previousReviews?: Review[];
    criticalFiles?: string[];
    chunkInfo?: {
      current: number;
      total: number;
      description: string;
      priority: number;
    };
  };
  
  /**
   * Review options
   */
  options?: {
    focusAreas?: ReviewFocusArea[];
    severity?: 'all' | 'high' | 'critical';
    autoFix?: boolean;
    maxSuggestions?: number;
  };
}

/**
 * Code change in a file
 */
export interface CodeChange {
  /**
   * File path
   */
  file: string;
  
  /**
   * Language of the file
   */
  language?: string;
  
  /**
   * Type of change
   */
  changeType: 'added' | 'modified' | 'deleted';
  
  /**
   * Diff hunks
   */
  hunks: DiffHunk[];
  
  /**
   * Full file content (if available)
   */
  content?: string;
  
  /**
   * Previous file content (for modified files)
   */
  previousContent?: string;
}

/**
 * Diff hunk
 */
export interface DiffHunk {
  /**
   * Start line in old file
   */
  oldStart: number;
  
  /**
   * Number of lines in old file
   */
  oldLines: number;
  
  /**
   * Start line in new file
   */
  newStart: number;
  
  /**
   * Number of lines in new file
   */
  newLines: number;
  
  /**
   * Diff content
   */
  content: string;
  
  /**
   * Context around the change
   */
  context?: {
    before: string;
    after: string;
  };
}

/**
 * Review focus areas
 */
export type ReviewFocusArea = 
  | 'security'
  | 'performance'
  | 'best-practices'
  | 'code-quality'
  | 'documentation'
  | 'testing'
  | 'accessibility'
  | 'error-handling';

/**
 * AI-generated review
 */
export interface Review {
  /**
   * Overall assessment
   */
  summary: {
    verdict: 'approve' | 'request-changes' | 'comment';
    confidence: number;
    message: string;
    healthScore?: number;
  };
  
  /**
   * Review comments
   */
  comments: ReviewComment[];
  
  /**
   * Suggested fixes
   */
  suggestions: CodeSuggestion[];
  
  /**
   * Metrics
   */
  metrics: {
    issuesFound: number;
    criticalIssues: number;
    improvements: number;
    estimatedImpact: 'high' | 'medium' | 'low';
  };
  
  /**
   * Token usage
   */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    model: string;
    estimatedCost: number;
  };
}

/**
 * Review comment
 */
export interface ReviewComment {
  /**
   * File path
   */
  file: string;
  
  /**
   * Line number
   */
  line: number;
  
  /**
   * End line (for multi-line comments)
   */
  endLine?: number;
  
  /**
   * Comment type
   */
  type: 'issue' | 'suggestion' | 'question' | 'praise';
  
  /**
   * Severity
   */
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  
  /**
   * Category
   */
  category: ReviewFocusArea;
  
  /**
   * Comment message
   */
  message: string;
  
  /**
   * Code snippet
   */
  codeSnippet?: string;
  
  /**
   * Suggested fix
   */
  suggestion?: string;
  
  /**
   * Confidence score (0-1)
   */
  confidence: number;
  
  /**
   * Related finding IDs from static analysis
   */
  relatedFindings?: string[];
}

/**
 * Code suggestion
 */
export interface CodeSuggestion {
  /**
   * Suggestion ID
   */
  id: string;
  
  /**
   * File path
   */
  file: string;
  
  /**
   * Start line
   */
  startLine: number;
  
  /**
   * End line
   */
  endLine: number;
  
  /**
   * Type of suggestion
   */
  type: 'fix' | 'refactor' | 'optimization' | 'security-fix';
  
  /**
   * Description
   */
  description: string;
  
  /**
   * Original code
   */
  originalCode: string;
  
  /**
   * Suggested code
   */
  suggestedCode: string;
  
  /**
   * Explanation
   */
  explanation: string;
  
  /**
   * Estimated impact
   */
  impact: {
    performance?: 'improved' | 'neutral' | 'degraded';
    security?: 'improved' | 'neutral' | 'degraded';
    readability?: 'improved' | 'neutral' | 'degraded';
  };
  
  /**
   * Confidence score (0-1)
   */
  confidence: number;
  
  /**
   * Whether this can be auto-applied
   */
  autoApplicable: boolean;
}

/**
 * Token usage tracking
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
  estimatedCost: number;
}

/**
 * Cost calculation
 */
export interface CostCalculation {
  model: string;
  inputTokens: number;
  outputTokens: number;
  inputCostPer1k: number;
  outputCostPer1k: number;
  totalCost: number;
}

// Zod schemas for response validation

export const ReviewCommentSchema = z.object({
  file: z.string(),
  line: z.number(),
  endLine: z.number().optional(),
  type: z.enum(['issue', 'suggestion', 'question', 'praise']),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  category: z.enum([
    'security',
    'performance',
    'best-practices',
    'code-quality',
    'documentation',
    'testing',
    'accessibility',
    'error-handling'
  ]),
  message: z.string(),
  codeSnippet: z.string().optional(),
  suggestion: z.string().optional(),
  confidence: z.number().min(0).max(1),
  relatedFindings: z.array(z.string()).optional()
});

export const CodeSuggestionSchema = z.object({
  id: z.string(),
  file: z.string(),
  startLine: z.number(),
  endLine: z.number(),
  type: z.enum(['fix', 'refactor', 'optimization', 'security-fix']),
  description: z.string(),
  originalCode: z.string(),
  suggestedCode: z.string(),
  explanation: z.string(),
  impact: z.object({
    performance: z.enum(['improved', 'neutral', 'degraded']).optional(),
    security: z.enum(['improved', 'neutral', 'degraded']).optional(),
    readability: z.enum(['improved', 'neutral', 'degraded']).optional()
  }),
  confidence: z.number().min(0).max(1),
  autoApplicable: z.boolean()
});

export const ReviewSchema = z.object({
  summary: z.object({
    verdict: z.enum(['approve', 'request-changes', 'comment']),
    confidence: z.number().min(0).max(1),
    message: z.string(),
    healthScore: z.number().min(0).max(100).optional()
  }),
  comments: z.array(ReviewCommentSchema),
  suggestions: z.array(CodeSuggestionSchema),
  metrics: z.object({
    issuesFound: z.number(),
    criticalIssues: z.number(),
    improvements: z.number(),
    estimatedImpact: z.enum(['high', 'medium', 'low'])
  })
});

// Type exports
export type ReviewCommentType = z.infer<typeof ReviewCommentSchema>;
export type CodeSuggestionType = z.infer<typeof CodeSuggestionSchema>;
export type ReviewType = z.infer<typeof ReviewSchema>;