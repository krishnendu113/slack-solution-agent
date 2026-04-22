/**
 * compaction.js — In-session context compaction service
 *
 * Estimates token usage for a message array and compacts older messages
 * into a single summary when the estimated count exceeds a threshold.
 * Uses Haiku via runSubAgent for summarisation.
 *
 * Works with either store backend (no store dependency).
 */

import { runSubAgent } from './subAgent.js';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Number of recent messages to always preserve during compaction. */
const PRESERVED_TAIL = 4;

/** Default token threshold before compaction triggers. */
const DEFAULT_THRESHOLD = 60_000;

/** Summarisation prompt sent to Haiku when compacting context. */
const SUMMARISATION_PROMPT = `You are a context-summarisation assistant. You will receive a series of conversation messages that need to be condensed into a concise summary.

Your summary MUST preserve:
1. The original user intent and request
2. All feasibility verdicts reached so far
3. All tool results cited (Jira tickets, Confluence pages, Kapa docs, etc.)
4. Any open questions or unresolved points

Output ONLY the summary text — no preamble, no markdown fences. Keep it as concise as possible while retaining all critical information listed above.`;

// ─── estimateTokens ──────────────────────────────────────────────────────────

/**
 * Estimates the total token count for an array of messages using the
 * character-count heuristic (chars / 3.5).
 *
 * Handles messages whose `content` is a string or an array of content blocks
 * (each block having a `text` or similar string field). Returns 0 for any
 * value that would produce NaN.
 *
 * @param {Array<{role: string, content: string | Array}>} messages
 * @returns {number} Estimated token count
 */
export function estimateTokens(messages) {
  if (!Array.isArray(messages)) return 0;

  let total = 0;

  for (const msg of messages) {
    const content = msg?.content;
    let charCount = 0;

    if (typeof content === 'string') {
      charCount = content.length;
    } else if (Array.isArray(content)) {
      for (const block of content) {
        const text = typeof block === 'string'
          ? block
          : (block?.text ?? '');
        charCount += typeof text === 'string' ? text.length : 0;
      }
    }
    // else: content is null/undefined/number — charCount stays 0

    const estimate = charCount / 3.5;
    total += Number.isNaN(estimate) ? 0 : estimate;
  }

  return total;
}

// ─── compactIfNeeded ─────────────────────────────────────────────────────────

/**
 * Compacts the message array if the estimated token count exceeds the
 * threshold. Summarises the oldest messages (all except the last 4) via
 * Haiku and replaces them with a single summary message.
 *
 * @param {Array<{role: string, content: string | Array}>} messages
 * @param {number} [threshold] - Token threshold; defaults to
 *   `CONTEXT_COMPACTION_THRESHOLD` env var or 60 000.
 * @returns {Promise<{messages: Array, compacted: boolean}>}
 */
export async function compactIfNeeded(messages, threshold) {
  const envThreshold = Number(process.env.CONTEXT_COMPACTION_THRESHOLD);
  const effectiveThreshold = threshold
    ?? (Number.isFinite(envThreshold) && envThreshold > 0 ? envThreshold : DEFAULT_THRESHOLD);

  // Nothing to compact if we have 4 or fewer messages
  if (!Array.isArray(messages) || messages.length <= PRESERVED_TAIL) {
    return { messages, compacted: false };
  }

  const estimated = estimateTokens(messages);

  if (estimated <= effectiveThreshold) {
    return { messages, compacted: false };
  }

  // Split: old messages to summarise, recent messages to keep
  const oldMessages = messages.slice(0, messages.length - PRESERVED_TAIL);
  const recentMessages = messages.slice(messages.length - PRESERVED_TAIL);

  try {
    const formatted = oldMessages
      .map(m => {
        const text = typeof m.content === 'string'
          ? m.content
          : JSON.stringify(m.content);
        return `[${m.role}]: ${text}`;
      })
      .join('\n\n');

    const summary = await runSubAgent({
      systemPrompt: SUMMARISATION_PROMPT,
      userContent: formatted,
      maxTokens: 2048,
      operation: 'compaction',
    });

    const summaryMessage = {
      role: 'user',
      content: `[Context Summary] ${summary}`,
    };

    console.log(
      `[compaction] Compacted ${oldMessages.length} messages → 1 summary. ` +
      `Tokens before=${Math.round(estimated)}, after≈${Math.round(estimateTokens([summaryMessage, ...recentMessages]))}`
    );

    return {
      messages: [summaryMessage, ...recentMessages],
      compacted: true,
    };
  } catch (err) {
    console.error(`[compaction] Haiku summarisation failed: ${err.message}`);
    return { messages, compacted: false };
  }
}
