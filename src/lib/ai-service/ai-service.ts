/**
 * AIService — restored 2026-07-18; never committed originally; minimal
 * implementation of the interface consumed by src/lib/auto-fix/fix-generator.ts,
 * which uses exactly one method: generateCodeFix().
 *
 * Declared as an interface (not a class): EnhancedAIService already implements this
 * shape structurally, and both existing call sites (src/app.ts, src/worker.ts)
 * construct FixGenerator with an EnhancedAIService instance. Restoring a second
 * concrete OpenAI client class would duplicate live logic that already exists.
 */

import { TokenUsage } from './types';

export interface AIService {
  generateCodeFix(
    file: string,
    issue: string,
    code: string,
    context?: string
  ): Promise<{
    fixedCode: string;
    explanation: string;
    usage: TokenUsage;
  }>;
}
