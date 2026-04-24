/**
 * stores/json/auditStore.js — JSON-file audit persistence
 *
 * Implements the AuditStore interface using data/audit.json.
 * Audit entries are append-only and never modified.
 *
 * Uses a write-queue pattern to prevent concurrent write corruption.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'audit.json');

/**
 * @typedef {Object} AuditEntry
 * @property {string} id
 * @property {string} event
 * @property {string} actor
 * @property {string|null} target
 * @property {object|null} details
 * @property {string} timestamp
 */

/** @type {AuditEntry[]} */
let data = [];

// Simple write queue to prevent concurrent write corruption
let writeChain = Promise.resolve();

function scheduleSave() {
  writeChain = writeChain.then(async () => {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
  }).catch(err => {
    console.error('[auditStore] Failed to save:', err.message);
  });
  return writeChain;
}

/**
 * Initialise the store — call once at startup.
 * Creates data/ dir and loads existing audit entries if any.
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
  console.log('[auditStore] Loaded', data.length, 'audit entries');
}

/**
 * Appends an audit entry to the store.
 * @param {AuditEntry} entry
 * @returns {Promise<void>}
 */
export async function appendEntry(entry) {
  data.push(entry);
  await scheduleSave();
}

/**
 * Lists audit entries, optionally filtered.
 * @param {{ event?: string, actor?: string, target?: string }} [filter]
 * @returns {Promise<AuditEntry[]>}
 */
export async function listEntries(filter) {
  if (!filter) return [...data];

  return data.filter(entry => {
    if (filter.event && entry.event !== filter.event) return false;
    if (filter.actor && entry.actor !== filter.actor) return false;
    if (filter.target && entry.target !== filter.target) return false;
    return true;
  });
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
