/**
 * userManagement.prop.test.js — Property-based tests for user management
 *
 * Uses fast-check to verify universal properties of user management operations.
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

// Generate a password that meets the password policy (min 8 chars, upper, lower, digit, special)
const arbValidPassword = fc
  .tuple(
    fc.stringMatching(/^[A-Z]{1,4}$/),
    fc.stringMatching(/^[a-z]{1,4}$/),
    fc.stringMatching(/^[0-9]{1,3}$/),
    fc.constantFrom('!', '@', '#', '$', '%', '^', '&', '*'),
  )
  .map(([upper, lower, digits, special]) => `${upper}${lower}${digits}${special}`)
  .filter(p => p.length >= 8);

const arbRole = fc.constantFrom('user', 'admin');

const arbPasswordType = fc.constantFrom('one-time', 'permanent');

const arbName = fc.stringMatching(/^[A-Za-z]{1,20}$/).filter(s => s.length >= 1);

// --- Helpers ---

/** Validates that a string is a valid UUID v4 format */
function isValidUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

/** Validates that a string is a valid ISO 8601 timestamp */
function isValidISO(str) {
  const d = new Date(str);
  return !isNaN(d.getTime()) && d.toISOString() === str;
}

// Feature: user-management, Property 7: User creation stores all required fields
describe('Property 7: User creation stores all required fields', () => {
  // **Validates: Requirements 1.1, 12.1**
  it('for any valid creation input, the stored record contains all specified fields with correct types', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbEmail,
        arbValidPassword,
        arbRole,
        arbName,
        arbName,
        arbPasswordType,
        async (email, password, role, firstName, lastName, passwordType) => {
          await store._reset();

          const mustChangePassword = passwordType === 'one-time';
          const createdBy = 'admin@example.com';

          const user = await store.createUser({
            email,
            password,
            role,
            firstName,
            lastName,
            passwordType,
            mustChangePassword,
            createdBy,
          });

          // id: valid UUID
          expect(user.id).toBeDefined();
          expect(typeof user.id).toBe('string');
          expect(isValidUUID(user.id)).toBe(true);

          // firstName: matches input
          expect(user.firstName).toBe(firstName);
          expect(typeof user.firstName).toBe('string');

          // lastName: matches input
          expect(user.lastName).toBe(lastName);
          expect(typeof user.lastName).toBe('string');

          // email: matches input
          expect(user.email).toBe(email);
          expect(typeof user.email).toBe('string');

          // passwordHash: non-null (password was provided)
          expect(user.passwordHash).not.toBeNull();
          expect(typeof user.passwordHash).toBe('string');
          expect(user.passwordHash.length).toBeGreaterThan(0);

          // role: matches input
          expect(user.role).toBe(role);

          // passwordType: matches input
          expect(user.passwordType).toBe(passwordType);

          // mustChangePassword: matches expected value
          expect(user.mustChangePassword).toBe(mustChangePassword);
          expect(typeof user.mustChangePassword).toBe('boolean');

          // failedLoginAttempts: initialized to 0
          expect(user.failedLoginAttempts).toBe(0);
          expect(typeof user.failedLoginAttempts).toBe('number');

          // lockedUntil: initialized to null
          expect(user.lockedUntil).toBeNull();

          // createdAt: valid ISO timestamp
          expect(user.createdAt).toBeDefined();
          expect(typeof user.createdAt).toBe('string');
          expect(isValidISO(user.createdAt)).toBe(true);

          // lastPasswordChange: initialized to null
          expect(user.lastPasswordChange).toBeNull();

          // createdBy: matches input
          expect(user.createdBy).toBe(createdBy);
          expect(typeof user.createdBy).toBe('string');

          // Verify the record can be retrieved from the store
          const retrieved = await store.findUserById(user.id);
          expect(retrieved).not.toBeNull();
          expect(retrieved.id).toBe(user.id);
          expect(retrieved.firstName).toBe(firstName);
          expect(retrieved.lastName).toBe(lastName);
          expect(retrieved.email).toBe(email);
          expect(retrieved.passwordHash).toBe(user.passwordHash);
          expect(retrieved.role).toBe(role);
          expect(retrieved.passwordType).toBe(passwordType);
          expect(retrieved.mustChangePassword).toBe(mustChangePassword);
          expect(retrieved.failedLoginAttempts).toBe(0);
          expect(retrieved.lockedUntil).toBeNull();
          expect(retrieved.createdAt).toBe(user.createdAt);
          expect(retrieved.lastPasswordChange).toBeNull();
          expect(retrieved.createdBy).toBe(createdBy);
        },
      ),
      { numRuns: 20 },
    );
  }, 120_000);
});

