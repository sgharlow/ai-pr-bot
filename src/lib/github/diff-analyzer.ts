import parseDiff from 'parse-diff';
import * as mime from 'mime-types';
import { ChangedFile } from './types';

export interface SemanticDiff {
  file: string;
  language: string;
  changes: SemanticChange[];
  additions: number;
  deletions: number;
  isNewFile: boolean;
  isDeletedFile: boolean;
  isRenamed: boolean;
  previousFilename?: string;
}

export interface SemanticChange {
  type: 'function' | 'class' | 'method' | 'variable' | 'import' | 'other';
  name?: string;
  startLine: number;
  endLine: number;
  changeType: 'added' | 'removed' | 'modified';
  content: string;
  context?: string;
}

export class DiffAnalyzer {
  private languagePatterns: Map<string, any> = new Map();

  constructor() {
    this.initializeLanguagePatterns();
  }

  /**
   * Analyzes changed files and extracts semantic information
   */
  async analyzeChangedFiles(changedFiles: ChangedFile[]): Promise<SemanticDiff[]> {
    const semanticDiffs: SemanticDiff[] = [];

    for (const file of changedFiles) {
      if (!file.patch) {
        // Handle files without patches (binary files, etc.)
        semanticDiffs.push({
          file: file.filename,
          language: this.detectLanguage(file.filename),
          changes: [],
          additions: file.additions,
          deletions: file.deletions,
          isNewFile: file.status === 'added',
          isDeletedFile: file.status === 'removed',
          isRenamed: file.status === 'renamed',
          previousFilename: file.previous_filename || undefined
        });
        continue;
      }

      const semanticDiff = await this.analyzeSingleFile(file);
      semanticDiffs.push(semanticDiff);
    }

    return semanticDiffs;
  }

  /**
   * Analyzes a single file's changes
   */
  private async analyzeSingleFile(file: ChangedFile): Promise<SemanticDiff> {
    const language = this.detectLanguage(file.filename);
    
    try {
      const parsedDiff = parseDiff(file.patch!)[0];
      
      if (!parsedDiff) {
        throw new Error(`Failed to parse diff for file: ${file.filename}`);
      }

      const changes = await this.extractSemanticChanges(parsedDiff, language);

      return {
        file: file.filename,
        language,
        changes,
        additions: file.additions,
        deletions: file.deletions,
        isNewFile: file.status === 'added',
        isDeletedFile: file.status === 'removed',
        isRenamed: file.status === 'renamed',
        previousFilename: file.previous_filename || undefined
      };
    } catch (error) {
      // If parsing fails, return basic info
      return {
        file: file.filename,
        language,
        changes: [],
        additions: file.additions,
        deletions: file.deletions,
        isNewFile: file.status === 'added',
        isDeletedFile: file.status === 'removed',
        isRenamed: file.status === 'renamed',
        previousFilename: file.previous_filename || undefined
      };
    }
  }

  /**
   * Extracts semantic changes from parsed diff
   */
  private async extractSemanticChanges(
    parsedDiff: any,
    language: string
  ): Promise<SemanticChange[]> {
    const changes: SemanticChange[] = [];
    const patterns = this.languagePatterns.get(language);

    if (!patterns) {
      // For unsupported languages, treat all changes as 'other'
      return this.extractGenericChanges(parsedDiff);
    }

    // Group chunks by their context to identify function-level changes
    for (const chunk of parsedDiff.chunks || []) {
      const chunkChanges = this.analyzeChunk(chunk, patterns);
      changes.push(...chunkChanges);
    }

    return changes;
  }

  /**
   * Analyzes a single chunk for semantic changes
   */
  private analyzeChunk(chunk: any, patterns: any): SemanticChange[] {
    const changes: SemanticChange[] = [];
    const lines = chunk.changes || [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.type === 'normal') {
        continue;
      }

      const content = line.content || '';
      const lineNumber = this.getLineNumber(line);

      // Check for function definitions
      const functionMatch = this.matchPatterns(content, patterns.functions || []);
      if (functionMatch) {
        changes.push({
          type: 'function',
          name: this.extractName(functionMatch) || 'unknown',
          startLine: lineNumber,
          endLine: lineNumber,
          changeType: line.type === 'add' ? 'added' : 'removed',
          content
        });
        continue;
      }

      // Check for class definitions
      const classMatch = this.matchPatterns(content, patterns.classes || []);
      if (classMatch) {
        changes.push({
          type: 'class',
          name: this.extractName(classMatch) || 'unknown',
          startLine: lineNumber,
          endLine: lineNumber,
          changeType: line.type === 'add' ? 'added' : 'removed',
          content
        });
        continue;
      }

      // Check for imports
      const importMatch = this.matchPatterns(content, patterns.imports || []);
      if (importMatch) {
        changes.push({
          type: 'import',
          name: this.extractName(importMatch, 'module') || content.trim(),
          startLine: lineNumber,
          endLine: lineNumber,
          changeType: line.type === 'add' ? 'added' : 'removed',
          content
        });
        continue;
      }

      // Check for variable declarations
      const variableMatch = this.matchPatterns(content, patterns.variables || []);
      if (variableMatch) {
        changes.push({
          type: 'variable',
          name: this.extractName(variableMatch) || 'unknown',
          startLine: lineNumber,
          endLine: lineNumber,
          changeType: line.type === 'add' ? 'added' : 'removed',
          content
        });
        continue;
      }

      // Default to 'other' type
      changes.push({
        type: 'other',
        startLine: lineNumber,
        endLine: lineNumber,
        changeType: line.type === 'add' ? 'added' : 'removed',
        content
      });
    }

