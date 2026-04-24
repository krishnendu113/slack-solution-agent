# Requirements Document

## Introduction

The MongoDB Backend Adapters feature completes the store adapter pattern for the Capillary Solution Agent by implementing the MongoDB-backed persistence layer. The existing codebase has a fully functional JSON-file backend and a store factory that branches on `STORE_BACKEND=mongodb`, but the MongoDB adapter files do not exist yet. This feature creates the MongoDB connection manager (`src/db.js`), four MongoDB store adapters (conversationStore, userStore, personaStore, auditStore), a one-time data migration utility (`src/migration.js`), and updates the store factory and project configuration. All adapters implement the exact same interface as their JSON-file counterparts, ensuring zero changes to calling code.

## Glossary

- **Store_Factory**: The central module (`src/stores/index.js`) that reads `STORE_BACKEND` from the environment and exports the selected adapter implementations.
- **Connection_Manager**: The module (`src/db.js`) that manages the MongoDB client lifecycle — connecting, providing the database reference, and closing the connection.
- **MongoDB_Adapter**: Any of the four store adapter modules in `src/stores/mongo/` that implement the store interfaces using the `mongodb` npm driver.
- **JSON_Adapter**: The existing store adapter modules in `src/stores/json/` that implement the store interfaces using flat JSON files.
- **Migration_Utility**: The module (`src/migration.js`) that performs one-time data migration from JSON flat files to MongoDB collections.
- **Collation**: A MongoDB feature that enables case-insensitive string comparison at the index and query level, using `{ locale: 'en', strength: 2 }`.
- **Atomic_Push**: MongoDB's `$push` operator that appends to an array within a single atomic operation, avoiding read-modify-write race conditions.

## Requirements

### Requirement 1: MongoDB Connection Manager

**User Story:** As a developer, I want a connection manager that handles MongoDB client lifecycle, so that all adapters share a single connection pool and indexes are created automatically.

#### Acceptance Criteria

1. WHEN `STORE_BACKEND` is set to `"mongodb"`, the Connection_Manager SHALL establish a connection to MongoDB using the `MONGODB_URI` environment variable if set, or by composing a connection string from `MONGODB_USERNAME` and `MONGODB_PASSWORD` environment variables using the Atlas template `mongodb+srv://{username}:{password}@solution-agent.ikuk2cg.mongodb.net/?appName=solution-agent`.
2. WHEN the connection is established, the Connection_Manager SHALL select the database specified by `MONGODB_DB_NAME` (default: `capillary_agent`).
3. WHEN `connectDB()` succeeds, the Connection_Manager SHALL create all required indexes on the `conversations`, `users`, `personas`, and `audit` collections with `{ background: true }`.
4. IF neither `MONGODB_URI` nor both `MONGODB_USERNAME` and `MONGODB_PASSWORD` are set, the Connection_Manager SHALL log a fatal error and call `process.exit(1)`.
5. IF the MongoDB connection attempt fails (network, authentication, DNS), the Connection_Manager SHALL log a fatal error with a sanitised URI (password replaced with `***`) and call `process.exit(1)`.
6. WHEN `getDb()` is called after a successful `connectDB()`, the Connection_Manager SHALL return the cached Db instance.
7. WHEN `getDb()` is called before `connectDB()` or after `closeDB()`, the Connection_Manager SHALL throw an error with message `"Database not connected — call connectDB() first"`.
8. WHEN `closeDB()` is called, the Connection_Manager SHALL close the MongoClient connection gracefully.

### Requirement 2: MongoDB Conversation Store Adapter

**User Story:** As a developer, I want a MongoDB conversation adapter that implements the same interface as the JSON adapter, so that conversation CRUD operations work identically regardless of backend.

#### Acceptance Criteria

1. WHEN `createConversation(userId, firstMessage)` is called, the MongoDB_Adapter SHALL insert a document into the `conversations` collection with fields: `id` (UUID via `crypto.randomUUID()`), `userId`, `title` (first 80 characters of firstMessage with newlines replaced by spaces), `createdAt` (ISO timestamp), `updatedAt` (ISO timestamp), `compactedAt` (null), `messages` (empty array), and `plans` (empty array).
2. WHEN `listConversations(userId)` is called, the MongoDB_Adapter SHALL return only conversations belonging to that userId, sorted by `updatedAt` descending, projecting out the `messages` and `plans` arrays.
3. WHEN `getConversation(id, userId)` is called, the MongoDB_Adapter SHALL return the full conversation document if it exists and belongs to that userId, or `null` otherwise.
4. WHEN `appendMessage(id, msg)` is called, the MongoDB_Adapter SHALL use MongoDB's `$push` operator to atomically append the message to the `messages` array and `$set` to update the `updatedAt` timestamp. If the message lacks a `timestamp` field, the adapter SHALL add one with the current ISO timestamp.
5. IF `appendMessage` is called with an `id` that does not exist in the collection, the MongoDB_Adapter SHALL throw an error with message `"Conversation {id} not found"`.
6. WHEN `deleteConversation(id, userId)` is called, the MongoDB_Adapter SHALL delete the document only if both `id` and `userId` match, returning `true` on success and `false` if no document matched.
7. WHEN `setCompactedAt(id)` is called, the MongoDB_Adapter SHALL set the `compactedAt` field to the current ISO timestamp using `$set`.
8. WHEN `savePlanState(id, plans)` is called, the MongoDB_Adapter SHALL replace the `plans` array and update `updatedAt` using `$set`.
9. WHEN `searchConversations(userId, query, limit)` is called, the MongoDB_Adapter SHALL query for conversations belonging to `userId` where `messages.content` matches the query string case-insensitively (using `$regex` with `$options: "i"`), return results sorted by `updatedAt` descending, limited to `limit` results, with each result containing `conversationId`, `title`, `createdAt`, `updatedAt`, and a `snippet` of the first matching message content (max 200 characters).
10. IF `searchConversations` is called with an empty query, the MongoDB_Adapter SHALL return an empty array.

