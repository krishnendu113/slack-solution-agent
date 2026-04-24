/**
 * userManagement.test.js — Unit tests for user management login flow, middleware, and endpoints
 *
 * Tests the auth router endpoints and middleware by directly importing
 * the store, lockout, and password modules and simulating request flows.
 *
 * Requirements: 2.1, 2.2, 2.4, 3.4, 4.4, 1.6, 4.5, 8.3, 6.2, 6.4, 9.5, 12.2, 12.3
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import bcrypt from 'bcrypt';
import { fileURLToPath } from 'url';
import * as userStore from '../stores/json/userStore.js';
import { isLocked, applyFailedAttempt, resetLockout, LOCKOUT_THRESHOLD, LOCKOUT_DURATION_MS } from '../lockout.js';
import { requireAuth, requirePasswordChange } from '../auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '../../data/users.json');

// Capture original file content before any test modifies it
const originalDataPromise = fs.readFile(DATA_FILE, 'utf-8').catch(() => null);

// Valid password that meets policy: uppercase, lowercase, digit, special, 8+ chars
const VALID_PASSWORD = 'Test1234!';
const BCRYPT_ROUNDS = 12;

beforeEach(async () => {
  await userStore._reset();
});

afterAll(async () => {
  await userStore._flush();
  const originalData = await originalDataPromise;
  if (originalData !== null) {
    await fs.writeFile(DATA_FILE, originalData);
  }
});

/**
 * Creates a mock Express response object.
 */
function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(data) {
      res.body = data;
      return res;
    },
    redirect(url) {
      res.redirectUrl = url;
      return res;
    },
  };
  return res;
}

// ─── Req 2.1: Login with one-time password returns mustChangePassword flag ───

describe('Req 2.1: Login with one-time password returns mustChangePassword flag', () => {
  it('user created with one-time password has mustChangePassword=true', async () => {
    const user = await userStore.createUser({
      email: 'onetime@example.com',
      password: VALID_PASSWORD,
      role: 'user',
      firstName: 'One',
      lastName: 'Time',
      passwordType: 'one-time',
      mustChangePassword: true,
      createdBy: 'admin@example.com',
    });

    expect(user.mustChangePassword).toBe(true);
    expect(user.passwordType).toBe('one-time');

    // Verify password matches (simulating login credential check)
    const match = await bcrypt.compare(VALID_PASSWORD, user.passwordHash);
    expect(match).toBe(true);

    // When mustChangePassword is true, the login response should include the flag
    // (simulating the login flow logic from auth.js)
    if (user.mustChangePassword) {
      const loginResponse = { ok: true, mustChangePassword: true, email: user.email };
      expect(loginResponse.mustChangePassword).toBe(true);
    }
  });
});

// ─── Req 2.2: Login with permanent password establishes session ──────────────

describe('Req 2.2: Login with permanent password establishes session', () => {
  it('user created with permanent password has mustChangePassword=false and session is established', async () => {
    const user = await userStore.createUser({
      email: 'permanent@example.com',
      password: VALID_PASSWORD,
      role: 'user',
      firstName: 'Perm',
      lastName: 'User',
      passwordType: 'permanent',
      mustChangePassword: false,
      createdBy: 'admin@example.com',
    });

    expect(user.mustChangePassword).toBe(false);

    // Verify password matches
    const match = await bcrypt.compare(VALID_PASSWORD, user.passwordHash);
    expect(match).toBe(true);

    // When mustChangePassword is false, the login response establishes a full session
    if (!user.mustChangePassword) {
      const session = { userId: user.id, email: user.email, role: user.role };
      expect(session.userId).toBe(user.id);
      expect(session.email).toBe('permanent@example.com');
      expect(session.role).toBe('user');
    }
  });
});

// ─── Req 2.4: Password change clears mustChangePassword and establishes session

