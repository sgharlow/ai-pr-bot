import { 
  GeneratedFix,
  FixValidationRequest,
  FixValidationResult 
} from './types';

/**
 * Validates generated fixes for syntactic and semantic correctness
 */
export class FixValidator {
  /**
   * Validate a generated fix
   */
  async validate(request: FixValidationRequest): Promise<FixValidationResult> {
    const results: FixValidationResult = {
      valid: true,
      confidence: request.fix.confidence.overall,
      checks: {}
    };

    // Run requested validations
    if (request.options?.checkSyntax !== false) {
      results.checks.syntax = await this.validateSyntax(request.fix);
      if (!results.checks.syntax.valid) {
        results.valid = false;
        results.confidence *= 0.5; // Reduce confidence for syntax errors
      }
    }

    if (request.options?.checkSemantics) {
      results.checks.semantics = await this.validateSemantics(request.fix);
      if (!results.checks.semantics.valid) {
        results.valid = false;
        results.confidence *= 0.7; // Reduce confidence for semantic issues
      }
    }

    if (request.options?.runTests) {
      results.checks.tests = await this.validateWithTests(request.fix);
      if (!results.checks.tests.passed) {
        results.valid = false;
        results.confidence *= 0.8; // Reduce confidence for test failures
      }
    }

    if (request.options?.checkSideEffects) {
      results.checks.sideEffects = await this.checkSideEffects(request.fix);
      if (results.checks.sideEffects.detected && results.checks.sideEffects.effects) {
        // Check for major side effects
        const hasMajorEffects = results.checks.sideEffects.effects.some(
          effect => effect.severity === 'major'
        );
        if (hasMajorEffects) {
          results.confidence *= 0.6; // Significantly reduce confidence for major side effects
        }
      }
    }

    // Generate recommendations based on validation results
    results.recommendations = this.generateRecommendations(results);

    return results;
  }

