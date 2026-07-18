/**
 * Tree-sitter types — restored 2026-07-18; never committed originally; minimal
 * implementation of the interface consumed by
 * src/lib/code-analysis/analyzer/types.ts (ParseResult) and
 * src/lib/code-analysis/analyzer/code-analyzer.ts (ast.functions / ast.classes).
 */

export interface CodeSymbol {
  /** Symbol name as it appears in source ('' when anonymous) */
  name: string;

  /** 1-based line of the declaration */
  line: number;
}

export interface ParseResult {
  /** Language the content was parsed as */
  language: string;

  /** Function/method declarations found */
  functions: CodeSymbol[];

  /** Class declarations found */
  classes: CodeSymbol[];
}