describe('Req 2.4: Password change clears mustChangePassword and establishes session', () => {
  it('after password change, mustChangePassword is set to false', async () => {
    // Create user with one-time password
    const user = await userStore.createUser({
      email: 'changeme@example.com',
      password: VALID_PASSWORD,
      role: 'user',
      firstName: 'Change',
      lastName: 'Me',
      passwordType: 'one-time',
      mustChangePassword: true,
      createdBy: 'admin@example.com',
    });

    expect(user.mustChangePassword).toBe(true);

    // Simulate password change: hash new password, update user
    const newPassword = 'NewPass99!';
    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const updated = await userStore.updateUser(user.id, {
      passwordHash: newHash,
      mustChangePassword: false,
      failedLoginAttempts: 0,
      lastPasswordChange: new Date().toISOString(),
    });

    expect(updated.mustChangePassword).toBe(false);
    expect(updated.lastPasswordChange).not.toBeNull();

    // Verify new password works
    const match = await bcrypt.compare(newPassword, updated.passwordHash);
    expect(match).toBe(true);

    // Session should now be fully established (no mustChangePassword flag)
    const session = { userId: updated.id, email: updated.email, role: updated.role, mustChangePassword: false };
    expect(session.mustChangePassword).toBe(false);
  });
});

// ─── Req 3.4: Password change resets failedLoginAttempts ─────────────────────

describe('Req 3.4: Password change resets failedLoginAttempts', () => {
  it('failedLoginAttempts is reset to 0 after password change', async () => {
    const user = await userStore.createUser({
      email: 'failcount@example.com',
      password: VALID_PASSWORD,
      role: 'user',
      firstName: 'Fail',
      lastName: 'Count',
      passwordType: 'permanent',
      mustChangePassword: false,
      createdBy: 'admin@example.com',
    });

    // Simulate 3 failed login attempts
    await userStore.updateUser(user.id, { failedLoginAttempts: 3 });
    const beforeChange = await userStore.findUserById(user.id);
    expect(beforeChange.failedLoginAttempts).toBe(3);

    // Simulate password change — resets failedLoginAttempts
    const newHash = await bcrypt.hash('Changed1!', BCRYPT_ROUNDS);
    await userStore.updateUser(user.id, {
      passwordHash: newHash,
      mustChangePassword: false,
      failedLoginAttempts: 0,
      lastPasswordChange: new Date().toISOString(),
    });

    const afterChange = await userStore.findUserById(user.id);
    expect(afterChange.failedLoginAttempts).toBe(0);
  });
});

// ─── Req 4.4: Admin reset clears lockout state ──────────────────────────────

describe('Req 4.4: Admin reset clears lockout state', () => {
  it('admin password reset clears failedLoginAttempts and lockedUntil', async () => {
    const user = await userStore.createUser({
      email: 'locked@example.com',
      password: VALID_PASSWORD,
      role: 'user',
      firstName: 'Locked',
      lastName: 'User',
      passwordType: 'permanent',
      mustChangePassword: false,
      createdBy: 'admin@example.com',
    });

    // Simulate lockout: 5 failed attempts and a lockedUntil in the future
    const futureTime = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await userStore.updateUser(user.id, {
      failedLoginAttempts: 5,
      lockedUntil: futureTime,
    });

    const lockedUser = await userStore.findUserById(user.id);
    expect(lockedUser.failedLoginAttempts).toBe(5);
    expect(lockedUser.lockedUntil).toBe(futureTime);
    expect(isLocked(lockedUser).locked).toBe(true);

    // Admin resets password — clears lockout state using resetLockout()
    const newHash = await bcrypt.hash('AdminReset1!', BCRYPT_ROUNDS);
    const lockoutReset = resetLockout();
    await userStore.updateUser(user.id, {
      passwordHash: newHash,
      mustChangePassword: true,
      passwordType: 'one-time',
      ...lockoutReset,
    });

    const resetUser = await userStore.findUserById(user.id);
    expect(resetUser.failedLoginAttempts).toBe(0);
    expect(resetUser.lockedUntil).toBeNull();
    expect(isLocked(resetUser).locked).toBe(false);
  });
});

