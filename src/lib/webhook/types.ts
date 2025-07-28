export interface WebhookEvent {
  action: string;
  number?: number;
  pull_request?: PullRequest;
  repository: Repository;
  sender: User;
  installation?: Installation;
}

export interface PullRequest {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  head: {
    sha: string;
    ref: string;
    repo: Repository;
  };
  base: {
    sha: string;
    ref: string;
    repo: Repository;
  };
  user: User;
  created_at: string;
  updated_at: string;
  merged_at?: string;
  draft: boolean;
  mergeable?: boolean;
  mergeable_state?: string;
}

export interface Repository {
  id: number;
  name: string;
  full_name: string;
  owner: User;
  private: boolean;
  default_branch: string;
  clone_url: string;
  ssh_url: string;
}

export interface User {
  id: number;
  login: string;
  avatar_url: string;
  type: 'User' | 'Bot';
}

export interface Installation {
  id: number;
  account: User;
}

export interface WebhookValidationResult {
  isValid: boolean;
  error?: string;
}

export interface ProcessedWebhookEvent {
  event: WebhookEvent;
  eventType: string;
  deliveryId: string;
  timestamp: Date;
}