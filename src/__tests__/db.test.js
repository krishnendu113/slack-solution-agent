/**
 * db.test.js — Unit tests for src/db.js (MongoDB connection manager)
 *
 * Tests connection lifecycle, URI composition, and getDb/closeDB behaviour
 * using mongodb-memory-server.
 *
 * Since db.js holds module-level state, tests run sequentially and manage
 * the connection state carefully between tests.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDB, getDb, closeDB } from '../db.js';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
});

afterAll(async () => {
  // Ensure connection is closed
  try {
    await closeDB();
  } catch {
    // ignore
  }
  if (mongod) await mongod.stop();
});

describe('db.js — connection lifecycle', () => {
  it('getDb() throws before connectDB() is called', () => {
    expect(() => getDb()).toThrow('Database not connected');
  });

  it('connectDB() succeeds with valid MONGODB_URI', async () => {
    process.env.MONGODB_URI = mongod.getUri();
    process.env.MONGODB_DB_NAME = 'test_lifecycle_' + Date.now();

    const db = await connectDB();
    expect(db).toBeDefined();
    expect(db.databaseName).toContain('test_lifecycle_');
  });

  it('getDb() returns a Db instance after connectDB()', () => {
    const db = getDb();
    expect(db).toBeDefined();
    expect(typeof db.collection).toBe('function');
  });

  it('closeDB() resets state so getDb() throws again', async () => {
    await closeDB();
    expect(() => getDb()).toThrow('Database not connected');
  });

  it('MONGODB_URI takes priority over MONGODB_USERNAME + MONGODB_PASSWORD', async () => {
    // Set both — MONGODB_URI should win
    process.env.MONGODB_URI = mongod.getUri();
    process.env.MONGODB_USERNAME = 'ignored';
    process.env.MONGODB_PASSWORD = 'ignored';
    process.env.MONGODB_DB_NAME = 'test_priority_' + Date.now();

    const db = await connectDB();
    expect(db).toBeDefined();
    expect(db.databaseName).toContain('test_priority_');

    await closeDB();
    delete process.env.MONGODB_USERNAME;
    delete process.env.MONGODB_PASSWORD;
  });
});
