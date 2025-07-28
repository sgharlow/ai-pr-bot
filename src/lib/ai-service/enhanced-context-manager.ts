import { CodeChange } from './types';
import { AnalysisFinding } from '../code-analysis/analyzer/types';

/**
 * Priority levels for different types of content
 */
export enum ContentPriority {
  CRITICAL_SECURITY = 100,
  HIGH_SECURITY = 90,
  CRITICAL_BUG = 80,
  HIGH_BUG = 70,
  PERFORMANCE = 60,
  MEDIUM_ISSUE = 50,
  LOW_ISSUE = 40,
  STYLE = 30,
  CONTEXT = 20,
  METADATA = 10
}

/**
 * Chunk strategy for splitting large PRs
 */
export enum ChunkStrategy {
  BY_MODULE = 'by-module',
  BY_SEVERITY = 'by-severity',
  BY_FILE_TYPE = 'by-file-type',
  BY_SIZE = 'by-size',
  SMART = 'smart'
}

/**
 * Context window configuration
 */
export interface ContextWindowConfig {
  model: string;
  contextWindowSize: number;
  reservedTokens: number;
  enableSmartChunking: boolean;
  prioritizeSecurityIssues: boolean;
  maxChunks: number;
}

/**
 * Enhanced context manager for intelligent PR analysis
 */
export class EnhancedContextManager {
  private config: ContextWindowConfig;
  private readonly TOKEN_MULTIPLIERS = {
    code: 0.4,
    text: 0.25,
    markdown: 0.3,
    json: 0.35,
    diff: 0.45, // Diffs are more token-dense
    minified: 0.5 // Minified code
  };

  private readonly CONTEXT_WINDOWS: Record<string, number> = {
    'gpt-4-turbo-preview': 128000,
    'gpt-4-1106-preview': 128000,
    'gpt-4-vision-preview': 128000,
    'gpt-4': 8192,
    'gpt-4-32k': 32768,
    'gpt-3.5-turbo': 16385,
    'gpt-3.5-turbo-16k': 16385,
    'claude-3-opus': 200000,
    'claude-3-sonnet': 200000,
    'claude-3-haiku': 200000,
    'default': 8192
  };

  constructor(config: Partial<ContextWindowConfig> = {}) {
    this.config = {
      model: config.model || 'gpt-4-turbo-preview',
      contextWindowSize: config.contextWindowSize || this.getModelContextWindow(config.model || 'gpt-4-turbo-preview'),
      reservedTokens: config.reservedTokens || 4000,
      enableSmartChunking: config.enableSmartChunking !== false,
      prioritizeSecurityIssues: config.prioritizeSecurityIssues !== false,
      maxChunks: config.maxChunks || 10
    };
  }

  /**
   * Get model context window size
   */
  private getModelContextWindow(model: string): number {
    return this.CONTEXT_WINDOWS[model] || this.CONTEXT_WINDOWS.default;
  }

  /**
   * Enhanced token estimation with content analysis
   */
  estimateTokens(content: string, type?: string): number {
    // Auto-detect content type if not provided
    if (!type) {
      type = this.detectContentType(content);
    }

    const multiplier = this.TOKEN_MULTIPLIERS[type as keyof typeof this.TOKEN_MULTIPLIERS] || this.TOKEN_MULTIPLIERS.code;
    
    // Adjust for content density
    const density = this.calculateContentDensity(content);
    const adjustedMultiplier = multiplier * density;
    
    return Math.ceil(content.length * adjustedMultiplier);
  }

  /**
   * Detect content type from content
   */
  private detectContentType(content: string): string {
    // Check for minified code
    if (content.length > 500 && content.split('\n').length < 5) {
      return 'minified';
    }
    
    // Check for diff format
    if (content.includes('@@') && (content.includes('+++') || content.includes('---'))) {
      return 'diff';
    }
    
    // Check for JSON
    if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
      return 'json';
    }
    