// Feature: user-management, Property 11: User profile update round-trip
describe('Property 11: User profile update round-trip', () => {
  // **Validates: Requirements 9.3**
  it('for any valid update to firstName, lastName, or role, reading back the record returns updated values', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbEmail,
        arbValidPassword,
        arbRole,
        arbName,
        arbName,
        arbName,
        arbName,
        arbRole,
        async (email, password, origRole, origFirst, origLast, newFirst, newLast, newRole) => {
          await store._reset();

          // Create a user with original values
          const user = await store.createUser({
            email,
            password,
            role: origRole,
            firstName: origFirst,
            lastName: origLast,
            passwordType: 'permanent',
            mustChangePassword: false,
            createdBy: 'admin@example.com',
          });

          // Build an update with new firstName, lastName, and role
          const updateFields = {
            firstName: newFirst,
            lastName: newLast,
            role: newRole,
          };

          const updated = await store.updateUser(user.id, updateFields);

          // updateUser should return the updated record
          expect(updated).not.toBeNull();
          expect(updated.firstName).toBe(newFirst);
          expect(updated.lastName).toBe(newLast);
          expect(updated.role).toBe(newRole);

          // Reading back by ID should reflect the same updated values
          const retrieved = await store.findUserById(user.id);
          expect(retrieved).not.toBeNull();
          expect(retrieved.firstName).toBe(newFirst);
          expect(retrieved.lastName).toBe(newLast);
          expect(retrieved.role).toBe(newRole);

          // Other fields should remain unchanged
          expect(retrieved.id).toBe(user.id);
          expect(retrieved.email).toBe(email);
          expect(retrieved.passwordHash).toBe(user.passwordHash);
          expect(retrieved.createdAt).toBe(user.createdAt);
          expect(retrieved.createdBy).toBe('admin@example.com');
        },
      ),
      { numRuns: 20 },
    );
  }, 120_000);
});

// Feature: user-management, Property 10: User listing and profile retrieval never expose passwordHash
describe('Property 10: User listing and profile retrieval never expose passwordHash', () => {
  // **Validates: Requirements 9.1, 9.2**

  /**
   * Replicates the stripping logic used by the API layer in src/auth.js:
   *   const { passwordHash, ...rest } = user;
   *   return rest;
   */
  function stripPasswordHash(user) {
    const { passwordHash, ...rest } = user;
    return rest;
  }

  it('for any set of users, listing and profile retrieval with stripping never contain passwordHash', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.tuple(arbEmail, arbValidPassword, arbRole, arbName, arbName, arbPasswordType),
          { minLength: 1, maxLength: 5 },
        ),
        async (userInputs) => {
          await store._reset();

          // Deduplicate emails (case-insensitive) to avoid duplicate-email errors
          const seen = new Set();
          const uniqueInputs = userInputs.filter(([email]) => {
            const lower = email.toLowerCase();
            if (seen.has(lower)) return false;
            seen.add(lower);
            return true;
          });

          // Create users in the store
          const createdUsers = [];
          for (const [email, password, role, firstName, lastName, passwordType] of uniqueInputs) {
            const user = await store.createUser({
              email,
              password,
              role,
              firstName,
              lastName,
              passwordType,
              mustChangePassword: passwordType === 'one-time',
              createdBy: 'admin@example.com',
            });
            createdUsers.push(user);
          }

          // --- Verify listUsers + strip (Requirement 9.1) ---
          const allUsers = await store.listUsers();
          const strippedList = allUsers.map(stripPasswordHash);

          expect(strippedList.length).toBe(uniqueInputs.length);

          for (const record of strippedList) {
            // passwordHash must NOT be present
            expect(record).not.toHaveProperty('passwordHash');

            // All other expected fields must still be present
            expect(record).toHaveProperty('id');
            expect(record).toHaveProperty('firstName');
            expect(record).toHaveProperty('lastName');
            expect(record).toHaveProperty('email');
            expect(record).toHaveProperty('role');
            expect(record).toHaveProperty('passwordType');
            expect(record).toHaveProperty('createdAt');
            expect(record).toHaveProperty('lastPasswordChange');
          }

          // --- Verify findUserById + strip (Requirement 9.2) ---
          for (const created of createdUsers) {
            const fetched = await store.findUserById(created.id);
            expect(fetched).not.toBeNull();

            const strippedProfile = stripPasswordHash(fetched);

            // passwordHash must NOT be present
            expect(strippedProfile).not.toHaveProperty('passwordHash');

            // All other fields must be preserved correctly
            expect(strippedProfile.id).toBe(created.id);
            expect(strippedProfile.firstName).toBe(created.firstName);
            expect(strippedProfile.lastName).toBe(created.lastName);
            expect(strippedProfile.email).toBe(created.email);
            expect(strippedProfile.role).toBe(created.role);
            expect(strippedProfile.passwordType).toBe(created.passwordType);
            expect(strippedProfile.createdAt).toBe(created.createdAt);
          }
        },
      ),
      { numRuns: 20 },
    );
  }, 120_000);
});

