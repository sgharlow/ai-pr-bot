/**
 * PrivacyGuard — restored 2026-07-18; never committed originally; minimal
 * implementation of the interface consumed by
 * src/lib/code-analysis/analyzer/code-analyzer.ts: redactSecrets(content).
 *
 * Pattern-based redaction of well-known credential formats before code is sent to
 * external analyzers / the AI service. Honest limits: this is a fixed list of
 * high-confidence patterns (documented per pattern below), not a general secret
 * scanner — it will miss secrets that do not match these shapes. Fail-closed in
 * spirit: patterns are chosen to over-redact rather than leak (e.g. any quoted
 * value assigned to a key/token/secret/password-like name is redacted).
 */

import { Redaction, PrivacyGuardResult } from './types';

export { Redaction, PrivacyGuardResult } from './types';

interface SecretPattern {
  type: string;
  regex: RegExp;
}

const PATTERNS: SecretPattern[] = [
  // AWS access key IDs: AKIA/ASIA + 16 uppercase alphanumerics (documented format)
  { type: 'aws-access-key', regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  // GitHub tokens: classic PATs, fine-grained PATs, app/oauth/server tokens
  { type: 'github-token', regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g },
  { type: 'github-token', regex: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g },
  // OpenAI-style API keys
  { type: 'openai-api-key', regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  // Slack tokens
  { type: 'slack-token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  // PEM private key blocks
  {
    type: 'private-key',
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g
  },
  // Generic assignment of a quoted value to a secret-like identifier
  {
    type: 'generic-secret',
    regex: /((?:api[_-]?key|apikey|secret|token|password|passwd|pwd)\s*[:=]\s*)(['"])(?:(?!\2).){8,}\2/gi
  }
];

const REPLACEMENT = '[REDACTED]';

export class PrivacyGuard {
  redactSecrets(content: string): PrivacyGuardResult {
    const redactions: Redaction[] = [];
    let sanitized = content;

    for (const pattern of PATTERNS) {
      // Match against the current sanitized text so overlapping patterns do not
      // re-redact placeholders; positions are computed per pass.
      sanitized = sanitized.replace(pattern.regex, (match: string, ...args: unknown[]) => {
        const offset = args[args.length - 2] as number;
        const before = sanitized.slice(0, offset);
        const line = before.split('\n').length;
        const column = offset - before.lastIndexOf('\n');

        redactions.push({ type: pattern.type, line, column, replacement: REPLACEMENT });

        // For the generic-secret pattern keep the identifier prefix so the code
        // still parses (key = "[REDACTED]"); other patterns replace wholesale.
        if (pattern.type === 'generic-secret') {
          const prefix = args[0] as string;
          const quote = args[1] as string;
          return `${prefix}${quote}${REPLACEMENT}${quote}`;
        }
        return REPLACEMENT;
      });
    }

    return { sanitizedCode: sanitized, redactions };
  }
}
