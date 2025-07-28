import { v4 as uuidv4 } from 'uuid';
import { 
  FixGenerationRequest,
  GeneratedFix,
  FixGeneratorConfig,
  GeneratedFixSchema
} from './types';
import { AIService } from '../ai-service/ai-service';
import { ReviewComment } from '../ai-service/types';
import { AnalysisFinding } from '../code-analysis/analyzer/types';
import { TokenUsage } from '../ai-service/types';

/**
 * Default configuration
 */
const DEFAULT_CONFIG: FixGeneratorConfig = {
  ai: {
    model: 'gpt-4-turbo-preview',
    temperature: 0.3,
    maxTokens: 2000
  },
  validation: {
    requireSyntaxCheck: true,
    requireSemanticCheck: true,
    minConfidence: 0.7
  },
  preferences: {
    preferMinimalChanges: true,
    avoidBreakingChanges: true,
    preserveFormatting: true,
    respectStyleGuide: true
  },
  safety: {
    maxRetries: 3,
    timeout: 30000,
    maxPatchSize: 1000,
    blockedPatterns: []
  }
};

/**
 * Fix generator that creates AI-powered fixes for code issues
 */
export class FixGenerator {
  private config: FixGeneratorConfig;
  private aiService: AIService;

  constructor(
    aiService: AIService,
    config?: Partial<FixGeneratorConfig>
  ) {
    this.aiService = aiService;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate a fix for an issue
   */
  async generateFix(request: FixGenerationRequest): Promise<GeneratedFix> {
    const startTime = Date.now();
    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < (request.options?.maxAttempts || this.config.safety?.maxRetries || 3)) {
      attempts++;
      
      try {
        // Generate fix using AI
        const fixResult = await this.generateFixWithAI(request);
        
        // Validate confidence
        if (fixResult.confidence.overall < (request.options?.minConfidence || this.config.validation?.minConfidence || 0.7)) {
          throw new Error(
            `Fix confidence too low: ${fixResult.confidence.overall} < ${request.options?.minConfidence || this.config.validation?.minConfidence}`
          );
        }

        // Validate fix if requested
        if (request.options?.validateSyntax !== false) {
          const syntaxValid = await this.validateSyntax(fixResult);
          fixResult.confidence.syntaxValid = syntaxValid;
          
          if (!syntaxValid && this.config.validation?.requireSyntaxCheck) {
            throw new Error('Fix failed syntax validation');
          }
        }

        // Check timeout
        if (Date.now() - startTime > (this.config.safety?.timeout || 30000)) {
          throw new Error('Fix generation timeout');
        }

        return fixResult;
      } catch (error) {
        lastError = error as Error;
        console.warn(`Fix generation attempt ${attempts} failed:`, error);
        
        // Add delay between retries
        if (attempts < (request.options?.maxAttempts || this.config.safety?.maxRetries || 3)) {
          await this.sleep(1000 * attempts);
        }
      }
    }

    throw new Error(
      `Failed to generate fix after ${attempts} attempts: ${lastError?.message || 'Unknown error'}`
    );
  }

  /**
   * Generate fix using AI service
   */
  private async generateFixWithAI(request: FixGenerationRequest): Promise<GeneratedFix> {
    const prompt = this.createFixPrompt(request);
    
    // Call AI service for fix generation
    const response = await this.aiService.generateCodeFix(
      request.code.file,
      this.getIssueDescription(request.issue),
      request.code.content,
      prompt.context
    );

    // Parse the response and create GeneratedFix
    const fix = this.parseAIResponse(
      response,
      request,
      {
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens,
        cost: response.usage.estimatedCost
      }
    );

    // Validate the generated fix structure
    const validation = GeneratedFixSchema.safeParse(fix);
    if (!validation.success) {
      throw new Error(`Invalid fix structure: ${validation.error.message}`);
    }

    return fix;
  }

