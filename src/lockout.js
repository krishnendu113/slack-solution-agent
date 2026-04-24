/**
 * Lockout Manager
 *
 * Pure-function module for account lockout state management.
 * Provides functions to check lockout status, apply failed login attempts,
 * and reset lockout state.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */

/** Number of consecutive failed attempts before lockout triggers. */
export const LOCKOUT_THRESHOLD = 5;

/** Lockout duration in milliseconds (15 minutes). */
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

/**
 * Checks if a user account is currently locked.
 * @param {{ lockedUntil: string|null }} user
 * @param {Date} [now=new Date()]
 * @returns {{ locked: boolean, remainingMs: number }}
 */
export function isLocked(user, now = new Date()) {
  if (!user.lockedUntil) {
    return { locked: false, remainingMs: 0 };
  }

  const lockedUntilTime = new Date(user.lockedUntil).getTime();
  const nowTime = now.getTime();
  const remainingMs = lockedUntilTime - nowTime;

  if (remainingMs > 0) {
    return { locked: true, remainingMs };
  }

  return { locked: false, remainingMs: 0 };
}

/**
 * Computes the new lockout state after a failed login attempt.
 * Increments the failed attempt counter and sets lockedUntil when the
 * threshold is reached.
 * @param {{ failedLoginAttempts: number }} user
 * @param {{ threshold: number, durationMs: number }} config
 * @param {Date} [now=new Date()]
 * @returns {{ failedLoginAttempts: number, lockedUntil: string|null }}
 */
export function applyFailedAttempt(user, config, now = new Date()) {
  const failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;

  if (failedLoginAttempts >= config.threshold) {
    const lockedUntil = new Date(now.getTime() + config.durationMs).toISOString();
    return { failedLoginAttempts, lockedUntil };
  }

  return { failedLoginAttempts, lockedUntil: user.lockedUntil || null };
}

/**
 * Returns the reset state for a successful login or admin reset.
 * @returns {{ failedLoginAttempts: number, lockedUntil: null }}
 */
export function resetLockout() {
  return { failedLoginAttempts: 0, lockedUntil: null };
}
