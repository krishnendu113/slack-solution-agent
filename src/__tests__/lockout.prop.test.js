/**
 * lockout.prop.test.js — Property-based tests for src/lockout.js
 *
 * Uses fast-check to verify universal properties of the lockout manager.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { isLocked, applyFailedAttempt } from '../lockout.js';

// Feature: user-management, Property 8: Lockout state determined by timestamp comparison
describe('Property 8: Lockout state determined by timestamp comparison', () => {
  // **Validates: Requirements 6.3, 6.5**

  it('returns locked: true when lockedUntil is in the future relative to now', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2000-01-01'), max: new Date('2100-01-01') }),
        fc.integer({ min: 1, max: 365 * 24 * 60 * 60 * 1000 }), // 1ms to ~1 year offset
        (now, futureOffsetMs) => {
          const lockedUntil = new Date(now.getTime() + futureOffsetMs);
          const user = { lockedUntil: lockedUntil.toISOString() };

          const result = isLocked(user, now);

          expect(result.locked).toBe(true);
          expect(result.remainingMs).toBe(futureOffsetMs);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('returns locked: false when lockedUntil is in the past relative to now', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2000-01-01'), max: new Date('2100-01-01') }),
        fc.integer({ min: 1, max: 365 * 24 * 60 * 60 * 1000 }), // 1ms to ~1 year offset
        (now, pastOffsetMs) => {
          const lockedUntil = new Date(now.getTime() - pastOffsetMs);
          const user = { lockedUntil: lockedUntil.toISOString() };

          const result = isLocked(user, now);

          expect(result.locked).toBe(false);
          expect(result.remainingMs).toBe(0);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('returns locked: false when lockedUntil is null', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2000-01-01'), max: new Date('2100-01-01') }),
        (now) => {
          const user = { lockedUntil: null };

          const result = isLocked(user, now);

          expect(result.locked).toBe(false);
          expect(result.remainingMs).toBe(0);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('returns locked: false when lockedUntil equals now exactly', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2000-01-01'), max: new Date('2100-01-01') }),
        (now) => {
          const user = { lockedUntil: now.toISOString() };

          const result = isLocked(user, now);

          // When lockedUntil === now, remainingMs is 0, so locked should be false
          expect(result.locked).toBe(false);
          expect(result.remainingMs).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('remainingMs is always non-negative regardless of lockout state', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2000-01-01'), max: new Date('2100-01-01') }),
        fc.oneof(
          fc.constant(null),
          fc.date({ min: new Date('2000-01-01'), max: new Date('2100-01-01') }).map((d) => d.toISOString()),
        ),
        (now, lockedUntil) => {
          const user = { lockedUntil };

          const result = isLocked(user, now);

          expect(result.remainingMs).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 150 },
    );
  });
});

// Feature: user-management, Property 9: Failed login counter increments monotonically
describe('Property 9: Failed login counter increments monotonically', () => {
  // **Validates: Requirements 6.1**

  it('for any sequence of N consecutive failed attempts (N < threshold), failedLoginAttempts equals N', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }), // N < LOCKOUT_THRESHOLD (5)
        fc.date({ min: new Date('2000-01-01'), max: new Date('2100-01-01') }),
        (n, now) => {
          const config = { threshold: 5, durationMs: 15 * 60 * 1000 };
          let user = { failedLoginAttempts: 0, lockedUntil: null };

          for (let i = 1; i <= n; i++) {
            const result = applyFailedAttempt(user, config, now);
            expect(result.failedLoginAttempts).toBe(i);
            // Before reaching threshold, lockedUntil should remain null
            expect(result.lockedUntil).toBeNull();
            // Feed the result back as the next user state
            user = { ...user, ...result };
          }

          // After N attempts, the counter should equal N
          expect(user.failedLoginAttempts).toBe(n);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('counter increments by exactly 1 on each failed attempt', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3 }), // starting count (must stay below threshold after +1)
        fc.date({ min: new Date('2000-01-01'), max: new Date('2100-01-01') }),
        (startCount, now) => {
          const config = { threshold: 5, durationMs: 15 * 60 * 1000 };
          const user = { failedLoginAttempts: startCount, lockedUntil: null };

          const result = applyFailedAttempt(user, config, now);

          expect(result.failedLoginAttempts).toBe(startCount + 1);
        },
      ),
      { numRuns: 150 },
    );
  });
});