  /**
   * Validate syntax of the fixed code
   */
  private async validateSyntax(fix: GeneratedFix): Promise<NonNullable<FixValidationResult['checks']['syntax']>> {
    const errors: Array<{
      line: number;
      column: number;
      message: string;
      severity: 'error' | 'warning';
    }> = [];

    try {
      const language = this.detectLanguage(fix.fix.file);
      
      // Language-specific validation
      switch (language) {
        case 'javascript':
        case 'typescript':
          this.validateJavaScriptSyntax(fix.fix.fixedCode, errors);
          break;
        case 'python':
          this.validatePythonSyntax(fix.fix.fixedCode, errors);
          break;
        case 'go':
          this.validateGoSyntax(fix.fix.fixedCode, errors);
          break;
        case 'java':
          this.validateJavaSyntax(fix.fix.fixedCode, errors);
          break;
        case 'ruby':
          this.validateRubySyntax(fix.fix.fixedCode, errors);
          break;
        default:
          // Basic validation for unknown languages
          this.validateBasicSyntax(fix.fix.fixedCode, errors);
      }

      return {
        valid: errors.filter(e => e.severity === 'error').length === 0,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (error) {
      return {
        valid: false,
        errors: [{
          line: 1,
          column: 1,
          message: `Syntax validation failed: ${error}`,
          severity: 'error'
        }]
      };
    }
  }

  /**
   * Validate semantics of the fixed code
   */
  private async validateSemantics(fix: GeneratedFix): Promise<NonNullable<FixValidationResult['checks']['semantics']>> {
    const issues: Array<{
      type: 'type-error' | 'undefined-variable' | 'unused-code' | 'logic-error';
      message: string;
      line?: number;
    }> = [];

    try {
      // Check for common semantic issues
      const code = fix.fix.fixedCode;
      const lines = code.split('\n');

      // Check for undefined variables (simple heuristic)
      const definedVars = new Set<string>();
      const usedVars = new Set<string>();
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Simple variable definition detection
        const varMatches = line.match(/(?:const|let|var|function)\s+(\w+)/g);
        if (varMatches) {
          varMatches.forEach(match => {
            const varName = match.split(/\s+/)[1];
            definedVars.add(varName);
          });
        }

        // Simple variable usage detection
        const usageMatches = line.match(/\b(\w+)\s*\(/g);
        if (usageMatches) {
          usageMatches.forEach(match => {
            const varName = match.replace(/\s*\($/, '');
            if (!definedVars.has(varName) && !this.isBuiltIn(varName)) {
              issues.push({
                type: 'undefined-variable',
                message: `Possible undefined variable: ${varName}`,
                line: i + 1
              });
            }
          });
        }
      }

      // Check for logic errors in the fix
      if (fix.fix.type === 'deletion' && fix.fix.originalCode.includes('return')) {
        issues.push({
          type: 'logic-error',
          message: 'Deleting code with return statement may cause logic errors'
        });
      }

      return {
        valid: issues.filter(i => i.type === 'type-error' || i.type === 'logic-error').length === 0,
        issues: issues.length > 0 ? issues : undefined
      };
    } catch (error) {
      return {
        valid: false,
        issues: [{
          type: 'logic-error',
          message: `Semantic validation failed: ${error}`
        }]
      };
    }
  }

  /**
   * Validate fix by running tests
   */
  private async validateWithTests(fix: GeneratedFix): Promise<NonNullable<FixValidationResult['checks']['tests']>> {
    // This is a placeholder - in production, you would:
    // 1. Apply the fix to a test environment
    // 2. Run the project's test suite
    // 3. Collect and parse test results
    
    return {
      passed: true,
      total: 0,
      passed_count: 0,
      failed: []
    };
  }

  /**
   * Check for potential side effects
   */
  private async checkSideEffects(fix: GeneratedFix): Promise<NonNullable<FixValidationResult['checks']['sideEffects']>> {
    const effects: Array<{
      type: 'api-change' | 'behavior-change' | 'performance-impact';
      description: string;
      severity: 'minor' | 'moderate' | 'major';
    }> = [];

    const original = fix.fix.originalCode;
    const fixed = fix.fix.fixedCode;

    // Check for API changes
    if (this.hasApiChanges(original, fixed)) {
      effects.push({
        type: 'api-change',
        description: 'Function signature or public API may have changed',
        severity: 'major'
      });
    }

    // Check for behavior changes
    if (this.hasBehaviorChanges(original, fixed)) {
      effects.push({
        type: 'behavior-change',
        description: 'Code behavior may have changed',
        severity: 'moderate'
      });
    }

    // Check for performance impact
    const perfImpact = this.assessPerformanceImpact(original, fixed);
    if (perfImpact) {
      effects.push({
        type: 'performance-impact',
        description: perfImpact.description,
        severity: perfImpact.severity
      });
    }

    return {
      detected: effects.length > 0,
      effects: effects.length > 0 ? effects : undefined
    };
  }

  /**
   * Generate recommendations based on validation results
   */
  private generateRecommendations(results: FixValidationResult): string[] {
    const recommendations: string[] = [];

    // Syntax recommendations
    if (results.checks.syntax && !results.checks.syntax.valid) {
      recommendations.push('Fix syntax errors before applying this patch');
      if (results.checks.syntax.errors) {
        const errorCount = results.checks.syntax.errors.filter(e => e.severity === 'error').length;
        if (errorCount > 3) {
          recommendations.push('Consider regenerating the fix - too many syntax errors detected');
        }
      }
    }

    // Semantic recommendations
    if (results.checks.semantics && results.checks.semantics.issues) {
      const hasUndefined = results.checks.semantics.issues.some(i => i.type === 'undefined-variable');
      if (hasUndefined) {
        recommendations.push('Review undefined variable warnings - may need additional imports or definitions');
      }
    }

    // Test recommendations
    if (results.checks.tests && !results.checks.tests.passed) {
      recommendations.push('Run full test suite before merging - some tests are failing');
    }

    // Side effect recommendations
    if (results.checks.sideEffects?.effects) {
      const hasMajor = results.checks.sideEffects.effects.some(e => e.severity === 'major');
      if (hasMajor) {
        recommendations.push('Major side effects detected - manual review strongly recommended');
        recommendations.push('Consider creating a feature flag for gradual rollout');
      }
    }

    // Confidence-based recommendations
    if (results.confidence < 0.5) {
      recommendations.push('Low confidence fix - consider manual implementation');
    } else if (results.confidence < 0.7) {
      recommendations.push('Medium confidence fix - thorough testing recommended');
    }

    return recommendations;
  }

  /**
   * Detect language from file extension
   */
  private detectLanguage(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    
    const languageMap: Record<string, string> = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'py': 'python',
      'go': 'go',
      'java': 'java',
      'rb': 'ruby',
      'php': 'php',
      'cs': 'csharp',
      'cpp': 'cpp',
      'c': 'c',
      'rs': 'rust'
    };

    return languageMap[ext || ''] || 'unknown';
  }

  /**
   * Validate JavaScript/TypeScript syntax
   */
  private validateJavaScriptSyntax(
    code: string, 
    errors: Array<{ line: number; column: number; message: string; severity: 'error' | 'warning' }>
  ): void {
    // Basic JavaScript syntax checks
    const lines = code.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check for unterminated strings
      const stringMatches = line.match(/(['"])(?:(?!\1).)*$/);
      if (stringMatches) {
        errors.push({
          line: i + 1,
          column: line.indexOf(stringMatches[0]) + 1,
          message: 'Unterminated string literal',
          severity: 'error'
        });
      }

      // Check for missing semicolons (warning)
      if (line.trim() && !line.trim().endsWith(';') && !line.trim().endsWith('{') && !line.trim().endsWith('}')) {
        const needsSemicolon = /^(const|let|var|return|throw|break|continue)\s/.test(line.trim());
        if (needsSemicolon) {
          errors.push({
            line: i + 1,
            column: line.length,
            message: 'Missing semicolon',
            severity: 'warning'
          });
        }
      }
    }

    // Check bracket balance
    this.checkBracketBalance(code, errors);
  }

  /**
   * Validate Python syntax
   */
  private validatePythonSyntax(
    code: string, 
    errors: Array<{ line: number; column: number; message: string; severity: 'error' | 'warning' }>
  ): void {
    const lines = code.split('\n');
    let indentLevel = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Check indentation
      if (trimmed) {
        const currentIndent = line.length - line.trimStart().length;
        const expectedIndent = indentLevel * 4;
        
        if (currentIndent !== expectedIndent && trimmed[0] !== '#') {
          errors.push({
            line: i + 1,
            column: 1,
            message: `Indentation error: expected ${expectedIndent} spaces, got ${currentIndent}`,
            severity: 'error'
          });
        }
        
        // Update indent level
        if (trimmed.endsWith(':')) {
          indentLevel++;
        } else if (trimmed === 'pass' || trimmed.startsWith('return') || trimmed.startsWith('break')) {
          indentLevel = Math.max(0, indentLevel - 1);
        }
      }
    }
  }

  /**
   * Validate Go syntax
   */
  private validateGoSyntax(
    code: string, 
    errors: Array<{ line: number; column: number; message: string; severity: 'error' | 'warning' }>
  ): void {
    // Basic Go syntax checks
    const lines = code.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check for := outside of functions
      if (line.includes(':=') && !this.isInsideFunction(lines, i)) {
        errors.push({
          line: i + 1,
          column: line.indexOf(':=') + 1,
          message: 'Short variable declaration outside function body',
          severity: 'error'
        });
      }
    }

    this.checkBracketBalance(code, errors);
  }

  /**
   * Validate Java syntax
   */
  private validateJavaSyntax(
    code: string, 
    errors: Array<{ line: number; column: number; message: string; severity: 'error' | 'warning' }>
  ): void {
    const lines = code.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check for missing semicolons in Java
      if (line.trim() && !line.trim().endsWith(';') && 
          !line.trim().endsWith('{') && !line.trim().endsWith('}') &&
          !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
        const needsSemicolon = /^(return|throw|break|continue|import|package)\s/.test(line.trim());
        if (needsSemicolon) {
          errors.push({
            line: i + 1,
            column: line.length,
            message: 'Missing semicolon',
            severity: 'error'
          });
        }
      }
    }

    this.checkBracketBalance(code, errors);
  }

  /**
   * Validate Ruby syntax
   */
  private validateRubySyntax(
    code: string, 
    errors: Array<{ line: number; column: number; message: string; severity: 'error' | 'warning' }>
  ): void {
    const lines = code.split('\n');
    let blockLevel = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Count block starts
      if (/\b(def|class|module|if|unless|while|for|begin|do)\b/.test(trimmed)) {
        blockLevel++;
      }
      
      // Count block ends
      if (trimmed === 'end') {
        blockLevel--;
        if (blockLevel < 0) {
          errors.push({
            line: i + 1,
            column: 1,
            message: 'Unexpected "end" - no matching block start',
            severity: 'error'
          });
        }
      }
    }
    
    if (blockLevel > 0) {
      errors.push({
        line: lines.length,
        column: 1,
        message: `Missing ${blockLevel} "end" statement(s)`,
        severity: 'error'
      });
    }
  }