  /**
   * Create prompt for fix generation
   */
  private createFixPrompt(request: FixGenerationRequest): { main: string; context: string } {
    const issue = request.issue;
    const issueType = this.getIssueType(issue);
    const severity = this.getIssueSeverity(issue);
    
    let contextParts: string[] = [];

    // Add issue context
    contextParts.push(`Issue Type: ${issueType}`);
    contextParts.push(`Severity: ${severity}`);
    contextParts.push(`File: ${request.code.file}`);
    
    if (request.code.language) {
      contextParts.push(`Language: ${request.code.language}`);
    }

    // Add code context
    if (request.code.startLine && request.code.endLine) {
      contextParts.push(`Lines: ${request.code.startLine}-${request.code.endLine}`);
    }

    // Add preferences
    if (this.config.preferences?.preferMinimalChanges) {
      contextParts.push('Preference: Make minimal changes to fix the issue');
    }
    if (this.config.preferences?.avoidBreakingChanges) {
      contextParts.push('Preference: Avoid breaking changes');
    }
    if (this.config.preferences?.preserveFormatting) {
      contextParts.push('Preference: Preserve existing code formatting');
    }

    // Add custom instructions
    if (request.context?.customInstructions) {
      contextParts.push(`Instructions: ${request.context.customInstructions}`);
    }

    // Add framework context
    if (request.context?.frameworkVersion) {
      contextParts.push(`Framework: ${request.context.frameworkVersion}`);
    }

    const mainPrompt = `Generate a fix for the following ${severity} ${issueType} issue:

${this.getIssueDescription(issue)}

The fix should:
1. Completely resolve the identified issue
2. Maintain backward compatibility when possible
3. Follow best practices for ${request.code.language || 'the language'}
4. Include clear explanation of changes

Provide your response in JSON format with the following structure:
{
  "fixedCode": "the complete fixed code",
  "explanation": "detailed explanation of the fix",
  "changes": ["list of specific changes made"],
  "impact": {
    "fixes": ["what issues this fixes"],
    "sideEffects": ["any potential side effects"],
    "breaking": false
  },
  "confidence": 0.95,
  "riskLevel": "low"
}`;

    return {
      main: mainPrompt,
      context: contextParts.join('\n')
    };
  }

  /**
   * Parse AI response into GeneratedFix
   */
  private parseAIResponse(
    response: { fixedCode: string; explanation: string; usage: TokenUsage },
    request: FixGenerationRequest,
    tokenInfo: { promptTokens: number; completionTokens: number; totalTokens: number; cost: number }
  ): GeneratedFix {
    // Parse the AI response
    let aiData: any;
    try {
      // The explanation from AI service might contain JSON
      const jsonMatch = response.explanation.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        aiData = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback to basic structure
        aiData = {
          fixedCode: response.fixedCode,
          explanation: response.explanation,
          changes: ['Applied fix based on AI analysis'],
          impact: {
            fixes: [this.getIssueDescription(request.issue)],
            sideEffects: [],
            breaking: false
          },
          confidence: 0.8,
          riskLevel: 'medium'
        };
      }
    } catch (error) {
      // If parsing fails, use the direct response
      aiData = {
        fixedCode: response.fixedCode,
        explanation: response.explanation,
        changes: ['Applied automated fix'],
        impact: {
          fixes: [this.getIssueDescription(request.issue)],
          sideEffects: [],
          breaking: false
        },
        confidence: 0.75,
        riskLevel: 'medium'
      };
    }

    // Determine fix type
    const fixType = this.determinefixType(
      request.code.content,
      aiData.fixedCode || response.fixedCode
    );

    // Calculate line ranges
    const startLine = request.code.startLine || this.getIssueLine(request.issue) || 1;
    const originalLines = request.code.content.split('\n').length;
    const endLine = request.code.endLine || startLine + originalLines - 1;

