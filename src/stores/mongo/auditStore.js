/**
 * stores/mongo/auditStore.js — MongoDB audit persistence
 *
 * Implements the AuditStore interface using the `audit` MongoDB collection.
 * Drop-in replacement for stores/json/auditStore.js.
 *
 * Audit entries are append-only and never modified or deleted.
 */

import { getDb } from '../../db.js';

/** @returns {import('mongodb').Collection} */
function col() {
  return getDb().collection('audit');
}

/**
 * Appends an audit entry to the collection.
 * Entries are append-only — never modified or deleted.
 *
 * @param {{ id: string, event: string, actor: string, target: string|null, details: object|null, timestamp: string }} entry
 * @returns {Promise<void>}
 */
export async function appendEntry(entry) {
  await col().insertOne(entry);
}

/**
 * Lists audit entries, optionally filtered by event, actor, and/or target.
 * Results are sorted by timestamp descending (most recent first).
 * The MongoDB `_id` field is stripped from results.
 *
 * @param {{ event?: string, actor?: string, target?: string }} [filter]
 * @returns {Promise<Array<{ id: string, event: string, actor: string, target: string|null, details: object|null, timestamp: string }>>}
 */
export async function listEntries(filter) {
  const query = {};

  if (filter) {
    if (filter.event) query.event = filter.event;
    if (filter.actor) query.actor = filter.actor;
    if (filter.target) query.target = filter.target;
  }

  return col()
    .find(query)
    .sort({ timestamp: -1 })
    .project({ _id: 0 })
    .toArray();
}
