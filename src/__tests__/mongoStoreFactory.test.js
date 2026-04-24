/**
 * mongoStoreFactory.test.js — Unit tests for src/stores/index.js (MongoDB backend)
 *
 * Tests that the store factory correctly initialises all four stores
 * when STORE_BACKEND=mongodb, including the audit store.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { closeDB } from '../db.js';

let mongod;
let savedBackend;
let savedUri;
let savedDbName;

beforeAll(async () => {
  // Save original env
  savedBackend = process.env.STORE_BACKEND;
  savedUri = process.env.MONGODB_URI;
  savedDbName = process.env.MONGODB_DB_NAME;

  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB_NAME = 'test_factory_' + Date.now();
  process.env.STORE_BACKEND = 'mongodb';
});

afterAll(async () => {
  try {
    await closeDB();
  } catch {
    // ignore
  }
  if (mongod) await mongod.stop();

  // Restore env
  if (savedBackend !== undefined) process.env.STORE_BACKEND = savedBackend;
  else delete process.env.STORE_BACKEND;
  if (savedUri !== undefined) process.env.MONGODB_URI = savedUri;
  else delete process.env.MONGODB_URI;
  if (savedDbName !== undefined) process.env.MONGODB_DB_NAME = savedDbName;
  else delete process.env.MONGODB_DB_NAME;
});

describe('store factory with STORE_BACKEND=mongodb', () => {
  it('initialises all four stores including audit', async () => {
    // Import the factory — it has module-level state
    const factory = await import('../stores/index.js');
    await factory.init();

    const convStore = factory.getConversationStore();
    const userStore = factory.getUserStore();
    const personaStore = factory.getPersonaStore();
    const auditStore = factory.getAuditStore();

    expect(convStore).toBeDefined();
    expect(userStore).toBeDefined();
    expect(personaStore).toBeDefined();
    expect(auditStore).toBeDefined();

    // Verify they have the expected methods
    expect(typeof convStore.createConversation).toBe('function');
    expect(typeof userStore.createUser).toBe('function');
    expect(typeof personaStore.getPersona).toBe('function');
  });

  it('getAuditStore() returns a valid store with appendEntry and listEntries', async () => {
    const factory = await import('../stores/index.js');
    // init() was already called in the previous test, factory is already initialised

    const auditStore = factory.getAuditStore();
    expect(typeof auditStore.appendEntry).toBe('function');
    expect(typeof auditStore.listEntries).toBe('function');
  });
});
