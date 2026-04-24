/**
 * mongoConversationStore.test.js — Unit tests for src/stores/mongo/conversationStore.js
 *
 * Tests CRUD operations, appendMessage, searchConversations, and edge cases
 * against a MongoMemoryServer instance.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestMongo, getTestDb, stopTestMongo } from './mongoTestHelper.js';

let store;

beforeAll(async () => {
  await startTestMongo();
  store = await import('../stores/mongo/conversationStore.js');
});

afterAll(async () => {
  await stopTestMongo();
});

beforeEach(async () => {
  const db = getTestDb();
  await db.collection('conversations').deleteMany({});
});

describe('createConversation', () => {
  it('creates with correct fields', async () => {
    const conv = await store.createConversation('user-1', 'Hello world');

    expect(conv.id).toBeDefined();
    expect(conv.userId).toBe('user-1');
    expect(conv.title).toBe('Hello world');
    expect(conv.createdAt).toBeDefined();
    expect(conv.updatedAt).toBeDefined();
    expect(conv.compactedAt).toBeNull();
    expect(conv.messages).toEqual([]);
    expect(conv.plans).toEqual([]);
  });

  it('truncates title to 80 characters', async () => {
    const conv = await store.createConversation('user-1', 'A'.repeat(200));
    expect(conv.title.length).toBe(80);
  });

  it('replaces newlines in title', async () => {
    const conv = await store.createConversation('user-1', 'Line one\nLine two');
    expect(conv.title).toBe('Line one Line two');
  });
});

describe('listConversations', () => {
  it('returns only conversations for the given userId, sorted by updatedAt desc', async () => {
    await store.createConversation('user-1', 'Conv A');
    await new Promise((r) => setTimeout(r, 10));
    await store.createConversation('user-2', 'Conv B');
    await new Promise((r) => setTimeout(r, 10));
    const convC = await store.createConversation('user-1', 'Conv C');

    const user1List = await store.listConversations('user-1');
    const user2List = await store.listConversations('user-2');

    expect(user1List).toHaveLength(2);
    expect(user2List).toHaveLength(1);
    // Most recent first
    expect(user1List[0].id).toBe(convC.id);
    // Should not include messages or plans
    expect(user1List[0]).not.toHaveProperty('messages');
    expect(user1List[0]).not.toHaveProperty('plans');
  });
});

describe('getConversation', () => {
  it('returns null for wrong userId', async () => {
    const conv = await store.createConversation('user-1', 'Test');
    const result = await store.getConversation(conv.id, 'user-2');
    expect(result).toBeNull();
  });

  it('returns full document for correct userId', async () => {
    const conv = await store.createConversation('user-1', 'Test');
    const result = await store.getConversation(conv.id, 'user-1');

    expect(result).not.toBeNull();
    expect(result.id).toBe(conv.id);
    expect(result.userId).toBe('user-1');
    expect(result.messages).toEqual([]);
    expect(result.plans).toEqual([]);
  });

  it('returns null for non-existent id', async () => {
    const result = await store.getConversation('nonexistent', 'user-1');
    expect(result).toBeNull();
  });
});

describe('appendMessage', () => {
  it('adds message atomically and updates updatedAt', async () => {
    const conv = await store.createConversation('user-1', 'Test');
    const originalUpdatedAt = conv.updatedAt;

    await new Promise((r) => setTimeout(r, 10));
    const msg = { role: 'user', content: 'Hello' };
    const result = await store.appendMessage(conv.id, msg);

    expect(result.role).toBe('user');
    expect(result.content).toBe('Hello');
    expect(result.timestamp).toBeDefined();

    const updated = await store.getConversation(conv.id, 'user-1');
    expect(updated.messages).toHaveLength(1);
    expect(updated.messages[0].content).toBe('Hello');
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
      new Date(originalUpdatedAt).getTime()
    );
  });

  it('preserves message order', async () => {
    const conv = await store.createConversation('user-1', 'Test');
    await store.appendMessage(conv.id, { role: 'user', content: 'First' });
    await store.appendMessage(conv.id, { role: 'assistant', content: 'Second' });
    await store.appendMessage(conv.id, { role: 'user', content: 'Third' });

    const updated = await store.getConversation(conv.id, 'user-1');
    expect(updated.messages.map((m) => m.content)).toEqual(['First', 'Second', 'Third']);
  });

  it('throws for non-existent conversation', async () => {
    await expect(
      store.appendMessage('nonexistent', { role: 'user', content: 'Hello' })
    ).rejects.toThrow('Conversation nonexistent not found');
  });
});

describe('deleteConversation', () => {
  it('returns true for own conversation', async () => {
    const conv = await store.createConversation('user-1', 'Test');
    const result = await store.deleteConversation(conv.id, 'user-1');
    expect(result).toBe(true);

    const check = await store.getConversation(conv.id, 'user-1');
    expect(check).toBeNull();
  });

  it("returns false for other user's conversation", async () => {
    const conv = await store.createConversation('user-1', 'Test');
    const result = await store.deleteConversation(conv.id, 'user-2');
    expect(result).toBe(false);
  });
});

describe('setCompactedAt', () => {
  it('sets the compactedAt timestamp', async () => {
    const conv = await store.createConversation('user-1', 'Test');
    expect(conv.compactedAt).toBeNull();

    await store.setCompactedAt(conv.id);

    const updated = await store.getConversation(conv.id, 'user-1');
    expect(updated.compactedAt).toBeDefined();
    expect(new Date(updated.compactedAt).getTime()).toBeGreaterThan(0);
  });
});

describe('savePlanState', () => {
  it('replaces plans array', async () => {
    const conv = await store.createConversation('user-1', 'Test');
    const plans = [{ planId: 'p1', title: 'Plan 1', steps: [] }];
    await store.savePlanState(conv.id, plans);

    const updated = await store.getConversation(conv.id, 'user-1');
    expect(updated.plans).toEqual(plans);
  });
});

describe('searchConversations', () => {
  it('returns matching results with snippets ≤ 200 chars', async () => {
    const conv = await store.createConversation('user-1', 'Test');
    await store.appendMessage(conv.id, {
      role: 'user',
      content: 'The quick brown fox jumps over the lazy dog',
    });

    const results = await store.searchConversations('user-1', 'brown fox', 10);
    expect(results).toHaveLength(1);
    expect(results[0].conversationId).toBe(conv.id);
    expect(results[0].snippet).toContain('brown fox');
    expect(results[0].snippet.length).toBeLessThanOrEqual(200);
  });

  it('returns empty for empty query', async () => {
    const conv = await store.createConversation('user-1', 'Test');
    await store.appendMessage(conv.id, { role: 'user', content: 'Hello world' });

    const results = await store.searchConversations('user-1', '', 10);
    expect(results).toEqual([]);
  });

  it('is case-insensitive', async () => {
    const conv = await store.createConversation('user-1', 'Test');
    await store.appendMessage(conv.id, { role: 'user', content: 'Hello World' });

    const lower = await store.searchConversations('user-1', 'hello world', 10);
    const upper = await store.searchConversations('user-1', 'HELLO WORLD', 10);

    expect(lower).toHaveLength(1);
    expect(upper).toHaveLength(1);
    expect(lower[0].conversationId).toBe(upper[0].conversationId);
  });

  it('scopes results to the given userId', async () => {
    const conv1 = await store.createConversation('user-1', 'Test');
    await store.appendMessage(conv1.id, { role: 'user', content: 'shared keyword' });

    const conv2 = await store.createConversation('user-2', 'Test');
    await store.appendMessage(conv2.id, { role: 'user', content: 'shared keyword' });

    const results = await store.searchConversations('user-1', 'shared keyword', 10);
    expect(results).toHaveLength(1);
    expect(results[0].conversationId).toBe(conv1.id);
  });

  it('truncates snippet to 200 chars for long messages', async () => {
    const conv = await store.createConversation('user-1', 'Test');
    await store.appendMessage(conv.id, {
      role: 'user',
      content: 'keyword ' + 'x'.repeat(300),
    });

    const results = await store.searchConversations('user-1', 'keyword', 10);
    expect(results).toHaveLength(1);
    expect(results[0].snippet.length).toBeLessThanOrEqual(200);
  });
});
