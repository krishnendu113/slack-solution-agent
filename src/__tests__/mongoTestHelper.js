/**
 * mongoTestHelper.js — Shared test helper for MongoDB memory server
 *
 * Starts a MongoMemoryServer before all tests, connects via db.js,
 * and provides getTestDb() to access the database reference.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDB, getDb, closeDB } from '../db.js';

let mongod;

/**
 * Start the in-memory MongoDB server and connect via db.js.
 * Call this in beforeAll().
 */
export async function startTestMongo() {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  process.env.MONGODB_URI = uri;
  process.env.MONGODB_DB_NAME = 'test_' + Date.now();
  await connectDB();
}

/**
 * Get the test database reference.
 * @returns {import('mongodb').Db}
 */
export function getTestDb() {
  return getDb();
}

/**
 * Close the connection and stop the memory server.
 * Call this in afterAll().
 */
export async function stopTestMongo() {
  await closeDB();
  if (mongod) {
    await mongod.stop();
  }
}
