/**
 * personaStore.prop.test.js — Property-based tests for src/stores/json/personaStore.js
 *
 * Uses fast-check to verify universal properties of the persona store.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fc from 'fast-check';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as store from '../stores/json/personaStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '../../data/personas.json');

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

// Valid slug: lowercase alphanumeric with hyphens, starts and ends with alphanumeric
const arbSlug = fc.stringMatching(/^[a-z][a-z0-9-]{0,18}[a-z0-9]$/).filter(
  s => s.length >= 2 && !s.includes('--'),
);

const arbDisplayName = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0);

const arbText = fc.string({ minLength: 0, maxLength: 200 });

// Generate a date string like "2024-03-15"
const arbDateStr = fc
  .record({
    year: fc.integer({ min: 2020, max: 2030 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }),
  })
  .map(({ year, month, day }) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);

const arbRecentConversation = fc.record({
  date: arbDateStr,
  summary: fc.string({ minLength: 1, maxLength: 150 }).filter(s => s.trim().length > 0),
});

const arbRecentConversations = fc.array(arbRecentConversation, { minLength: 0, maxLength: 8 });

// Feature: platform-persistence-and-efficiency, Property 6: Persona store round-trip with case-insensitive lookup
describe('Property 6: Persona store round-trip with case-insensitive lookup', () => {
  // **Validates: Requirements 3.1, 3.2**
  it('upserting a persona and retrieving by slug with any casing variation returns the same document', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSlug,
        arbDisplayName,
        arbText,
        arbText,
        arbText,
        async (slug, displayName, overview, modules, knownIssues) => {
          await store._reset();

          // Upsert persona
          const created = await store.upsertPersona(slug, {
            displayName,
            overview,
            modules,
            knownIssues,
          });

          expect(created.slug).toBe(slug);
          expect(created.displayName).toBe(displayName);
          expect(created.overview).toBe(overview);
          expect(created.modules).toBe(modules);
          expect(created.knownIssues).toBe(knownIssues);

          // Retrieve with exact slug
          const foundExact = store.getPersona(slug);
          expect(foundExact).not.toBeNull();
          expect(foundExact.slug).toBe(slug);
          expect(foundExact.displayName).toBe(displayName);
          expect(foundExact.overview).toBe(overview);
          expect(foundExact.modules).toBe(modules);
          expect(foundExact.knownIssues).toBe(knownIssues);

          // Retrieve with uppercased slug
          const foundUpper = store.getPersona(slug.toUpperCase());
          expect(foundUpper).not.toBeNull();
          expect(foundUpper.slug).toBe(slug);
          expect(foundUpper.displayName).toBe(displayName);

          // Retrieve with mixed case
          const mixedCase = slug
            .split('')
            .map((ch, i) => (i % 2 === 0 ? ch.toUpperCase() : ch.toLowerCase()))
            .join('');
          const foundMixed = store.getPersona(mixedCase);
          expect(foundMixed).not.toBeNull();
          expect(foundMixed.slug).toBe(slug);
          expect(foundMixed.displayName).toBe(displayName);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: platform-persistence-and-efficiency, Property 7: Persona append preserves existing entries
describe('Property 7: Persona append preserves existing entries', () => {
  // **Validates: Requirements 3.4**
  it('appending a new entry to recentConversations results in N+1 entries with first N unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSlug,
        arbDisplayName,
        arbRecentConversations,
        arbRecentConversation,
        async (slug, displayName, existingEntries, newEntry) => {
          await store._reset();

          // Create persona with existing recentConversations
          await store.upsertPersona(slug, {
            displayName,
            recentConversations: existingEntries.map(e => ({ ...e })),
          });

          // Verify initial state
          const before = store.getPersona(slug);
          expect(before.recentConversations).toHaveLength(existingEntries.length);

          // Append new entry
          await store.appendRecentConversation(slug, { ...newEntry });

          // Retrieve and verify
          const after = store.getPersona(slug);
          expect(after.recentConversations).toHaveLength(existingEntries.length + 1);

          // First N entries are unchanged
          for (let i = 0; i < existingEntries.length; i++) {
            expect(after.recentConversations[i].date).toBe(existingEntries[i].date);
            expect(after.recentConversations[i].summary).toBe(existingEntries[i].summary);
          }

          // The (N+1)th entry matches the appended data
          const lastEntry = after.recentConversations[existingEntries.length];
          expect(lastEntry.date).toBe(newEntry.date);
          expect(lastEntry.summary).toBe(newEntry.summary);
        },
      ),
      { numRuns: 100 },
    );
  });
});