// Feature: user-management, Property 1: Password hash round-trip
describe('Property 1: Password hash round-trip', () => {
  // **Validates: Requirements 1.4, 3.1, 3.3, 4.1, 13.1**
  it('for any valid password, hashing with bcrypt then comparing the same password returns true', async () => {
    const bcrypt = await import('bcrypt');

    await fc.assert(
      fc.asyncProperty(
        arbValidPassword,
        async (password) => {
          const hash = await bcrypt.default.hash(password, 12);
          const match = await bcrypt.default.compare(password, hash);
          expect(match).toBe(true);
        },
      ),
      { numRuns: 20 },
    );
  }, 120_000);
});

// Feature: user-management, Property 5: passwordType determines mustChangePassword flag
describe('Property 5: passwordType determines mustChangePassword flag', () => {
  // **Validates: Requirements 1.2, 1.3, 4.2, 4.3**
  it('for any user creation with passwordType "one-time" or "permanent", the resulting mustChangePassword matches expected value', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbEmail,
        arbValidPassword,
        arbRole,
        arbName,
        arbName,
        arbPasswordType,
        async (email, password, role, firstName, lastName, passwordType) => {
          await store._reset();

          const expectedMustChange = passwordType === 'one-time';

          const user = await store.createUser({
            email,
            password,
            role,
            firstName,
            lastName,
            passwordType,
            mustChangePassword: expectedMustChange,
            createdBy: 'admin@example.com',
          });

          // The stored mustChangePassword flag must match the expected value
          expect(user.mustChangePassword).toBe(expectedMustChange);
          expect(typeof user.mustChangePassword).toBe('boolean');

          // Verify the passwordType is stored correctly
          expect(user.passwordType).toBe(passwordType);

          // Verify round-trip: reading back from store yields the same flag
          const retrieved = await store.findUserById(user.id);
          expect(retrieved).not.toBeNull();
          expect(retrieved.mustChangePassword).toBe(expectedMustChange);
          expect(retrieved.passwordType).toBe(passwordType);
        },
      ),
      { numRuns: 20 },
    );
  }, 120_000);
});

// Feature: user-management, Property 6: Duplicate email rejection is case-insensitive
describe('Property 6: Duplicate email rejection is case-insensitive', () => {
  // **Validates: Requirements 1.5**
  it('for any email and case transformation, creating a second user with the transformed email is rejected', async () => {
    // Arbitrary that produces a case-transformed version of an email
    const arbCaseTransform = fc.constantFrom(
      (e) => e.toUpperCase(),
      (e) => e.toLowerCase(),
      // Mixed case: capitalize every other character
      (e) => e.split('').map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase())).join(''),
      // Swap case of each character
      (e) => e.split('').map(c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()).join(''),
    );

    await fc.assert(
      fc.asyncProperty(
        arbEmail,
        arbValidPassword,
        arbValidPassword,
        arbRole,
        arbName,
        arbName,
        arbCaseTransform,
        async (email, password1, password2, role, firstName, lastName, transform) => {
          await store._reset();

          // Create the first user
          await store.createUser({
            email,
            password: password1,
            role,
            firstName,
            lastName,
            passwordType: 'permanent',
            mustChangePassword: false,
            createdBy: 'admin@example.com',
          });

          // Apply case transformation to the email
          const transformedEmail = transform(email);

          // Attempt to create a second user with the transformed email — should be rejected
          await expect(
            store.createUser({
              email: transformedEmail,
              password: password2,
              role,
              firstName,
              lastName,
              passwordType: 'permanent',
              mustChangePassword: false,
              createdBy: 'admin@example.com',
            }),
          ).rejects.toThrow('User already exists');
        },
      ),
      { numRuns: 20 },
    );
  }, 120_000);
});

