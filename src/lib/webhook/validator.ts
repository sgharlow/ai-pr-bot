import crypto from 'crypto';
import { config } from '../../config/environment';
import { WebhookValidationResult } from './types';

export class WebhookValidator {
  private readonly secret: string;

  constructor(secret?: string) {
    this.secret = secret || config.GITHUB_WEBHOOK_SECRET;
  }

  /**
   * Validates GitHub webhook signature using HMAC-SHA256
   */
  validateSignature(payload: string, signature: string): WebhookValidationResult {
    // TEMPORARY: Skip validation for testing
    if (process.env.SKIP_WEBHOOK_VALIDATION === 'true') {
      console.warn('[WebhookValidator] SKIPPING SIGNATURE VALIDATION - TEST MODE');
      return { isValid: true };
    }
    
    if (!signature) {
      return {
        isValid: false,
        error: 'Missing signature header'
      };
    }

    // GitHub sends signature as 'sha256=<hash>'
    if (!signature.startsWith('sha256=')) {
      return {
        isValid: false,
        error: 'Invalid signature format'
      };
    }

    const expectedSignature = signature.substring(7); // Remove 'sha256=' prefix
    const computedSignature = this.computeSignature(payload);

    // Use timing-safe comparison to prevent timing attacks
    // Ensure both buffers are the same length to avoid RangeError
    let isValid = false;
    try {
      if (expectedSignature.length === computedSignature.length) {
        isValid = crypto.timingSafeEqual(
          Buffer.from(expectedSignature, 'hex'),
          Buffer.from(computedSignature, 'hex')
        );
      }
    } catch (error) {
      // Invalid hex strings or other errors
      isValid = false;
    }

    if (isValid) {
      return { isValid: true };
    } else {
      return { isValid: false, error: 'Signature verification failed' };
    }
  }

  /**
   * Computes HMAC-SHA256 signature for the payload
   */
  private computeSignature(payload: string): string {
    return crypto
      .createHmac('sha256', this.secret)
      .update(payload, 'utf8')
      .digest('hex');
  }

  /**
   * Validates webhook payload structure
   */
  validatePayload(payload: any): WebhookValidationResult {
    if (!payload) {
      return {
        isValid: false,
        error: 'Empty payload'
      };
    }

    if (typeof payload !== 'object') {
      return {
        isValid: false,
        error: 'Invalid payload format'
      };
    }

    // Check for required fields
    if (!payload.repository) {
      return {
        isValid: false,
        error: 'Missing repository information'
      };
    }

    if (!payload.sender) {
      return {
        isValid: false,
        error: 'Missing sender information'
      };
    }

    return { isValid: true };
  }

  /**
   * Validates that the event is relevant for processing
   */
  isRelevantEvent(eventType: string, payload: any): boolean {
    // Only process pull request events
    if (eventType !== 'pull_request') {
      return false;
    }

    // Only process specific actions
    const relevantActions = ['opened', 'synchronize', 'reopened'];
    return relevantActions.includes(payload.action);
  }
}