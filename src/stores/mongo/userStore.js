/**
 * stores/mongo/userStore.js — MongoDB user persistence
 *
 * Implements the UserStore interface using the `users` MongoDB collection.
 * Drop-in replacement for stores/json/userStore.js.
 *
 * Uses case-insensitive regex for email lookups, bcrypt for password hashing,
 * and atomic findOneAndUpdate for upserts.
 */

import { getDb } from '../../db.js';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 12;

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
  return getDb().collection('users');
}

/**
 * Creates a new user. Hashes password with bcrypt before storing.
 * Throws if a user with the same email already exists (E11000).
 *
 * @param {{ email: string, password?: string|null, role?: string, firstName?: string, lastName?: string, passwordType?: string|null, mustChangePassword?: boolean, createdBy?: string }} opts
 * @returns {Promise<object>}
 */
export async function createUser({
  email,
  password = null,
  role = 'user',
  firstName = '',
  lastName = '',
  passwordType = null,
  mustChangePassword = false,
  createdBy = 'system',
}) {
  const passwordHash = password ? await bcrypt.hash(password, BCRYPT_ROUNDS) : null;

  const user = {
    id: crypto.randomUUID(),
    firstName,
    lastName,
    email,
    passwordHash,
    role,
    passwordType,
    mustChangePassword,
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: new Date().toISOString(),
    lastPasswordChange: null,
    createdBy,
  };

  try {
    await col().insertOne(user);
  } catch (err) {
    if (err.code === 11000) {
      throw new Error('User already exists');
    }
    throw err;
  }

  // Strip _id before returning
  delete user._id;
  return user;
}

/**
 * Finds a user by email (case-insensitive).
 *
 * @param {string} email
 * @returns {Promise<object|null>}
 */
export async function findUserByEmail(email) {
  const escaped = escapeRegex(email);
  const doc = await col().findOne(
    { email: { $regex: new RegExp('^' + escaped + '$', 'i') } },
    { projection: { _id: 0 } }
  );
  return doc || null;
}

/**
 * Finds a user by ID.
 *
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function findUserById(id) {
  const doc = await col().findOne({ id }, { projection: { _id: 0 } });
  return doc || null;
}

/**
 * Returns all user records.
 *
 * @returns {Promise<object[]>}
 */
export async function listUsers() {
  return col().find({}).project({ _id: 0 }).toArray();
}

/**
 * Removes a user by ID. Returns true if found and removed, false otherwise.
 *
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteUser(id) {
  const result = await col().deleteOne({ id });
  return result.deletedCount > 0;
}

/**
 * Merges fields into an existing user record and returns the updated document.
 * Returns null if the user is not found.
 *
 * @param {string} id
 * @param {object} fields
 * @returns {Promise<object|null>}
 */
export async function updateUser(id, fields) {
  const doc = await col().findOneAndUpdate(
    { id },
    { $set: fields },
    { returnDocument: 'after', projection: { _id: 0 } }
  );
  return doc || null;
}

/**
 * Upsert for SSO — find existing by email (case-insensitive), return if found.
 * Otherwise create with default SSO fields.
 *
 * @param {string} email
 * @returns {Promise<object>}
 */
export async function upsertSsoUser(email) {
  const escaped = escapeRegex(email);
  const doc = await col().findOneAndUpdate(
    { email: { $regex: new RegExp('^' + escaped + '$', 'i') } },
    {
      $setOnInsert: {
        id: crypto.randomUUID(),
        firstName: '',
        lastName: '',
        email,
        passwordHash: null,
        role: 'user',
        passwordType: null,
        mustChangePassword: false,
        failedLoginAttempts: 0,
        lockedUntil: null,
        createdAt: new Date().toISOString(),
        lastPasswordChange: null,
        createdBy: 'sso',
      },
    },
    { upsert: true, returnDocument: 'after', projection: { _id: 0 } }
  );
  return doc;
}
