/**
 * compaction.prop.test.js — Property-based tests for src/compaction.js
 *
 * Uses fast-check to verify universal properties of the compaction service.
 */

// Feature: platform-persistence-and-efficiency, Property 8: Compaction preserves recent messages and reduces total

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

// ─── Mock runSubAgent ────────────────────────────────────────────────────────

vi.mock('../subAgent.js', () => ({
  runSubAgent: vi.fn(async () => 'Summary of previous context.'),
}));

import { estimateTokens, compactIfNeeded } from '../compaction.js';

// ─── Property 8: Compaction preserves recent messages and reduces total ──────

describe('Property 8: Compaction preserves recent messages and reduces total', () => {
  // **Validates: Requirements 4.2**

  const originalEnv = process.env.CONTEXT_COMPACTION_THRESHOLD;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CONTEXT_COMPACTION_THRESHOLD;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CONTEXT_COMPACTION_THRESHOLD = originalEnv;
    } else {
      delete process.env.CONTEXT_COMPACTION_THRESHOLD;
    }
  });

  // Arbitrary: generate a message with enough content to contribute to token count
  const arbMessage = fc.record({
    role: fc.constantFrom('user', 'assistant'),
    content: fc.string({ minLength: 10, maxLength: 300 }).filter(s => s.trim().length > 0),
  });

  // Generate arrays of 6+ messages whose total chars exceed threshold * 3.5
  // We need > 5 messages so that summarising the old messages (N - 4 > 1)
  // actually reduces the total count. With exactly 5, 1 old → 1 summary = no reduction.
  const THRESHOLD = 10;

  const arbMessageArray = fc
    .array(arbMessage, { minLength: 6, maxLength: 20 })
    .filter(msgs => {
      const totalChars = msgs.reduce((sum, m) => sum + m.content.length, 0);
      return totalChars > THRESHOLD * 3.5;
    });

  it('for any message array exceeding threshold: last 4 identical, count reduced, first is summary', async () => {
    await fc.assert(
      fc.asyncProperty(arbMessageArray, async (messages) => {
        // Verify precondition: estimated tokens exceed threshold
        const estimated = estimateTokens(messages);
        fc.pre(estimated > THRESHOLD);
        fc.pre(messages.length > 4);

        const result = await compactIfNeeded(messages, THRESHOLD);

        // (a) Last 4 messages are identical to original last 4
        const originalLast4 = messages.slice(-4);
        const resultLast4 = result.messages.slice(-4);
        expect(resultLast4).toHaveLength(4);
        for (let i = 0; i < 4; i++) {
          expect(resultLast4[i].role).toBe(originalLast4[i].role);
          expect(resultLast4[i].content).toBe(originalLast4[i].content);
        }

        // (b) Total message count is strictly less than original
        expect(result.messages.length).toBeLessThan(messages.length);

        // (c) First message is a summary with role 'user'
        expect(result.messages[0].role).toBe('user');
        expect(result.messages[0].content).toMatch(/^\[Context Summary\]/);

        // Compaction flag should be true
        expect(result.compacted).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
