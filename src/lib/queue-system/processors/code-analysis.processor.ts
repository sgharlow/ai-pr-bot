/**
 * CodeAnalysisProcessor — restored 2026-07-18; never committed originally; minimal
 * implementation of the interface consumed by src/lib/queue-system/index.ts
 * (constructor(codeAnalyzer, queueManager) + createProcessor()) and re-exported by
 * ./index.ts.
 *
 * Delegates to the injected CodeAnalyzer (real component) for each file in the job.
 * No follow-up jobs are enqueued automatically — the original chaining semantics
 * were never committed, so the processor returns findings in the JobResult instead
 * of inventing pipeline behavior. queueManager is accepted (call-site contract) and
 * kept for that future chaining.
 */

import { Job } from 'bull';
import { CodeAnalysisJobData, JobResult, JobProcessor, IQueueManager } from '../types';
import { CodeAnalyzer as ICodeAnalyzer, AnalysisFinding } from '../../code-analysis/analyzer/types';

export class CodeAnalysisProcessor {
  constructor(
    private codeAnalyzer: ICodeAnalyzer,
    private queueManager?: IQueueManager
  ) {}

  createProcessor(): JobProcessor<CodeAnalysisJobData> {
    return async (job: Job<CodeAnalysisJobData>): Promise<JobResult> => {
      const started = Date.now();
      const { files, configuration } = job.data;

      try {
        const allFindings: AnalysisFinding[] = [];
        const fileErrors: Array<{ file: string; error: string }> = [];

        for (const file of files) {
          try {
            const result = await this.codeAnalyzer.analyze(file.content, {
              filePath: file.path,
              ...(file.language !== undefined ? { language: file.language } : {})
            });
            allFindings.push(...result.findings);
            for (const err of result.errors) {
              fileErrors.push({ file: file.path, error: `${err.source}: ${err.message}` });
            }
          } catch (error) {
            fileErrors.push({
              file: file.path,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }

        return {
          success: true,
          data: {
            findings: allFindings,
            filesAnalyzed: files.length,
            fileErrors,
            configuration
          },
          metrics: {
            duration: Date.now() - started,
            retries: job.attemptsMade
          }
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'CODE_ANALYSIS_FAILED',
            message: error instanceof Error ? error.message : String(error),
            ...(error instanceof Error && error.stack ? { stack: error.stack } : {})
          },
          metrics: {
            duration: Date.now() - started,
            retries: job.attemptsMade
          }
        };
      }
    };
  }
}
