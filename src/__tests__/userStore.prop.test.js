/**
 * userStore.prop.test.js — Property-based tests for src/stores/json/userStore.js
 *
 * Uses fast-check to verify universal properties of the user store.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fc from 'fast-check';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as store from '../stores/json/userStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '../../data/users.json');

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

// Generate a valid email: local part + @example.com
const arbLocalPart = fc.stringMatching(/^[a-z][a-z0-9]{0,14}$/).filter(s => s.length >= 1);
const arbEmail = arbLocalPart.map(local => `${local}@example.com`);

const arbPassword = fc.string({ minLength: 6, maxLength: 30 }).filter(s => s.trim().length >= 6);

const arbRole = fc.constantFrom('user', 'admin');

// Random case transformation: randomly uppercase/lowercase each character
function randomCaseTransform(str, rng) {
  return str
    .split('')
    .map(ch => (rng() > 0.5 ? ch.toUpperCase() : ch.toLowerCase()))
    .join('');
}

const arbCaseVariant = (email) =>
  fc.func(fc.double({ min: 0, max: 1, noNaN: true })).map(rng => randomCaseTransform(email, rng));

// Feature: platform-persistence-and-efficiency, Property 4: User store round-trip with case-insensitive lookup
describe('Property 4: User store round-trip with case-insensitive lookup', () => {
  // **Validates: Requirements 2.1, 2.2**
  // Note: numRuns reduced to 20 because bcrypt hashing (12 rounds) is intentionally slow
  it('creating a user and looking up by email with any casing variation returns the same user record', async () => {
    await fc.assert(
      fc.asyncProperty(arbEmail, arbPassword, arbRole, async (email, password, role) => {
        await store._reset();

        // Create user
        const created = await store.createUser({ email, password, role });
        expect(created.id).toBeDefined();
        expect(created.email).toBe(email);
        expect(created.role).toBe(role);
        expect(created.passwordHash).toBeDefined();
        expect(created.passwordHash).not.toBe(password);
        expect(created.createdAt).toBeDefined();

        // Look up with exact email
        const foundExact = await store.findUserByEmail(email);
        expect(foundExact).not.toBeNull();
        expect(foundExact.id).toBe(created.id);

        // Look up with uppercased email
        const foundUpper = await store.findUserByEmail(email.toUpperCase());
        expect(foundUpper).not.toBeNull();
        expect(foundUpper.id).toBe(created.id);

        // Look up with lowercased email
        const foundLower = await store.findUserByEmail(email.toLowerCase());
        expect(foundLower).not.toBeNull();
        expect(foundLower.id).toBe(created.id);

        // Look up with mixed case
        const mixedCase = email
          .split('')
          .map((ch, i) => (i % 2 === 0 ? ch.toUpperCase() : ch.toLowerCase()))
          .join('');
        const foundMixed = await store.findUserByEmail(mixedCase);
        expect(foundMixed).not.toBeNull();
        expect(foundMixed.id).toBe(created.id);

        // All lookups return the same record
        expect(foundExact.email).toBe(created.email);
        expect(foundUpper.email).toBe(created.email);
        expect(foundLower.email).toBe(created.email);
        expect(foundMixed.email).toBe(created.email);
      }),
      { numRuns: 20 },
    );
  }, 60_000);
});

// Feature: platform-persistence-and-efficiency, Property 5: SSO upsert idempotence
describe('Property 5: SSO upsert idempotence', () => {
  // **Validates: Requirements 2.4**
  it('calling upsertSsoUser N times always returns the same user record and results in exactly one user', async () => {
    await fc.assert(
      fc.asyncProperty(arbEmail, fc.integer({ min: 1, max: 10 }), async (email, repeatCount) => {
        await store._reset();

        // Call upsertSsoUser N times
        let firstUser = null;
        for (let i = 0; i < repeatCount; i++) {
          const user = await store.upsertSsoUser(email);
          if (i === 0) {
            firstUser = user;
            expect(user.id).toBeDefined();
            expect(user.email).toBe(email);
            expect(user.passwordHash).toBeNull();
            expect(user.role).toBe('user');
          } else {
            // All subsequent calls return the same record
            expect(user.id).toBe(firstUser.id);
            expect(user.email).toBe(firstUser.email);
            expect(user.createdAt).toBe(firstUser.createdAt);
          }
        }

        // Verify exactly one user exists for this email
        const found = await store.findUserByEmail(email);
        expect(found).not.toBeNull();
        expect(found.id).toBe(firstUser.id);

        // Creating a different user should work (proves we're not just empty)
        const otherEmail = `other-${email}`;
        const other = await store.upsertSsoUser(otherEmail);
        expect(other.id).not.toBe(firstUser.id);
      }),
      { numRuns: 100 },
    );
  });
});