### Requirement 3: MongoDB User Store Adapter

**User Story:** As a developer, I want a MongoDB user adapter that implements the same interface as the JSON adapter, so that user management operations work identically regardless of backend.

#### Acceptance Criteria

1. WHEN `createUser(opts)` is called with valid fields (email, password, role, firstName, lastName, passwordType, mustChangePassword, createdBy), the MongoDB_Adapter SHALL hash the password with bcrypt (12 rounds) and insert a document into the `users` collection with all user model fields: `id` (UUID), `firstName`, `lastName`, `email`, `passwordHash`, `role`, `passwordType`, `mustChangePassword`, `failedLoginAttempts` (0), `lockedUntil` (null), `createdAt` (ISO timestamp), `lastPasswordChange` (null), and `createdBy`.
2. IF `createUser` is called with a null or undefined password, the MongoDB_Adapter SHALL set `passwordHash` to `null` (for SSO users).
3. IF `createUser` is called with an email that already exists in the collection (case-insensitive), the MongoDB_Adapter SHALL throw an error with message `"User already exists"`. This SHALL be enforced by catching MongoDB's `E11000` duplicate key error from the unique email index with case-insensitive collation.
4. WHEN `findUserByEmail(email)` is called, the MongoDB_Adapter SHALL perform a case-insensitive lookup and return the matching user record, or `null` if not found.
5. WHEN `findUserById(id)` is called, the MongoDB_Adapter SHALL return the user record matching the UUID, or `null` if not found.
6. WHEN `listUsers()` is called, the MongoDB_Adapter SHALL return all user records from the collection.
7. WHEN `updateUser(id, fields)` is called, the MongoDB_Adapter SHALL use `findOneAndUpdate` with `$set` to merge the provided fields into the existing record and return the updated document. If no user matches the id, it SHALL return `null`.
8. WHEN `deleteUser(id)` is called, the MongoDB_Adapter SHALL remove the document matching the id and return `true` if a document was deleted, or `false` otherwise.
9. WHEN `upsertSsoUser(email)` is called, the MongoDB_Adapter SHALL use `findOneAndUpdate` with `upsert: true` and `$setOnInsert` to atomically find an existing user by email (case-insensitive) or create a new one with `passwordHash: null`, `role: "user"`, `mustChangePassword: false`, `failedLoginAttempts: 0`, `lockedUntil: null`, and `createdBy: "sso"`. It SHALL return the found or created user document.

### Requirement 4: MongoDB Persona Store Adapter

**User Story:** As a developer, I want a MongoDB persona adapter that implements the same interface as the JSON adapter, so that client persona operations work identically regardless of backend.

#### Acceptance Criteria

1. WHEN `getPersona(slug)` is called, the MongoDB_Adapter SHALL perform a case-insensitive lookup on the `slug` field and return the matching persona document, or `null` if not found.
2. WHEN `appendRecentConversation(slug, entry)` is called on an existing persona, the MongoDB_Adapter SHALL use `$push` to atomically append the entry to the `recentConversations` array and `$set` to update the `updatedAt` timestamp.
3. IF `appendRecentConversation` is called with a slug that does not exist in the collection, the MongoDB_Adapter SHALL throw an error with message `"Persona "{slug}" not found"`.
4. WHEN `upsertPersona(slug, fields)` is called, the MongoDB_Adapter SHALL use `findOneAndUpdate` with `upsert: true` to create a new persona (with defaults for missing fields: `displayName` derived from slug, empty strings for `overview`/`modules`/`knownIssues`, empty array for `recentConversations`) or merge fields into an existing one. It SHALL return the resulting persona document.

### Requirement 5: MongoDB Audit Store Adapter

**User Story:** As a developer, I want a MongoDB audit adapter that implements the same interface as the JSON adapter, so that audit logging works identically regardless of backend.

#### Acceptance Criteria

