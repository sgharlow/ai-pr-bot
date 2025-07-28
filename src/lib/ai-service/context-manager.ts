import { CodeChange } from './types';
import { AnalysisFinding } from '../code-analysis/analyzer/types';

/**
 * Context window sizes for different models
 */
const CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-4-turbo-preview': 128000,
  'gpt-4-1106-preview': 128000,
  'gpt-4-vision-preview': 128000,
  'gpt-4': 8192,
  'gpt-4-32k': 32768,
  'gpt-3.5-turbo': 16385,
  'gpt-3.5-turbo-16k': 16385,
  'default': 8192
};

/**
 * Token estimation multipliers
 */
const TOKEN_MULTIPLIERS = {
  // Average tokens per character for different content types
  code: 0.4,      // Code is more token-dense
  text: 0.25,     // Regular text
  markdown: 0.3,  // Markdown with formatting
  json: 0.35      // JSON data
};

/**
 * Context manager for handling large code reviews
 */
export class ContextManager {
  private contextWindowSize: number;
  private reservedTokens: number;

  constructor(
    model: string = 'gpt-4-turbo-preview',
    reservedTokens: number = 4000 // Reserve for response
  ) {
    this.contextWindowSize = this.getContextWindowSize(model);
    this.reservedTokens = reservedTokens;
  }

  /**
   * Get context window size for a model
   */
  private getContextWindowSize(model: string): number {
    // Try exact match
    const exactMatch = CONTEXT_WINDOWS[model];
    if (exactMatch !== undefined) {
      return exactMatch;
    }

    // Try prefix match
    for (const [key, size] of Object.entries(CONTEXT_WINDOWS)) {
      const prefix = key.split('-preview')[0];
      if (prefix && model.startsWith(prefix)) {
        return size;
      }
    }

    return CONTEXT_WINDOWS['default'] || 8192;
  }

  /**
   * Estimate token count for content
   */
  estimateTokens(content: string, type: 'code' | 'text' | 'markdown' | 'json' = 'code'): number {
    const multiplier = TOKEN_MULTIPLIERS[type] || TOKEN_MULTIPLIERS.code;
    return Math.ceil(content.length * multiplier);
  }

  /**
   * Get available tokens for prompt
   */
  getAvailableTokens(): number {
    return this.contextWindowSize - this.reservedTokens;
  }

  /**
   * Prioritize and slice changes to fit context window
   */
  prioritizeChanges(
    changes: CodeChange[],
    findings: AnalysisFinding[],
    systemPromptTokens: number = 500
  ): {
    includedChanges: CodeChange[];
    excludedChanges: CodeChange[];
    tokenUsage: {
      systemPrompt: number;
      changes: number;
      findings: number;
      total: number;
      available: number;
    };
  } {
    const availableTokens = this.getAvailableTokens() - systemPromptTokens;
    let currentTokens = 0;
    
    // Calculate token cost for findings (include high severity ones)
    const criticalFindings = findings.filter(f => 
      f.severity === 'critical' || f.severity === 'high'
    );
    const findingsTokens = this.estimateFindingsTokens(criticalFindings);
    currentTokens += findingsTokens;

    // Prioritize changes
    const prioritizedChanges = this.prioritizeChangesByImportance(changes, findings);
    
    const includedChanges: CodeChange[] = [];
    const excludedChanges: CodeChange[] = [];

    for (const change of prioritizedChanges) {
      const changeTokens = this.estimateChangeTokens(change);
      
      if (currentTokens + changeTokens <= availableTokens) {
        includedChanges.push(change);
        currentTokens += changeTokens;
      } else {
        // Try to include a truncated version
        const truncatedChange = this.truncateChange(
          change, 
          availableTokens - currentTokens
        );
        
        if (truncatedChange) {
          includedChanges.push(truncatedChange);
          currentTokens += this.estimateChangeTokens(truncatedChange);
        } else {
          excludedChanges.push(change);
        }
      }
    }

    return {
      includedChanges,
      excludedChanges,
      tokenUsage: {
        systemPrompt: systemPromptTokens,
        changes: currentTokens - findingsTokens,
        findings: findingsTokens,
        total: systemPromptTokens + currentTokens,
        available: this.getAvailableTokens()
      }
    };
  }

  /**
   * Prioritize changes by importance
   */
  private prioritizeChangesByImportance(
    changes: CodeChange[],
    findings: AnalysisFinding[]
  ): CodeChange[] {
    // Create a map of files to their finding severities
    const fileSeverityMap = new Map<string, number>();
    
    findings.forEach(finding => {
      const current = fileSeverityMap.get(finding.file) || 0;
      const severity = this.getSeverityScore(finding.severity);
      fileSeverityMap.set(finding.file, Math.max(current, severity));
    });

    // Sort changes by:
    // 1. Files with critical/high findings
    // 2. Modified files (over added/deleted)
    // 3. Smaller files (more likely to fit entirely)
    return [...changes].sort((a, b) => {
      const aSeverity = fileSeverityMap.get(a.file) || 0;
      const bSeverity = fileSeverityMap.get(b.file) || 0;
      
      if (aSeverity !== bSeverity) {
        return bSeverity - aSeverity; // Higher severity first
      }
      
      // Prioritize modified files
      const typeOrder = { modified: 0, added: 1, deleted: 2 };
      const aType = typeOrder[a.changeType];
      const bType = typeOrder[b.changeType];
      
      if (aType !== bType) {
        return aType - bType;
      }
      
      // Smaller files first
      const aSize = a.hunks.reduce((sum, h) => sum + h.content.length, 0);
      const bSize = b.hunks.reduce((sum, h) => sum + h.content.length, 0);
      
      return aSize - bSize;
    });
  }

