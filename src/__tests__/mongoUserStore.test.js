/**
 * mongoUserStore.test.js — Unit tests for src/stores/mongo/userStore.js
 *
 * Tests user CRUD, bcrypt hashing, duplicate email handling, case-insensitive
 * lookup, SSO upsert, and update/delete operations against MongoMemoryServer.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import bcrypt from 'bcrypt';
import { startTestMongo, getTestDb, stopTestMongo } from './mongoTestHelper.js';

let store;

beforeAll(async () => {
  await startTestMongo();
  store = await import('../stores/mongo/userStore.js');
});

afterAll(async () => {
  await stopTestMongo();
});

beforeEach(async () => {
  const db = getTestDb();
  await db.collection('users').deleteMany({});
});

describe('createUser', () => {
  it('hashes password correctly (bcrypt.compare returns true)', async () => {
    const user = await store.createUser({
      email: 'test@example.com',
      password: 'secret123',
    });

    expect(user.passwordHash).toBeDefined();
    expect(user.passwordHash).not.toBe('secret123');
    const match = await bcrypt.compare('secret123', user.passwordHash);
    expect(match).toBe(true);
  });

  it('sets passwordHash to null when password is null', async () => {
    const user = await store.createUser({
      email: 'sso@example.com',
      password: null,
    });

    expect(user.passwordHash).toBeNull();
  });

  it('throws "User already exists" for duplicate email', async () => {
    await store.createUser({ email: 'dup@example.com', password: 'pass1' });

    await expect(
      store.createUser({ email: 'dup@example.com', password: 'pass2' })
    ).rejects.toThrow('User already exists');
  });

  it('includes all expected fields', async () => {
    const user = await store.createUser({
      email: 'full@example.com',
      password: 'pass',
      role: 'admin',
      firstName: 'John',
      lastName: 'Doe',
      passwordType: 'permanent',
      mustChangePassword: true,
      createdBy: 'admin@example.com',
    });

    expect(user.id).toBeDefined();
    expect(user.firstName).toBe('John');
    expect(user.lastName).toBe('Doe');
    expect(user.email).toBe('full@example.com');
    expect(user.role).toBe('admin');
    expect(user.passwordType).toBe('permanent');
    expect(user.mustChangePassword).toBe(true);
    expect(user.failedLoginAttempts).toBe(0);
    expect(user.lockedUntil).toBeNull();
    expect(user.createdAt).toBeDefined();
    expect(user.lastPasswordChange).toBeNull();
    expect(user.createdBy).toBe('admin@example.com');
  });
});

describe('findUserByEmail', () => {
  it('is case-insensitive', async () => {
    await store.createUser({ email: 'CamelCase@Example.COM', password: 'pass' });

    const found = await store.findUserByEmail('camelcase@example.com');
    expect(found).not.toBeNull();
    expect(found.email).toBe('CamelCase@Example.COM');
  });

  it('returns null for non-existent email', async () => {
    const found = await store.findUserByEmail('nobody@example.com');
    expect(found).toBeNull();
  });
});

describe('findUserById', () => {
  it('returns user for valid id', async () => {
    const user = await store.createUser({ email: 'byid@example.com', password: 'pass' });
    const found = await store.findUserById(user.id);
    expect(found).not.toBeNull();
    expect(found.id).toBe(user.id);
  });

  it('returns null for non-existent id', async () => {
    const found = await store.findUserById('nonexistent-id');
    expect(found).toBeNull();
  });
});

describe('listUsers', () => {
  it('returns all users', async () => {
    await store.createUser({ email: 'a@example.com', password: 'pass' });
    await store.createUser({ email: 'b@example.com', password: 'pass' });
    await store.createUser({ email: 'c@example.com', password: 'pass' });

    const users = await store.listUsers();
    expect(users).toHaveLength(3);
  });
});

describe('updateUser', () => {
  it('merges fields and returns updated doc', async () => {
    const user = await store.createUser({
      email: 'update@example.com',
      password: 'pass',
      firstName: 'Old',
    });

    const updated = await store.updateUser(user.id, { firstName: 'New', role: 'admin' });
    expect(updated).not.toBeNull();
    expect(updated.firstName).toBe('New');
    expect(updated.role).toBe('admin');
    // Unchanged fields preserved
    expect(updated.email).toBe('update@example.com');
  });

  it('returns null for non-existent id', async () => {
    const result = await store.updateUser('nonexistent-id', { firstName: 'Test' });
    expect(result).toBeNull();
  });
});

describe('deleteUser', () => {
  it('returns true when user exists', async () => {
    const user = await store.createUser({ email: 'del@example.com', password: 'pass' });
    const result = await store.deleteUser(user.id);
    expect(result).toBe(true);

    const check = await store.findUserById(user.id);
    expect(check).toBeNull();
  });

  it('returns false for non-existent id', async () => {
    const result = await store.deleteUser('nonexistent-id');
    expect(result).toBe(false);
  });
});

describe('upsertSsoUser', () => {
  it('creates on first call', async () => {
    const user = await store.upsertSsoUser('sso@example.com');
    expect(user).not.toBeNull();
    expect(user.id).toBeDefined();
    expect(user.email).toBe('sso@example.com');
  });

  it('returns same user on second call', async () => {
    const first = await store.upsertSsoUser('sso2@example.com');
    const second = await store.upsertSsoUser('sso2@example.com');
    expect(first.id).toBe(second.id);
  });

  it('sets correct defaults', async () => {
    const user = await store.upsertSsoUser('ssodefaults@example.com');
    expect(user.passwordHash).toBeNull();
    expect(user.role).toBe('user');
    expect(user.mustChangePassword).toBe(false);
    expect(user.createdBy).toBe('sso');
    expect(user.failedLoginAttempts).toBe(0);
    expect(user.lockedUntil).toBeNull();
  });
});
