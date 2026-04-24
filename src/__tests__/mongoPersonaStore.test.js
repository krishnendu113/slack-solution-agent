/**
 * mongoPersonaStore.test.js — Unit tests for src/stores/mongo/personaStore.js
 *
 * Tests persona CRUD, case-insensitive slug lookup, upsert semantics,
 * and appendRecentConversation against MongoMemoryServer.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestMongo, getTestDb, stopTestMongo } from './mongoTestHelper.js';

let store;

beforeAll(async () => {
  await startTestMongo();
  store = await import('../stores/mongo/personaStore.js');
});

afterAll(async () => {
  await stopTestMongo();
});

beforeEach(async () => {
  const db = getTestDb();
  await db.collection('personas').deleteMany({});
});

describe('getPersona', () => {
  it('returns null for non-existent slug', async () => {
    const result = await store.getPersona('nonexistent');
    expect(result).toBeNull();
  });

  it('is case-insensitive', async () => {
    await store.upsertPersona('My-Client', { displayName: 'My Client' });

    const lower = await store.getPersona('my-client');
    const upper = await store.getPersona('MY-CLIENT');
    const mixed = await store.getPersona('My-Client');

    expect(lower).not.toBeNull();
    expect(upper).not.toBeNull();
    expect(mixed).not.toBeNull();
    expect(lower.displayName).toBe('My Client');
  });
});

describe('upsertPersona', () => {
  it('creates with defaults on first call', async () => {
    const persona = await store.upsertPersona('new-client', {
      displayName: 'New Client',
    });

    expect(persona).not.toBeNull();
    expect(persona.slug).toBe('new-client');
    expect(persona.displayName).toBe('New Client');
    expect(persona.overview).toBe('');
    expect(persona.modules).toBe('');
    expect(persona.knownIssues).toBe('');
    expect(persona.recentConversations).toEqual([]);
    expect(persona.updatedAt).toBeDefined();
  });

  it('merges fields on second call', async () => {
    await store.upsertPersona('merge-client', { displayName: 'Original' });
    const updated = await store.upsertPersona('merge-client', {
      overview: 'Updated overview',
    });

    expect(updated.displayName).toBe('Original');
    expect(updated.overview).toBe('Updated overview');
  });
});

describe('appendRecentConversation', () => {
  it('appends to existing persona', async () => {
    await store.upsertPersona('append-client', { displayName: 'Append Client' });

    const entry1 = { date: '2024-01-01T00:00:00Z', summary: 'First conversation' };
    const entry2 = { date: '2024-01-02T00:00:00Z', summary: 'Second conversation' };

    await store.appendRecentConversation('append-client', entry1);
    await store.appendRecentConversation('append-client', entry2);

    const persona = await store.getPersona('append-client');
    expect(persona.recentConversations).toHaveLength(2);
    expect(persona.recentConversations[0]).toEqual(entry1);
    expect(persona.recentConversations[1]).toEqual(entry2);
  });

  it('throws for non-existent persona', async () => {
    await expect(
      store.appendRecentConversation('nonexistent', {
        date: '2024-01-01T00:00:00Z',
        summary: 'Test',
      })
    ).rejects.toThrow('Persona "nonexistent" not found');
  });
});