1. WHEN `appendEntry(entry)` is called, the MongoDB_Adapter SHALL insert the entry document into the `audit` collection. Audit entries are append-only and SHALL never be modified or deleted.
2. WHEN `listEntries()` is called with no filter, the MongoDB_Adapter SHALL return all audit entries sorted by `timestamp` descending.
3. WHEN `listEntries(filter)` is called with a filter object containing any combination of `event`, `actor`, and `target` fields, the MongoDB_Adapter SHALL return only entries matching all specified filter fields (AND logic).

### Requirement 6: Data Migration from JSON to MongoDB

**User Story:** As a developer, I want a one-time migration utility that transfers existing JSON flat-file data into MongoDB, so that switching backends preserves all existing data.

#### Acceptance Criteria

1. WHEN `runMigrations()` is called and `data/conversations.json` exists without a `data/conversations.json.migrated` counterpart, the Migration_Utility SHALL parse the JSON file, extract conversation documents from the `conversations` object, insert them into the `conversations` MongoDB collection, and rename the source file to `data/conversations.json.migrated`.
2. WHEN `runMigrations()` is called and `data/users.json` exists without a `.migrated` counterpart, the Migration_Utility SHALL parse the JSON array and insert user documents into the `users` MongoDB collection, then rename the source file.
3. WHEN `runMigrations()` is called and `data/personas.json` exists without a `.migrated` counterpart, the Migration_Utility SHALL parse the JSON file, extract persona documents from the `personas` object, insert them into the `personas` MongoDB collection, then rename the source file.
4. WHEN `runMigrations()` is called and `data/audit.json` exists without a `.migrated` counterpart, the Migration_Utility SHALL parse the JSON array and insert audit entries into the `audit` MongoDB collection, then rename the source file.
5. WHEN `runMigrations()` is called and a `.migrated` counterpart already exists for a data file, the Migration_Utility SHALL skip migration for that file (idempotent).
6. IF a JSON data file is corrupt or unparseable, the Migration_Utility SHALL log an error and skip that file without renaming it to `.migrated`.
7. IF an insert operation fails partially, the Migration_Utility SHALL log the failure and NOT rename the source file, allowing the migration to retry on the next startup.
8. IF a source data file is empty (empty array `[]` or empty object `{}`), the Migration_Utility SHALL skip it gracefully without error.

### Requirement 7: Store Factory Update

**User Story:** As a developer, I want the store factory to fully initialise all four stores (including audit) for the MongoDB backend and run migrations, so that the MongoDB path is complete.

#### Acceptance Criteria

1. WHEN `STORE_BACKEND` is set to `"mongodb"`, the Store_Factory SHALL import and assign the MongoDB audit store adapter (`src/stores/mongo/auditStore.js`) to the `auditStore` module variable, in addition to the conversation, user, and persona stores.
2. WHEN `STORE_BACKEND` is set to `"mongodb"`, the Store_Factory SHALL call `runMigrations()` from `src/migration.js` after `connectDB()` succeeds and before the stores are used.
3. THE Store_Factory SHALL continue to support the `"json"` backend with no changes to its existing behaviour.

### Requirement 8: MongoDB Index Strategy

**User Story:** As a developer, I want appropriate indexes on all MongoDB collections, so that queries perform efficiently and uniqueness constraints are enforced at the database level.

#### Acceptance Criteria

1. THE Connection_Manager SHALL create a compound index `{ userId: 1, updatedAt: -1 }` on the `conversations` collection for efficient user-scoped listing sorted by recency.
2. THE Connection_Manager SHALL create a unique index `{ id: 1 }` on the `conversations` collection for direct lookup by conversation UUID.
3. THE Connection_Manager SHALL create a unique index `{ email: 1 }` on the `users` collection with collation `{ locale: 'en', strength: 2 }` for case-insensitive email uniqueness.
4. THE Connection_Manager SHALL create a unique index `{ id: 1 }` on the `users` collection for direct lookup by user UUID.
5. THE Connection_Manager SHALL create a unique index `{ slug: 1 }` on the `personas` collection with collation `{ locale: 'en', strength: 2 }` for case-insensitive slug uniqueness.
6. THE Connection_Manager SHALL create an index `{ timestamp: -1 }` on the `audit` collection for reverse chronological listing.
7. THE Connection_Manager SHALL create a compound index `{ event: 1, timestamp: -1 }` on the `audit` collection for filtered event queries with time ordering.

### Requirement 9: Environment Configuration

**User Story:** As a developer, I want clear environment variable documentation and the mongodb npm dependency, so that I can configure and deploy the MongoDB backend.

#### Acceptance Criteria

1. THE `package.json` SHALL include `mongodb` (version `^6.12.0`) as a production dependency.
2. THE `.env.example` file SHALL include `MONGODB_USERNAME` and `MONGODB_PASSWORD` variables with comments explaining they are an alternative to `MONGODB_URI` for the Atlas connection string.
3. THE `.env.example` file SHALL include a commented-out `MONGODB_URI` variable with a descriptive comment.
4. THE `.env.example` file SHALL include a commented-out `MONGODB_DB_NAME` variable with default value `capillary_agent`.
