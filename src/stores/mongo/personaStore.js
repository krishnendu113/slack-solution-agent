/**
 * stores/mongo/personaStore.js — MongoDB persona persistence
 *
 * Implements the PersonaStore interface using the `personas` MongoDB collection.
 * Drop-in replacement for stores/json/personaStore.js.
 *
 * Uses case-insensitive regex for slug lookups and atomic $push for
 * appending recent conversations.
 */

import { getDb } from '../../db.js';

/**
 * Escape special regex characters in a string so it can be used
 * safely inside a RegExp constructor.
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** @returns {import('mongodb').Collection} */
function col() {
  return getDb().collection('personas');
}

/**
 * Retrieves a persona by slug (case-insensitive).
 * Returns null if not found.
 *
 * @param {string} slug
 * @returns {Promise<object|null>}
 */
export async function getPersona(slug) {
  const escaped = escapeRegex(slug);
  const doc = await col().findOne(
    { slug: { $regex: new RegExp('^' + escaped + '$', 'i') } },
    { projection: { _id: 0 } }
  );
  return doc || null;
}

/**
 * Appends a recent conversation entry to a persona's recentConversations array.
 * Uses atomic $push — no read-modify-write race.
 * Throws if the persona does not exist.
 *
 * @param {string} slug
 * @param {{ date: string, summary: string }} entry
 * @returns {Promise<void>}
 */
export async function appendRecentConversation(slug, entry) {
  const escaped = escapeRegex(slug);
  const result = await col().updateOne(
    { slug: { $regex: new RegExp('^' + escaped + '$', 'i') } },
    {
      $push: { recentConversations: entry },
      $set: { updatedAt: new Date().toISOString() },
    }
  );

  if (result.matchedCount === 0) {
    throw new Error(`Persona "${slug}" not found`);
  }
}

/**
 * Creates or updates a persona document.
 * If a persona with the given slug already exists (case-insensitive), merges fields.
 * Otherwise creates a new persona with defaults for missing fields.
 *
 * @param {string} slug
 * @param {object} fields
 * @returns {Promise<object>}
 */
export async function upsertPersona(slug, fields) {
  const escaped = escapeRegex(slug);
  const now = new Date().toISOString();

  // Derive a display name from the slug: "my-client" → "My Client"
  const defaultDisplayName = slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  // Build $setOnInsert defaults, excluding any keys already in fields
  // to avoid MongoDB "Updating the path would create a conflict" errors.
  const defaults = {
    slug,
    displayName: defaultDisplayName,
    overview: '',
    modules: '',
    knownIssues: '',
    recentConversations: [],
  };
  const setOnInsert = {};
  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in fields)) {
      setOnInsert[key] = value;
    }
  }

  const doc = await col().findOneAndUpdate(
    { slug: { $regex: new RegExp('^' + escaped + '$', 'i') } },
    {
      $set: { ...fields, updatedAt: now },
      $setOnInsert: setOnInsert,
    },
    { upsert: true, returnDocument: 'after', projection: { _id: 0 } }
  );

  return doc;
}
