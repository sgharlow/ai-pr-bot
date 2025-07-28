import { App } from '@octokit/app';
import { Octokit } from '@octokit/rest';
import jwt from 'jsonwebtoken';
import { config } from '../../config/environment';
import { GitHubConfig, InstallationAuth, GitHubError } from './types';

export class GitHubAuth {
  private app: App;
  private config: GitHubConfig;
  private installationTokens: Map<number, InstallationAuth> = new Map();

  constructor(githubConfig?: GitHubConfig) {
    this.config = githubConfig || {
      appId: config.GITHUB_APP_ID,
      privateKey: config.GITHUB_PRIVATE_KEY,
      clientId: config.GITHUB_CLIENT_ID,
      clientSecret: config.GITHUB_CLIENT_SECRET,
      webhookSecret: config.GITHUB_WEBHOOK_SECRET
    };

    console.log('[GitHubAuth] Initializing with App ID:', this.config.appId);
    console.log('[GitHubAuth] Private key length:', this.config.privateKey?.length || 0);

    this.app = new App({
      appId: this.config.appId,
      privateKey: this.config.privateKey,
      oauth: {
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret
      }
    });
  }

  /**
   * Gets an authenticated Octokit instance for a specific installation
   */
  async getInstallationOctokit(installationId: number) {
    try {
      const installation = await this.app.getInstallationOctokit(installationId);
      console.log('[GitHubAuth] Octokit instance type:', installation.constructor.name);
      console.log('[GitHubAuth] Has rest property:', !!installation.rest);
      console.log('[GitHubAuth] Has pulls property:', !!installation.pulls);
      console.log('[GitHubAuth] Direct properties:', Object.keys(installation).slice(0, 10));
      
      // Check if we have the pulls methods directly on the instance
      if (installation.pulls) {
        console.log('[GitHubAuth] Found direct pulls property');
      }
      
      return installation;
    } catch (error) {
      throw this.handleGitHubError(error, `Failed to get installation Octokit for installation ${installationId}`);
    }
  }

  /**
   * Gets an installation access token with caching and refresh logic
   */
  async getInstallationToken(installationId: number): Promise<string> {
    // Check if we have a cached token that's still valid
    const cached = this.installationTokens.get(installationId);
    if (cached && cached.expiresAt > new Date(Date.now() + 60000)) { // 1 minute buffer
      return cached.token;
    }

    try {
      const installation = await this.app.getInstallationOctokit(installationId);
      const { data } = await installation.request('POST /app/installations/{installation_id}/access_tokens', {
        installation_id: installationId
      });

      const auth: InstallationAuth = {
        installationId,
        token: data.token,
        expiresAt: new Date(data.expires_at)
      };

      this.installationTokens.set(installationId, auth);
      return data.token;
    } catch (error) {
      throw this.handleGitHubError(error, `Failed to get installation token for installation ${installationId}`);
    }
  }

  /**
   * Creates a JWT token for GitHub App authentication
   */
  createJWT(): string {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iat: now - 60, // Issued 60 seconds in the past to account for clock drift
      exp: now + 600, // Expires in 10 minutes
      iss: this.config.appId
    };

    return jwt.sign(payload, this.config.privateKey, { algorithm: 'RS256' });
  }

  /**
   * Gets the GitHub App's installations
   */
  async getInstallations(): Promise<Array<{ id: number; account: { login: string; type: string } }>> {
    try {
      const jwt = this.createJWT();
      const octokit = new Octokit({
        auth: jwt
      });

      const { data } = await octokit.rest.apps.listInstallations();
      return data.map(installation => ({
        id: installation.id,
        account: {
          login: installation.account?.login || '',
          type: installation.account?.type || ''
        }
      }));
    } catch (error) {
      throw this.handleGitHubError(error, 'Failed to get GitHub App installations');
    }
  }

  /**
   * Gets installation ID for a specific repository
   */
  async getInstallationIdForRepo(owner: string, repo: string): Promise<number> {
    try {
      const jwt = this.createJWT();
      const octokit = new Octokit({
        auth: jwt
      });

      const { data } = await octokit.rest.apps.getRepoInstallation({
        owner,
        repo
      });

      return data.id;
    } catch (error) {
      throw this.handleGitHubError(error, `Failed to get installation ID for ${owner}/${repo}`);
    }
  }

  /**
   * Validates that the GitHub App has the required permissions
   */
  async validatePermissions(installationId: number): Promise<{ valid: boolean; missing: string[] }> {
    try {
      const installation = await this.app.getInstallationOctokit(installationId);
      const { data } = await installation.request('GET /app/installations/{installation_id}', {
        installation_id: installationId
      });

      const requiredPermissions = [
        'contents',
        'pull_requests',
        'checks',
        'metadata'
      ];

      const missing: string[] = [];
      const permissions = data.permissions || {};

      for (const permission of requiredPermissions) {
        if (!permissions[permission] || permissions[permission] === 'none') {
          missing.push(permission);
        }
      }

      return {
        valid: missing.length === 0,
        missing
      };
    } catch (error) {
      throw this.handleGitHubError(error, `Failed to validate permissions for installation ${installationId}`);
    }
  }

  /**
   * Refreshes an installation token if it's expired or about to expire
   */
  async refreshTokenIfNeeded(installationId: number): Promise<void> {
    const cached = this.installationTokens.get(installationId);
    if (!cached || cached.expiresAt <= new Date(Date.now() + 300000)) { // 5 minutes buffer
      await this.getInstallationToken(installationId);
    }
  }

  /**
   * Clears cached tokens (useful for testing or forced refresh)
   */
  clearTokenCache(installationId?: number): void {
    if (installationId) {
      this.installationTokens.delete(installationId);
    } else {
      this.installationTokens.clear();
    }
  }

  /**
   * Handles GitHub API errors with proper error formatting
   */
  private handleGitHubError(error: any, context: string): GitHubError {
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
   * Gets the current rate limit status
   */
  async getRateLimit(installationId: number): Promise<{
    limit: number;
    remaining: number;
    reset: Date;
    used: number;
  }> {
    try {
      const installation = await this.app.getInstallationOctokit(installationId);
      const { data } = await installation.request('GET /rate_limit');

      return {
        limit: data.rate.limit,
        remaining: data.rate.remaining,
        reset: new Date(data.rate.reset * 1000),
        used: data.rate.used
      };
    } catch (error) {
      throw this.handleGitHubError(error, `Failed to get rate limit for installation ${installationId}`);
    }
  }
}