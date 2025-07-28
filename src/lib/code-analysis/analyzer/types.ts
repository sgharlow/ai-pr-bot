/**
 * Types for the Code Analysis Orchestration Engine
 */

import { ParseResult } from '../tree-sitter/types';
import { Redaction } from '../../privacy-guard/types';

export interface CodeAnalysisConfig {
  /**
   * Enable privacy guard for redacting sensitive data
   */
  enablePrivacyGuard?: boolean;
  
  /**
   * Privacy guard configuration file path
   */
  privacyGuardConfig?: string;
  
  /**
   * Enable Tree-sitter AST parsing
   */
  enableTreeSitter?: boolean;
  
  /**
   * Enable Semgrep static analysis
   */
  enableSemgrep?: boolean;
  
  /**
   * Semgrep rules configuration
   */
  semgrepConfig?: {
    rulesPath?: string;
    includeRules?: string[];
    excludeRules?: string[];
    severityLevels?: ('ERROR' | 'WARNING' | 'INFO')[];
  };
  
  /**
   * Minimum severity level to report
   */
  minSeverity?: 'critical' | 'high' | 'medium' | 'low';
  
  /**
   * Maximum number of findings to return
   */
  maxFindings?: number;
  
  /**
   * Enable performance metrics collection
   */
  collectMetrics?: boolean;
  
  /**
   * Custom configuration from .ai-review.yml
   */
  customConfig?: Record<string, any>;
}

export interface CodeAnalysisOptions {
  /**
   * Language hint for analysis
   */
  language?: string;
  
  /**
   * File path for context
   */
  filePath?: string;
  
  /**
   * Additional context for analysis
   */
  context?: {
    repository?: string;
    branch?: string;
    commit?: string;
    pullRequest?: number;
  };
}

export interface CodeAnalysisResult {
  /**
   * Combined findings from all analyzers
   */
  findings: AnalysisFinding[];
  
  /**
   * AST parse results if enabled
   */
  ast?: ParseResult;
  
  /**
   * Redacted content if privacy guard is enabled
   */
  redactedContent?: string;
  
  /**
   * Redactions made by privacy guard
   */
  redactions?: Redaction[];
  
  /**
   * Performance metrics
   */
  metrics?: AnalysisMetrics;
  
  /**
   * Errors encountered during analysis
   */
  errors: AnalysisError[];
  
  /**
   * Analysis metadata
   */
  metadata: {
    analyzedAt: Date;
    language?: string;
    filePath?: string;
    analyzersUsed: string[];
    configSource?: string;
  };
}

export interface AnalysisFinding {
  /**
   * Unique identifier for the finding
   */
  id: string;
  
  /**
   * Source of the finding
   */
  source: 'semgrep' | 'tree-sitter' | 'privacy-guard' | 'plugin';
  
  /**
   * Type of finding
   */
  type: 'security' | 'performance' | 'style' | 'bug' | 'privacy';
  
  /**
   * Severity level
   */
  severity: 'critical' | 'high' | 'medium' | 'low';
  
  /**
   * Rule or check that triggered the finding
   */
  rule: string;
  
  /**
   * Human-readable message
   */
  message: string;
  
  /**
   * File path
   */
  file: string;
  
  /**
   * Start location
   */
  location: {
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
  };
  
  /**
   * Code snippet
   */
  codeSnippet?: string;
  
  /**
   * Suggested fix
   */
  suggestion?: string;
  
  /**
   * Can be automatically fixed
   */
  autoFixable: boolean;
  
  /**
   * Confidence score (0-1)
   */
  confidence: number;
  
  /**
   * Additional metadata
   */
  metadata?: Record<string, any>;
}

export interface AnalysisMetrics {
  /**
   * Total analysis time in milliseconds
   */
  totalTime: number;
  
  /**
   * Time breakdown by component
   */
  breakdown: {
    privacyGuard?: number;
    treeSitter?: number;
    semgrep?: number;
    plugins?: number;
  };
  
  /**
   * Number of findings by source
   */
  findingCounts: {
    total: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
    bySource: Record<string, number>;
  };
  
  /**
   * Code metrics
   */
  codeMetrics?: {
    lines: number;
    functions: number;
    classes: number;
    complexity?: number;
  };
}

export interface AnalysisError {
  /**
   * Error source
   */
  source: string;
  
  /**
   * Error message
   */
  message: string;
  
  /**
   * Error type
   */
  type: 'configuration' | 'runtime' | 'timeout' | 'unknown';
  
  /**
   * Stack trace if available
   */
  stack?: string;
  
  /**
   * Additional context
   */
  context?: Record<string, any>;
}

export interface CodeAnalyzer {
  /**
   * Analyze code content
   */
  analyze(
    content: string,
    options?: CodeAnalysisOptions
  ): Promise<CodeAnalysisResult>;
  
  /**
   * Analyze multiple files
   */
  analyzeFiles(
    filePaths: string[],
    options?: CodeAnalysisOptions
  ): Promise<Map<string, CodeAnalysisResult>>;
  
  /**
   * Load configuration from file
   */
  loadConfig(configPath: string): Promise<void>;
  
  /**
   * Update configuration
   */
  updateConfig(config: Partial<CodeAnalysisConfig>): void;
  
  /**
   * Get current configuration
   */
  getConfig(): CodeAnalysisConfig;
}

/**
 * Configuration file schema (.ai-review.yml)
 */
export interface AIReviewConfig {
  enabled: boolean;
  severityThreshold?: 'critical' | 'high' | 'medium' | 'low';
  autoFix?: boolean;
  costLimit?: number; // Legacy field for backward compatibility
  languages?: string[];
  customRules?: string[];
  analysis?: {
    privacyGuard?: {
      enabled?: boolean;
      configPath?: string;
    };
    treeSitter?: {
      enabled?: boolean;
    };
    semgrep?: {
      enabled?: boolean;
      rules?: string | string[];
      excludeRules?: string[];
      severity?: ('ERROR' | 'WARNING' | 'INFO')[];
    };
  };
  notifications?: {
    slack?: boolean;
    discord?: boolean;
  };
  plugins?: Array<{
    name: string;
    enabled: boolean;
    config?: Record<string, any>;
  }>;
  costLimits?: {
    daily?: number;
    weekly?: number;
    monthly?: number;
    alertThreshold?: number; // Percentage (0-100)
    hardLimit?: boolean; // If true, operations blocked when limit exceeded
  };
}