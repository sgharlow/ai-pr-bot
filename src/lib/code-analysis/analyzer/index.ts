export * from './types';
export { CodeAnalyzer, createCodeAnalyzer } from './code-analyzer';
export { ConfigLoader } from './config-loader';
export { FindingMerger } from './finding-merger';

// NOTE (repair 2026-07-18): this barrel previously re-exported
// OptimizedCodeAnalyzer / OptimizedAnalysisOptions / OptimizedAnalysisResult and a
// createOptimizedAnalyzer factory from './optimized-analyzer'. That module was never
// committed and no code in the repository consumes any of those exports, so the
// re-exports were removed rather than fabricating an "optimized" analyzer.

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
