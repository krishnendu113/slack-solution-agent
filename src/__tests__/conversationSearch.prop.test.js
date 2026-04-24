/**
 * conversationSearch.prop.test.js — Property-based tests for conversation search scoping and case-insensitivity
 *
 * Property 18: Search results scoping and case-insensitivity
 * - Create conversations for two userIds with known content, search for userId A — results only contain userId A's conversations
 * - Search with different casing variations of the same query — same set of conversation IDs returned
 * - Test against the JSON-file adapter
 *
 * **Validates: Requirements 10.4, 10.5**
 *
 * Uses fast-check v4.7.0 and vitest.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fc from 'fast-check';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as store from '../stores/json/conversationStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '../../data/conversations.json');

// Capture original file content before any test modifies it
const originalDataPromise = fs.readFile(DATA_FILE, 'utf-8').catch(() => null);

beforeEach(async () => {
  await store._reset();
});

afterAll(async () => {
  await store._flush();
  const originalData = await originalDataPromise;
  if (originalData !== null) {
    await fs.writeFile(DATA_FILE, originalData);
  }
});

// --- Arbitraries ---

const arbUserId = fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0);

const arbFirstMessage = fc.string({ minLength: 1, maxLength: 80 }).filter(s => s.trim().length > 0);

// A keyword that contains at least one letter (so casing variations are meaningful)
const arbKeyword = fc
  .string({ minLength: 2, maxLength: 30 })
  .filter(s => s.trim().length > 0 && /[a-zA-Z]/.test(s));

// Feature: platform-persistence-and-efficiency, Property 18: Search results scoping and case-insensitivity
describe('Property 18: Search results scoping and case-insensitivity', () => {
  // **Validates: Requirements 10.4, 10.5**

  it('searching for userId A returns only userId A conversations, never userId B conversations', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbUserId,
        arbUserId,
        arbKeyword,
        fc.integer({ min: 1, max: 4 }),
        fc.integer({ min: 1, max: 4 }),
        async (userA, userB, keyword, countA, countB) => {
          // Ensure distinct userIds
          fc.pre(userA !== userB);

          await store._reset();

          // Create conversations for user A with the keyword in message content
          const idsA = [];
          for (let i = 0; i < countA; i++) {
            const conv = await store.createConversation(userA, `A-conv-${i}`);
            await store.appendMessage(conv.id, {
              role: 'user',
              content: `Message about ${keyword} for user A conversation ${i}`,
            });
            idsA.push(conv.id);
          }

          // Create conversations for user B with the same keyword in message content
          const idsB = [];
          for (let i = 0; i < countB; i++) {
            const conv = await store.createConversation(userB, `B-conv-${i}`);
            await store.appendMessage(conv.id, {
              role: 'user',
              content: `Message about ${keyword} for user B conversation ${i}`,
            });
            idsB.push(conv.id);
          }

          // Search for user A — results should only contain user A's conversations
          const resultsA = store.searchConversations(userA, keyword, 100);
          const resultIdsA = resultsA.map(r => r.conversationId);

          // All results belong to user A
          expect(resultsA.length).toBe(countA);
          for (const id of resultIdsA) {
            expect(idsA).toContain(id);
          }

          // No user B conversations leaked
          for (const id of idsB) {
            expect(resultIdsA).not.toContain(id);
          }

          // Search for user B — results should only contain user B's conversations
          const resultsB = store.searchConversations(userB, keyword, 100);
          const resultIdsB = resultsB.map(r => r.conversationId);

          expect(resultsB.length).toBe(countB);
          for (const id of resultIdsB) {
            expect(idsB).toContain(id);
          }

          for (const id of idsA) {
            expect(resultIdsB).not.toContain(id);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('searching with different casing variations of the same query returns the same set of conversation IDs', async () => {
    await fc.assert(
      fc.asyncProperty(arbUserId, arbKeyword, fc.integer({ min: 1, max: 5 }), async (userId, keyword, count) => {
        await store._reset();

        // Create conversations with the keyword embedded in message content
        for (let i = 0; i < count; i++) {
          const conv = await store.createConversation(userId, `conv-${i}`);
          await store.appendMessage(conv.id, {
            role: 'user',
            content: `Discussion about ${keyword} in conversation ${i}`,
          });
        }

        // Search with different casing variations
        const lowerResults = store.searchConversations(userId, keyword.toLowerCase(), 100);
        const upperResults = store.searchConversations(userId, keyword.toUpperCase(), 100);

        // Build a mixed-case version: alternate upper/lower per character
        const mixedCase = keyword
          .split('')
          .map((ch, i) => (i % 2 === 0 ? ch.toUpperCase() : ch.toLowerCase()))
          .join('');
        const mixedResults = store.searchConversations(userId, mixedCase, 100);

        // Extract and sort conversation IDs for comparison
        const lowerIds = lowerResults.map(r => r.conversationId).sort();
        const upperIds = upperResults.map(r => r.conversationId).sort();
        const mixedIds = mixedResults.map(r => r.conversationId).sort();

        // All casing variations should return the same set of conversation IDs
        expect(upperIds).toEqual(lowerIds);
        expect(mixedIds).toEqual(lowerIds);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: platform-persistence-and-efficiency, Property 19: Search snippet length constraint
describe('Property 19: Search snippet length constraint', () => {
  // **Validates: Requirements 10.6**

  it('all search result snippets are at most 200 characters long, regardless of message length', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbUserId,
        arbKeyword,
        fc.array(
          fc.oneof(
            // Short messages (well under 200 chars)
            fc.integer({ min: 5, max: 100 }),
            // Medium messages (around 200 chars)
            fc.integer({ min: 150, max: 250 }),
            // Long messages (well over 200 chars)
            fc.integer({ min: 300, max: 1000 }),
          ),
          { minLength: 1, maxLength: 6 },
        ),
        fc.integer({ min: 1, max: 20 }),
        async (userId, keyword, messageLengths, limit) => {
          await store._reset();

          // Create one conversation per message length, each containing the keyword
          for (let i = 0; i < messageLengths.length; i++) {
            const targetLen = messageLengths[i];
            // Build a message that contains the keyword and is exactly targetLen characters
            const prefix = `${keyword} `;
            const padding = 'x'.repeat(Math.max(0, targetLen - prefix.length));
            const content = (prefix + padding).slice(0, targetLen);

            const conv = await store.createConversation(userId, `conv-${i}`);
            await store.appendMessage(conv.id, {
              role: 'user',
              content,
            });
          }

          const results = store.searchConversations(userId, keyword, limit);

          // Every snippet must be at most 200 characters
          for (const result of results) {
            expect(result.snippet.length).toBeLessThanOrEqual(200);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
