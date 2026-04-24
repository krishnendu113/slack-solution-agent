/**
 * stores/index.js — Store factory module
 *
 * Central factory that reads STORE_BACKEND from the environment and exports
 * the selected adapter implementations. All calling code imports from here —
 * never directly from a specific backend.
 *
 * Supported backends:
 *   - "json"    (default) — JSON-file adapters in src/stores/json/
 *   - "mongodb" — MongoDB adapters in src/stores/mongo/ (optional dependency)
 */

/** @type {import('./json/conversationStore.js') | import('./mongo/conversationStore.js') | null} */
let conversationStore = null;

/** @type {import('./json/userStore.js') | import('./mongo/userStore.js') | null} */
let userStore = null;

/** @type {import('./json/personaStore.js') | import('./mongo/personaStore.js') | null} */
let personaStore = null;

/** @type {import('./json/auditStore.js') | import('./mongo/auditStore.js') | null} */
let auditStore = null;

const VALID_BACKENDS = ['json', 'mongodb'];

/**
 * Initialise the selected store backend.
 * Must be called once at startup before app.listen().
 */
export async function init() {
  const backend = process.env.STORE_BACKEND || 'json';

  if (!VALID_BACKENDS.includes(backend)) {
    console.error(`[stores] FATAL: Invalid STORE_BACKEND "${backend}". Valid values: ${VALID_BACKENDS.join(', ')}`);
    process.exit(1);
  }

  if (backend === 'json') {
    const convMod = await import('./json/conversationStore.js');
    const userMod = await import('./json/userStore.js');
    const personaMod = await import('./json/personaStore.js');
    const auditMod = await import('./json/auditStore.js');

    conversationStore = convMod;
    userStore = userMod;
    personaStore = personaMod;
    auditStore = auditMod;

    await conversationStore.init();
    await userStore.init();
    await personaStore.init();
    await auditStore.init();

    console.log('[stores] Initialised with JSON-file backend');
  } else if (backend === 'mongodb') {
    const { connectDB } = await import('../db.js');
    await connectDB();

    const { runMigrations } = await import('../migration.js');
    await runMigrations();

    const convMod = await import('./mongo/conversationStore.js');
    const userMod = await import('./mongo/userStore.js');
    const personaMod = await import('./mongo/personaStore.js');
    const auditMod = await import('./mongo/auditStore.js');

    conversationStore = convMod;
    userStore = userMod;
    personaStore = personaMod;
    auditStore = auditMod;

    console.log('[stores] Initialised with MongoDB backend');
  }
}

/**
 * Returns the conversation store adapter.
 * @returns {import('./json/conversationStore.js') | import('./mongo/conversationStore.js')}
 */
export function getConversationStore() {
  if (!conversationStore) throw new Error('[stores] Not initialised — call init() first');
  return conversationStore;
}

/**
 * Returns the user store adapter.
 * @returns {import('./json/userStore.js') | import('./mongo/userStore.js')}
 */
export function getUserStore() {
  if (!userStore) throw new Error('[stores] Not initialised — call init() first');
  return userStore;
}

/**
 * Returns the persona store adapter.
 * @returns {import('./json/personaStore.js') | import('./mongo/personaStore.js')}
 */
export function getPersonaStore() {
  if (!personaStore) throw new Error('[stores] Not initialised — call init() first');
  return personaStore;
}

/**
 * Returns the audit store adapter.
 * @returns {import('./json/auditStore.js') | import('./mongo/auditStore.js')}
 */
export function getAuditStore() {
  if (!auditStore) throw new Error('[stores] Not initialised — call init() first');
  return auditStore;
}