    return {
      id: uuidv4(),
      issue: request.issue,
      fix: {
        type: fixType,
        file: request.code.file,
        startLine,
        endLine,
        originalCode: request.code.content,
        fixedCode: aiData.fixedCode || response.fixedCode,
        patch: this.generatePatch(
          request.code.content,
          aiData.fixedCode || response.fixedCode,
          startLine
        )
      },
      explanation: {
        summary: aiData.explanation || response.explanation,
        reasoning: aiData.reasoning || 'AI-generated fix based on issue analysis',
        changes: aiData.changes || ['Code updated to fix the issue'],
        impact: {
          fixes: aiData.impact?.fixes || [this.getIssueDescription(request.issue)],
          sideEffects: aiData.impact?.sideEffects,
          breaking: aiData.impact?.breaking || false
        }
      },
      confidence: {
        overall: aiData.confidence || 0.8,
        syntaxValid: true, // Will be updated by validation
        semanticValid: true, // Will be updated by validation
        testsPassing: undefined,
        riskLevel: aiData.riskLevel || 'medium'
      },
      metadata: {
        generatedAt: new Date(),
        model: this.config.ai?.model || 'gpt-4-turbo-preview',
        tokens: {
          prompt: tokenInfo.promptTokens,
          completion: tokenInfo.completionTokens,
          total: tokenInfo.totalTokens
        },
        cost: tokenInfo.cost,
        attempts: 1
      }
    };
  }

  /**
   * Validate syntax of generated fix
   */
  private async validateSyntax(fix: GeneratedFix): Promise<boolean> {
    // This is a placeholder - in a real implementation, you would:
    // 1. Use a language-specific parser (e.g., @babel/parser for JS/TS)
    // 2. Parse the fixed code
    // 3. Check for syntax errors
    // 4. Update fix.validation.syntaxCheck
    
    try {
      // Basic validation - check if code is not empty
      if (!fix.fix.fixedCode || fix.fix.fixedCode.trim().length === 0) {
        fix.validation = {
          ...fix.validation,
          syntaxCheck: {
            valid: false,
            errors: ['Fixed code is empty']
          }
        };
        return false;
      }

      // Check for common syntax issues
      const syntaxChecks = [
        { pattern: /[{]\s*$/, pair: '}', name: 'braces' },
        { pattern: /[(]\s*$/, pair: ')', name: 'parentheses' },
        { pattern: /[\[]\s*$/, pair: ']', name: 'brackets' }
      ];

      const errors: string[] = [];
      for (const check of syntaxChecks) {
        const openCount = (fix.fix.fixedCode.match(new RegExp(check.pattern.source.slice(0, -3), 'g')) || []).length;
        const closeCount = (fix.fix.fixedCode.match(new RegExp(`\\${check.pair}`, 'g')) || []).length;
        
        if (openCount !== closeCount) {
          errors.push(`Mismatched ${check.name}: ${openCount} opening, ${closeCount} closing`);
        }
      }

      fix.validation = {
        ...fix.validation,
        syntaxCheck: {
          valid: errors.length === 0,
          errors: errors.length > 0 ? errors : undefined
        }
      };

      return errors.length === 0;
    } catch (error) {
      fix.validation = {
        ...fix.validation,
        syntaxCheck: {
          valid: false,
          errors: [`Syntax validation error: ${error}`]
        }
      };
      return false;
    }
  }

  /**
   * Determine the type of fix based on original and fixed code
   */
  private determinefixType(original: string, fixed: string): 'patch' | 'replacement' | 'insertion' | 'deletion' {
    const originalLines = original.split('\n');
    const fixedLines = fixed.split('\n');

    if (fixed.trim().length === 0) {
      return 'deletion';
    }
    
    if (original.trim().length === 0) {
      return 'insertion';
    }

    // Check if it's mostly the same with small changes
    let changedLines = 0;
    for (let i = 0; i < Math.max(originalLines.length, fixedLines.length); i++) {
      if (originalLines[i] !== fixedLines[i]) {
        changedLines++;
      }
    }

    const changeRatio = changedLines / Math.max(originalLines.length, fixedLines.length);
    
    if (changeRatio < 0.3) {
      return 'patch';
    } else {
      return 'replacement';
    }
  }

  /**
   * Generate a unified diff patch
   */
  private generatePatch(original: string, fixed: string, startLine: number): string {
    const originalLines = original.split('\n');
    const fixedLines = fixed.split('\n');
    
    let patch = `@@ -${startLine},${originalLines.length} +${startLine},${fixedLines.length} @@\n`;
    
    // Simple diff - in production, use a proper diff library
    for (let i = 0; i < Math.max(originalLines.length, fixedLines.length); i++) {
      if (i < originalLines.length && i < fixedLines.length) {
        if (originalLines[i] !== fixedLines[i]) {
          patch += `-${originalLines[i]}\n`;
          patch += `+${fixedLines[i]}\n`;
        } else {
          patch += ` ${originalLines[i]}\n`;
        }
      } else if (i < originalLines.length) {
        patch += `-${originalLines[i]}\n`;
      } else {
        patch += `+${fixedLines[i]}\n`;
      }
    }

    return patch;
  }

  /**
   * Get issue description from ReviewComment or AnalysisFinding
   */
  private getIssueDescription(issue: ReviewComment | AnalysisFinding): string {
    return issue.message;
  }

  /**
   * Get issue type
   */
  private getIssueType(issue: ReviewComment | AnalysisFinding): string {
    if ('category' in issue) {
      return issue.category;
    }
    return issue.type;
  }

  /**
   * Get issue severity
   */
  private getIssueSeverity(issue: ReviewComment | AnalysisFinding): string {
    return issue.severity;
  }

  /**
   * Get issue line number
   */
  private getIssueLine(issue: ReviewComment | AnalysisFinding): number | undefined {
    if ('line' in issue) {
      return issue.line;
    }
    if ('location' in issue && issue.location) {
      return issue.location.line;
    }
    return undefined;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<FixGeneratorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): FixGeneratorConfig {
    return { ...this.config };
  }
}