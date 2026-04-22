/**
 * personaStore.test.js — Unit tests for src/stores/json/personaStore.js
 *
 * Tests the JSON-file persona store adapter against the PersonaStore interface.
 * Resets data/personas.json to clean state before each test.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as store from '../stores/json/personaStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '../../data/personas.json');

// Eagerly capture original file content before any test modifies it
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

describe('init', () => {
  it('starts with no personas after reset', () => {
    const result = store.getPersona('nonexistent');
    expect(result).toBeNull();
  });
});

describe('getPersona', () => {
  it('returns null for missing slugs', () => {
    const result = store.getPersona('no-such-client');
    expect(result).toBeNull();
  });

  it('retrieves a persona by exact slug', async () => {
    await store.upsertPersona('acme-corp', {
      displayName: 'Acme Corp',
      overview: 'A test client',
    });

    const persona = store.getPersona('acme-corp');
    expect(persona).not.toBeNull();
    expect(persona.slug).toBe('acme-corp');
    expect(persona.displayName).toBe('Acme Corp');
  });

  it('performs case-insensitive slug lookup', async () => {
    await store.upsertPersona('Acme-Corp', {
      displayName: 'Acme Corp',
      overview: 'A test client',
    });

    const lower = store.getPersona('acme-corp');
    expect(lower).not.toBeNull();
    expect(lower.displayName).toBe('Acme Corp');

    const upper = store.getPersona('ACME-CORP');
    expect(upper).not.toBeNull();
    expect(upper.displayName).toBe('Acme Corp');

    const mixed = store.getPersona('AcMe-CoRp');
    expect(mixed).not.toBeNull();
    expect(mixed.displayName).toBe('Acme Corp');
  });
});

describe('upsertPersona', () => {
  it('creates a new persona with all fields', async () => {
    const persona = await store.upsertPersona('test-client', {
      displayName: 'Test Client',
      overview: 'Overview text',
      modules: 'Loyalty, Engage',
      knownIssues: 'None',
    });

    expect(persona.slug).toBe('test-client');
    expect(persona.displayName).toBe('Test Client');
    expect(persona.overview).toBe('Overview text');
    expect(persona.modules).toBe('Loyalty, Engage');
    expect(persona.knownIssues).toBe('None');
    expect(persona.recentConversations).toEqual([]);
    expect(persona.updatedAt).toBeDefined();
  });

  it('provides default displayName from slug when not given', async () => {
    const persona = await store.upsertPersona('my-cool-client', {});
    expect(persona.displayName).toBe('My Cool Client');
  });

  it('provides empty string defaults for missing text fields', async () => {
    const persona = await store.upsertPersona('minimal', {});
    expect(persona.overview).toBe('');
    expect(persona.modules).toBe('');
    expect(persona.knownIssues).toBe('');
  });

  it('updates an existing persona by merging fields', async () => {
    await store.upsertPersona('acme-corp', {
      displayName: 'Acme Corp',
      overview: 'Original overview',
      modules: 'Loyalty',
    });

    const updated = await store.upsertPersona('acme-corp', {
      overview: 'Updated overview',
      knownIssues: 'Issue #1',
    });

    expect(updated.displayName).toBe('Acme Corp');
    expect(updated.overview).toBe('Updated overview');
    expect(updated.modules).toBe('Loyalty');
    expect(updated.knownIssues).toBe('Issue #1');
  });

  it('updates existing persona with case-insensitive slug match', async () => {
    await store.upsertPersona('acme-corp', {
      displayName: 'Acme Corp',
      overview: 'Original',
    });

    const updated = await store.upsertPersona('ACME-CORP', {
      overview: 'Updated via uppercase',
    });

    expect(updated.overview).toBe('Updated via uppercase');
    expect(updated.displayName).toBe('Acme Corp');

    // Should still be one persona, not two
    const found = store.getPersona('acme-corp');
    expect(found.overview).toBe('Updated via uppercase');
  });

  it('updates the updatedAt timestamp on upsert', async () => {
    const first = await store.upsertPersona('acme-corp', { overview: 'v1' });
    const firstTime = first.updatedAt;

    await new Promise(r => setTimeout(r, 10));
    const second = await store.upsertPersona('acme-corp', { overview: 'v2' });

    expect(new Date(second.updatedAt).getTime()).toBeGreaterThan(new Date(firstTime).getTime());
  });
});

describe('appendRecentConversation', () => {
  it('appends an entry to recentConversations', async () => {
    await store.upsertPersona('acme-corp', { displayName: 'Acme Corp' });

    await store.appendRecentConversation('acme-corp', {
      date: '2025-01-15',
      summary: 'Discussed loyalty module integration',
    });

    const persona = store.getPersona('acme-corp');
    expect(persona.recentConversations).toHaveLength(1);
    expect(persona.recentConversations[0].date).toBe('2025-01-15');
    expect(persona.recentConversations[0].summary).toBe('Discussed loyalty module integration');
  });

  it('preserves existing entries when appending', async () => {
    await store.upsertPersona('acme-corp', { displayName: 'Acme Corp' });

    await store.appendRecentConversation('acme-corp', {
      date: '2025-01-10',
      summary: 'First conversation',
    });
    await store.appendRecentConversation('acme-corp', {
      date: '2025-01-15',
      summary: 'Second conversation',
    });
    await store.appendRecentConversation('acme-corp', {
      date: '2025-01-20',
      summary: 'Third conversation',
    });

    const persona = store.getPersona('acme-corp');
    expect(persona.recentConversations).toHaveLength(3);
    expect(persona.recentConversations[0].summary).toBe('First conversation');
    expect(persona.recentConversations[1].summary).toBe('Second conversation');
    expect(persona.recentConversations[2].summary).toBe('Third conversation');
  });

  it('performs case-insensitive slug lookup for append', async () => {
    await store.upsertPersona('acme-corp', { displayName: 'Acme Corp' });

    await store.appendRecentConversation('ACME-CORP', {
      date: '2025-01-15',
      summary: 'Appended via uppercase slug',
    });

    const persona = store.getPersona('acme-corp');
    expect(persona.recentConversations).toHaveLength(1);
    expect(persona.recentConversations[0].summary).toBe('Appended via uppercase slug');
  });

  it('updates the updatedAt timestamp on append', async () => {
    await store.upsertPersona('acme-corp', { displayName: 'Acme Corp' });
    const before = store.getPersona('acme-corp').updatedAt;

    await new Promise(r => setTimeout(r, 10));
    await store.appendRecentConversation('acme-corp', {
      date: '2025-01-15',
      summary: 'New entry',
    });

    const after = store.getPersona('acme-corp').updatedAt;
    expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime());
  });

  it('throws for non-existent persona', async () => {
    await expect(
      store.appendRecentConversation('nonexistent', {
        date: '2025-01-15',
        summary: 'Should fail',
      })
    ).rejects.toThrow('Persona "nonexistent" not found');
  });
});

describe('persistence', () => {
  it('persists data to disk and survives re-init', async () => {
    await store.upsertPersona('persist-test', {
      displayName: 'Persist Test',
      overview: 'Should survive re-init',
    });
    await store._flush();

    // Re-init to simulate restart
    await store.init();

    const persona = store.getPersona('persist-test');
    expect(persona).not.toBeNull();
    expect(persona.displayName).toBe('Persist Test');
    expect(persona.overview).toBe('Should survive re-init');
  });
});
