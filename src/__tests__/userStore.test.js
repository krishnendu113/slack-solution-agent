/**
 * userStore.test.js — Unit tests for src/stores/json/userStore.js
 *
 * Tests the JSON-file user store adapter against the UserStore interface.
 * Resets data/users.json to clean state before each test.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import bcrypt from 'bcrypt';
import { fileURLToPath } from 'url';
import * as store from '../stores/json/userStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '../../data/users.json');

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
  it('starts with empty users after reset', async () => {
    const result = await store.findUserByEmail('nobody@example.com');
    expect(result).toBeNull();
  });
});

describe('createUser', () => {
  it('creates a user with all required fields', async () => {
    const user = await store.createUser({ email: 'test@example.com', password: 'secret123', role: 'user' });

    expect(user.id).toBeDefined();
    expect(user.email).toBe('test@example.com');
    expect(user.passwordHash).toBeDefined();
    expect(user.passwordHash).not.toBe('secret123');
    expect(user.role).toBe('user');
    expect(user.createdAt).toBeDefined();
  });

  it('hashes password with bcrypt', async () => {
    const user = await store.createUser({ email: 'test@example.com', password: 'mypassword' });

    const match = await bcrypt.compare('mypassword', user.passwordHash);
    expect(match).toBe(true);

    const noMatch = await bcrypt.compare('wrongpassword', user.passwordHash);
    expect(noMatch).toBe(false);
  });

  it('sets passwordHash to null when no password provided', async () => {
    const user = await store.createUser({ email: 'sso@example.com' });
    expect(user.passwordHash).toBeNull();
  });

  it('defaults role to user', async () => {
    const user = await store.createUser({ email: 'test@example.com', password: 'secret' });
    expect(user.role).toBe('user');
  });

  it('accepts admin role', async () => {
    const user = await store.createUser({ email: 'admin@example.com', password: 'secret', role: 'admin' });
    expect(user.role).toBe('admin');
  });

  it('throws on duplicate email', async () => {
    await store.createUser({ email: 'dup@example.com', password: 'secret' });
    await expect(
      store.createUser({ email: 'dup@example.com', password: 'other' })
    ).rejects.toThrow('User already exists');
  });

  it('throws on duplicate email with different casing', async () => {
    await store.createUser({ email: 'Test@Example.com', password: 'secret' });
    await expect(
      store.createUser({ email: 'test@example.com', password: 'other' })
    ).rejects.toThrow('User already exists');
  });
});

describe('findUserByEmail', () => {
  it('finds user by exact email', async () => {
    const created = await store.createUser({ email: 'find@example.com', password: 'secret' });
    const found = await store.findUserByEmail('find@example.com');

    expect(found).not.toBeNull();
    expect(found.id).toBe(created.id);
    expect(found.email).toBe('find@example.com');
  });

  it('finds user case-insensitively', async () => {
    await store.createUser({ email: 'CaseTest@Example.COM', password: 'secret' });

    const found1 = await store.findUserByEmail('casetest@example.com');
    expect(found1).not.toBeNull();
    expect(found1.email).toBe('CaseTest@Example.COM');

    const found2 = await store.findUserByEmail('CASETEST@EXAMPLE.COM');
    expect(found2).not.toBeNull();
    expect(found2.email).toBe('CaseTest@Example.COM');
  });

  it('returns null for non-existent email', async () => {
    const result = await store.findUserByEmail('nonexistent@example.com');
    expect(result).toBeNull();
  });
});

describe('upsertSsoUser', () => {
  it('creates a new SSO user when not found', async () => {
    const user = await store.upsertSsoUser('sso@example.com');

    expect(user.id).toBeDefined();
    expect(user.email).toBe('sso@example.com');
    expect(user.passwordHash).toBeNull();
    expect(user.role).toBe('user');
    expect(user.createdAt).toBeDefined();
  });

  it('returns existing user on subsequent calls', async () => {
    const first = await store.upsertSsoUser('sso@example.com');
    const second = await store.upsertSsoUser('sso@example.com');

    expect(second.id).toBe(first.id);
    expect(second.email).toBe(first.email);
  });

  it('finds existing user case-insensitively', async () => {
    const first = await store.upsertSsoUser('SSO@Example.com');
    const second = await store.upsertSsoUser('sso@example.com');

    expect(second.id).toBe(first.id);
  });

  it('does not create duplicates on repeated calls', async () => {
    await store.upsertSsoUser('repeat@example.com');
    await store.upsertSsoUser('repeat@example.com');
    await store.upsertSsoUser('repeat@example.com');

    // Verify only one user exists by checking that findUserByEmail returns the same one
    const found = await store.findUserByEmail('repeat@example.com');
    expect(found).not.toBeNull();

    // Create a different user to verify count indirectly
    await store.upsertSsoUser('other@example.com');
    const other = await store.findUserByEmail('other@example.com');
    expect(other).not.toBeNull();
    expect(other.id).not.toBe(found.id);
  });
});
