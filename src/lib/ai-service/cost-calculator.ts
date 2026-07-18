/**
 * CostCalculator — restored 2026-07-18; never committed originally; minimal
 * implementation of the interface consumed by src/lib/ai-service/enhanced-ai-service.ts:
 * CostCalculator.calculateCost(usage) and CostCalculator.formatCost(n).
 *
 * Pricing constants are OpenAI's published per-1K-token prices (openai.com/api/pricing,
 * as of the models this repo references in config: 'gpt-4' and 'gpt-4-turbo-preview').
 * Unknown models FALL BACK to the most expensive listed pricing (computed from the
 * table, so it stays true as prices are edited) — fail-closed: the cost-limit guard
 * in EnhancedAIService must overestimate, never underestimate. (F2 fix 2026-07-18:
 * this previously fell back to gpt-4 while claiming "most expensive" — gpt-4-32k
 * costs 2x more; the guarantee is now computed, not asserted.)
 */

import { TokenUsage, CostCalculation } from './types';

interface ModelPricing {
  inputCostPer1k: number;
  outputCostPer1k: number;
}

/** USD per 1,000 tokens. Source: OpenAI published pricing. */
const MODEL_PRICING: Record<string, ModelPricing> = {
  'gpt-4': { inputCostPer1k: 0.03, outputCostPer1k: 0.06 },
  'gpt-4-32k': { inputCostPer1k: 0.06, outputCostPer1k: 0.12 },
  'gpt-4-turbo': { inputCostPer1k: 0.01, outputCostPer1k: 0.03 },
  'gpt-4-turbo-preview': { inputCostPer1k: 0.01, outputCostPer1k: 0.03 },
  'gpt-4o': { inputCostPer1k: 0.0025, outputCostPer1k: 0.01 },
  'gpt-4o-mini': { inputCostPer1k: 0.00015, outputCostPer1k: 0.0006 },
  'gpt-3.5-turbo': { inputCostPer1k: 0.0005, outputCostPer1k: 0.0015 }
};

/** Fail-closed default for unknown models: the most expensive listed pricing,
 * computed from the table so the guarantee cannot silently rot (see header). */
const FALLBACK_PRICING: ModelPricing = Object.values(MODEL_PRICING).reduce((max, p) =>
  p.inputCostPer1k + p.outputCostPer1k > max.inputCostPer1k + max.outputCostPer1k ? p : max
);

export class CostCalculator {
  /**
   * Calculate the cost of a request from its token usage.
   * Matches models by exact name first, then by longest known prefix
   * (OpenAI returns dated variants like "gpt-4-0613").
   */
  static calculateCost(usage: TokenUsage): CostCalculation {
    const pricing = CostCalculator.getPricing(usage.model);
    const inputCost = (usage.promptTokens / 1000) * pricing.inputCostPer1k;
    const outputCost = (usage.completionTokens / 1000) * pricing.outputCostPer1k;

    return {
      model: usage.model,
      inputTokens: usage.promptTokens,
      outputTokens: usage.completionTokens,
      inputCostPer1k: pricing.inputCostPer1k,
      outputCostPer1k: pricing.outputCostPer1k,
      totalCost: inputCost + outputCost
    };
  }

  /**
   * Format a USD cost for display, e.g. "$0.0123".
   */
  static formatCost(cost: number): string {
    return `$${cost.toFixed(4)}`;
  }

  private static getPricing(model: string): ModelPricing {
    if (MODEL_PRICING[model]) {
      return MODEL_PRICING[model];
    }
    // Prefix match, longest first, so "gpt-4-turbo-2024-04-09" resolves to
    // gpt-4-turbo pricing rather than gpt-4 pricing.
    const prefixes = Object.keys(MODEL_PRICING).sort((a, b) => b.length - a.length);
    for (const prefix of prefixes) {
      if (model.startsWith(prefix)) {
        return MODEL_PRICING[prefix];
      }
    }
    return FALLBACK_PRICING;
  }
}
