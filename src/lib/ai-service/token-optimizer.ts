/**
 * TokenOptimizer — restored 2026-07-18; never committed originally; minimal
 * implementation of the interface consumed by src/lib/ai-service/enhanced-ai-service.ts:
 * OptimizationStrategy enum (REMOVE_WHITESPACE, SEMANTIC_SLICING) and
 * optimize(changes, findings, options) returning optimized changes/findings + metrics.
 *
 * Only reachable when AIServiceConfig.enableTokenOptimization is set (no current
 * call site sets it), so this stays deliberately conservative:
 * - REMOVE_WHITESPACE: strips trailing whitespace and collapses blank-line runs in
 *   hunk content (lossless for review purposes).
 * - SEMANTIC_SLICING: drops findings below minSeverity, and when maxTokens is given,
 *   drops whole lowest-priority changes (files without findings first) until the
 *   estimate fits. Never rewrites code content.
 * Token estimate is the standard chars/4 heuristic — an estimate, not a tokenizer.
 */

import { CodeChange } from './types';
import { AnalysisFinding } from '../code-analysis/analyzer/types';

export enum OptimizationStrategy {
  REMOVE_WHITESPACE = 'remove-whitespace',
  SEMANTIC_SLICING = 'semantic-slicing'
}

export interface OptimizationOptions {
  strategies: OptimizationStrategy[];
  maxTokens?: number;
  minSeverity?: 'critical' | 'high' | 'medium' | 'low';
}

export interface OptimizationResult {
  changes: CodeChange[];
  findings: AnalysisFinding[];
  metrics: {
    originalTokens: number;
    optimizedTokens: number;
    reductionPercentage: number;
  };
}

const SEVERITY_RANK: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 };

export class TokenOptimizer {
  optimize(
    changes: CodeChange[],
    findings: AnalysisFinding[],
    options: OptimizationOptions
  ): OptimizationResult {
    const originalTokens = this.estimateTokens(changes);

    let optimizedChanges = changes;
    let optimizedFindings = findings;

    if (options.strategies.includes(OptimizationStrategy.REMOVE_WHITESPACE)) {
      optimizedChanges = optimizedChanges.map(change => ({
        ...change,
        hunks: change.hunks.map(hunk => ({
          ...hunk,
          content: this.compactWhitespace(hunk.content)
        }))
      }));
    }

    if (options.strategies.includes(OptimizationStrategy.SEMANTIC_SLICING)) {
      if (options.minSeverity) {
        const minRank = SEVERITY_RANK[options.minSeverity] ?? 0;
        optimizedFindings = optimizedFindings.filter(
          f => (SEVERITY_RANK[f.severity] ?? 0) >= minRank
        );
      }

      if (options.maxTokens !== undefined) {
        optimizedChanges = this.sliceToBudget(optimizedChanges, optimizedFindings, options.maxTokens);
      }
    }

    const optimizedTokens = this.estimateTokens(optimizedChanges);
    const reductionPercentage = originalTokens > 0
      ? Math.round(((originalTokens - optimizedTokens) / originalTokens) * 100)
      : 0;

    return {
      changes: optimizedChanges,
      findings: optimizedFindings,
      metrics: { originalTokens, optimizedTokens, reductionPercentage }
    };
  }

  /** chars/4 heuristic over hunk content (see header). */
  private estimateTokens(changes: CodeChange[]): number {
    const chars = changes.reduce(
      (sum, change) => sum + change.hunks.reduce((s, h) => s + h.content.length, 0),
      0
    );
    return Math.ceil(chars / 4);
  }

  private compactWhitespace(content: string): string {
    return content
      .split('\n')
      .map(line => line.replace(/[ \t]+$/, ''))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n');
  }

  /**
   * Drop whole changes, lowest priority first (files with no findings, then files
   * whose worst finding is least severe), until the token estimate fits the budget.
   * Files are never partially rewritten.
   */
  private sliceToBudget(
    changes: CodeChange[],
    findings: AnalysisFinding[],
    maxTokens: number
  ): CodeChange[] {
    if (this.estimateTokens(changes) <= maxTokens) {
      return changes;
    }

    const priorityOf = (change: CodeChange): number => {
      const fileFindings = findings.filter(f => f.file === change.file);
      if (fileFindings.length === 0) {
        return -1;
      }
      return Math.max(...fileFindings.map(f => SEVERITY_RANK[f.severity] ?? 0));
    };

    // Highest priority first; keep as many of the most important files as fit.
    const ordered = [...changes].sort((a, b) => priorityOf(b) - priorityOf(a));
    const kept: CodeChange[] = [];
    let budget = maxTokens;

    for (const change of ordered) {
      const cost = this.estimateTokens([change]);
      if (cost <= budget) {
        kept.push(change);
        budget -= cost;
      }
    }

    // Preserve the original ordering of the kept changes.
    const keptSet = new Set(kept);
    return changes.filter(c => keptSet.has(c));
  }
}
