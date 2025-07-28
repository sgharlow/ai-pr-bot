import { CodeReviewRequest, ReviewFocusArea } from './types';
import { AnalysisFinding } from '../code-analysis/analyzer/types';

/**
 * Prompt templates for code review
 */
export class PromptTemplates {
  /**
   * System prompt for code review
   */
  static getSystemPrompt(): string {
    return `You are an expert code reviewer specializing in backend API security, performance, and best practices. Your role is to:

1. Identify security vulnerabilities, performance issues, and code quality problems
2. Provide actionable suggestions with specific code fixes
3. Praise good practices and improvements
4. Consider the context of the changes and their impact
5. Be constructive and educational in your feedback

Key principles:
- Focus on high-impact issues first
- Provide clear explanations with examples
- Consider backwards compatibility
- Suggest modern best practices
- Be concise but thorough

You will receive:
- Code changes in diff format
- Static analysis findings from tools like Semgrep and Tree-sitter
- Pull request metadata and context

You must respond with structured JSON that includes:
- Overall review summary with verdict
- Specific line-by-line comments
- Code suggestions with fixes
- Metrics about issues found`;
  }

  /**
   * Create user prompt for code review
   */
  static createReviewPrompt(request: CodeReviewRequest): string {
    const { pullRequest, changes, findings, options } = request;
    
    let prompt = `Review the following pull request:\n\n`;
    
    // PR metadata
    prompt += `## Pull Request #${pullRequest.number}: ${pullRequest.title}\n`;
    prompt += `Author: ${pullRequest.author}\n`;
    prompt += `Repository: ${pullRequest.repository}\n`;
    
    if (pullRequest.description) {
      prompt += `\nDescription:\n${pullRequest.description}\n`;
    }
    
    // Focus areas
    if (options?.focusAreas && options.focusAreas.length > 0) {
      prompt += `\n## Focus Areas\n`;
      prompt += `Please pay special attention to:\n`;
      options.focusAreas.forEach(area => {
        prompt += `- ${this.getFocusAreaDescription(area)}\n`;
      });
    }
    
    // Static analysis findings
    if (findings.length > 0) {
      prompt += `\n## Static Analysis Findings\n`;
      prompt += `The following issues were detected by automated tools:\n\n`;
      
      const groupedFindings = this.groupFindingsBySeverity(findings);
      
      for (const [severity, severityFindings] of Object.entries(groupedFindings)) {
        if (severityFindings.length > 0) {
          prompt += `### ${severity.toUpperCase()} (${severityFindings.length})\n`;
          severityFindings.slice(0, 10).forEach(finding => {
            prompt += `- **${finding.rule}** in \`${finding.file}:${finding.location.line}\`: ${finding.message}\n`;
          });
          if (severityFindings.length > 10) {
            prompt += `- ... and ${severityFindings.length - 10} more\n`;
          }
          prompt += '\n';
        }
      }
    }
    
    // Code changes
    prompt += `\n## Code Changes\n`;
    changes.forEach(change => {
      prompt += `\n### ${change.file} (${change.changeType})\n`;
      if (change.language) {
        prompt += `Language: ${change.language}\n`;
      }
      
      change.hunks.forEach((hunk, index) => {
        prompt += `\n#### Hunk ${index + 1} (lines ${hunk.newStart}-${hunk.newStart + hunk.newLines})\n`;
        prompt += '```diff\n';
        prompt += hunk.content;
        prompt += '\n```\n';
        
        if (hunk.context) {
          if (hunk.context.before) {
            prompt += `Context before:\n\`\`\`\n${hunk.context.before}\n\`\`\`\n`;
          }
          if (hunk.context.after) {
            prompt += `Context after:\n\`\`\`\n${hunk.context.after}\n\`\`\`\n`;
          }
        }
      });
    });
    
    // Review instructions
    prompt += `\n## Review Instructions\n`;
    prompt += `1. Analyze the code changes for security vulnerabilities, performance issues, and best practice violations\n`;
    prompt += `2. Consider the static analysis findings and validate or expand on them\n`;
    prompt += `3. Provide specific, actionable feedback with code examples\n`;
    prompt += `4. Suggest improvements and fixes\n`;
    
    if (options?.severity) {
      prompt += `5. Focus on ${options.severity === 'critical' ? 'critical issues only' : options.severity === 'high' ? 'high and critical issues' : 'all issues'}\n`;
    }
    
    if (options?.autoFix) {
      prompt += `6. Provide auto-applicable fixes where possible\n`;
    }
    
    return prompt;
  }

  /**
   * Create prompt for generating fixes
   */
  static createFixPrompt(
    file: string,
    issue: string,
    originalCode: string,
    context?: string
  ): string {
    return `Generate a fix for the following issue:

File: ${file}
Issue: ${issue}

Original code:
\`\`\`
${originalCode}
\`\`\`

${context ? `Additional context:\n${context}\n` : ''}

Provide a fix that:
1. Resolves the identified issue
2. Maintains existing functionality
3. Follows best practices
4. Is clear and maintainable

Respond with the fixed code and a brief explanation of the changes.`;
  }