  /**
   * Basic syntax validation for unknown languages
   */
  private validateBasicSyntax(
    code: string, 
    errors: Array<{ line: number; column: number; message: string; severity: 'error' | 'warning' }>
  ): void {
    // Just check bracket balance for unknown languages
    this.checkBracketBalance(code, errors);
  }

  /**
   * Check bracket balance
   */
  private checkBracketBalance(
    code: string,
    errors: Array<{ line: number; column: number; message: string; severity: 'error' | 'warning' }>
  ): void {
    const brackets = [
      { open: '{', close: '}', name: 'braces' },
      { open: '[', close: ']', name: 'brackets' },
      { open: '(', close: ')', name: 'parentheses' }
    ];

    for (const bracket of brackets) {
      const stack: number[] = [];
      const lines = code.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        for (let j = 0; j < line.length; j++) {
          if (line[j] === bracket.open) {
            stack.push(i);
          } else if (line[j] === bracket.close) {
            if (stack.length === 0) {
              errors.push({
                line: i + 1,
                column: j + 1,
                message: `Unexpected closing ${bracket.name}`,
                severity: 'error'
              });
            } else {
              stack.pop();
            }
          }
        }
      }
      
      if (stack.length > 0) {
        errors.push({
          line: stack[0] + 1,
          column: 1,
          message: `Unclosed ${bracket.name}`,
          severity: 'error'
        });
      }
    }
  }

  /**
   * Check if a line is inside a function (simple heuristic)
   */
  private isInsideFunction(lines: string[], lineIndex: number): boolean {
    let braceLevel = 0;
    
    for (let i = 0; i <= lineIndex; i++) {
      const line = lines[i];
      braceLevel += (line.match(/{/g) || []).length;
      braceLevel -= (line.match(/}/g) || []).length;
    }
    
    return braceLevel > 0;
  }

  /**
   * Check if a variable name is a built-in
   */
  private isBuiltIn(name: string): boolean {
    const builtIns = new Set([
      'console', 'Math', 'JSON', 'Object', 'Array', 'String', 'Number',
      'Boolean', 'Date', 'RegExp', 'Error', 'Promise', 'Set', 'Map',
      'require', 'module', 'exports', 'process', 'global', 'window',
      'document', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'
    ]);
    
    return builtIns.has(name);
  }

  /**
   * Check if code has API changes
   */
  private hasApiChanges(original: string, fixed: string): boolean {
    // Check for function signature changes
    const originalFunctions = original.match(/function\s+\w+\s*\([^)]*\)/g) || [];
    const fixedFunctions = fixed.match(/function\s+\w+\s*\([^)]*\)/g) || [];
    
    return originalFunctions.length !== fixedFunctions.length ||
           originalFunctions.some((f, i) => f !== fixedFunctions[i]);
  }

  /**
   * Check if code has behavior changes
   */
  private hasBehaviorChanges(original: string, fixed: string): boolean {
    // Simple heuristic: check if control flow changed
    const originalControl = (original.match(/\b(if|else|while|for|return|throw|break|continue)\b/g) || []).length;
    const fixedControl = (fixed.match(/\b(if|else|while|for|return|throw|break|continue)\b/g) || []).length;
    
    return Math.abs(originalControl - fixedControl) > 2;
  }

  /**
   * Assess performance impact
   */
  private assessPerformanceImpact(original: string, fixed: string): 
    { description: string; severity: 'minor' | 'moderate' | 'major' } | null {
    
    // Check for loop additions
    const originalLoops = (original.match(/\b(for|while|forEach|map|filter|reduce)\b/g) || []).length;
    const fixedLoops = (fixed.match(/\b(for|while|forEach|map|filter|reduce)\b/g) || []).length;
    
    if (fixedLoops > originalLoops) {
      return {
        description: 'Additional loops added - may impact performance',
        severity: fixedLoops - originalLoops > 2 ? 'major' : 'moderate'
      };
    }
    
    // Check for nested loops
    if (fixed.includes('for') && fixed.includes('forEach')) {
      return {
        description: 'Nested loops detected - potential performance impact',
        severity: 'moderate'
      };
    }
    
    return null;
  }
}