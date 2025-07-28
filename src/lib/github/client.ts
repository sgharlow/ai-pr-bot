import { GitHubAuth } from './auth';
import { DiffAnalyzer, SemanticDiff } from './diff-analyzer-simple';
import { 
  PullRequestData, 
  ChangedFile, 
  GitHubComment, 
  CreateCommentOptions,
  GitHubCheckRun,
  CreateCheckRunOptions,
  GitHubError 
} from './types';

export class GitHubClient {
  private auth: GitHubAuth;
  private diffAnalyzer: DiffAnalyzer;

  constructor(auth?: GitHubAuth) {
    this.auth = auth || new GitHubAuth();
    this.diffAnalyzer = new DiffAnalyzer();
  }

  /**
   * Fetches pull request data
   */
  async getPullRequest(
    owner: string, 
    repo: string, 
    pullNumber: number, 
    installationId: number
  ): Promise<PullRequestData> {
    try {
      console.log(`[GitHubClient] Getting PR ${owner}/${repo}#${pullNumber} for installation ${installationId}`);
      const octokit = await this.auth.getInstallationOctokit(installationId);
      console.log(`[GitHubClient] Got octokit instance:`, !!octokit);
      console.log(`[GitHubClient] Octokit keys:`, Object.keys(octokit || {}).slice(0, 10));
      
      // With @octokit/app v14, we need to use the request method directly
      console.log(`[GitHubClient] Using direct request method for PR`);
      
      const { data } = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
        owner,
        repo,
        pull_number: pullNumber
      });

