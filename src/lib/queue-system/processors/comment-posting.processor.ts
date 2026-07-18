/**
 * CommentPostingProcessor — restored 2026-07-18; never committed originally;
 * minimal implementation of the interface consumed by src/lib/queue-system/index.ts
 * (constructor(githubClient) + createProcessor()) and re-exported by ./index.ts.
 *
 * Delegates to the injected GitHubClient (real component).
 *
 * Contract-resolution decision (flagged for owner review): CommentPostingJobData
 * identifies the target only as repositoryId/pullRequestId strings and has no
 * installationId field, but every GitHubClient call requires (owner, repo, number,
 * installationId). This processor resolves repositoryId as an "owner/repo" full
 * name, pullRequestId as a numeric string, and installationId from
 * job.data.metadata.installationId — and fails the job explicitly when any of
 * those cannot be resolved (fail-closed: no guessing which repo to post to).
 */

import { Job } from 'bull';
import { CommentPostingJobData, JobResult, JobProcessor } from '../types';
import { GitHubClient } from '../../github/client';

export class CommentPostingProcessor {
  constructor(private githubClient: GitHubClient) {}

  createProcessor(): JobProcessor<CommentPostingJobData> {
    return async (job: Job<CommentPostingJobData>): Promise<JobResult> => {
      const { repositoryId, pullRequestId, comments, summary, metadata } = job.data;

      const [owner, repo] = repositoryId.split('/');
      const prNumber = Number.parseInt(pullRequestId, 10);
      const installationId = typeof metadata?.['installationId'] === 'number'
        ? (metadata['installationId'] as number)
        : undefined;

      if (!owner || !repo || Number.isNaN(prNumber) || installationId === undefined) {
        return {
          success: false,
          error: {
            code: 'UNRESOLVABLE_TARGET',
            message:
              `Cannot resolve comment target from job data (repositoryId="${repositoryId}", ` +
              `pullRequestId="${pullRequestId}", metadata.installationId=` +
              `${String(metadata?.['installationId'])}). Expected repositoryId as ` +
              '"owner/repo", a numeric pullRequestId, and a numeric metadata.installationId.'
          }
        };
      }

      let posted = 0;
      const failures: Array<{ path?: string; line?: number; error: string }> = [];

      // Summary comment first (regular issue comment).
      if (summary) {
        try {
          await this.githubClient.createComment(owner, repo, prNumber, { body: summary }, installationId);
          posted++;
        } catch (error) {
          failures.push({ error: error instanceof Error ? error.message : String(error) });
        }
      }

      // Inline review comments.
      for (const comment of comments) {
        try {
          await this.githubClient.createComment(
            owner,
            repo,
            prNumber,
            {
              body: comment.body,
              path: comment.path,
              line: comment.line,
              ...(comment.side !== undefined ? { side: comment.side } : {})
            },
            installationId
          );
          posted++;
        } catch (error) {
          failures.push({
            path: comment.path,
            line: comment.line,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      const attempted = comments.length + (summary ? 1 : 0);
      if (posted === 0 && attempted > 0) {
        return {
          success: false,
          error: {
            code: 'ALL_COMMENTS_FAILED',
            message: `0/${attempted} comments posted to ${repositoryId}#${prNumber}: ${failures[0]?.error ?? 'unknown error'}`
          },
          data: { failures }
        };
      }

      return { success: true, data: { posted, attempted, failures } };
    };
  }
}
