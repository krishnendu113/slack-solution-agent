/**
 * conversationStore.prop.test.js — Property-based tests for src/stores/json/conversationStore.js
 *
 * Uses fast-check to verify universal properties of the conversation store.
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

const arbMessages = fc.array(arbMessage, { minLength: 0, maxLength: 10 });

// Feature: platform-persistence-and-efficiency, Property 1: Conversation round-trip
describe('Property 1: Conversation round-trip', () => {
  // **Validates: Requirements 1.1, 1.2**
  it('creating a conversation and appending messages, then retrieving by ID returns all fields and messages in order', async () => {
    await fc.assert(
      fc.asyncProperty(arbUserId, arbFirstMessage, arbMessages, async (userId, firstMessage, messages) => {
        await store._reset();

        // Create conversation
        const conv = await store.createConversation(userId, firstMessage);
        expect(conv.id).toBeDefined();
        expect(conv.userId).toBe(userId);

        // Append messages
        for (const msg of messages) {
          await store.appendMessage(conv.id, { role: msg.role, content: msg.content });
        }

        // Retrieve by ID scoped to same userId
        const retrieved = store.getConversation(conv.id, userId);
        expect(retrieved).not.toBeNull();

        // Verify all fields
        expect(retrieved.id).toBe(conv.id);
        expect(retrieved.userId).toBe(userId);
        expect(retrieved.createdAt).toBeDefined();
        expect(retrieved.updatedAt).toBeDefined();

        // Verify messages in order
        expect(retrieved.messages).toHaveLength(messages.length);
        for (let i = 0; i < messages.length; i++) {
          expect(retrieved.messages[i].role).toBe(messages[i].role);
          expect(retrieved.messages[i].content).toBe(messages[i].content);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: platform-persistence-and-efficiency, Property 2: Conversation user scoping
describe('Property 2: Conversation user scoping', () => {
  // **Validates: Requirements 1.4**
  it('listing or retrieving conversations for userId A never returns conversations belonging to userId B', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbUserId,
        arbUserId,
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 5 }),
        async (userA, userB, countA, countB) => {
          // Ensure distinct userIds
          fc.pre(userA !== userB);

          await store._reset();

          // Create conversations for user A
          const idsA = [];
          for (let i = 0; i < countA; i++) {
            const conv = await store.createConversation(userA, `Conv A-${i}`);
            idsA.push(conv.id);
          }

          // Create conversations for user B
          const idsB = [];
          for (let i = 0; i < countB; i++) {
            const conv = await store.createConversation(userB, `Conv B-${i}`);
            idsB.push(conv.id);
          }

          // List for user A — should only contain A's conversations
          const listA = store.listConversations(userA);
          expect(listA).toHaveLength(countA);
          for (const item of listA) {
            expect(item.userId).toBe(userA);
            expect(idsA).toContain(item.id);
          }

          // List for user B — should only contain B's conversations
          const listB = store.listConversations(userB);
          expect(listB).toHaveLength(countB);
          for (const item of listB) {
            expect(item.userId).toBe(userB);
            expect(idsB).toContain(item.id);
          }

          // Retrieving A's conversations with B's userId returns null
          for (const id of idsA) {
            expect(store.getConversation(id, userB)).toBeNull();
          }

          // Retrieving B's conversations with A's userId returns null
          for (const id of idsB) {
            expect(store.getConversation(id, userA)).toBeNull();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
