// First tests in this repo (2026-07-18) — node:test over the compiled dist/, zero new
// dependencies. Run via `npm test` (builds first). Covers the two review follow-ups:
// F1 (demo mode is fail-closed) and F2 (unknown-model pricing can never under-count).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { CostCalculator } = await import('../dist/lib/ai-service/cost-calculator.js');
const { EnhancedDemoProcessorSimple } = await import('../dist/lib/queue-system/processors/pr-processor.js');

test('F2: unknown model falls back to pricing >= every listed model (fail-closed property)', () => {
  const unknown = CostCalculator.calculateCost({
    model: 'totally-unknown-model-x',
    promptTokens: 1000,
    completionTokens: 1000,
    totalTokens: 2000
  });
  const listed = ['gpt-4', 'gpt-4-32k', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'];
  for (const model of listed) {
    const known = CostCalculator.calculateCost({
      model,
      promptTokens: 1000,
      completionTokens: 1000,
      totalTokens: 2000
    });
    assert.ok(
      unknown.totalCost >= known.totalCost,
      `fallback ($${unknown.totalCost}) must be >= ${model} ($${known.totalCost})`
    );
  }
});

test('F2: dated variants resolve by longest prefix, not the shortest', () => {
  const dated = CostCalculator.calculateCost({
    model: 'gpt-4-turbo-2024-04-09',
    promptTokens: 1000,
    completionTokens: 0,
    totalTokens: 1000
  });
  assert.equal(dated.inputCostPer1k, 0.01, 'gpt-4-turbo-* must price as gpt-4-turbo, not gpt-4');
});

test('F1: without DEMO_MODE=true the PR processor refuses before any GitHub call', async () => {
  delete process.env.DEMO_MODE;
  const explodingClient = new Proxy({}, {
    get() {
      throw new Error('GitHub client must not be touched when demo mode is disabled');
    }
  });
  const processor = new EnhancedDemoProcessorSimple(explodingClient).createProcessor();
  const result = await processor({
    data: {
      repository: { owner: 'o', name: 'r', fullName: 'o/r' },
      pullRequest: { number: 1, title: 't', author: 'a', baseBranch: 'main', headBranch: 'x', sha: 's' },
      installationId: 123,
      action: 'opened',
      timestamp: new Date()
    }
  });
  assert.equal(result.success, false);
  assert.equal(result.error.code, 'DEMO_MODE_DISABLED');
});