    return changes;
  }

  /**
   * Gets line number from a change object
   */
  private getLineNumber(line: any): number {
    if (line.type === 'add') {
      return line.ln || 0;
    }
    return line.ln1 || line.ln2 || 0;
  }

  /**
   * Extracts name from regex match
   */
  private extractName(match: RegExpMatchArray, groupName: string = 'n'): string | undefined {
    return match.groups?.[groupName];
  }

  /**
   * Matches content against multiple patterns
   */
  private matchPatterns(content: string, patterns: RegExp[]): RegExpMatchArray | null {
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        return match;
      }
    }
    return null;
  }

  /**
   * Extracts generic changes for unsupported languages
   */
  private extractGenericChanges(parsedDiff: any): SemanticChange[] {
    const changes: SemanticChange[] = [];

    for (const chunk of parsedDiff.chunks || []) {
      for (const line of chunk.changes || []) {
        if (line && line.type !== 'normal') {
          changes.push({
            type: 'other',
            startLine: this.getLineNumber(line),
            endLine: this.getLineNumber(line),
            changeType: line.type === 'add' ? 'added' : 'removed',
            content: line.content || ''
          });
        }
      }
    }

    return changes;
  }

  /**
   * Detects programming language from filename
   */
  public detectLanguage(filename: string): string {
    const extension = filename.split('.').pop()?.toLowerCase();
    
    const languageMap: Record<string, string> = {
      // JavaScript/TypeScript
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'mjs': 'javascript',
      'cjs': 'javascript',
      
      // Python
      'py': 'python',
      'pyx': 'python',
      'pyi': 'python',
      
      // Go
      'go': 'go',
      
      // Java
      'java': 'java',
      'kt': 'kotlin',
      'kts': 'kotlin',
      
      // Ruby
      'rb': 'ruby',
      'rake': 'ruby',
      
      // C/C++
      'c': 'c',
      'cpp': 'cpp',
      'cc': 'cpp',
      'cxx': 'cpp',
      'h': 'c',
      'hpp': 'cpp',
      
      // C#
      'cs': 'csharp',
      
      // PHP
      'php': 'php',
      
      // Rust
      'rs': 'rust',
      
      // Swift
      'swift': 'swift',
      
      // Shell
      'sh': 'shell',
      'bash': 'shell',
      'zsh': 'shell',
      
      // Config files
      'json': 'json',
      'yaml': 'yaml',
      'yml': 'yaml',
      'xml': 'xml',
      'toml': 'toml',
      
      // Web
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'sass': 'sass',
      'less': 'less',
      
      // SQL
      'sql': 'sql',
      
      // Markdown
      'md': 'markdown',
      'mdx': 'markdown'
    };

    if (extension && languageMap[extension]) {
      return languageMap[extension];
    }

    // Check for special filenames
    const specialFiles: Record<string, string> = {
      'Dockerfile': 'dockerfile',
      'Makefile': 'makefile',
      'Rakefile': 'ruby',
      'Gemfile': 'ruby',
      'package.json': 'json',
      'tsconfig.json': 'json',
      '.eslintrc.js': 'javascript',
      '.babelrc': 'json'
    };

    const basename = filename.split('/').pop() || '';
    if (specialFiles[basename]) {
      return specialFiles[basename];
    }

    return 'unknown';
  }

  /**
   * Initializes language-specific patterns for semantic analysis
   */
  private initializeLanguagePatterns(): void {
    // JavaScript/TypeScript patterns
    this.languagePatterns.set('javascript', {
      functions: [
        /function\s+(?<name>\w+)\s*\(/,
        /const\s+(?<name>\w+)\s*=\s*\(/,
        /let\s+(?<name>\w+)\s*=\s*\(/,
        /var\s+(?<name>\w+)\s*=\s*\(/,
        /(?<name>\w+)\s*:\s*function\s*\(/,
        /(?<name>\w+)\s*=\s*\([^)]*\)\s*=>/,
        /async\s+function\s+(?<name>\w+)\s*\(/
      ],
      classes: [
        /class\s+(?<name>\w+)/,
        /interface\s+(?<name>\w+)/,
        /type\s+(?<name>\w+)\s*=/
      ],
      methods: [
        /(?<name>\w+)\s*\([^)]*\)\s*{/,
        /async\s+(?<name>\w+)\s*\([^)]*\)\s*{/
      ],
      variables: [
        /const\s+(?<name>\w+)\s*=/,
        /let\s+(?<name>\w+)\s*=/,
        /var\s+(?<name>\w+)\s*=/
      ],
      imports: [
        /import\s+.*\s+from\s+['"](?<module>[^'"]+)['"]/,
        /import\s+['"](?<module>[^'"]+)['"]/,
        /require\s*\(\s*['"](?<module>[^'"]+)['"]\s*\)/
      ]
    });

    this.languagePatterns.set('typescript', this.languagePatterns.get('javascript'));

    // Python patterns
    this.languagePatterns.set('python', {
      functions: [
        /def\s+(?<name>\w+)\s*\(/,
        /async\s+def\s+(?<name>\w+)\s*\(/
      ],
      classes: [
        /class\s+(?<name>\w+)/
      ],
      variables: [
        /(?<name>\w+)\s*=/
      ],
      imports: [
        /import\s+(?<module>\w+)/,
        /from\s+(?<module>[\w.]+)\s+import/
      ]
    });

    // Go patterns
    this.languagePatterns.set('go', {
      functions: [
        /func\s+(?<name>\w+)\s*\(/,
        /func\s+\(\w+\s+\*?\w+\)\s+(?<name>\w+)\s*\(/
      ],
      classes: [
        /type\s+(?<name>\w+)\s+struct/,
        /type\s+(?<name>\w+)\s+interface/
      ],
      variables: [
        /var\s+(?<name>\w+)/,
        /(?<name>\w+)\s*:=/
      ],
      imports: [
        /import\s+['"](?<module>[^'"]+)['"]/
      ]
    });

    // Java patterns
    this.languagePatterns.set('java', {
      functions: [
        /(?:public|private|protected)?\s*(?:static)?\s*\w+\s+(?<name>\w+)\s*\(/
      ],
      classes: [
        /(?:public|private|protected)?\s*class\s+(?<name>\w+)/,
        /(?:public|private|protected)?\s*interface\s+(?<name>\w+)/
      ],
      variables: [
        /(?:public|private|protected)?\s*(?:static)?\s*(?:final)?\s*\w+\s+(?<name>\w+)/
      ],
      imports: [
        /import\s+(?<module>[\w.]+)/
      ]
    });

    // Ruby patterns
    this.languagePatterns.set('ruby', {
      functions: [
        /def\s+(?<name>\w+)/
      ],
      classes: [
        /class\s+(?<name>\w+)/,
        /module\s+(?<name>\w+)/
      ],
      variables: [
        /(?<name>\w+)\s*=/,
        /@(?<name>\w+)/
      ],
      imports: [
        /require\s+['"](?<module>[^'"]+)['"]/,
        /require_relative\s+['"](?<module>[^'"]+)['"]/
      ]
    });
  }

  /**
   * Gets function signatures from code content
   */
  public extractFunctionSignatures(content: string, language: string): any[] {
    const patterns = this.languagePatterns.get(language);
    if (!patterns) {
      return [];
    }

    const signatures: any[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const functionMatch = this.matchPatterns(line, patterns.functions || []);
      
      if (functionMatch) {
        const name = this.extractName(functionMatch);
        if (name) {
          // Extract parameters (simplified)
          const paramMatch = line.match(/\(([^)]*)\)/);
          const parameters = paramMatch ? 
            paramMatch[1].split(',').map(p => p.trim()).filter(p => p) : 
            [];

          signatures.push({
            name,
            parameters,
            startLine: i + 1,
            endLine: i + 1
          });
        }
      }
    }

    return signatures;
  }

  /**
   * Gets class definitions from code content
   */
  public extractClassDefinitions(content: string, language: string): any[] {
    const patterns = this.languagePatterns.get(language);
    if (!patterns) {
      return [];
    }

    const classes: any[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const classMatch = this.matchPatterns(line, patterns.classes || []);
      
      if (classMatch) {
        const name = this.extractName(classMatch);
        if (name) {
          classes.push({
            name,
            methods: [],
            properties: [],
            startLine: i + 1,
            endLine: i + 1
          });
        }
      }
    }

    return classes;
  }
}