      return {
        id: data.id,
        number: data.number,
        title: data.title,
        body: data.body || '',
        state: data.state as 'open' | 'closed',
        head: {
          sha: data.head.sha,
          ref: data.head.ref,
          repo: {
            id: data.head.repo?.id || 0,
            name: data.head.repo?.name || '',
            full_name: data.head.repo?.full_name || '',
            owner: {
              login: data.head.repo?.owner?.login || ''
            }
          }
        },
        base: {
          sha: data.base.sha,
          ref: data.base.ref,
          repo: {
            id: data.base.repo.id,
            name: data.base.repo.name,
            full_name: data.base.repo.full_name,
            owner: {
              login: data.base.repo.owner.login
            }
          }
        },
        user: {
          id: data.user?.id || 0,
          login: data.user?.login || '',
          avatar_url: data.user?.avatar_url || ''
        },
        created_at: data.created_at,
        updated_at: data.updated_at,
        mergeable: data.mergeable || undefined,
        mergeable_state: data.mergeable_state || undefined,
        draft: data.draft
      };
    } catch (error) {
      throw this.handleError(error, `Failed to get pull request ${owner}/${repo}#${pullNumber}`);
    }
  }

  /**
   * Fetches changed files in a pull request
   */
  async getChangedFiles(
    owner: string, 
    repo: string, 
    pullNumber: number, 
    installationId: number
  ): Promise<ChangedFile[]> {
    try {
      const octokit = await this.auth.getInstallationOctokit(installationId);
      
      // With @octokit/app v14, we need to use the request method directly
      const { data } = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/files', {
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 100 // GitHub's maximum
      });

      return data.map(file => ({
        filename: file.filename,
        status: file.status as 'added' | 'modified' | 'removed' | 'renamed',
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        patch: file.patch || '',
        previous_filename: file.previous_filename
      }));
    } catch (error) {
      throw this.handleError(error, `Failed to get changed files for ${owner}/${repo}#${pullNumber}`);
    }
  }

  /**
   * Fetches changed files with semantic diff analysis
   */
  async getSemanticDiffs(
    owner: string, 
    repo: string, 
    pullNumber: number, 
    installationId: number
  ): Promise<SemanticDiff[]> {
    try {
      const changedFiles = await this.getChangedFiles(owner, repo, pullNumber, installationId);
      return await this.diffAnalyzer.analyzeChangedFiles(changedFiles);
    } catch (error) {
      throw this.handleError(error, `Failed to get semantic diffs for ${owner}/${repo}#${pullNumber}`);
    }
  }

  /**
   * Posts a comment on a pull request
   */
  async createComment(
    owner: string,
    repo: string,
    pullNumber: number,
    options: CreateCommentOptions,
    installationId: number
  ): Promise<GitHubComment> {
    try {
      const octokit = await this.auth.getInstallationOctokit(installationId);
      
      let response;
      if (options.path && options.line) {
        // Create a review comment (inline comment)
        response = await octokit.request('POST /repos/{owner}/{repo}/pulls/{pull_number}/comments', {
          owner,
          repo,
          pull_number: pullNumber,
          body: options.body,
          commit_id: options.commit_id || '',
          path: options.path,
          line: options.line,
          side: options.side || 'RIGHT',
          start_line: options.start_line,
          start_side: options.start_side
        });
      } else {
        // Create a regular issue comment
        response = await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
          owner,
          repo,
          issue_number: pullNumber,
          body: options.body
        });
      }

      const data = response.data;
      return {
        id: data.id,
        body: data.body,
        path: 'path' in data ? data.path : undefined,
        line: 'line' in data ? data.line : undefined,
        position: 'position' in data ? data.position : undefined,
        user: {
          login: data.user?.login || '',
          avatar_url: data.user?.avatar_url || ''
        },
        created_at: data.created_at,
        updated_at: data.updated_at
      };
    } catch (error) {
      throw this.handleError(error, `Failed to create comment on ${owner}/${repo}#${pullNumber}`);
    }
  }

  /**
   * Creates or updates a check run
   */
  async createCheckRun(
    owner: string,
    repo: string,
    options: CreateCheckRunOptions,
    installationId: number
  ): Promise<GitHubCheckRun> {
    try {
      const octokit = await this.auth.getInstallationOctokit(installationId);
      const { data } = await octokit.request('POST /repos/{owner}/{repo}/check-runs', {
        owner,
        repo,
        name: options.name,
        head_sha: options.head_sha,
        status: options.status,
        conclusion: options.conclusion,
        output: options.output,
        actions: options.actions
      });

      return {
        id: data.id,
        name: data.name,
        status: data.status as 'queued' | 'in_progress' | 'completed',
        conclusion: data.conclusion as any,
        output: data.output ? {
          title: data.output.title || '',
          summary: data.output.summary || '',
          text: data.output.text
        } : undefined
      };
    } catch (error) {
      throw this.handleError(error, `Failed to create check run for ${owner}/${repo}@${options.head_sha}`);
    }
  }

  /**
   * Updates an existing check run
   */
  async updateCheckRun(
    owner: string,
    repo: string,
    checkRunId: number,
    options: Partial<CreateCheckRunOptions>,
    installationId: number
  ): Promise<GitHubCheckRun> {
    try {
      const octokit = await this.auth.getInstallationOctokit(installationId);
      const { data } = await octokit.request('PATCH /repos/{owner}/{repo}/check-runs/{check_run_id}', {
        owner,
        repo,
        check_run_id: checkRunId,
        name: options.name,
        status: options.status,
        conclusion: options.conclusion,
        output: options.output
      });

      return {
        id: data.id,
        name: data.name,
        status: data.status as 'queued' | 'in_progress' | 'completed',
        conclusion: data.conclusion as any,
        output: data.output ? {
          title: data.output.title || '',
          summary: data.output.summary || '',
          text: data.output.text
        } : undefined
      };
    } catch (error) {
      throw this.handleError(error, `Failed to update check run ${checkRunId} for ${owner}/${repo}`);
    }
  }

  /**
   * Gets file content from a repository
   */
  async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref: string,
    installationId: number
  ): Promise<{ content: string; encoding: string; sha: string }> {
    try {
      const octokit = await this.auth.getInstallationOctokit(installationId);
      const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner,
        repo,
        path,
        ref
      });

      if (Array.isArray(data) || data.type !== 'file') {
        throw new Error(`Path ${path} is not a file`);
      }

      return {
        content: data.content,
        encoding: data.encoding as string,
        sha: data.sha
      };
    } catch (error) {
      throw this.handleError(error, `Failed to get file content for ${owner}/${repo}:${path}@${ref}`);
    }
  }

  /**
   * Creates a new branch
   */
  async createBranch(
    owner: string,
    repo: string,
    branchName: string,
    fromSha: string,
    installationId: number
  ): Promise<void> {
    try {
      const octokit = await this.auth.getInstallationOctokit(installationId);
      await octokit.request('POST /repos/{owner}/{repo}/git/refs', {
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha: fromSha
      });
    } catch (error) {
      throw this.handleError(error, `Failed to create branch ${branchName} in ${owner}/${repo}`);
    }
  }

  /**
   * Creates a pull request
   */
  async createPullRequest(
    owner: string,
    repo: string,
    title: string,
    body: string,
    head: string,
    base: string,
    installationId: number
  ): Promise<PullRequestData> {
    try {
      const octokit = await this.auth.getInstallationOctokit(installationId);
      const { data } = await octokit.request('POST /repos/{owner}/{repo}/pulls', {
        owner,
        repo,
        title,
        body,
        head,
        base
      });

      return {
        id: data.id,
        number: data.number,
        title: data.title,
        body: data.body || '',
        state: data.state as 'open' | 'closed',
        head: {
          sha: data.head.sha,
          ref: data.head.ref,
          repo: {
            id: data.head.repo?.id || 0,
            name: data.head.repo?.name || '',
            full_name: data.head.repo?.full_name || '',
            owner: {
              login: data.head.repo?.owner?.login || ''
            }
          }
        },
        base: {
          sha: data.base.sha,
          ref: data.base.ref,
          repo: {
            id: data.base.repo.id,
            name: data.base.repo.name,
            full_name: data.base.repo.full_name,
            owner: {
              login: data.base.repo.owner.login
            }
          }
        },
        user: {
          id: data.user?.id || 0,
          login: data.user?.login || '',
          avatar_url: data.user?.avatar_url || ''
        },
        created_at: data.created_at,
        updated_at: data.updated_at,
        mergeable: data.mergeable || undefined,
        mergeable_state: data.mergeable_state || undefined,
        draft: data.draft
      };
    } catch (error) {
      throw this.handleError(error, `Failed to create pull request in ${owner}/${repo}`);
    }
  }

  /**
   * Gets repository information
   */
  async getRepository(
    owner: string,
    repo: string,
    installationId: number
  ): Promise<{
    id: number;
    name: string;
    full_name: string;
    default_branch: string;
    private: boolean;
  }> {
    try {
      const octokit = await this.auth.getInstallationOctokit(installationId);
      const { data } = await octokit.request('GET /repos/{owner}/{repo}', {
        owner,
        repo
      });

      return {
        id: data.id,
        name: data.name,
        full_name: data.full_name,
        default_branch: data.default_branch,
        private: data.private
      };
    } catch (error) {
      throw this.handleError(error, `Failed to get repository ${owner}/${repo}`);
    }
  }

  /**
   * Handles authentication errors with retry logic
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    installationId: number,
    maxRetries: number = 2
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        // If it's an auth error and we haven't exceeded retries, refresh token and try again
        if (error.status === 401 && attempt < maxRetries) {
          await this.auth.refreshTokenIfNeeded(installationId);
          continue;
        }

        // If it's a rate limit error, throw immediately (don't retry)
        if (error.status === 403 && error.response?.data?.message?.includes('rate limit')) {
          throw error;
        }

        // For other errors, only retry if we haven't exceeded max attempts
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          continue;
        }

        throw error;
      }
    }

    throw lastError!;
  }

  /**
   * Handles GitHub API errors
   */
  private handleError(error: any, context: string): GitHubError {
    const gitHubError = new Error(`${context}: ${error.message}`) as GitHubError;
    
    if (error.response) {
      gitHubError.status = error.response.status;
      gitHubError.response = error.response;
    } else if (error.status) {
      gitHubError.status = error.status;
    }

    return gitHubError;
  }

  /**
   * Gets the authentication instance (useful for testing)
   */
  getAuth(): GitHubAuth {
    return this.auth;
  }
}