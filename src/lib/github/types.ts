export interface GitHubConfig {
  appId: string;
  privateKey: string;
  clientId: string;
  clientSecret: string;
  webhookSecret: string;
}

export interface InstallationAuth {
  installationId: number;
  token: string;
  expiresAt: Date;
}

export interface PullRequestData {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  head: {
    sha: string;
    ref: string;
    repo: {
      id: number;
      name: string;
      full_name: string;
      owner: {
        login: string;
      };
    };
  };
  base: {
    sha: string;
    ref: string;
    repo: {
      id: number;
      name: string;
      full_name: string;
      owner: {
        login: string;
      };
    };
  };
  user: {
    id: number;
    login: string;
    avatar_url: string;
  };
  created_at: string;
  updated_at: string;
  mergeable?: boolean;
  mergeable_state?: string;
  draft: boolean;
}

export interface ChangedFile {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  additions: number;
  deletions: number;
  changes: number;
  patch: string;
  previous_filename?: string;
}

export interface GitHubComment {
  id: number;
  body: string;
  path?: string;
  line?: number;
  position?: number;
  user: {
    login: string;
    avatar_url: string;
  };
  created_at: string;
  updated_at: string;
}

export interface CreateCommentOptions {
  body: string;
  path?: string;
  line?: number;
  commit_id?: string;
  side?: 'LEFT' | 'RIGHT';
  start_line?: number;
  start_side?: 'LEFT' | 'RIGHT';
}

export interface GitHubCheckRun {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'timed_out' | 'action_required';
  output?: {
    title: string;
    summary: string;
    text?: string;
  };
}

export interface CreateCheckRunOptions {
  name: string;
  head_sha: string;
  status?: 'queued' | 'in_progress' | 'completed';
  conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'timed_out' | 'action_required';
  output?: {
    title: string;
    summary: string;
    text?: string;
  };
  actions?: Array<{
    label: string;
    description: string;
    identifier: string;
  }>;
}

export interface GitHubError extends Error {
  status?: number;
  response?: {
    status: number;
    data: any;
  };
}