  /**
   * Get focus area description
   */
  private static getFocusAreaDescription(area: ReviewFocusArea): string {
    const descriptions: Record<ReviewFocusArea, string> = {
      'security': 'Security vulnerabilities (injection, authentication, authorization, secrets)',
      'performance': 'Performance issues (N+1 queries, inefficient algorithms, memory leaks)',
      'best-practices': 'Code best practices and design patterns',
      'code-quality': 'Code quality, readability, and maintainability',
      'documentation': 'Documentation completeness and accuracy',
      'testing': 'Test coverage and quality',
      'accessibility': 'Accessibility compliance and best practices',
      'error-handling': 'Error handling and edge cases'
    };
    
    return descriptions[area] || area;
  }

  /**
   * Group findings by severity
   */
  private static groupFindingsBySeverity(
    findings: AnalysisFinding[]
  ): Record<string, AnalysisFinding[]> {
    const grouped: Record<string, AnalysisFinding[]> = {
      critical: [],
      high: [],
      medium: [],
      low: []
    };
    
    findings.forEach(finding => {
      const severityGroup = grouped[finding.severity];
      if (severityGroup) {
        severityGroup.push(finding);
      }
    });
    
    return grouped;
  }

  /**
   * Create function definitions for OpenAI function calling
   */
  static getFunctionDefinitions() {
    return [
      {
        name: 'submit_review',
        description: 'Submit a code review with comments and suggestions',
        parameters: {
          type: 'object',
          properties: {
            summary: {
              type: 'object',
              properties: {
                verdict: {
                  type: 'string',
                  enum: ['approve', 'request-changes', 'comment'],
                  description: 'Overall review verdict'
                },
                confidence: {
                  type: 'number',
                  minimum: 0,
                  maximum: 1,
                  description: 'Confidence in the review (0-1)'
                },
                message: {
                  type: 'string',
                  description: 'Summary message explaining the verdict'
                },
                healthScore: {
                  type: 'number',
                  minimum: 0,
                  maximum: 100,
                  description: 'Overall code health score'
                }
              },
              required: ['verdict', 'confidence', 'message']
            },
            comments: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  file: { type: 'string' },
                  line: { type: 'number' },
                  endLine: { type: 'number' },
                  type: {
                    type: 'string',
                    enum: ['issue', 'suggestion', 'question', 'praise']
                  },
                  severity: {
                    type: 'string',
                    enum: ['critical', 'high', 'medium', 'low', 'info']
                  },
                  category: {
                    type: 'string',
                    enum: [
                      'security',
                      'performance',
                      'best-practices',
                      'code-quality',
                      'documentation',
                      'testing',
                      'accessibility',
                      'error-handling'
                    ]
                  },
                  message: { type: 'string' },
                  codeSnippet: { type: 'string' },
                  suggestion: { type: 'string' },
                  confidence: {
                    type: 'number',
                    minimum: 0,
                    maximum: 1
                  },
                  relatedFindings: {
                    type: 'array',
                    items: { type: 'string' }
                  }
                },
                required: ['file', 'line', 'type', 'severity', 'category', 'message', 'confidence']
              }
            },
            suggestions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  file: { type: 'string' },
                  startLine: { type: 'number' },
                  endLine: { type: 'number' },
                  type: {
                    type: 'string',
                    enum: ['fix', 'refactor', 'optimization', 'security-fix']
                  },
                  description: { type: 'string' },
                  originalCode: { type: 'string' },
                  suggestedCode: { type: 'string' },
                  explanation: { type: 'string' },
                  impact: {
                    type: 'object',
                    properties: {
                      performance: {
                        type: 'string',
                        enum: ['improved', 'neutral', 'degraded']
                      },
                      security: {
                        type: 'string',
                        enum: ['improved', 'neutral', 'degraded']
                      },
                      readability: {
                        type: 'string',
                        enum: ['improved', 'neutral', 'degraded']
                      }
                    }
                  },
                  confidence: {
                    type: 'number',
                    minimum: 0,
                    maximum: 1
                  },
                  autoApplicable: { type: 'boolean' }
                },
                required: [
                  'id', 'file', 'startLine', 'endLine', 'type',
                  'description', 'originalCode', 'suggestedCode',
                  'explanation', 'confidence', 'autoApplicable'
                ]
              }
            },
            metrics: {
              type: 'object',
              properties: {
                issuesFound: { type: 'number' },
                criticalIssues: { type: 'number' },
                improvements: { type: 'number' },
                estimatedImpact: {
                  type: 'string',
                  enum: ['high', 'medium', 'low']
                }
              },
              required: ['issuesFound', 'criticalIssues', 'improvements', 'estimatedImpact']
            }
          },
          required: ['summary', 'comments', 'suggestions', 'metrics']
        }
      }
    ];
  }
}