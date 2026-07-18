/**
 * Privacy-guard types — restored 2026-07-18; never committed originally; minimal
 * implementation of the interface consumed by src/lib/code-analysis/analyzer/types.ts
 * (Redaction) and src/lib/code-analysis/analyzer/code-analyzer.ts (via PrivacyGuard).
 *
 * Deliberately does NOT carry the original secret text — a redaction record that
 * stores the secret would defeat the point of redacting it.
 */

export interface Redaction {
  /** Kind of secret detected (e.g. 'aws-access-key', 'github-token') */
  type: string;

  /** 1-based line number where the redaction was applied */
  line: number;

  /** 1-based column where the match started */
  column: number;

  /** The placeholder text substituted for the secret */
  replacement: string;
}

export interface PrivacyGuardResult {
  /** Content with secrets replaced by placeholders */
  sanitizedCode: string;

  /** Redactions that were applied */
  redactions: Redaction[];
}
