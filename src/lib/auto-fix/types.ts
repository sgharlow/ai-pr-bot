import { z } from 'zod';
import { ReviewComment, CodeSuggestion } from '../ai-service/types';
import { AnalysisFinding } from '../code-analysis/analyzer/types';

/**
 * Fix generation request
 */
export interface FixGenerationRequest {
  /**
   * The issue to fix
   */
  issue: ReviewComment | AnalysisFinding;
  
  /**
   * Code context
   */
  code: {
    file: string;
    content: string;
    language?: string;
    startLine?: number;
    endLine?: number;
  };
  
  /**
   * Additional context
   */
  context?: {
    relatedFiles?: string[];
    dependencies?: string[];
    frameworkVersion?: string;
    customInstructions?: string;
  };
  
  /**
   * Options
   */
  options?: {
    maxAttempts?: number;
    minConfidence?: number;
    preferredApproach?: 'minimal' | 'refactor' | 'comprehensive';
    validateSyntax?: boolean;
    runTests?: boolean;
  };
}

/**
 * Generated fix
 */
export interface GeneratedFix {
  /**
   * Unique fix ID
   */
  id: string;
  
  /**
   * Original issue
   */
  issue: ReviewComment | AnalysisFinding;
  
  /**
   * Fix details
   */
  fix: {
    type: 'patch' | 'replacement' | 'insertion' | 'deletion';
    file: string;
    startLine: number;
    endLine: number;
    originalCode: string;
    fixedCode: string;
    patch?: string;
  };
  
  /**
   * Explanation
   */
  explanation: {
    summary: string;
    reasoning: string;
    changes: string[];
    impact: {
      fixes: string[];
      sideEffects?: string[];
      breaking?: boolean;
    };
  };
  
  /**
   * Confidence metrics
   */
  confidence: {
    overall: number;
    syntaxValid: boolean;
    semanticValid: boolean;
    testsPassing?: boolean;
    riskLevel: 'low' | 'medium' | 'high';
  };
  
  /**
   * Validation results
   */
  validation?: {
    syntaxCheck?: {
      valid: boolean;
      errors?: string[];
    };
    semanticCheck?: {
      valid: boolean;
      warnings?: string[];
    };
    testResults?: {
      passed: boolean;
      failedTests?: string[];
    };
  };
  
  /**
   * Metadata
   */
  metadata: {
    generatedAt: Date;
    model: string;
    tokens: {
      prompt: number;
      completion: number;
      total: number;
    };
    cost: number;
    attempts: number;
  };
}

/**
 * Fix validation request
 */
export interface FixValidationRequest {
  /**
   * The generated fix
   */
  fix: GeneratedFix;
  
  /**
   * Validation options
   */
  options?: {
    checkSyntax?: boolean;
    checkSemantics?: boolean;
    runTests?: boolean;
    checkSideEffects?: boolean;
  };
}

/**
 * Fix validation result
 */
export interface FixValidationResult {
  /**
   * Overall validation status
   */
  valid: boolean;
  
  /**
   * Confidence score after validation
   */
  confidence: number;
  
  /**
   * Validation details
   */
  checks: {
    syntax?: {
      valid: boolean;
      errors?: Array<{
        line: number;
        column: number;
        message: string;
        severity: 'error' | 'warning';
      }>;
    };
    
    semantics?: {
      valid: boolean;
      issues?: Array<{
        type: 'type-error' | 'undefined-variable' | 'unused-code' | 'logic-error';
        message: string;
        line?: number;
      }>;
    };
    
    tests?: {
      passed: boolean;
      total: number;
      passed_count: number;
      failed: Array<{
        test: string;
        error: string;
      }>;
    };
    
    sideEffects?: {
      detected: boolean;
      effects?: Array<{
        type: 'api-change' | 'behavior-change' | 'performance-impact';
        description: string;
        severity: 'minor' | 'moderate' | 'major';
      }>;
    };
  };
  
  /**
   * Recommendations
   */
  recommendations?: string[];
}

/**
 * Fix application request
 */
export interface FixApplicationRequest {
  /**
   * The validated fix
   */
  fix: GeneratedFix;
  
  /**
   * Target branch
   */
  targetBranch?: string;
  
  /**
   * Options
   */
  options?: {
    createPR?: boolean;
    commitMessage?: string;
    branchName?: string;
    runCIChecks?: boolean;
  };
}

/**
 * Fix application result
 */
export interface FixApplicationResult {
  /**
   * Application status
   */
  applied: boolean;
  
  /**
   * Git details
   */
  git?: {
    branch: string;
    commit: string;
    files: string[];
  };
  
  /**
   * Pull request details
   */
  pullRequest?: {
    number: number;
    url: string;
    status: 'open' | 'closed' | 'merged';
  };
  
  /**
   * CI status
   */
  ci?: {
    status: 'pending' | 'running' | 'success' | 'failure';
    checks: Array<{
      name: string;
      status: string;
      conclusion?: string;
    }>;
  };
  
  /**
   * Errors if failed
   */
  error?: {
    type: 'merge-conflict' | 'ci-failure' | 'validation-error' | 'unknown';
    message: string;
    details?: any;
  };
}

/**
 * Fix generator configuration
 */
export interface FixGeneratorConfig {
  /**
   * AI service configuration
   */
  ai: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
  
  /**
   * Validation settings
   */
  validation: {
    requireSyntaxCheck?: boolean;
    requireSemanticCheck?: boolean;
    requireTestPass?: boolean;
    minConfidence?: number;
  };
  
  /**
   * Fix preferences
   */
  preferences: {
    preferMinimalChanges?: boolean;
    avoidBreakingChanges?: boolean;
    preserveFormatting?: boolean;
    respectStyleGuide?: boolean;
  };
  
  /**
   * Safety settings
   */
  safety: {
    maxRetries?: number;
    timeout?: number;
    maxPatchSize?: number;
    blockedPatterns?: string[];
  };
}

// Zod schemas for validation

export const GeneratedFixSchema = z.object({
  id: z.string(),
  issue: z.any(), // Will be validated separately
  fix: z.object({
    type: z.enum(['patch', 'replacement', 'insertion', 'deletion']),
    file: z.string(),
    startLine: z.number(),
    endLine: z.number(),
    originalCode: z.string(),
    fixedCode: z.string(),
    patch: z.string().optional()
  }),
  explanation: z.object({
    summary: z.string(),
    reasoning: z.string(),
    changes: z.array(z.string()),
    impact: z.object({
      fixes: z.array(z.string()),
      sideEffects: z.array(z.string()).optional(),
      breaking: z.boolean().optional()
    })
  }),
  confidence: z.object({
    overall: z.number().min(0).max(1),
    syntaxValid: z.boolean(),
    semanticValid: z.boolean(),
    testsPassing: z.boolean().optional(),
    riskLevel: z.enum(['low', 'medium', 'high'])
  }),
  validation: z.object({
    syntaxCheck: z.object({
      valid: z.boolean(),
      errors: z.array(z.string()).optional()
    }).optional(),
    semanticCheck: z.object({
      valid: z.boolean(),
      warnings: z.array(z.string()).optional()
    }).optional(),
    testResults: z.object({
      passed: z.boolean(),
      failedTests: z.array(z.string()).optional()
    }).optional()
  }).optional(),
  metadata: z.object({
    generatedAt: z.date(),
    model: z.string(),
    tokens: z.object({
      prompt: z.number(),
      completion: z.number(),
      total: z.number()
    }),
    cost: z.number(),
    attempts: z.number()
  })
});

export type GeneratedFixType = z.infer<typeof GeneratedFixSchema>;