/**
 * src/db.js — MongoDB Connection Manager
 *
 * Manages the MongoDB client lifecycle: connecting, providing the database
 * reference, creating indexes, and closing the connection. Only loaded when
 * STORE_BACKEND=mongodb (dynamic import in the store factory).
 *
 * Exports:
 *   connectDB()  — connect to MongoDB, create indexes, return Db instance
 *   getDb()      — return cached Db instance (throws if not connected)
 *   closeDB()    — close the MongoClient connection gracefully
 */

import { MongoClient } from 'mongodb';

/** @type {MongoClient | null} */
let client = null;

/** @type {import('mongodb').Db | null} */
let db = null;

/**
 * Replace the password portion of a MongoDB URI with '***' for safe logging.
 * @param {string} uri
 * @returns {string}
 */
function sanitiseUri(uri) {
  return uri.replace(/:([^@/]+)@/, ':***@');
}

/**
 * Build the MongoDB connection URI from environment variables.
 *
 * Priority:
 *   1. MONGODB_URI — use directly if set
 *   2. MONGODB_USERNAME + MONGODB_PASSWORD — compose Atlas connection string
 *   3. Neither — fatal error, exit
 *
 * @returns {string} MongoDB connection URI
 */
function buildUri() {
  if (process.env.MONGODB_URI) {
    return process.env.MONGODB_URI;
  }

  const username = process.env.MONGODB_USERNAME;
  const password = process.env.MONGODB_PASSWORD;

  if (username && password) {
    return `mongodb+srv://${username}:${password}@solution-agent.ikuk2cg.mongodb.net/?appName=solution-agent`;
  }

  console.error('[db] FATAL: No MongoDB connection info. Set MONGODB_URI or both MONGODB_USERNAME and MONGODB_PASSWORD.');
  process.exit(1);
}

/**
 * Create all required indexes on the MongoDB collections.
 * Failures are logged as warnings but do not prevent startup.
 *
 * @param {import('mongodb').Db} database
 */
async function createIndexes(database) {
  try {
    const conversations = database.collection('conversations');
    const users = database.collection('users');
    const personas = database.collection('personas');
    const audit = database.collection('audit');

    await Promise.all([
      // conversations indexes
      conversations.createIndex({ userId: 1, updatedAt: -1 }, { background: true }),
      conversations.createIndex({ id: 1 }, { unique: true, background: true }),

      // users indexes
      users.createIndex(
        { email: 1 },
        { unique: true, background: true, collation: { locale: 'en', strength: 2 } }
      ),
      users.createIndex({ id: 1 }, { unique: true, background: true }),

      // personas indexes
      personas.createIndex(
        { slug: 1 },
        { unique: true, background: true, collation: { locale: 'en', strength: 2 } }
      ),

      // audit indexes
      audit.createIndex({ timestamp: -1 }, { background: true }),
      audit.createIndex({ event: 1, timestamp: -1 }, { background: true }),
    ]);

    console.log('[db] All indexes created successfully');
  } catch (err) {
    console.warn('[db] WARNING: Index creation failed —', err.message);
  }
}

/**
 * Connect to MongoDB, select the database, and create indexes.
 *
 * @returns {Promise<import('mongodb').Db>} The Db instance
 */
export async function connectDB() {
  const uri = buildUri();
  const dbName = process.env.MONGODB_DB_NAME || 'capillary_agent';

  try {
    client = new MongoClient(uri);
    await client.connect();
    db = client.db(dbName);
    console.log(`[db] Connected to MongoDB database "${dbName}"`);
  } catch (err) {
    console.error(`[db] FATAL: Failed to connect to MongoDB (${sanitiseUri(uri)}) —`, err.message);
    process.exit(1);
  }

  await createIndexes(db);

  return db;
}

/**
 * Return the cached Db instance.
 *
 * @returns {import('mongodb').Db}
 * @throws {Error} If not connected
 */
export function getDb() {
  if (!db) {
    throw new Error('Database not connected — call connectDB() first');
  }
  return db;
}

/**
 * Close the MongoClient connection gracefully and reset cached references.
 *
 * @returns {Promise<void>}
 */
export async function closeDB() {
  if (client) {
    await client.close();
  }
  client = null;
  db = null;
}
