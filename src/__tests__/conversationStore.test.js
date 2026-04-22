/**
 * conversationStore.test.js — Unit tests for src/stores/json/conversationStore.js
 *
 * Tests the JSON-file conversation store adapter against the ConversationStore interface.
 * Replaces data/conversations.json with a clean state before each test.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as store from '../stores/json/conversationStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '../../data/conversations.json');

// Eagerly capture original file content before any test modifies it
const originalDataPromise = fs.readFile(DATA_FILE, 'utf-8').catch(() => null);

beforeEach(async () => {
  // Reset in-memory state and flush to disk
  await store._reset();
});

afterAll(async () => {
  // Restore original data
  await store._flush();
  const originalData = await originalDataPromise;
  if (originalData !== null) {
    await fs.writeFile(DATA_FILE, originalData);
  }
});

describe('init', () => {
  it('starts with empty conversations after clean init', () => {
    const convs = store.listConversations('user-1');
    expect(convs).toEqual([]);
  });
});

describe('createConversation', () => {
  it('creates a conversation with all required fields', async () => {
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
    const longMessage = 'A'.repeat(200);
    const conv = await store.createConversation('user-1', longMessage);
    expect(conv.title.length).toBe(80);
  });

  it('replaces newlines in title', async () => {
    const conv = await store.createConversation('user-1', 'Line one\nLine two');
    expect(conv.title).toBe('Line one Line two');
  });

  it('defaults title to "New conversation" for empty message', async () => {
    const conv = await store.createConversation('user-1', '');
    expect(conv.title).toBe('New conversation');
  });
});

describe('listConversations', () => {
  it('returns only conversations for the given userId', async () => {
    await store.createConversation('user-1', 'Conv A');
    await store.createConversation('user-2', 'Conv B');
    await store.createConversation('user-1', 'Conv C');

    const user1Convs = store.listConversations('user-1');
    const user2Convs = store.listConversations('user-2');

    expect(user1Convs).toHaveLength(2);
    expect(user2Convs).toHaveLength(1);
    expect(user1Convs.every(c => c.userId === 'user-1')).toBe(true);
    expect(user2Convs.every(c => c.userId === 'user-2')).toBe(true);
  });

  it('returns conversations sorted by updatedAt desc', async () => {
    const conv1 = await store.createConversation('user-1', 'First');
    await new Promise(r => setTimeout(r, 10));
    const conv2 = await store.createConversation('user-1', 'Second');

    const list = store.listConversations('user-1');
    expect(list[0].id).toBe(conv2.id);
    expect(list[1].id).toBe(conv1.id);
  });

  it('does not include messages in list results', async () => {
    const conv = await store.createConversation('user-1', 'Test');
    await store.appendMessage(conv.id, { role: 'user', content: 'Hello' });

    const list = store.listConversations('user-1');
    expect(list[0]).not.toHaveProperty('messages');
  });
});

describe('getConversation', () => {
  it('returns the full conversation for the correct userId', async () => {
    const conv = await store.createConversation('user-1', 'Test');
    const result = store.getConversation(conv.id, 'user-1');

    expect(result).not.toBeNull();
    expect(result.id).toBe(conv.id);
    expect(result.userId).toBe('user-1');
  });

  it('returns null for wrong userId', async () => {
    const conv = await store.createConversation('user-1', 'Test');
    const result = store.getConversation(conv.id, 'user-2');
    expect(result).toBeNull();
  });

  it('returns null for non-existent id', () => {
    const result = store.getConversation('nonexistent', 'user-1');
    expect(result).toBeNull();
  });
});

describe('appendMessage', () => {
  it('appends a message to the conversation', async () => {
    const conv = await store.createConversation('user-1', 'Test');
    const msg = { role: 'user', content: 'Hello' };
    const result = await store.appendMessage(conv.id, msg);

    expect(result.role).toBe('user');
    expect(result.content).toBe('Hello');
    expect(result.timestamp).toBeDefined();

    const updated = store.getConversation(conv.id, 'user-1');
    expect(updated.messages).toHaveLength(1);
    expect(updated.messages[0].content).toBe('Hello');
  });

  it('preserves message order', async () => {
    const conv = await store.createConversation('user-1', 'Test');
    await store.appendMessage(conv.id, { role: 'user', content: 'First' });
    await store.appendMessage(conv.id, { role: 'assistant', content: 'Second' });
    await store.appendMessage(conv.id, { role: 'user', content: 'Third' });

    const updated = store.getConversation(conv.id, 'user-1');
    expect(updated.messages.map(m => m.content)).toEqual(['First', 'Second', 'Third']);
  });

  it('throws for non-existent conversation', async () => {
    await expect(
      store.appendMessage('nonexistent', { role: 'user', content: 'Hello' })
    ).rejects.toThrow('Conversation nonexistent not found');
  });

  it('updates the updatedAt timestamp', async () => {
    const conv = await store.createConversation('user-1', 'Test');
    const originalUpdatedAt = conv.updatedAt;

    await new Promise(r => setTimeout(r, 10));
    await store.appendMessage(conv.id, { role: 'user', content: 'Hello' });

    const updated = store.getConversation(conv.id, 'user-1');
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(new Date(originalUpdatedAt).getTime());
  });
});

describe('deleteConversation', () => {
  it('deletes a conversation for the correct userId', async () => {
    const conv = await store.createConversation('user-1', 'Test');
    const result = await store.deleteConversation(conv.id, 'user-1');

    expect(result).toBe(true);
    expect(store.getConversation(conv.id, 'user-1')).toBeNull();
  });

  it('returns false for wrong userId', async () => {
    const conv = await store.createConversation('user-1', 'Test');
    const result = await store.deleteConversation(conv.id, 'user-2');

    expect(result).toBe(false);
    expect(store.getConversation(conv.id, 'user-1')).not.toBeNull();
  });

  it('returns false for non-existent conversation', async () => {
    const result = await store.deleteConversation('nonexistent', 'user-1');
    expect(result).toBe(false);
  });
});

describe('setCompactedAt', () => {
  it('sets compactedAt to current ISO timestamp', async () => {
    const conv = await store.createConversation('user-1', 'Test');
    expect(conv.compactedAt).toBeNull();

    await store.setCompactedAt(conv.id);

    const updated = store.getConversation(conv.id, 'user-1');
    expect(updated.compactedAt).toBeDefined();
    expect(new Date(updated.compactedAt).getTime()).toBeGreaterThan(0);
  });

  it('throws for non-existent conversation', async () => {
    await expect(store.setCompactedAt('nonexistent')).rejects.toThrow('Conversation nonexistent not found');
  });
});

describe('savePlanState', () => {
  it('replaces the plans array on the conversation', async () => {
    const conv = await store.createConversation('user-1', 'Test');
    expect(conv.plans).toEqual([]);

    const plans = [
      { planId: 'p1', title: 'Plan 1', steps: [{ description: 'Step 1', status: 'pending' }] },
    ];
    await store.savePlanState(conv.id, plans);

    const updated = store.getConversation(conv.id, 'user-1');
    expect(updated.plans).toEqual(plans);
  });

  it('replaces existing plans entirely', async () => {
    const conv = await store.createConversation('user-1', 'Test');

    await store.savePlanState(conv.id, [{ planId: 'p1', title: 'Old', steps: [] }]);
    await store.savePlanState(conv.id, [{ planId: 'p2', title: 'New', steps: [] }]);

    const updated = store.getConversation(conv.id, 'user-1');
    expect(updated.plans).toHaveLength(1);
    expect(updated.plans[0].planId).toBe('p2');
  });

  it('throws for non-existent conversation', async () => {
    await expect(store.savePlanState('nonexistent', [])).rejects.toThrow('Conversation nonexistent not found');
  });
});
