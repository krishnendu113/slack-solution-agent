/**
 * stores/json/userStore.js — JSON-file user persistence
 *
 * Implements the UserStore interface using data/users.json.
 * Upgraded from src/auth.js user helpers with async API shape,
 * case-insensitive email lookup, and write-queue pattern.
 *
 * Uses a write-queue pattern to prevent concurrent write corruption.
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'users.json');

const BCRYPT_ROUNDS = 12;

/** @type {Array<{ id: string, email: string, passwordHash: string|null, role: string, createdAt: string }>} */
let data = [];

// Simple write queue to prevent concurrent write corruption
let writeChain = Promise.resolve();

function scheduleSave() {
  writeChain = writeChain.then(async () => {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
  }).catch(err => {
    console.error('[userStore] Failed to save:', err.message);
  });
  return writeChain;
}

/**
 * Initialise the store — call once at startup.
 * Creates data/ dir and loads existing users if any.
 */
export async function init() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    data = JSON.parse(raw);
  } catch {
    // File doesn't exist yet or is corrupt — start fresh
    data = [];
    await scheduleSave();
  }
  console.log('[userStore] Loaded', data.length, 'users');
}

/**
 * Finds a user by email (case-insensitive).
 * @param {string} email
 * @returns {Promise<{ id: string, email: string, passwordHash: string|null, role: string, createdAt: string } | null>}
 */
export async function findUserByEmail(email) {
  const normalised = email.toLowerCase();
  return data.find(u => u.email.toLowerCase() === normalised) || null;
}

/**
 * Creates a new user. Hashes password with bcrypt before storing.
 * Throws if a user with the same email already exists.
 * @param {{ email: string, password?: string|null, role?: string }} opts
 * @returns {Promise<{ id: string, email: string, passwordHash: string|null, role: string, createdAt: string }>}
 */
export async function createUser({ email, password = null, role = 'user' }) {
  const normalised = email.toLowerCase();
  if (data.find(u => u.email.toLowerCase() === normalised)) {
    throw new Error('User already exists');
  }

  const passwordHash = password ? await bcrypt.hash(password, BCRYPT_ROUNDS) : null;
  const user = {
    id: crypto.randomUUID(),
    email,
    passwordHash,
    role,
    createdAt: new Date().toISOString(),
  };

  data.push(user);
  await scheduleSave();
  return user;
}

/**
 * Upsert for SSO — find existing by email (case-insensitive), return if found.
 * Otherwise create with passwordHash: null, role: 'user'.
 * @param {string} email
 * @returns {Promise<{ id: string, email: string, passwordHash: string|null, role: string, createdAt: string }>}
 */
export async function upsertSsoUser(email) {
  const existing = await findUserByEmail(email);
  if (existing) return existing;

  const user = {
    id: crypto.randomUUID(),
    email,
    passwordHash: null,
    role: 'user',
    createdAt: new Date().toISOString(),
  };

  data.push(user);
  await scheduleSave();
  return user;
}

/**
 * Waits for any pending writes to complete.
 * Useful for testing to ensure data is flushed before assertions.
 * @returns {Promise<void>}
 */
export async function _flush() {
  await writeChain;
}

/**
 * Resets in-memory state to empty. For testing only.
 * Waits for pending writes, clears data, then saves.
 */
export async function _reset() {
  await writeChain;
  data = [];
  await scheduleSave();
}
