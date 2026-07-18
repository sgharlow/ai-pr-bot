// NOTE (repair 2026-07-18): this barrel previously also re-exported
// './pr-analysis.processor' (PRAnalysisProcessor). That module was never committed
// and its only reference was the always-dead non-demo branch in ../index.ts (demo
// mode is hard-forced there), so the re-export was removed rather than fabricating
// the real PR-analysis pipeline. The live PR_ANALYSIS processor is
// EnhancedDemoProcessorSimple in ./pr-processor.ts.
export * from './pr-processor';
export * from './code-analysis.processor';
export * from './fix-generation.processor';
export * from './notification.processor';
export * from './comment-posting.processor';
export * from './cost-tracking.processor';
