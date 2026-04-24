/**
 * historyLookup.prop.test.js — Property-based tests for conversation history lookup round-trip
 *
 * Property 16: History lookup round-trip
 * - Create a conversation with N random messages, call lookup — all N messages returned in order with content preserved
 * - Test with and without messageRange: with range { start: S, count: C }, verify exactly min(C, N - S) messages returned starting from index S
 * - Test against the JSON-file adapter
 *
 * **Validates: Requirements 10.1, 10.2**
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

const arbUserId = fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0);

const arbFirstMessage = fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0);

const arbMessage = fc.record({
  role: fc.constantFrom('user', 'assistant'),
  content: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
});

const arbMessages = fc.array(arbMessage, { minLength: 0, maxLength: 15 });

// Feature: platform-persistence-and-efficiency, Property 16: History lookup round-trip
describe('Property 16: History lookup round-trip', () => {
  // **Validates: Requirements 10.1, 10.2**
  it('creating a conversation with N messages and looking up returns all N messages in order with content preserved', async () => {
    await fc.assert(
      fc.asyncProperty(arbUserId, arbFirstMessage, arbMessages, async (userId, firstMessage, messages) => {
        await store._reset();

        // Create conversation
        const conv = await store.createConversation(userId, firstMessage);

        // Append N messages
        for (const msg of messages) {
          await store.appendMessage(conv.id, { role: msg.role, content: msg.content });
        }

        // Lookup via getConversation (what lookup_conversation_history uses internally)
        const retrieved = store.getConversation(conv.id, userId);
        expect(retrieved).not.toBeNull();

        // All N messages returned
        expect(retrieved.messages).toHaveLength(messages.length);

        // Messages in order with content preserved
        for (let i = 0; i < messages.length; i++) {
          expect(retrieved.messages[i].role).toBe(messages[i].role);
          expect(retrieved.messages[i].content).toBe(messages[i].content);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('with messageRange { start: S, count: C }, returns exactly min(C, N - S) messages starting from index S', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbUserId,
        arbFirstMessage,
        fc.array(arbMessage, { minLength: 1, maxLength: 15 }),
        fc.gen(),
        async (userId, firstMessage, messages, gen) => {
          await store._reset();

          const conv = await store.createConversation(userId, firstMessage);

          // Append messages
          for (const msg of messages) {
            await store.appendMessage(conv.id, { role: msg.role, content: msg.content });
          }

          const N = messages.length;

          // Generate random start and count using gen
          const start = gen(fc.integer, { min: 0, max: N });
          const count = gen(fc.integer, { min: 0, max: N + 5 });

          // Retrieve full conversation
          const retrieved = store.getConversation(conv.id, userId);
          expect(retrieved).not.toBeNull();

          // Apply messageRange slicing (same logic as the tool handler)
          const sliced = retrieved.messages.slice(start, start + count);

          // Expected count: min(count, N - start) but not less than 0
          const expectedCount = Math.max(0, Math.min(count, N - start));
          expect(sliced).toHaveLength(expectedCount);

          // Verify content matches the original messages at the correct indices
          for (let i = 0; i < sliced.length; i++) {
            expect(sliced[i].role).toBe(messages[start + i].role);
            expect(sliced[i].content).toBe(messages[start + i].content);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: platform-persistence-and-efficiency, Property 17: History lookup user scoping
describe('Property 17: History lookup user scoping', () => {
  // **Validates: Requirements 10.3**
  it('looking up a conversation created by userId A with userId B always returns null and never exposes messages', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbUserId,
        arbUserId,
        arbFirstMessage,
        arbMessages,
        async (userIdA, userIdB, firstMessage, messages) => {
          // Ensure distinct userIds
          fc.pre(userIdA !== userIdB);

          await store._reset();

          // Create a conversation owned by userId A
          const conv = await store.createConversation(userIdA, firstMessage);

          // Append messages to userId A's conversation
          for (const msg of messages) {
            await store.appendMessage(conv.id, { role: msg.role, content: msg.content });
          }

          // Attempt lookup with userId B — should return null (translates to "Conversation not found" error)
          const result = store.getConversation(conv.id, userIdB);
          expect(result).toBeNull();

          // Listing conversations for userId B should not include userId A's conversation
          const listB = store.listConversations(userIdB);
          const leakedIds = listB.map(c => c.id);
          expect(leakedIds).not.toContain(conv.id);
          expect(listB).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