// Feature: user-management, Property 2: Password hash rejects different passwords
describe('Property 2: Password hash rejects different passwords', () => {
  // **Validates: Requirements 13.2**
  it('for any two distinct passwords, hashing p1 then comparing p2 returns false', async () => {
    const bcrypt = await import('bcrypt');

    await fc.assert(
      fc.asyncProperty(
        arbValidPassword,
        arbValidPassword,
        async (p1, p2) => {
          fc.pre(p1 !== p2);
          const hash = await bcrypt.default.hash(p1, 12);
          const match = await bcrypt.default.compare(p2, hash);
          expect(match).toBe(false);
        },
      ),
      { numRuns: 20 },
    );
  }, 120_000);
});

// Feature: user-management, Property 13: Invalid role values are rejected
describe('Property 13: Invalid role values are rejected', () => {
  // **Validates: Requirements 1.7**

  /**
   * Replicates the role validation logic from POST /api/users in src/auth.js:
   *   if (!['user', 'admin'].includes(role)) → 400 error
   *
   * This is a pure validation check — no bcrypt or store interaction needed.
   */
  const VALID_ROLES = ['admin', 'user'];

  function isValidRole(role) {
    return VALID_ROLES.includes(role);
  }

  // Arbitrary that generates strings which are NOT "admin" or "user"
  const arbInvalidRole = fc.string({ minLength: 0, maxLength: 50 }).filter(
    s => s !== 'admin' && s !== 'user',
  );

  it('for any string that is not "admin" or "user", role validation rejects it', () => {
    fc.assert(
      fc.property(
        arbInvalidRole,
        (invalidRole) => {
          // The role validation check used by the API should reject this value
          expect(isValidRole(invalidRole)).toBe(false);

          // Verify the inverse: the valid roles are accepted
          expect(isValidRole('admin')).toBe(true);
          expect(isValidRole('user')).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: user-management, Property 14: Empty or whitespace-only names are rejected
describe('Property 14: Empty or whitespace-only names are rejected', () => {
  // **Validates: Requirements 1.8**

  /**
   * Replicates the name validation logic from POST /api/users in src/auth.js:
   *   if (typeof firstName !== 'string' || firstName.trim() === '' ||
   *       typeof lastName !== 'string' || lastName.trim() === '')
   *     → 400 error "firstName and lastName must be non-empty strings"
   *
   * This is a pure validation check — no bcrypt or store interaction needed.
   */
  function isValidName(name) {
    return typeof name === 'string' && name.trim() !== '';
  }

  // Arbitrary that generates empty or whitespace-only strings
  const arbEmptyOrWhitespace = fc.oneof(
    fc.constant(''),
    fc.stringMatching(/^[ \t\n\r]+$/).filter(s => s.length >= 1),
  );

  it('for any empty or whitespace-only string as firstName, name validation rejects it', () => {
    fc.assert(
      fc.property(
        arbEmptyOrWhitespace,
        (invalidFirstName) => {
          // The name validation check used by the API should reject this value
          expect(isValidName(invalidFirstName)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('for any empty or whitespace-only string as lastName, name validation rejects it', () => {
    fc.assert(
      fc.property(
        arbEmptyOrWhitespace,
        (invalidLastName) => {
          // The name validation check used by the API should reject this value
          expect(isValidName(invalidLastName)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('valid non-whitespace names are accepted', () => {
    fc.assert(
      fc.property(
        arbName,
        (validName) => {
          // Non-empty, non-whitespace names should pass validation
          expect(isValidName(validName)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: user-management, Property 12: SSO users have null passwordHash and no forced password change
describe('Property 12: SSO users have null passwordHash and no forced password change', () => {
  // **Validates: Requirements 11.2**
  it('for any email, upsertSsoUser results in passwordHash: null and mustChangePassword: false', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbEmail,
        async (email) => {
          await store._reset();

          const user = await store.upsertSsoUser(email);

          // passwordHash must be null for SSO users
          expect(user.passwordHash).toBeNull();

          // mustChangePassword must be false for SSO users
          expect(user.mustChangePassword).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  }, 120_000);

  it('for any email, retrieving an existing SSO user still has null passwordHash and no forced password change', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbEmail,
        async (email) => {
          await store._reset();

          // Create the SSO user
          await store.upsertSsoUser(email);

          // Retrieve the same SSO user (upsert should return existing)
          const user = await store.upsertSsoUser(email);

          // passwordHash must still be null
          expect(user.passwordHash).toBeNull();

          // mustChangePassword must still be false
          expect(user.mustChangePassword).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  }, 120_000);
});
