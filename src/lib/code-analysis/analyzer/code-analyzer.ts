import * as fs from 'fs/promises';
import * as path from 'path';
import { PrivacyGuard } from '../../privacy-guard';
import { parser as treeSitterParser } from '../tree-sitter';
import { createSemgrep, createMockSemgrep, Semgrep } from '../semgrep';
import { ConfigLoader } from './config-loader';
import { FindingMerger } from './finding-merger';
import {
  CodeAnalyzer as ICodeAnalyzer,
  CodeAnalysisConfig,
  CodeAnalysisOptions,
  CodeAnalysisResult,
  AnalysisFinding,
  AnalysisMetrics,
  AnalysisError
} from './types';

/**
 * Main code analysis orchestration engine
 */
export class CodeAnalyzer implements ICodeAnalyzer {
  private config: CodeAnalysisConfig;
  private privacyGuard?: PrivacyGuard;
  private semgrep?: Semgrep;
  private configSource?: string;
  
  constructor(config?: Partial<CodeAnalysisConfig>) {
    this.config = ConfigLoader.mergeWithDefaults(config || {});
    this.initializeAnalyzers();
  }
  
  /**
   * Analyze code content
   */
  async analyze(
    content: string,
    options: CodeAnalysisOptions = {}
  ): Promise<CodeAnalysisResult> {
    const startTime = Date.now();
    const errors: AnalysisError[] = [];
    const metrics: AnalysisMetrics = {
      totalTime: 0,
      breakdown: {},
      findingCounts: {
        total: 0,
        bySeverity: {},
        byType: {},
        bySource: {}
      }
    };
    
    // Load configuration if file path is provided
    if (options.filePath && !this.configSource) {
      try {
        const { config, configPath } = await ConfigLoader.findAndLoadConfig(options.filePath);
        this.config = config;
        if (configPath) {
          this.configSource = configPath;
        }
        this.initializeAnalyzers();
      } catch (error: any) {
        errors.push({
          source: 'config',
          message: `Failed to load configuration: ${error.message}`,
          type: 'configuration'
        });
      }
    }
    
    // Detect language if not provided
    const language = options.language || 
      (options.filePath ? this.detectLanguage(options.filePath) : undefined);
    
    const allFindings: AnalysisFinding[][] = [];
    let redactedContent = content;
    let redactions;
    let ast;
    
    // Run Privacy Guard
    if (this.config.enablePrivacyGuard && this.privacyGuard) {
      const privacyStart = Date.now();
      try {
        const privacyResult = this.privacyGuard.redactSecrets(content);
        redactedContent = privacyResult.sanitizedCode;
        redactions = privacyResult.redactions;
        
        // Convert redactions to findings
        const privacyFindings = FindingMerger.fromPrivacyGuard(
          redactions,
          options.filePath || 'unknown'
        );
        allFindings.push(privacyFindings);
        
        metrics.breakdown.privacyGuard = Date.now() - privacyStart;
      } catch (error: any) {
        errors.push({
          source: 'privacy-guard',
          message: error.message,
          type: 'runtime',
          stack: error.stack
        });
      }
    }
    
    // Run Tree-sitter AST parsing
    if (this.config.enableTreeSitter && language) {
      const treeStart = Date.now();
      try {
        ast = await treeSitterParser.parse(redactedContent, language as any);
        
        // Generate findings from AST
        const astFindings = FindingMerger.fromTreeSitter(
          ast,
          options.filePath || 'unknown'
        );
        allFindings.push(astFindings);
        
        // Collect code metrics
        if (ast) {
          metrics.codeMetrics = {
            lines: redactedContent.split('\n').length,
            functions: ast.functions.length,
            classes: ast.classes.length
          };
        }
        
        metrics.breakdown.treeSitter = Date.now() - treeStart;
      } catch (error: any) {
        errors.push({
          source: 'tree-sitter',
          message: error.message,
          type: 'runtime',
          stack: error.stack
        });
      }
    }
    
    // Run Semgrep analysis
    if (this.config.enableSemgrep && this.semgrep) {
      const semgrepStart = Date.now();
      try {
        const semgrepFindings = await this.semgrep.analyze(
          redactedContent,
          language,
          this.config.semgrepConfig
        );
        
        const analysisFindings = FindingMerger.fromSemgrep(semgrepFindings);
        allFindings.push(analysisFindings);
        
        metrics.breakdown.semgrep = Date.now() - semgrepStart;
      } catch (error: any) {
        errors.push({
          source: 'semgrep',
          message: error.message,
          type: 'runtime',
          stack: error.stack
        });
      }
    }
    
    // Merge all findings
    const findings = FindingMerger.merge(allFindings, this.config);
    
    // Calculate metrics
    metrics.totalTime = Date.now() - startTime;
    metrics.findingCounts.total = findings.length;
    
    // Count by severity
    findings.forEach(finding => {
      metrics.findingCounts.bySeverity[finding.severity] = 
        (metrics.findingCounts.bySeverity[finding.severity] || 0) + 1;
      metrics.findingCounts.byType[finding.type] = 
        (metrics.findingCounts.byType[finding.type] || 0) + 1;
      metrics.findingCounts.bySource[finding.source] = 
        (metrics.findingCounts.bySource[finding.source] || 0) + 1;
    });
    
    return {
      findings,
      ...(ast !== undefined ? { ast } : {}),
      ...(this.config.enablePrivacyGuard && redactedContent !== undefined ? { redactedContent } : {}),
      ...(redactions !== undefined ? { redactions } : {}),
      ...(this.config.collectMetrics && metrics !== undefined ? { metrics } : {}),
      errors,
      metadata: {
        analyzedAt: new Date(),
        ...(language !== undefined ? { language } : {}),
        ...(options.filePath !== undefined ? { filePath: options.filePath } : {}),
        analyzersUsed: this.getAnalyzersUsed(),
        ...(this.configSource !== undefined ? { configSource: this.configSource } : {})
      }
    };
  }
  