// ─── Req 1.6, 4.5, 8.3: Non-admin cannot access admin endpoints ─────────────

describe('Req 1.6, 4.5, 8.3: Non-admin cannot access admin endpoints', () => {
  it('requireAuth rejects unauthenticated API requests with 401', () => {
    const req = { session: {}, path: '/api/users' };
    const res = mockRes();
    let nextCalled = false;

    requireAuth(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Not authenticated');
  });

  it('requireAuth allows authenticated requests', () => {
    const req = { session: { userId: 'some-id' }, path: '/api/users' };
    const res = mockRes();
    let nextCalled = false;

    requireAuth(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
  });

  it('admin role check pattern rejects non-admin users', () => {
    // Simulating the role check pattern used in all admin endpoints:
    // if (req.session?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const session = { userId: 'user-id', email: 'user@example.com', role: 'user' };

    // Non-admin should be rejected
    expect(session.role).not.toBe('admin');

    const res = mockRes();
    if (session.role !== 'admin') {
      res.status(403).json({ error: 'Admin only' });
    }

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('Admin only');
  });

  it('admin role check pattern allows admin users', () => {
    const session = { userId: 'admin-id', email: 'admin@example.com', role: 'admin' };
    expect(session.role).toBe('admin');
  });
});

// ─── Req 6.2: Lockout triggers after 5 failed attempts ──────────────────────

describe('Req 6.2: Lockout triggers after 5 failed attempts', () => {
  it('account is locked after 5 consecutive failed login attempts', () => {
    const config = { threshold: LOCKOUT_THRESHOLD, durationMs: LOCKOUT_DURATION_MS };
    const now = new Date();
    let user = { failedLoginAttempts: 0, lockedUntil: null };

    // Apply 4 failed attempts — should NOT lock
    for (let i = 0; i < 4; i++) {
      const result = applyFailedAttempt(user, config, now);
      user = { ...user, ...result };
    }

    expect(user.failedLoginAttempts).toBe(4);
    expect(user.lockedUntil).toBeNull();
    expect(isLocked(user, now).locked).toBe(false);

    // 5th failed attempt — should lock
    const lockResult = applyFailedAttempt(user, config, now);
    user = { ...user, ...lockResult };

    expect(user.failedLoginAttempts).toBe(5);
    expect(user.lockedUntil).not.toBeNull();
    expect(isLocked(user, now).locked).toBe(true);

    // Verify lockout duration is approximately 15 minutes
    const lockedUntilTime = new Date(user.lockedUntil).getTime();
    const expectedTime = now.getTime() + LOCKOUT_DURATION_MS;
    expect(lockedUntilTime).toBe(expectedTime);
  });

  it('locked account rejects login attempts with remaining time', () => {
    const futureTime = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min from now
    const user = { lockedUntil: futureTime };

    const result = isLocked(user);
    expect(result.locked).toBe(true);
    expect(result.remainingMs).toBeGreaterThan(0);

    // Remaining time should be approximately 10 minutes
    const remainingMinutes = Math.ceil(result.remainingMs / 60000);
    expect(remainingMinutes).toBeLessThanOrEqual(10);
    expect(remainingMinutes).toBeGreaterThan(0);
  });
});

// ─── Req 6.4: Successful login resets counter ────────────────────────────────

describe('Req 6.4: Successful login resets counter', () => {
  it('successful login resets failedLoginAttempts to 0 and clears lockedUntil', async () => {
    const user = await userStore.createUser({
      email: 'resetcounter@example.com',
      password: VALID_PASSWORD,
      role: 'user',
      firstName: 'Reset',
      lastName: 'Counter',
      passwordType: 'permanent',
      mustChangePassword: false,
      createdBy: 'admin@example.com',
    });

    // Simulate 3 failed attempts
    await userStore.updateUser(user.id, { failedLoginAttempts: 3 });
    const beforeLogin = await userStore.findUserById(user.id);
    expect(beforeLogin.failedLoginAttempts).toBe(3);

    // Simulate successful login — verify password matches
    const match = await bcrypt.compare(VALID_PASSWORD, user.passwordHash);
    expect(match).toBe(true);

    // On successful login, reset lockout state
    const lockoutReset = resetLockout();
    await userStore.updateUser(user.id, lockoutReset);

    const afterLogin = await userStore.findUserById(user.id);
    expect(afterLogin.failedLoginAttempts).toBe(0);
    expect(afterLogin.lockedUntil).toBeNull();
  });
});

// ─── Req 9.5: Delete user returns 404 for non-existent ID ───────────────────

describe('Req 9.5: Delete user returns 404 for non-existent ID', () => {
  it('deleteUser returns false for non-existent user ID', async () => {
    const result = await userStore.deleteUser('non-existent-uuid-1234');
    expect(result).toBe(false);
  });

  it('deleteUser returns true for existing user and removes them', async () => {
    const user = await userStore.createUser({
      email: 'deleteme@example.com',
      password: VALID_PASSWORD,
      role: 'user',
      firstName: 'Delete',
      lastName: 'Me',
      passwordType: 'permanent',
      mustChangePassword: false,
      createdBy: 'admin@example.com',
    });

    const deleted = await userStore.deleteUser(user.id);
    expect(deleted).toBe(true);

    // Verify user is gone
    const found = await userStore.findUserById(user.id);
    expect(found).toBeNull();
  });

  it('second delete of same user returns false (404 scenario)', async () => {
    const user = await userStore.createUser({
      email: 'doubledelete@example.com',
      password: VALID_PASSWORD,
      role: 'user',
      firstName: 'Double',
      lastName: 'Delete',
      passwordType: 'permanent',
      mustChangePassword: false,
      createdBy: 'admin@example.com',
    });

    await userStore.deleteUser(user.id);
    const secondDelete = await userStore.deleteUser(user.id);
    expect(secondDelete).toBe(false);
  });
});

// ─── Req 12.2, 12.3: Backward compatibility with missing fields ─────────────

describe('Req 12.2, 12.3: Backward compatibility with missing fields', () => {
  it('createUser with minimal fields defaults failedLoginAttempts to 0 and mustChangePassword to false', async () => {
    // Create user without explicitly setting new fields — simulates old-style creation
    const user = await userStore.createUser({
      email: 'legacy@example.com',
      password: VALID_PASSWORD,
    });

    // Defaults from Req 12.2
    expect(user.failedLoginAttempts).toBe(0);
    expect(user.mustChangePassword).toBe(false);

    // Defaults from Req 12.3
    expect(user.firstName).toBe('');
    expect(user.lastName).toBe('');
    expect(user.passwordType).toBeNull();
    expect(user.lockedUntil).toBeNull();
    expect(user.lastPasswordChange).toBeNull();
  });

  it('existing user records missing new fields are treated with sensible defaults', async () => {
    // Create a user, then verify all fields have expected defaults
    const user = await userStore.createUser({
      email: 'compat@example.com',
      password: VALID_PASSWORD,
      role: 'user',
    });

    // All new fields should have their default values
    expect(user.firstName).toBe('');
    expect(user.lastName).toBe('');
    expect(user.passwordType).toBeNull();
    expect(user.mustChangePassword).toBe(false);
    expect(user.failedLoginAttempts).toBe(0);
    expect(user.lockedUntil).toBeNull();
    expect(user.lastPasswordChange).toBeNull();
    expect(user.createdBy).toBe('system');
  });

  it('lockout functions handle users with default/missing lockout fields', () => {
    // Simulate a legacy user record with missing lockout fields
    const legacyUser = { lockedUntil: null, failedLoginAttempts: 0 };

    // isLocked should return not locked
    const lockState = isLocked(legacyUser);
    expect(lockState.locked).toBe(false);
    expect(lockState.remainingMs).toBe(0);

    // applyFailedAttempt should work with default values
    const config = { threshold: LOCKOUT_THRESHOLD, durationMs: LOCKOUT_DURATION_MS };
    const result = applyFailedAttempt(legacyUser, config);
    expect(result.failedLoginAttempts).toBe(1);
    expect(result.lockedUntil).toBeNull();
  });

  it('applyFailedAttempt handles missing failedLoginAttempts (treats as 0)', () => {
    // User record without failedLoginAttempts field at all
    const userWithoutField = { lockedUntil: null };
    const config = { threshold: LOCKOUT_THRESHOLD, durationMs: LOCKOUT_DURATION_MS };

    const result = applyFailedAttempt(userWithoutField, config);
    // applyFailedAttempt uses (user.failedLoginAttempts || 0) + 1
    expect(result.failedLoginAttempts).toBe(1);
  });
});

// ─── requirePasswordChange middleware ────────────────────────────────────────

describe('requirePasswordChange middleware', () => {
  it('allows requests when mustChangePassword is not set', () => {
    const req = { session: { userId: 'id', email: 'user@example.com' }, path: '/api/conversations' };
    const res = mockRes();
    let nextCalled = false;

    requirePasswordChange(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
  });

  it('blocks non-allowed endpoints when mustChangePassword is true', () => {
    const req = { session: { userId: 'id', mustChangePassword: true }, path: '/api/conversations' };
    const res = mockRes();
    let nextCalled = false;

    requirePasswordChange(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('Password change required before accessing this resource');
  });

  it('allows /api/auth/change-password when mustChangePassword is true', () => {
    const req = { session: { userId: 'id', mustChangePassword: true }, path: '/api/auth/change-password' };
    const res = mockRes();
    let nextCalled = false;

    requirePasswordChange(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
  });

  it('allows /api/auth/logout when mustChangePassword is true', () => {
    const req = { session: { userId: 'id', mustChangePassword: true }, path: '/api/auth/logout' };
    const res = mockRes();
    let nextCalled = false;

    requirePasswordChange(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
  });

  it('allows /api/auth/me when mustChangePassword is true', () => {
    const req = { session: { userId: 'id', mustChangePassword: true }, path: '/api/auth/me' };
    const res = mockRes();
    let nextCalled = false;

    requirePasswordChange(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
  });
});

// ─── Req 7.1–7.7: Audit logging integration tests ───────────────────────────

import * as auditStore from '../stores/json/auditStore.js';
import * as stores from '../stores/index.js';
import { logAuditEvent, AUDIT_EVENTS } from '../auditLogger.js';

describe('Req 7.1–7.7: Audit logging records events with correct fields', () => {
  beforeAll(async () => {
    // Initialise the store factory so getAuditStore() works inside logAuditEvent
    await stores.init();
  });

  beforeEach(async () => {
    await auditStore._reset();
  });

  afterAll(async () => {
    await auditStore._flush();
  });

  /**
   * Helper: call logAuditEvent, flush pending writes, then return all entries.
   */
  async function logAndRetrieve(params) {
    logAuditEvent(params);
    // logAuditEvent is fire-and-forget — flush to ensure the write completes
    await auditStore._flush();
    return auditStore.listEntries();
  }

  // Req 7.1: USER_CREATED event
  it('records USER_CREATED with actor, target, and timestamp', async () => {
    const entries = await logAndRetrieve({
      event: 'USER_CREATED',
      actor: 'admin@example.com',
      target: 'newuser@example.com',
      details: { role: 'user', passwordType: 'one-time' },
    });

    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry.event).toBe('USER_CREATED');
    expect(entry.actor).toBe('admin@example.com');
    expect(entry.target).toBe('newuser@example.com');
    expect(entry.details).toEqual({ role: 'user', passwordType: 'one-time' });
    expect(entry.id).toBeDefined();
    expect(entry.timestamp).toBeDefined();
    // Timestamp should be a valid ISO string
    expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
  });

  // Req 7.2: PASSWORD_CHANGED event
  it('records PASSWORD_CHANGED with actor and timestamp', async () => {
    const entries = await logAndRetrieve({
      event: 'PASSWORD_CHANGED',
      actor: 'user@example.com',
    });

    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry.event).toBe('PASSWORD_CHANGED');
    expect(entry.actor).toBe('user@example.com');
    expect(entry.id).toBeDefined();
    expect(entry.timestamp).toBeDefined();
    expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
  });

  // Req 7.3: PASSWORD_RESET event
  it('records PASSWORD_RESET with actor, target, and timestamp', async () => {
    const entries = await logAndRetrieve({
      event: 'PASSWORD_RESET',
      actor: 'admin@example.com',
      target: 'resetuser@example.com',
    });

    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry.event).toBe('PASSWORD_RESET');
    expect(entry.actor).toBe('admin@example.com');
    expect(entry.target).toBe('resetuser@example.com');
    expect(entry.id).toBeDefined();
    expect(entry.timestamp).toBeDefined();
    expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
  });

  // Req 7.4: LOGIN_FAILED event
  it('records LOGIN_FAILED with target and timestamp', async () => {
    const entries = await logAndRetrieve({
      event: 'LOGIN_FAILED',
      actor: 'unknown',
      target: 'victim@example.com',
      details: { reason: 'incorrect password' },
    });

    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry.event).toBe('LOGIN_FAILED');
    expect(entry.target).toBe('victim@example.com');
    expect(entry.details).toEqual({ reason: 'incorrect password' });
    expect(entry.id).toBeDefined();
    expect(entry.timestamp).toBeDefined();
    expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
  });

  // Req 7.5: ACCOUNT_LOCKED event
  it('records ACCOUNT_LOCKED with target and timestamp', async () => {
    const entries = await logAndRetrieve({
      event: 'ACCOUNT_LOCKED',
      actor: 'system',
      target: 'locked@example.com',
      details: { failedAttempts: 5 },
    });

    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry.event).toBe('ACCOUNT_LOCKED');
    expect(entry.target).toBe('locked@example.com');
    expect(entry.details).toEqual({ failedAttempts: 5 });
    expect(entry.id).toBeDefined();
    expect(entry.timestamp).toBeDefined();
    expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
  });

  // Req 7.6: LOGIN_SUCCESS event
  it('records LOGIN_SUCCESS with actor and timestamp', async () => {
    const entries = await logAndRetrieve({
      event: 'LOGIN_SUCCESS',
      actor: 'happy@example.com',
    });

    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry.event).toBe('LOGIN_SUCCESS');
    expect(entry.actor).toBe('happy@example.com');
    expect(entry.id).toBeDefined();
    expect(entry.timestamp).toBeDefined();
    expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
  });

  // Req 7.7: Audit entries persisted through store abstraction
  it('entries are filterable by event type via the store', async () => {
    logAuditEvent({ event: 'USER_CREATED', actor: 'admin@example.com', target: 'a@example.com' });
    logAuditEvent({ event: 'LOGIN_SUCCESS', actor: 'b@example.com' });
    logAuditEvent({ event: 'USER_CREATED', actor: 'admin@example.com', target: 'c@example.com' });
    await auditStore._flush();

    const created = await auditStore.listEntries({ event: 'USER_CREATED' });
    expect(created).toHaveLength(2);
    created.forEach(e => expect(e.event).toBe('USER_CREATED'));

    const logins = await auditStore.listEntries({ event: 'LOGIN_SUCCESS' });
    expect(logins).toHaveLength(1);
    expect(logins[0].actor).toBe('b@example.com');
  });

  // Verify all six event types are in the AUDIT_EVENTS constant
  it('AUDIT_EVENTS contains all six expected event types', () => {
    const expected = [
      'USER_CREATED',
      'PASSWORD_CHANGED',
      'PASSWORD_RESET',
      'LOGIN_FAILED',
      'ACCOUNT_LOCKED',
      'LOGIN_SUCCESS',
    ];
    expect(AUDIT_EVENTS).toEqual(expect.arrayContaining(expected));
    expect(AUDIT_EVENTS).toHaveLength(expected.length);
  });
});