  /**
   * Get severity score
   */
  private getSeverityScore(severity: string): number {
    const scores: Record<string, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1
    };
    return scores[severity] || 0;
  }

  /**
   * Estimate tokens for a change
   */
  private estimateChangeTokens(change: CodeChange): number {
    let tokens = 50; // Base overhead for file metadata
    
    // Add tokens for each hunk
    change.hunks.forEach(hunk => {
      tokens += this.estimateTokens(hunk.content, 'code');
      if (hunk.context?.before) {
        tokens += this.estimateTokens(hunk.context.before, 'code');
      }
      if (hunk.context?.after) {
        tokens += this.estimateTokens(hunk.context.after, 'code');
      }
    });
    
    return tokens;
  }

  /**
   * Estimate tokens for findings
   */
  private estimateFindingsTokens(findings: AnalysisFinding[]): number {
    // Approximately 50 tokens per finding
    return findings.length * 50;
  }

  /**
   * Truncate a change to fit within token limit
   */
  private truncateChange(change: CodeChange, maxTokens: number): CodeChange | null {
    if (maxTokens < 100) return null; // Not enough space
    
    const truncated: CodeChange = {
      ...change,
      hunks: []
    };
    
    let currentTokens = 50; // Base overhead
    
    // Include as many hunks as possible
    for (const hunk of change.hunks) {
      const hunkTokens = this.estimateTokens(hunk.content, 'code');
      
      if (currentTokens + hunkTokens <= maxTokens) {
        truncated.hunks.push(hunk);
        currentTokens += hunkTokens;
      } else if (currentTokens + 100 <= maxTokens) {
        // Try to include a truncated version of the hunk
        const lines = hunk.content.split('\n');
        const truncatedLines = lines.slice(0, Math.floor(lines.length / 2));
        
        truncated.hunks.push({
          ...hunk,
          content: truncatedLines.join('\n') + '\n... (truncated)'
        });
        break;
      }
    }
    
    return truncated.hunks.length > 0 ? truncated : null;
  }

  /**
   * Split changes into multiple batches for review
   */
  createBatches(
    changes: CodeChange[],
    findings: AnalysisFinding[],
    maxBatches: number = 5
  ): {
    batches: Array<{
      changes: CodeChange[];
      findings: AnalysisFinding[];
      tokenEstimate: number;
    }>;
    strategy: string;
  } {
    const batches: Array<{
      changes: CodeChange[];
      findings: AnalysisFinding[];
      tokenEstimate: number;
    }> = [];
    
    // Group changes by related files/modules
    const fileGroups = this.groupRelatedFiles(changes);
    
    // Create batches from file groups
    let currentBatch = {
      changes: [] as CodeChange[],
      findings: [] as AnalysisFinding[],
      tokenEstimate: 0
    };
    
    const systemPromptTokens = 500;
    const availableTokens = this.getAvailableTokens() - systemPromptTokens;
    
    for (const group of fileGroups) {
      const groupTokens = group.changes.reduce(
        (sum, change) => sum + this.estimateChangeTokens(change),
        0
      );
      
      const groupFindings = findings.filter(f =>
        group.changes.some(c => c.file === f.file)
      );
      const findingsTokens = this.estimateFindingsTokens(groupFindings);
      
      if (currentBatch.tokenEstimate + groupTokens + findingsTokens > availableTokens) {
        // Start new batch
        if (currentBatch.changes.length > 0) {
          batches.push(currentBatch);
        }
        
        currentBatch = {
          changes: group.changes,
          findings: groupFindings,
          tokenEstimate: groupTokens + findingsTokens
        };
      } else {
        // Add to current batch
        currentBatch.changes.push(...group.changes);
        currentBatch.findings.push(...groupFindings);
        currentBatch.tokenEstimate += groupTokens + findingsTokens;
      }
      
      if (batches.length >= maxBatches - 1) {
        break;
      }
    }
    
    // Add final batch
    if (currentBatch.changes.length > 0) {
      batches.push(currentBatch);
    }
    
    return {
      batches,
      strategy: batches.length > 1 ? 'split-by-module' : 'single-batch'
    };
  }

  /**
   * Group related files together
   */
  private groupRelatedFiles(changes: CodeChange[]): Array<{
    changes: CodeChange[];
    commonPath: string;
  }> {
    const groups = new Map<string, CodeChange[]>();
    
    changes.forEach(change => {
      // Extract module/directory
      const parts = change.file.split('/');
      const module = parts.length > 2 ? parts.slice(0, -1).join('/') : 'root';
      
      if (!groups.has(module)) {
        groups.set(module, []);
      }
      groups.get(module)!.push(change);
    });
    
    return Array.from(groups.entries()).map(([commonPath, changes]) => ({
      changes,
      commonPath
    }));
  }
}