    return 'code';
  }

  /**
   * Calculate content density (complexity)
   */
  private calculateContentDensity(content: string): number {
    const lines = content.split('\n');
    const nonEmptyLines = lines.filter(line => line.trim().length > 0);
    
    if (lines.length === 0) return 1;
    
    // Calculate average line length
    const avgLineLength = content.length / lines.length;
    
    // Higher density for longer lines and fewer newlines
    let density = 1;
    if (avgLineLength > 80) density *= 1.1;
    if (avgLineLength > 120) density *= 1.1;
    if (nonEmptyLines.length / lines.length > 0.9) density *= 1.1;
    
    return Math.min(density, 1.3); // Cap at 30% increase
  }

  /**
   * Intelligently prioritize and chunk changes
   */
  analyzeAndChunk(
    changes: CodeChange[],
    findings: AnalysisFinding[],
    options: {
      strategy?: ChunkStrategy;
      systemPromptTokens?: number;
      forceIncludeFiles?: string[];
    } = {}
  ): {
    chunks: Array<{
      id: string;
      priority: number;
      changes: CodeChange[];
      findings: AnalysisFinding[];
      tokenEstimate: number;
      description: string;
    }>;
    summary: {
      totalChanges: number;
      totalFindings: number;
      criticalFindings: number;
      estimatedTotalTokens: number;
      recommendedStrategy: ChunkStrategy;
    };
  } {
    const strategy = options.strategy || this.recommendChunkStrategy(changes, findings);
    const systemPromptTokens = options.systemPromptTokens || 500;
    
    // Calculate priorities for all content
    const prioritizedContent = this.prioritizeContent(changes, findings, options.forceIncludeFiles);
    
    // Create chunks based on strategy
    const chunks = this.createChunks(prioritizedContent, strategy, systemPromptTokens);
    
    // Calculate summary
    const summary = {
      totalChanges: changes.length,
      totalFindings: findings.length,
      criticalFindings: findings.filter(f => f.severity === 'critical').length,
      estimatedTotalTokens: this.calculateTotalTokens(changes, findings),
      recommendedStrategy: strategy
    };
    
    return { chunks, summary };
  }

  /**
   * Recommend the best chunking strategy
   */
  private recommendChunkStrategy(changes: CodeChange[], findings: AnalysisFinding[]): ChunkStrategy {
    const criticalFindings = findings.filter(f => f.severity === 'critical').length;
    const highFindings = findings.filter(f => f.severity === 'high').length;
    
    // If many critical issues, prioritize by severity
    if (criticalFindings > 5 || (criticalFindings + highFindings) > 10) {
      return ChunkStrategy.BY_SEVERITY;
    }
    
    // If changes span many modules, group by module
    const modules = new Set(changes.map(c => c.file.split('/')[0]));
    if (modules.size > 5) {
      return ChunkStrategy.BY_MODULE;
    }
    
    // For large PRs, use smart chunking
    if (changes.length > 20) {
      return ChunkStrategy.SMART;
    }
    
    // Default to size-based chunking
    return ChunkStrategy.BY_SIZE;
  }

  /**
   * Prioritize content based on severity and importance
   */
  private prioritizeContent(
    changes: CodeChange[],
    findings: AnalysisFinding[],
    forceIncludeFiles?: string[]
  ): Array<{
    change: CodeChange;
    priority: number;
    relatedFindings: AnalysisFinding[];
    mustInclude: boolean;
  }> {
    // Create finding map by file
    const findingsByFile = new Map<string, AnalysisFinding[]>();
    findings.forEach(finding => {
      const list = findingsByFile.get(finding.file) || [];
      list.push(finding);
      findingsByFile.set(finding.file, list);
    });
    
    return changes.map(change => {
      const relatedFindings = findingsByFile.get(change.file) || [];
      const mustInclude = forceIncludeFiles?.includes(change.file) || false;
      
      // Calculate priority
      let priority = this.calculateChangePriority(change, relatedFindings);
      
      // Boost priority for must-include files
      if (mustInclude) {
        priority = Math.max(priority, ContentPriority.CRITICAL_SECURITY);
      }
      
      return {
        change,
        priority,
        relatedFindings,
        mustInclude
      };
    }).sort((a, b) => b.priority - a.priority);
  }

  /**
   * Calculate priority for a change
   */
  private calculateChangePriority(change: CodeChange, findings: AnalysisFinding[]): number {
    let priority = ContentPriority.CONTEXT;
    
    // Check findings
    findings.forEach(finding => {
      const findingPriority = this.getFindingPriority(finding);
      priority = Math.max(priority, findingPriority);
    });
    
    // Adjust based on change type
    if (change.changeType === 'added' && this.isSecuritySensitiveFile(change.file)) {
      priority = Math.max(priority, ContentPriority.HIGH_SECURITY);
    }
    
    // Adjust based on file type
    if (this.isCriticalFile(change.file)) {
      priority = Math.max(priority, ContentPriority.HIGH_BUG);
    }
    
    return priority;
  }

  /**
   * Get priority for a finding
   */
  private getFindingPriority(finding: AnalysisFinding): number {
    const severityMap = {
      critical: finding.type === 'security' ? ContentPriority.CRITICAL_SECURITY : ContentPriority.CRITICAL_BUG,
      high: finding.type === 'security' ? ContentPriority.HIGH_SECURITY : ContentPriority.HIGH_BUG,
      medium: ContentPriority.MEDIUM_ISSUE,
      low: ContentPriority.LOW_ISSUE
    };
    
    return severityMap[finding.severity] || ContentPriority.LOW_ISSUE;
  }

  /**
   * Check if file is security sensitive
   */
  private isSecuritySensitiveFile(file: string): boolean {
    const sensitivePatterns = [
      /auth/i,
      /security/i,
      /token/i,
      /password/i,
      /secret/i,
      /key/i,
      /credential/i,
      /session/i,
      /jwt/i,
      /oauth/i
    ];
    
    return sensitivePatterns.some(pattern => pattern.test(file));
  }

  /**
   * Check if file is critical
   */
  private isCriticalFile(file: string): boolean {
    const criticalPatterns = [
      /config/i,
      /database/i,
      /api/i,
      /route/i,
      /middleware/i,
      /handler/i
    ];
    
    return criticalPatterns.some(pattern => pattern.test(file));
  }

  /**
   * Create chunks based on strategy
   */
  private createChunks(
    prioritizedContent: Array<{
      change: CodeChange;
      priority: number;
      relatedFindings: AnalysisFinding[];
      mustInclude: boolean;
    }>,
    strategy: ChunkStrategy,
    systemPromptTokens: number
  ): Array<{
    id: string;
    priority: number;
    changes: CodeChange[];
    findings: AnalysisFinding[];
    tokenEstimate: number;
    description: string;
  }> {
    const availableTokens = this.config.contextWindowSize - this.config.reservedTokens - systemPromptTokens;
    
    switch (strategy) {
      case ChunkStrategy.BY_SEVERITY:
        return this.chunkBySeverity(prioritizedContent, availableTokens);
      
      case ChunkStrategy.BY_MODULE:
        return this.chunkByModule(prioritizedContent, availableTokens);
      
      case ChunkStrategy.BY_FILE_TYPE:
        return this.chunkByFileType(prioritizedContent, availableTokens);
      
      case ChunkStrategy.SMART:
        return this.smartChunk(prioritizedContent, availableTokens);
      
      case ChunkStrategy.BY_SIZE:
      default:
        return this.chunkBySize(prioritizedContent, availableTokens);
    }
  }

  /**
   * Chunk by severity levels
   */
  private chunkBySeverity(
    content: Array<{
      change: CodeChange;
      priority: number;
      relatedFindings: AnalysisFinding[];
      mustInclude: boolean;
    }>,
    availableTokens: number
  ): Array<{
    id: string;
    priority: number;
    changes: CodeChange[];
    findings: AnalysisFinding[];
    tokenEstimate: number;
    description: string;
  }> {
    const chunks: Array<{
      id: string;
      priority: number;
      changes: CodeChange[];
      findings: AnalysisFinding[];
      tokenEstimate: number;
      description: string;
    }> = [];
    
    // Group by priority ranges
    const priorityGroups = [
      { min: ContentPriority.CRITICAL_SECURITY - 10, max: ContentPriority.CRITICAL_SECURITY + 10, name: 'Critical Security' },
      { min: ContentPriority.HIGH_SECURITY - 10, max: ContentPriority.HIGH_SECURITY + 10, name: 'High Security' },
      { min: ContentPriority.CRITICAL_BUG - 10, max: ContentPriority.CRITICAL_BUG + 10, name: 'Critical Bugs' },
      { min: ContentPriority.HIGH_BUG - 10, max: ContentPriority.HIGH_BUG + 10, name: 'High Priority' },
      { min: 0, max: ContentPriority.MEDIUM_ISSUE + 10, name: 'Other Issues' }
    ];
    
    for (const group of priorityGroups) {
      const groupContent = content.filter(c => 
        c.priority >= group.min && c.priority <= group.max
      );
      
      if (groupContent.length === 0) continue;
      
      const chunk = this.createSingleChunk(
        groupContent,
        availableTokens,
        `severity-${group.name.toLowerCase().replace(/\s+/g, '-')}`,
        group.name
      );
      
      if (chunk.changes.length > 0) {
        chunks.push(chunk);
      }
    }
    
    return chunks;
  }

  /**
   * Chunk by module/directory
   */
  private chunkByModule(
    content: Array<{
      change: CodeChange;
      priority: number;
      relatedFindings: AnalysisFinding[];
      mustInclude: boolean;
    }>,
    availableTokens: number
  ): Array<{
    id: string;
    priority: number;
    changes: CodeChange[];
    findings: AnalysisFinding[];
    tokenEstimate: number;
    description: string;
  }> {
    const chunks: Array<{
      id: string;
      priority: number;
      changes: CodeChange[];
      findings: AnalysisFinding[];
      tokenEstimate: number;
      description: string;
    }> = [];
    
    // Group by module
    const moduleGroups = new Map<string, typeof content>();
    content.forEach(item => {
      const module = item.change.file.split('/')[0] || 'root';
      const group = moduleGroups.get(module) || [];
      group.push(item);
      moduleGroups.set(module, group);
    });
    
    // Sort modules by highest priority content
    const sortedModules = Array.from(moduleGroups.entries())
      .sort((a, b) => {
        const aMaxPriority = Math.max(...a[1].map(c => c.priority));
        const bMaxPriority = Math.max(...b[1].map(c => c.priority));
        return bMaxPriority - aMaxPriority;
      });
    
    for (const [module, moduleContent] of sortedModules) {
      const chunk = this.createSingleChunk(
        moduleContent,
        availableTokens,
        `module-${module}`,
        `Module: ${module}`
      );
      
      if (chunk.changes.length > 0) {
        chunks.push(chunk);
      }
    }
    
    return chunks;
  }

  /**
   * Chunk by file type
   */
  private chunkByFileType(
    content: Array<{
      change: CodeChange;
      priority: number;
      relatedFindings: AnalysisFinding[];
      mustInclude: boolean;
    }>,
    availableTokens: number
  ): Array<{
    id: string;
    priority: number;
    changes: CodeChange[];
    findings: AnalysisFinding[];
    tokenEstimate: number;
    description: string;
  }> {
    const chunks: Array<{
      id: string;
      priority: number;
      changes: CodeChange[];
      findings: AnalysisFinding[];
      tokenEstimate: number;
      description: string;
    }> = [];
    
    // Group by file extension
    const typeGroups = new Map<string, typeof content>();
    content.forEach(item => {
      const ext = item.change.file.split('.').pop() || 'unknown';
      const group = typeGroups.get(ext) || [];
      group.push(item);
      typeGroups.set(ext, group);
    });
    
    for (const [type, typeContent] of typeGroups) {
      const chunk = this.createSingleChunk(
        typeContent,
        availableTokens,
        `type-${type}`,
        `File Type: ${type}`
      );
      
      if (chunk.changes.length > 0) {
        chunks.push(chunk);
      }
    }
    
    return chunks;
  }

  /**
   * Smart chunking that combines strategies
   */
  private smartChunk(
    content: Array<{
      change: CodeChange;
      priority: number;
      relatedFindings: AnalysisFinding[];
      mustInclude: boolean;
    }>,
    availableTokens: number
  ): Array<{
    id: string;
    priority: number;
    changes: CodeChange[];
    findings: AnalysisFinding[];
    tokenEstimate: number;
    description: string;
  }> {
    const chunks: Array<{
      id: string;
      priority: number;
      changes: CodeChange[];
      findings: AnalysisFinding[];
      tokenEstimate: number;
      description: string;
    }> = [];
    
    // First, create a chunk for must-include and critical items
    const criticalContent = content.filter(c => 
      c.mustInclude || c.priority >= ContentPriority.CRITICAL_BUG
    );
    
    if (criticalContent.length > 0) {
      const criticalChunk = this.createSingleChunk(
        criticalContent,
        availableTokens,
        'critical',
        'Critical Issues'
      );
      
      if (criticalChunk.changes.length > 0) {
        chunks.push(criticalChunk);
      }
    }
    
    // Then, chunk the rest by module
    const remainingContent = content.filter(c => 
      !c.mustInclude && c.priority < ContentPriority.CRITICAL_BUG
    );
    
    const moduleChunks = this.chunkByModule(remainingContent, availableTokens);
    chunks.push(...moduleChunks);
    
    return chunks;
  }

  /**
   * Simple size-based chunking
   */
  private chunkBySize(
    content: Array<{
      change: CodeChange;
      priority: number;
      relatedFindings: AnalysisFinding[];
      mustInclude: boolean;
    }>,
    availableTokens: number
  ): Array<{
    id: string;
    priority: number;
    changes: CodeChange[];
    findings: AnalysisFinding[];
    tokenEstimate: number;
    description: string;
  }> {
    const chunks: Array<{
      id: string;
      priority: number;
      changes: CodeChange[];
      findings: AnalysisFinding[];
      tokenEstimate: number;
      description: string;
    }> = [];
    
    let currentChunk: typeof chunks[0] = {
      id: `chunk-1`,
      priority: 0,
      changes: [],
      findings: [],
      tokenEstimate: 0,
      description: 'Chunk 1'
    };
    
    let chunkCount = 1;
    
    for (const item of content) {
      const changeTokens = this.estimateChangeTokens(item.change);
      const findingTokens = this.estimateFindingTokens(item.relatedFindings);
      const totalTokens = changeTokens + findingTokens;
      
      if (currentChunk.tokenEstimate + totalTokens > availableTokens && currentChunk.changes.length > 0) {
        // Start new chunk
        chunks.push(currentChunk);
        chunkCount++;
        
        currentChunk = {
          id: `chunk-${chunkCount}`,
          priority: 0,
          changes: [],
          findings: [],
          tokenEstimate: 0,
          description: `Chunk ${chunkCount}`
        };
      }
      
      currentChunk.changes.push(item.change);
      currentChunk.findings.push(...item.relatedFindings);
      currentChunk.tokenEstimate += totalTokens;
      currentChunk.priority = Math.max(currentChunk.priority, item.priority);
    }
    
    if (currentChunk.changes.length > 0) {
      chunks.push(currentChunk);
    }
    
    return chunks;
  }

  /**
   * Create a single chunk from content
   */
  private createSingleChunk(
    content: Array<{
      change: CodeChange;
      priority: number;
      relatedFindings: AnalysisFinding[];
      mustInclude: boolean;
    }>,
    availableTokens: number,
    id: string,
    description: string
  ): {
    id: string;
    priority: number;
    changes: CodeChange[];
    findings: AnalysisFinding[];
    tokenEstimate: number;
    description: string;
  } {
    const chunk = {
      id,
      priority: 0,
      changes: [] as CodeChange[],
      findings: [] as AnalysisFinding[],
      tokenEstimate: 0,
      description
    };
    
    // Add must-include items first
    const mustInclude = content.filter(c => c.mustInclude);
    const others = content.filter(c => !c.mustInclude);
    
    for (const item of [...mustInclude, ...others]) {
      const changeTokens = this.estimateChangeTokens(item.change);
      const findingTokens = this.estimateFindingTokens(item.relatedFindings);
      const totalTokens = changeTokens + findingTokens;
      
      if (chunk.tokenEstimate + totalTokens <= availableTokens || item.mustInclude) {
        chunk.changes.push(item.change);
        chunk.findings.push(...item.relatedFindings);
        chunk.tokenEstimate += totalTokens;
        chunk.priority = Math.max(chunk.priority, item.priority);
      }
    }
    
    return chunk;
  }

  /**
   * Estimate tokens for a change
   */
  private estimateChangeTokens(change: CodeChange): number {
    let tokens = 50; // Base overhead
    
    change.hunks.forEach(hunk => {
      tokens += this.estimateTokens(hunk.content);
      if (hunk.context?.before) {
        tokens += this.estimateTokens(hunk.context.before);
      }
      if (hunk.context?.after) {
        tokens += this.estimateTokens(hunk.context.after);
      }
    });
    
    return tokens;
  }

  /**
   * Estimate tokens for findings
   */
  private estimateFindingTokens(findings: AnalysisFinding[]): number {
    return findings.length * 60; // Slightly more than base estimate
  }

  /**
   * Calculate total tokens for all content
   */
  private calculateTotalTokens(changes: CodeChange[], findings: AnalysisFinding[]): number {
    const changeTokens = changes.reduce((sum, change) => 
      sum + this.estimateChangeTokens(change), 0
    );
    const findingTokens = this.estimateFindingTokens(findings);
    
    return changeTokens + findingTokens;
  }

  /**
   * Get context usage statistics
   */
  getContextUsageStats(): {
    model: string;
    contextWindow: number;
    reservedTokens: number;
    availableTokens: number;
    utilizationPercentage: number;
  } {
    const availableTokens = this.config.contextWindowSize - this.config.reservedTokens;
    
    return {
      model: this.config.model,
      contextWindow: this.config.contextWindowSize,
      reservedTokens: this.config.reservedTokens,
      availableTokens,
      utilizationPercentage: (availableTokens / this.config.contextWindowSize) * 100
    };
  }
}