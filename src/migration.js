/**
 * src/migration.js — One-Time Data Migration from JSON to MongoDB
 *
 * Migrates existing JSON flat-file data into MongoDB when switching backends.
 * Called once at startup after connectDB() when STORE_BACKEND=mongodb.
 *
 * Migration flow per file:
 *   1. Check if source file exists AND no .migrated counterpart
 *   2. Parse JSON, extract documents
 *   3. Insert into the corresponding MongoDB collection via insertMany
 *   4. Rename source to *.json.migrated
 *
 * Idempotent: skips files that already have a .migrated counterpart.
 * Error-safe: corrupt JSON or partial inserts are logged but do not rename.
 */

import { getDb } from './db.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data');

/**
 * Describes a single migration source: the JSON filename, the MongoDB
 * collection it maps to, and how to extract documents from the parsed JSON.
 *
 * @typedef {Object} MigrationSpec
 * @property {string} file        — JSON filename inside DATA_DIR
 * @property {string} collection  — target MongoDB collection name
 * @property {(parsed: any) => any[]} extract — pulls an array of docs from the parsed JSON
 */

/** @type {MigrationSpec[]} */
const MIGRATIONS = [
  {
    file: 'conversations.json',
    collection: 'conversations',
    extract: (parsed) => Object.values(parsed.conversations || {}),
  },
  {
    file: 'users.json',
    collection: 'users',
    extract: (parsed) => (Array.isArray(parsed) ? parsed : []),
  },
  {
    file: 'personas.json',
    collection: 'personas',
    extract: (parsed) => Object.values(parsed.personas || {}),
  },
  {
    file: 'audit.json',
    collection: 'audit',
    extract: (parsed) => (Array.isArray(parsed) ? parsed : []),
  },
];

/**
 * Check whether a file exists on disk.
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run all pending data migrations from JSON flat files into MongoDB.
 *
 * Safe to call on every startup — files that have already been migrated
 * (indicated by a .migrated counterpart) are skipped.
 *
 * @returns {Promise<void>}
 */
export async function runMigrations() {
  // If the data directory doesn't exist, there's nothing to migrate
  if (!(await fileExists(DATA_DIR))) {
    console.log('[migration] data/ directory not found — skipping migrations');
    return;
  }

  const db = getDb();

  for (const spec of MIGRATIONS) {
    const sourcePath = path.join(DATA_DIR, spec.file);
    const migratedPath = `${sourcePath}.migrated`;

    // Idempotency: skip if already migrated
    if (await fileExists(migratedPath)) {
      console.log(`[migration] ${spec.file} already migrated — skipping`);
      continue;
    }

    // Skip if source file doesn't exist
    if (!(await fileExists(sourcePath))) {
      continue;
    }

    // Parse the JSON file
    let parsed;
    try {
      const raw = await fs.readFile(sourcePath, 'utf-8');
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error(`[migration] Failed to parse ${spec.file} — skipping:`, err.message);
      continue;
    }

    // Extract documents
    const docs = spec.extract(parsed);

    // Skip empty data gracefully
    if (!docs || docs.length === 0) {
      console.log(`[migration] ${spec.file} is empty — skipping`);
      continue;
    }

    // Insert into MongoDB
    try {
      const collection = db.collection(spec.collection);
      await collection.insertMany(docs);
      console.log(`[migration] Inserted ${docs.length} documents into ${spec.collection}`);
    } catch (err) {
      console.error(`[migration] Failed to insert ${spec.file} into ${spec.collection} — will retry on next startup:`, err.message);
      // Do NOT rename — allows retry on next startup
      continue;
    }

    // Rename source to .migrated
    try {
      await fs.rename(sourcePath, migratedPath);
      console.log(`[migration] Renamed ${spec.file} → ${spec.file}.migrated`);
    } catch (err) {
      console.error(`[migration] Failed to rename ${spec.file}:`, err.message);
    }
  }
}
