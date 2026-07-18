/**
 * NotificationProcessor — restored 2026-07-18; never committed originally; minimal
 * implementation of the interface consumed by src/lib/queue-system/index.ts
 * (constructor(slackClient?, discordClient?) + createProcessor()) and re-exported
 * by ./index.ts.
 *
 * No Slack/Discord client implementation exists anywhere in this repo and no call
 * site injects one (both call sites pass undefined). The NotificationClient
 * interface below defines the seam a real client must satisfy; until one is
 * injected, jobs fail explicitly with CHANNEL_NOT_CONFIGURED — fail-closed, so a
 * "sent" notification is never claimed when nothing was sent.
 */

import { Job } from 'bull';
import { NotificationJobData, JobResult, JobProcessor } from '../types';

/** Seam for a real Slack/Discord/etc. client. */
export interface NotificationClient {
  send(notification: {
    channel?: string;
    recipients?: string[];
    template: string;
    data: NotificationJobData['data'];
  }): Promise<void>;
}

export class NotificationProcessor {
  constructor(
    private slackClient?: NotificationClient,
    private discordClient?: NotificationClient
  ) {}

  createProcessor(): JobProcessor<NotificationJobData> {
    return async (job: Job<NotificationJobData>): Promise<JobResult> => {
      const { type, channel, recipients, template, data } = job.data;

      const client = this.clientFor(type);
      if (!client) {
        return {
          success: false,
          error: {
            code: 'CHANNEL_NOT_CONFIGURED',
            message: `No ${type} client is configured; notification not sent (template: ${template})`
          }
        };
      }

      try {
        await client.send({
          ...(channel !== undefined ? { channel } : {}),
          ...(recipients !== undefined ? { recipients } : {}),
          template,
          data
        });
        return { success: true, data: { delivered: true, type } };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'NOTIFICATION_SEND_FAILED',
            message: error instanceof Error ? error.message : String(error)
          }
        };
      }
    };
  }

  private clientFor(type: NotificationJobData['type']): NotificationClient | undefined {
    switch (type) {
      case 'slack':
        return this.slackClient;
      case 'discord':
        return this.discordClient;
      default:
        // 'email' and 'webhook' channels never had clients in this repo.
        return undefined;
    }
  }
}
