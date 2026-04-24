/**
 * stores/mongo/conversationStore.js — MongoDB conversation persistence
 *
 * Implements the ConversationStore interface using the `conversations`
 * MongoDB collection. Drop-in replacement for stores/json/conversationStore.js.
 *
 * Uses atomic $push for message appends — no read-modify-write races.
 */

import { getDb } from '../../db.js';
import crypto from 'crypto';

/** @returns {import('mongodb').Collection} */
function col() {
  return getDb().collection('conversations');
}

/**
 * Returns all conversations for a given user, sorted by updatedAt desc.
 * Projects out messages and plans to keep the payload small.
 *
 * @param {string} userId
 * @returns {Promise<Array<{ id: string, userId: string, title: string, createdAt: string, updatedAt: string }>>}
 */
export async function listConversations(userId) {
  return col()
    .find({ userId })
    .sort({ updatedAt: -1 })
    .project({ _id: 0, messages: 0, plans: 0 })
    .toArray();
}

/**
 * Returns a full conversation with messages, or null.
 * Scoped by userId — returns null if the conversation belongs to a different user.
 *
 * @param {string} id
 * @param {string} userId
 * @returns {Promise<object | null>}
 */
export async function getConversation(id, userId) {
  const doc = await col().findOne({ id, userId }, { projection: { _id: 0 } });
  return doc || null;
}

/**
 * Creates a new conversation with the first user message.
 *
 * @param {string} userId
 * @param {string} firstMessage
 * @returns {Promise<object>}
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

  await col().insertOne(conv);

  // Strip _id before returning
  delete conv._id;
  return conv;
}

/**
 * Appends a message to a conversation using atomic $push.
 *
 * @param {string} id
 * @param {{ role: string, content: string, skillsUsed?: string[], escalated?: boolean, files?: string[], timestamp?: string }} msg
 * @returns {Promise<object>}
 */
export async function appendMessage(id, msg) {
  if (!msg.timestamp) {
    msg.timestamp = new Date().toISOString();
  }

  const result = await col().updateOne(
    { id },
    {
      $push: { messages: msg },
      $set: { updatedAt: new Date().toISOString() },
    }
  );

  if (result.matchedCount === 0) {
    throw new Error(`Conversation ${id} not found`);
  }

  return msg;
}

/**
 * Deletes a conversation. Scoped by userId.
 *
 * @param {string} id
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function deleteConversation(id, userId) {
  const result = await col().deleteOne({ id, userId });
  return result.deletedCount > 0;
}

/**
 * Sets the compactedAt timestamp to the current time.
 *
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function setCompactedAt(id) {
  await col().updateOne(
    { id },
    { $set: { compactedAt: new Date().toISOString() } }
  );
}

/**
 * Replaces the plans array on a conversation.
 *
 * @param {string} id
 * @param {Array<object>} plans
 * @returns {Promise<void>}
 */
export async function savePlanState(id, plans) {
  await col().updateOne(
    { id },
    { $set: { plans, updatedAt: new Date().toISOString() } }
  );
}

/**
 * Searches conversations for a given user by case-insensitive regex match
 * across message content. Returns matching conversations with a snippet of
 * the first matching message, sorted by updatedAt desc.
 *
 * @param {string} userId
 * @param {string} query
 * @param {number} limit
 * @returns {Promise<Array<{ conversationId: string, title: string, createdAt: string, updatedAt: string, snippet: string }>>}
 */
export async function searchConversations(userId, query, limit) {
  if (!query) return [];

  const docs = await col()
    .find({
      userId,
      'messages.content': { $regex: query, $options: 'i' },
    })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .toArray();

  return docs.map((doc) => {
    // Find the first message whose content matches the query
    const regex = new RegExp(query, 'i');
    let snippet = '';
    for (const msg of doc.messages) {
      if (msg.content && regex.test(msg.content)) {
        snippet = msg.content.length > 200 ? msg.content.slice(0, 200) : msg.content;
        break;
      }
    }

    return {
      conversationId: doc.id,
      title: doc.title,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      snippet,
    };
  });
}
