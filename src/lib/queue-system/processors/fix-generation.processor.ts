/**
 * FixGenerationProcessor — restored 2026-07-18; never committed originally; minimal
 * implementation of the interface consumed by src/lib/queue-system/index.ts
 * (constructor(fixGenerator, fixValidator, queueManager) + createProcessor()) and
 * re-exported by ./index.ts.
 *
 * HONEST LIMIT (flagged for owner review): FixGenerationJobData carries findings
 * but NO file contents, while FixGenerator.generateFix requires the code content
 * being fixed (FixGenerationRequest.code.content). The wiring that would supply
 * content was never committed. Rather than fabricate content (or silently no-op),
 * this processor fails the job with an explicit INSUFFICIENT_JOB_DATA error —
 * fail-closed, because generating "fixes" against empty content would be fake
 * output posted to real PRs. Nothing currently enqueues FIX_GENERATION jobs.
 */

import { Job } from 'bull';
import { FixGenerationJobData, JobResult, JobProcessor, IQueueManager } from '../types';
import { FixGenerator } from '../../auto-fix/fix-generator';
import { FixValidator } from '../../auto-fix/fix-validator';

export class FixGenerationProcessor {
  constructor(
    private fixGenerator: FixGenerator,
    private fixValidator: FixValidator,
    private queueManager?: IQueueManager
  ) {}

  createProcessor(): JobProcessor<FixGenerationJobData> {
    return async (job: Job<FixGenerationJobData>): Promise<JobResult> => {
      const { findings } = job.data;

      return {
        success: false,
        error: {
          code: 'INSUFFICIENT_JOB_DATA',
          message:
            `Fix generation for ${findings.length} finding(s) cannot run: ` +
            'FixGenerationJobData does not carry file contents, which ' +
            'FixGenerator.generateFix requires (request.code.content). The producer ' +
            'side of this contract was never committed; extend the job data with file ' +
            'contents (or a fetch handle) before enabling this processor.'
        }
      };
    };
  }
}
