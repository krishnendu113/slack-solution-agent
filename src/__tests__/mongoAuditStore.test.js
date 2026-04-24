/**
 * mongoAuditStore.test.js — Unit tests for src/stores/mongo/auditStore.js
 *
 * Tests appendEntry, listEntries with and without filters against MongoMemoryServer.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestMongo, getTestDb, stopTestMongo } from './mongoTestHelper.js';

let store;

beforeAll(async () => {
  await startTestMongo();
  store = await import('../stores/mongo/auditStore.js');
});

afterAll(async () => {
  await stopTestMongo();
});

beforeEach(async () => {
  const db = getTestDb();
  await db.collection('audit').deleteMany({});
});

describe('appendEntry', () => {
  it('inserts an entry', async () => {
    const entry = {
      id: 'audit-1',
      event: 'USER_CREATED',
      actor: 'admin@example.com',
      target: 'user@example.com',
      details: { role: 'user' },
      timestamp: '2024-01-01T00:00:00Z',
    };

    await store.appendEntry(entry);

    const entries = await store.listEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('audit-1');
    expect(entries[0].event).toBe('USER_CREATED');
    expect(entries[0].actor).toBe('admin@example.com');
  });
});

describe('listEntries', () => {
  const entries = [
    {
      id: 'a1',
      event: 'USER_CREATED',
      actor: 'admin@example.com',
      target: 'user1@example.com',
      details: null,
      timestamp: '2024-01-01T00:00:00Z',
    },
    {
      id: 'a2',
      event: 'LOGIN_FAILED',
      actor: 'user1@example.com',
      target: null,
      details: null,
      timestamp: '2024-01-02T00:00:00Z',
    },
    {
      id: 'a3',
      event: 'USER_CREATED',
      actor: 'admin@example.com',
      target: 'user2@example.com',
      details: null,
      timestamp: '2024-01-03T00:00:00Z',
    },
    {
      id: 'a4',
      event: 'LOGIN_SUCCESS',
      actor: 'user2@example.com',
      target: null,
      details: null,
      timestamp: '2024-01-04T00:00:00Z',
    },
  ];

  beforeEach(async () => {
    for (const entry of entries) {
      await store.appendEntry({ ...entry });
    }
  });

  it('returns all entries sorted by timestamp desc', async () => {
    const result = await store.listEntries();
    expect(result).toHaveLength(4);
    expect(result[0].id).toBe('a4');
    expect(result[3].id).toBe('a1');
  });

  it('with event filter returns only matching', async () => {
    const result = await store.listEntries({ event: 'USER_CREATED' });
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.event === 'USER_CREATED')).toBe(true);
  });

  it('with actor filter returns only matching', async () => {
    const result = await store.listEntries({ actor: 'admin@example.com' });
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.actor === 'admin@example.com')).toBe(true);
  });

  it('with combined filter uses AND logic', async () => {
    const result = await store.listEntries({
      event: 'USER_CREATED',
      actor: 'admin@example.com',
    });
    expect(result).toHaveLength(2);

    const result2 = await store.listEntries({
      event: 'LOGIN_FAILED',
      actor: 'user1@example.com',
    });
    expect(result2).toHaveLength(1);
    expect(result2[0].id).toBe('a2');
  });
});
