/**
 * store.js — JSON-file conversation persistence
 *
 * Stores conversations in data/conversations.json.
 * Loaded into memory on init(), flushed to disk after every mutation.
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data');
const DATA_FILE = path.join(DATA_DIR, 'conversations.json');

let data = { conversations: {} };

// Simple write queue to prevent concurrent write corruption
let writeChain = Promise.resolve();

function scheduleSave() {
  writeChain = writeChain.then(async () => {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
  }).catch(err => {
    console.error('[store] Failed to save:', err.message);
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
}

/**
 * Returns all conversations sorted by updatedAt desc (without messages).
 */
export function listConversations() {
  return Object.values(data.conversations)
    .map(({ id, title, createdAt, updatedAt }) => ({ id, title, createdAt, updatedAt }))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

/**
 * Returns a full conversation with messages, or null.
 */
export function getConversation(id) {
  return data.conversations[id] || null;
}

/**
 * Creates a new conversation with the first user message.
 * Returns the new conversation object.
 */
export async function createConversation(firstMessage) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const title = firstMessage.slice(0, 80).replace(/\n/g, ' ') || 'New conversation';

  const conv = {
    id,
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };

  data.conversations[id] = conv;
  await scheduleSave();
  return conv;
}

/**
 * Appends a message to a conversation.
 * msg shape: { role: 'user'|'assistant', content: string, skillsUsed?: string[], escalated?: boolean }
 */
export async function appendMessage(id, msg) {
  const conv = data.conversations[id];
  if (!conv) throw new Error(`Conversation ${id} not found`);

  conv.messages.push(msg);
  conv.updatedAt = new Date().toISOString();
  await scheduleSave();
  return msg;
}

/**
 * Deletes a conversation.
 */
export async function deleteConversation(id) {
  if (!data.conversations[id]) return false;
  delete data.conversations[id];
  await scheduleSave();
  return true;
}
