export * from './types';
export { CodeAnalyzer, createCodeAnalyzer } from './code-analyzer';
export { OptimizedCodeAnalyzer, OptimizedAnalysisOptions, OptimizedAnalysisResult } from './optimized-analyzer';
export { ConfigLoader } from './config-loader';
export { FindingMerger } from './finding-merger';

// Re-export main types for convenience
export type {
  CodeAnalysisConfig,
  CodeAnalysisOptions,
  CodeAnalysisResult,
  AnalysisFinding,
  AnalysisMetrics,
  AnalysisError,
  AIReviewConfig
} from './types';

import { CodeAnalysisConfig } from './types';

// Factory function for creating optimized analyzer
export function createOptimizedAnalyzer(config?: Partial<CodeAnalysisConfig>) {
  const { OptimizedCodeAnalyzer } = require('./optimized-analyzer');
  return new OptimizedCodeAnalyzer(config);
}