/**
 * Structure parser — restored 2026-07-18; never committed originally; minimal
 * implementation of the interface consumed by
 * src/lib/code-analysis/analyzer/code-analyzer.ts: parser.parse(content, language)
 * returning a ParseResult with functions[] and classes[].
 *
 * HONEST LIMIT: despite the module path, this does NOT use the tree-sitter native
 * parser (that dependency was never in package.json and adding native deps is out
 * of scope for the compile repair). It is a regex-based declaration scanner that
 * fills the two collections the analyzer consumes (counts for metrics). For that
 * reason enableTreeSitter defaults to false in ConfigLoader — this is opt-in.
 */

import { ParseResult, CodeSymbol } from './types';

export { ParseResult, CodeSymbol } from './types';

interface LanguagePatterns {
  functions: RegExp[];
  classes: RegExp[];
}

// Capture group 1 = symbol name in every pattern.
const LANGUAGE_PATTERNS: Record<string, LanguagePatterns> = {
  javascript: {
    functions: [
      /\bfunction\s+([A-Za-z_$][\w$]*)/g,
      /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b|\()/g
    ],
    classes: [/\bclass\s+([A-Za-z_$][\w$]*)/g]
  },
  typescript: {
    functions: [
      /\bfunction\s+([A-Za-z_$][\w$]*)/g,
      /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b|\()/g
    ],
    classes: [/\bclass\s+([A-Za-z_$][\w$]*)/g]
  },
  python: {
    functions: [/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/gm],
    classes: [/^\s*class\s+([A-Za-z_]\w*)/gm]
  },
  go: {
    functions: [/\bfunc\s+(?:\([^)]*\)\s+)?([A-Za-z_]\w*)/g],
    classes: [/\btype\s+([A-Za-z_]\w*)\s+struct\b/g]
  },
  java: {
    functions: [], // Java method detection needs real parsing; left empty rather than guessed
    classes: [/\b(?:public|private|protected)?\s*(?:abstract\s+|final\s+)?class\s+([A-Za-z_$][\w$]*)/g]
  },
  ruby: {
    functions: [/^\s*def\s+([A-Za-z_]\w*[?!]?)/gm],
    classes: [/^\s*class\s+([A-Z]\w*)/gm]
  }
};

class StructureParser {
  async parse(content: string, language: string): Promise<ParseResult> {
    const patterns = LANGUAGE_PATTERNS[language];
    if (!patterns) {
      // Unknown language: return an empty (not fabricated) structure.
      return { language, functions: [], classes: [] };
    }

    return {
      language,
      functions: this.collect(content, patterns.functions),
      classes: this.collect(content, patterns.classes)
    };
  }

  private collect(content: string, regexes: RegExp[]): CodeSymbol[] {
    const symbols: CodeSymbol[] = [];
    const seen = new Set<string>();

    for (const regex of regexes) {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        const name = match[1] ?? '';
        const line = content.slice(0, match.index).split('\n').length;
        const key = `${name}:${line}`;
        if (!seen.has(key)) {
          seen.add(key);
          symbols.push({ name, line });
        }
      }
    }

    return symbols;
  }
}

export const parser = new StructureParser();