  /**
   * Analyze multiple files
   */
  async analyzeFiles(
    filePaths: string[],
    options: CodeAnalysisOptions = {}
  ): Promise<Map<string, CodeAnalysisResult>> {
    const results = new Map<string, CodeAnalysisResult>();
    
    // Process files in parallel with a limit
    const BATCH_SIZE = 5;
    for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
      const batch = filePaths.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async filePath => {
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const detectedLanguage = options.language || this.detectLanguage(filePath);
            const result = await this.analyze(content, {
              ...options,
              filePath,
              ...(detectedLanguage !== undefined ? { language: detectedLanguage } : {})
            });
            return { filePath, result };
          } catch (error: any) {
            const errorResult: CodeAnalysisResult = {
              findings: [],
              errors: [{
                source: 'file',
                message: `Failed to read file: ${error.message}`,
                type: 'runtime'
              }],
              metadata: {
                analyzedAt: new Date(),
                filePath,
                analyzersUsed: []
              }
            };
            return { filePath, result: errorResult };
          }
        })
      );
      
      batchResults.forEach(({ filePath, result }) => {
        results.set(filePath, result);
      });
    }
    
    return results;
  }
  
  /**
   * Load configuration from file
   */
  async loadConfig(configPath: string): Promise<void> {
    this.config = await ConfigLoader.loadFromFile(configPath);
    this.configSource = configPath;
    this.initializeAnalyzers();
  }
  
  /**
   * Update configuration
   */
  updateConfig(config: Partial<CodeAnalysisConfig>): void {
    this.config = ConfigLoader.mergeWithDefaults({
      ...this.config,
      ...config
    });
    this.initializeAnalyzers();
  }
  
  /**
   * Get current configuration
   */
  getConfig(): CodeAnalysisConfig {
    return { ...this.config };
  }
  
  /**
   * Initialize analyzers based on configuration
   */
  private initializeAnalyzers(): void {
    // Initialize Privacy Guard
    if (this.config.enablePrivacyGuard) {
      this.privacyGuard = new PrivacyGuard();
      
      if (this.config.privacyGuardConfig) {
        // Load privacy guard config
        // Privacy guard doesn't have loadConfigSync, it uses constructor for config
      }
    }
    
    // Initialize Semgrep
    if (this.config.enableSemgrep) {
      // Use mock Semgrep in test environment
      if (process.env['NODE_ENV'] === 'test') {
        this.semgrep = createMockSemgrep();
      } else {
        this.semgrep = createSemgrep();
      }
    }
  }
  
  /**
   * Detect language from file extension
   */
  private detectLanguage(filePath: string): string | undefined {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: Record<string, string> = {
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.go': 'go',
      '.java': 'java',
      '.rb': 'ruby',
      '.rs': 'rust',
      '.php': 'php',
      '.cs': 'csharp'
    };
    
    return languageMap[ext];
  }
  
  /**
   * Get list of analyzers being used
   */
  private getAnalyzersUsed(): string[] {
    const analyzers: string[] = [];
    
    if (this.config.enablePrivacyGuard) analyzers.push('privacy-guard');
    if (this.config.enableTreeSitter) analyzers.push('tree-sitter');
    if (this.config.enableSemgrep) analyzers.push('semgrep');
    
    return analyzers;
  }
}

/**
 * Create a new code analyzer instance
 */
export function createCodeAnalyzer(
  config?: Partial<CodeAnalysisConfig>
): CodeAnalyzer {
  return new CodeAnalyzer(config);
}