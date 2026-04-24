/**
 * passwordPolicy.prop.test.js — Property-based tests for src/passwordPolicy.js
 *
 * Uses fast-check to verify universal properties of the password policy validator.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validatePassword } from '../passwordPolicy.js';

// --- Violation messages (must match the implementation) ---
const VIOLATION_MIN_LENGTH = 'Password must be at least 8 characters';
const VIOLATION_UPPERCASE = 'Password must contain at least one uppercase letter';
const VIOLATION_LOWERCASE = 'Password must contain at least one lowercase letter';
const VIOLATION_DIGIT = 'Password must contain at least one digit';
const VIOLATION_SPECIAL = 'Password must contain at least one special character';

/**
 * Independently check each rule against a string.
 * Returns the set of expected violations.
 */
function expectedViolations(password) {
  const violations = [];
  if (typeof password !== 'string' || password.length < 8) {
    violations.push(VIOLATION_MIN_LENGTH);
  }
  if (typeof password !== 'string' || !/[A-Z]/.test(password)) {
    violations.push(VIOLATION_UPPERCASE);
  }
  if (typeof password !== 'string' || !/[a-z]/.test(password)) {
    violations.push(VIOLATION_LOWERCASE);
  }
  if (typeof password !== 'string' || !/[0-9]/.test(password)) {
    violations.push(VIOLATION_DIGIT);
  }
  if (typeof password !== 'string' || !/[^A-Za-z0-9]/.test(password)) {
    violations.push(VIOLATION_SPECIAL);
  }
  return violations;
}

// Feature: user-management, Property 3: Password policy validation correctness
describe('Property 3: Password policy validation correctness', () => {
  // **Validates: Requirements 5.1, 5.2**

  it('for any string, validatePassword returns valid: true iff all five rules are met, and violations lists exactly the unmet rules', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 100 }), (password) => {
        const result = validatePassword(password);
        const expected = expectedViolations(password);

        // valid is true iff there are no violations
        expect(result.valid).toBe(expected.length === 0);

        // violations match exactly
        expect(result.violations).toEqual(expected);
      }),
      { numRuns: 200 },
    );
  });

  it('passwords meeting all five rules are always valid', () => {
    // Generate passwords that are guaranteed to satisfy all rules
    const arbValidPassword = fc
      .tuple(
        fc.stringMatching(/^[A-Z]$/),           // at least one uppercase
        fc.stringMatching(/^[a-z]$/),           // at least one lowercase
        fc.stringMatching(/^[0-9]$/),           // at least one digit
        fc.stringMatching(/^[!@#$%^&*]$/),      // at least one special char
        fc.string({ minLength: 4, maxLength: 50 }), // padding to reach >= 8 chars
      )
      .map(([upper, lower, digit, special, padding]) => upper + lower + digit + special + padding);

    fc.assert(
      fc.property(arbValidPassword, (password) => {
        const result = validatePassword(password);
        // A password with all required character types and length >= 8 must be valid
        if (password.length >= 8) {
          expect(result.valid).toBe(true);
          expect(result.violations).toEqual([]);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('passwords missing exactly one rule report exactly that violation', () => {
    // Generate a base valid password, then remove one character class to test single-violation detection
    const arbBaseComponents = fc.tuple(
      fc.stringMatching(/^[A-Z]{2}$/),
      fc.stringMatching(/^[a-z]{2}$/),
      fc.stringMatching(/^[0-9]{2}$/),
      fc.stringMatching(/^[!@#$%^&*]{2}$/),
    );

    // Missing uppercase: only lowercase + digit + special
    fc.assert(
      fc.property(arbBaseComponents, ([, lower, digit, special]) => {
        const password = lower + digit + special + 'ab'; // pad to 8+ chars, no uppercase
        const result = validatePassword(password);
        const expected = expectedViolations(password);
        expect(result.valid).toBe(expected.length === 0);
        expect(result.violations).toEqual(expected);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: user-management, Property 4: Password policy validation idempotence
describe('Property 4: Password policy validation idempotence', () => {
  // **Validates: Requirements 13.3**

  it('for any string, calling validatePassword multiple times produces identical results', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 100 }), (password) => {
        const result1 = validatePassword(password);
        const result2 = validatePassword(password);
        const result3 = validatePassword(password);

        // valid boolean must be identical across all calls
        expect(result2.valid).toBe(result1.valid);
        expect(result3.valid).toBe(result1.valid);

        // violations array must be identical across all calls
        expect(result2.violations).toEqual(result1.violations);
        expect(result3.violations).toEqual(result1.violations);
      }),
      { numRuns: 150 },
    );
  });
});
