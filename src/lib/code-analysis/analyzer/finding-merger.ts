/**
 * FindingMerger — restored 2026-07-18; never committed originally; minimal
 * implementation of the interface consumed by
 * src/lib/code-analysis/analyzer/code-analyzer.ts: fromPrivacyGuard(),
 * fromTreeSitter(), fromSemgrep(), merge().
 *
 * Design notes:
 * - fromTreeSitter returns no findings: a structural parse (functions/classes)
 *   is metrics input, not evidence of a defect — fabricating findings from it
 *   would be fake analysis. The analyzer already uses the AST for codeMetrics.
 * - merge() dedupes on (rule, file, line), filters by config.minSeverity,
 *   sorts by severity (critical first), and caps at config.maxFindings.
 */

import { AnalysisFinding, CodeAnalysisConfig } from './types';
import { Redaction } from '../../privacy-guard/types';
import { ParseResult } from '../tree-sitter/types';
import { SemgrepFinding } from '../semgrep';

const SEVERITY_RANK: Record<AnalysisFinding['severity'], number> = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0
};

const SEMGREP_SEVERITY_MAP: Record<SemgrepFinding['severity'], AnalysisFinding['severity']> = {
  ERROR: 'high',
  WARNING: 'medium',
  INFO: 'low'
};

export class FindingMerger {
  static fromPrivacyGuard(redactions: Redaction[], filePath: string): AnalysisFinding[] {
    return redactions.map((redaction, index) => ({
      id: `privacy-${filePath}-${redaction.line}-${index}`,
      source: 'privacy-guard' as const,
      type: 'privacy' as const,
      severity: 'high' as const,
      rule: `privacy-guard/${redaction.type}`,
      message: `Potential secret (${redaction.type}) detected and redacted`,
      file: filePath,
      location: { line: redaction.line, column: redaction.column },
      suggestion: 'Move the secret to environment variables or a secret manager and rotate it.',
      autoFixable: false,
      confidence: 0.8
    }));
  }

  static fromTreeSitter(_ast: ParseResult | undefined, _filePath: string): AnalysisFinding[] {
    // Structural parse results feed metrics, not findings (see header).
    return [];
  }

  static fromSemgrep(findings: SemgrepFinding[]): AnalysisFinding[] {
    return findings.map((finding, index) => ({
      id: `semgrep-${finding.file}-${finding.line}-${index}`,
      source: 'semgrep' as const,
      type: 'security' as const,
      severity: SEMGREP_SEVERITY_MAP[finding.severity] ?? 'low',
      rule: finding.ruleId,
      message: finding.message,
      file: finding.file,
      location: {
        line: finding.line,
        column: finding.column,
        ...(finding.endLine !== undefined ? { endLine: finding.endLine } : {}),
        ...(finding.endColumn !== undefined ? { endColumn: finding.endColumn } : {})
      },
      ...(finding.codeSnippet !== undefined ? { codeSnippet: finding.codeSnippet } : {}),
      autoFixable: false,
      confidence: 0.9
    }));
  }

  static merge(findingGroups: AnalysisFinding[][], config: CodeAnalysisConfig): AnalysisFinding[] {
    const all = findingGroups.flat();

    // Dedupe on (rule, file, line) — first occurrence wins.
    const seen = new Set<string>();
    let merged = all.filter(finding => {
      const key = `${finding.rule}|${finding.file}|${finding.location.line}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    if (config.minSeverity) {
      const minRank = SEVERITY_RANK[config.minSeverity];
      merged = merged.filter(finding => SEVERITY_RANK[finding.severity] >= minRank);
    }

    merged.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);

    if (config.maxFindings !== undefined && merged.length > config.maxFindings) {
      merged = merged.slice(0, config.maxFindings);
    }

    return merged;
  }
}
