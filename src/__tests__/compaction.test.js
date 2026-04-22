/**
 * compaction.test.js — Unit tests for src/compaction.js
 *
 * Tests estimateTokens and compactIfNeeded.
 * Mocks runSubAgent for deterministic Haiku responses.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { estimateTokens, compactIfNeeded } from '../compaction.js';

// ─── Mock runSubAgent ────────────────────────────────────────────────────────

vi.mock('../subAgent.js', () => ({
  runSubAgent: vi.fn(async () => 'Summarised context goes here.'),
}));

// Grab the mock so we can inspect / override per-test
const { runSubAgent } = await import('../subAgent.js');

// ─── estimateTokens ──────────────────────────────────────────────────────────

describe('estimateTokens', () => {
  it('returns 0 for an empty array', () => {
    expect(estimateTokens([])).toBe(0);
  });

  it('returns 0 for non-array input', () => {
    expect(estimateTokens(null)).toBe(0);
    expect(estimateTokens(undefined)).toBe(0);
    expect(estimateTokens('hello')).toBe(0);
  });

  it('estimates tokens from string content', () => {
    const messages = [
      { role: 'user', content: 'Hello world' }, // 11 chars
    ];
    const result = estimateTokens(messages);
    expect(result).toBeCloseTo(11 / 3.5, 5);
  });

  it('sums across multiple messages', () => {
    const messages = [
      { role: 'user', content: 'aaaa' },       // 4 chars
      { role: 'assistant', content: 'bbbbbb' }, // 6 chars
    ];
    const result = estimateTokens(messages);
    expect(result).toBeCloseTo(10 / 3.5, 5);
  });

  it('handles array-of-blocks content', () => {
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },  // 5 chars
          { type: 'text', text: 'World' },  // 5 chars
        ],
      },
    ];
    const result = estimateTokens(messages);
    expect(result).toBeCloseTo(10 / 3.5, 5);
  });

  it('handles mixed string and array content', () => {
    const messages = [
      { role: 'user', content: 'abc' },                                    // 3 chars
      { role: 'assistant', content: [{ type: 'text', text: 'defgh' }] },   // 5 chars
    ];
    const result = estimateTokens(messages);
    expect(result).toBeCloseTo(8 / 3.5, 5);
  });

  it('handles null/undefined content gracefully (defaults to 0)', () => {
    const messages = [
      { role: 'user', content: null },
      { role: 'assistant' },
    ];
    expect(estimateTokens(messages)).toBe(0);
  });

  it('handles content blocks that are plain strings', () => {
    const messages = [
      { role: 'user', content: ['hello', 'world'] }, // 5 + 5 = 10 chars
    ];
    expect(estimateTokens(messages)).toBeCloseTo(10 / 3.5, 5);
  });
});

// ─── compactIfNeeded ─────────────────────────────────────────────────────────

describe('compactIfNeeded', () => {
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

  it('returns unchanged when messages.length <= 4', async () => {
    const msgs = [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
      { role: 'assistant', content: 'd' },
    ];
    const result = await compactIfNeeded(msgs, 10);
    expect(result.compacted).toBe(false);
    expect(result.messages).toBe(msgs);
    expect(runSubAgent).not.toHaveBeenCalled();
  });

  it('returns unchanged when estimated tokens are below threshold', async () => {
    const msgs = [
      { role: 'user', content: 'short' },
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
    ];
    // Total chars: 5+5+1+1+1 = 13, tokens ≈ 3.7 — well below default 60000
    const result = await compactIfNeeded(msgs);
    expect(result.compacted).toBe(false);
    expect(result.messages).toBe(msgs);
  });

  it('compacts when estimated tokens exceed threshold', async () => {
    // Create messages that exceed a low threshold
    const longContent = 'x'.repeat(100);
    const msgs = [
      { role: 'user', content: longContent },
      { role: 'assistant', content: longContent },
      { role: 'user', content: longContent },
      { role: 'assistant', content: 'recent1' },
      { role: 'user', content: 'recent2' },
      { role: 'assistant', content: 'recent3' },
      { role: 'user', content: 'recent4' },
    ];

    // Threshold low enough to trigger compaction
    const result = await compactIfNeeded(msgs, 5);

    expect(result.compacted).toBe(true);
    expect(result.messages.length).toBe(5); // 1 summary + 4 recent
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[0].content).toMatch(/^\[Context Summary\]/);
    // Last 4 preserved
    expect(result.messages[1].content).toBe('recent1');
    expect(result.messages[2].content).toBe('recent2');
    expect(result.messages[3].content).toBe('recent3');
    expect(result.messages[4].content).toBe('recent4');
    expect(runSubAgent).toHaveBeenCalledOnce();
  });

  it('reads threshold from CONTEXT_COMPACTION_THRESHOLD env var', async () => {
    process.env.CONTEXT_COMPACTION_THRESHOLD = '10';
    const longContent = 'x'.repeat(100);
    const msgs = [
      { role: 'user', content: longContent },
      { role: 'assistant', content: longContent },
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
      { role: 'assistant', content: 'd' },
      { role: 'user', content: 'e' },
    ];

    const result = await compactIfNeeded(msgs);
    expect(result.compacted).toBe(true);
  });

  it('returns original messages on Haiku failure', async () => {
    runSubAgent.mockRejectedValueOnce(new Error('API timeout'));

    const longContent = 'x'.repeat(100);
    const msgs = [
      { role: 'user', content: longContent },
      { role: 'assistant', content: longContent },
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
      { role: 'assistant', content: 'd' },
      { role: 'user', content: 'e' },
    ];

    const result = await compactIfNeeded(msgs, 5);
    expect(result.compacted).toBe(false);
    expect(result.messages).toBe(msgs);
  });

  it('preserves exactly the last 4 messages', async () => {
    const msgs = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `msg-${i}`,
    }));

    const result = await compactIfNeeded(msgs, 1);
    expect(result.compacted).toBe(true);
    // Last 4 messages should be msg-6, msg-7, msg-8, msg-9
    expect(result.messages.slice(1).map(m => m.content)).toEqual([
      'msg-6', 'msg-7', 'msg-8', 'msg-9',
    ]);
  });

  it('passes correct parameters to runSubAgent', async () => {
    const msgs = [
      { role: 'user', content: 'old message 1' },
      { role: 'assistant', content: 'old reply 1' },
      { role: 'user', content: 'r1' },
      { role: 'assistant', content: 'r2' },
      { role: 'user', content: 'r3' },
      { role: 'assistant', content: 'r4' },
    ];

    await compactIfNeeded(msgs, 1);

    expect(runSubAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'compaction',
        maxTokens: 2048,
      })
    );
    // The userContent should contain the old messages formatted
    const call = runSubAgent.mock.calls[0][0];
    expect(call.userContent).toContain('[user]: old message 1');
    expect(call.userContent).toContain('[assistant]: old reply 1');
    // Should NOT contain the recent messages
    expect(call.userContent).not.toContain('r3');
    expect(call.userContent).not.toContain('r4');
  });

  it('handles non-array input gracefully', async () => {
    const result = await compactIfNeeded(null, 100);
    expect(result.compacted).toBe(false);
    expect(result.messages).toBeNull();
  });
});
