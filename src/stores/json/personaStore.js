/**
 * stores/json/personaStore.js — JSON-file persona persistence
 *
 * Implements the PersonaStore interface using data/personas.json.
 * Replaces the old per-file markdown approach in data/clients/{slug}.md
 * with a single JSON file for consistency with other stores.
 *
 * Uses a write-queue pattern to prevent concurrent write corruption.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'personas.json');

/**
 * @typedef {Object} RecentConversation
 * @property {string} date
 * @property {string} summary
 */

/**
 * @typedef {Object} Persona
 * @property {string} slug
 * @property {string} displayName
 * @property {string} overview
 * @property {string} modules
 * @property {string} knownIssues
 * @property {RecentConversation[]} recentConversations
 * @property {string} updatedAt
 */

/** @type {{ personas: Record<string, Persona> }} */
let data = { personas: {} };

// Simple write queue to prevent concurrent write corruption
let writeChain = Promise.resolve();

function scheduleSave() {
  writeChain = writeChain.then(async () => {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
  }).catch(err => {
    console.error('[personaStore] Failed to save:', err.message);
  });
  return writeChain;
}

/**
 * Initialise the store — call once at startup.
 * Creates data/ dir and loads existing personas if any.
 */
export async function init() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    data = JSON.parse(raw);
  } catch {
    // File doesn't exist yet or is corrupt — start fresh
    data = { personas: {} };
    await scheduleSave();
  }
  console.log('[personaStore] Loaded', Object.keys(data.personas).length, 'personas');
}

/**
 * Retrieves a persona by slug (case-insensitive).
 * Returns null for missing slugs — no placeholder creation.
 * @param {string} slug
 * @returns {Persona | null}
 */
export function getPersona(slug) {
  const normalised = slug.toLowerCase();
  const entry = Object.values(data.personas).find(
    p => p.slug.toLowerCase() === normalised
  );
  return entry || null;
}

/**
 * Appends a recent conversation entry to a persona's recentConversations array.
 * Updates the updatedAt timestamp and flushes to disk.
 * @param {string} slug
 * @param {{ date: string, summary: string }} entry
 * @returns {Promise<void>}
 */
export async function appendRecentConversation(slug, entry) {
  const normalised = slug.toLowerCase();
  const persona = Object.values(data.personas).find(
    p => p.slug.toLowerCase() === normalised
  );
  if (!persona) throw new Error(`Persona "${slug}" not found`);

  persona.recentConversations.push(entry);
  persona.updatedAt = new Date().toISOString();
  await scheduleSave();
}

/**
 * Creates or updates a persona document.
 * If a persona with the given slug already exists (case-insensitive), merges fields.
 * Otherwise creates a new persona with defaults for missing fields.
 * @param {string} slug
 * @param {Partial<Persona>} fields
 * @returns {Promise<Persona>}
 */
export async function upsertPersona(slug, fields) {
  const normalised = slug.toLowerCase();
  const existingKey = Object.keys(data.personas).find(
    k => k.toLowerCase() === normalised
  );

  const now = new Date().toISOString();

  if (existingKey) {
    // Merge fields into existing persona
    const existing = data.personas[existingKey];
    Object.assign(existing, fields, { updatedAt: now });
    await scheduleSave();
    return existing;
  }

  // Create new persona with defaults
  const persona = {
    slug,
    displayName: fields.displayName || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    overview: fields.overview || '',
    modules: fields.modules || '',
    knownIssues: fields.knownIssues || '',
    recentConversations: fields.recentConversations || [],
    ...fields,
    slug, // ensure slug is always the canonical value
    updatedAt: now,
  };

  data.personas[normalised] = persona;
  await scheduleSave();
  return persona;
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
  data = { personas: {} };
  await scheduleSave();
}
