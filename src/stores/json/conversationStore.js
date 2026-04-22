/**
 * stores/json/conversationStore.js — JSON-file conversation persistence
 *
 * Implements the ConversationStore interface using data/conversations.json.
 * Upgraded from src/store.js with userId scoping, compactedAt, and plans fields.
 *
 * Uses a write-queue pattern to prevent concurrent write corruption.
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'conversations.json');

/** @type {{ conversations: Record<string, import('./types').Conversation> }} */
let data = { conversations: {} };

// Simple write queue to prevent concurrent write corruption
let writeChain = Promise.resolve();

function scheduleSave() {
  writeChain = writeChain.then(async () => {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
  }).catch(err => {
    console.error('[conversationStore] Failed to save:', err.message);
  });
  return writeChain;
}

/**
 * Initialise the store — call once at startup.
 * Creates data/ dir and loads existing conversations if any.
 */
export async function init() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    data = JSON.parse(raw);
  } catch {
    // File doesn't exist yet or is corrupt — start fresh
    data = { conversations: {} };
    await scheduleSave();
  }
  console.log('[conversationStore] Loaded', Object.keys(data.conversations).length, 'conversations');
}

/**
 * Returns all conversations for a given user, sorted by updatedAt desc (without messages).
 * @param {string} userId
 * @returns {Array<{ id: string, userId: string, title: string, createdAt: string, updatedAt: string }>}
 */
export function listConversations(userId) {
  return Object.values(data.conversations)
    .filter(conv => conv.userId === userId)
    .map(({ id, userId, title, createdAt, updatedAt }) => ({ id, userId, title, createdAt, updatedAt }))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

/**
 * Returns a full conversation with messages, or null.
 * Scoped by userId — returns null if the conversation belongs to a different user.
 * @param {string} id
 * @param {string} userId
 * @returns {import('./types').Conversation | null}
 */
export function getConversation(id, userId) {
  const conv = data.conversations[id];
  if (!conv) return null;
  if (conv.userId !== userId) return null;
  return conv;
}

/**
 * Creates a new conversation with the first user message.
 * @param {string} userId
 * @param {string} firstMessage
 * @returns {Promise<import('./types').Conversation>}
 */
export async function createConversation(userId, firstMessage) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const title = firstMessage.slice(0, 80).replace(/\n/g, ' ') || 'New conversation';

  const conv = {
    id,
    userId,
    title,
    createdAt: now,
    updatedAt: now,
    compactedAt: null,
    messages: [],
    plans: [],
  };

  data.conversations[id] = conv;
  await scheduleSave();
  return conv;
}

/**
 * Appends a message to a conversation.
 * @param {string} id
 * @param {{ role: string, content: string, skillsUsed?: string[], escalated?: boolean, files?: string[], timestamp?: string }} msg
 * @returns {Promise<object>}
 */
export async function appendMessage(id, msg) {
  const conv = data.conversations[id];
  if (!conv) throw new Error(`Conversation ${id} not found`);

  if (!msg.timestamp) {
    msg.timestamp = new Date().toISOString();
  }

  conv.messages.push(msg);
  conv.updatedAt = new Date().toISOString();
  await scheduleSave();
  return msg;
}

/**
 * Deletes a conversation. Scoped by userId — only deletes if the conversation belongs to the user.
 * @param {string} id
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function deleteConversation(id, userId) {
  const conv = data.conversations[id];
  if (!conv) return false;
  if (conv.userId !== userId) return false;
  delete data.conversations[id];
  await scheduleSave();
  return true;
}

/**
 * Sets the compactedAt timestamp to the current time.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function setCompactedAt(id) {
  const conv = data.conversations[id];
  if (!conv) throw new Error(`Conversation ${id} not found`);

  conv.compactedAt = new Date().toISOString();
  await scheduleSave();
}

/**
 * Replaces the plans array on a conversation.
 * @param {string} id
 * @param {Array<object>} plans
 * @returns {Promise<void>}
 */
export async function savePlanState(id, plans) {
  const conv = data.conversations[id];
  if (!conv) throw new Error(`Conversation ${id} not found`);

  conv.plans = plans;
  conv.updatedAt = new Date().toISOString();
  await scheduleSave();
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
  data = { conversations: {} };
  await scheduleSave();
}
