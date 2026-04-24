/**
 * auditLogger.js — Thin wrapper for audit event logging
 *
 * Fire-and-forget pattern: catches and logs errors to console
 * without blocking the caller.
 */

import crypto from 'crypto';
import { getAuditStore } from './stores/index.js';

/**
 * Valid audit event types.
 * @type {readonly string[]}
 */
export const AUDIT_EVENTS = [
  'USER_CREATED',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET',
  'LOGIN_FAILED',
  'ACCOUNT_LOCKED',
  'LOGIN_SUCCESS',
];

/**
 * Logs a security-relevant audit event.
 * Fire-and-forget: errors are caught and logged to console.
 *
 * @param {{ event: string, actor: string, target?: string|null, details?: object|null }} entry
 * @returns {void}
 */
export function logAuditEvent({ event, actor, target = null, details = null }) {
  const auditEntry = {
    id: crypto.randomUUID(),
    event,
    actor,
    target,
    details,
    timestamp: new Date().toISOString(),
  };

  // Fire-and-forget — do not await, do not block the caller
  getAuditStore().appendEntry(auditEntry).catch(err => {
    console.error('[auditLogger] Failed to log event:', err.message);
  });
}
