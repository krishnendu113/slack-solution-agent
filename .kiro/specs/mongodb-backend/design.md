# Design Document: MongoDB Backend Adapters

## Overview

This design implements the MongoDB backend adapters for the Capillary Solution Agent, completing the store adapter pattern established in the platform-persistence-and-efficiency spec. The existing codebase has a fully functional JSON-file backend (`src/stores/json/`) and a store factory (`src/stores/index.js`) that already branches on `STORE_BACKEND=mongodb` — but the MongoDB adapter files (`src/stores/mongo/`, `src/db.js`) do not exist yet.

The implementation creates six new modules: a MongoDB connection manager (`src/db.js`), four MongoDB store adapters (conversationStore, userStore, personaStore, auditStore), and a one-time data migration utility (`src/migration.js`). It also patches the store factory to initialise the audit store for the MongoDB backend (currently missing) and adds the `mongodb` npm dependency.

All MongoDB adapters implement the exact same interface as their JSON-file counterparts, ensuring zero changes to calling code (`server.js`, `auth.js`, `orchestrator.js`, `graph.js`). The raw `mongodb` npm driver is used — no Mongoose — keeping the dependency surface small and the document shapes flexible.

## Architecture

### System Context — MongoDB Backend Path

```mermaid
graph TB
    subgraph "Application Layer"
        Server[Express Server<br/>src/server.js]
        Auth[Auth Module<br/>src/auth.js]
        Orchestrator[Orchestrator<br/>src/orchestrator.js]
        AuditLogger[Audit Logger<br/>src/auditLogger.js]
    end

    subgraph "Store Abstraction Layer"
        Factory[Store Factory<br/>src/stores/index.js]
    end

    subgraph "MongoDB Adapters — NEW"
        DB[Connection Manager<br/>src/db.js]
        MongoConv[conversationStore<br/>src/stores/mongo/conversationStore.js]
        MongoUser[userStore<br/>src/stores/mongo/userStore.js]
        MongoPersona[personaStore<br/>src/stores/mongo/personaStore.js]
        MongoAudit[auditStore<br/>src/stores/mongo/auditStore.js]
    end

    subgraph "Migration — NEW"
        Migration[migration.js<br/>src/migration.js]
    end

    subgraph "Infrastructure"
        MongoDB[(MongoDB Atlas<br/>solution-agent cluster)]
        JSONFiles[data/*.json<br/>Existing flat files]
    end

    Server --> Factory
    Auth --> Factory
    Orchestrator --> Factory
    AuditLogger --> Factory

    Factory -->|STORE_BACKEND=mongodb| DB
    Factory --> MongoConv
    Factory --> MongoUser
    Factory --> MongoPersona
    Factory --> MongoAudit

    DB -->|mongodb driver| MongoDB
    MongoConv --> DB
    MongoUser --> DB
    MongoPersona --> DB
    MongoAudit --> DB

    Migration -->|reads| JSONFiles
    Migration -->|inserts| MongoDB
    Migration --> DB
```

### Store Adapter Pattern — Class Diagram

```mermaid
classDiagram
    class StoreFactory {
        +init() Promise~void~
        +getConversationStore() ConversationStore
        +getUserStore() UserStore
        +getPersonaStore() PersonaStore
        +getAuditStore() AuditStore
    }

    class ConversationStore {
        <<interface>>
        +listConversations(userId) Array
        +getConversation(id, userId) Object|null
        +createConversation(userId, firstMessage) Object
        +appendMessage(id, msg) Object
        +deleteConversation(id, userId) boolean
        +setCompactedAt(id) void
        +savePlanState(id, plans) void
        +searchConversations(userId, query, limit) Array
    }

    class UserStore {
        <<interface>>
        +findUserByEmail(email) Object|null
        +createUser(opts) Object
        +findUserById(id) Object|null
        +listUsers() Array
        +updateUser(id, fields) Object|null
        +deleteUser(id) boolean
        +upsertSsoUser(email) Object
    }

    class PersonaStore {
        <<interface>>
        +getPersona(slug) Object|null
        +appendRecentConversation(slug, entry) void
        +upsertPersona(slug, fields) Object
    }

    class AuditStore {
        <<interface>>
        +appendEntry(entry) void
        +listEntries(filter?) Array
    }

    class MongoConversationStore {
        -collection: Collection
    }
    class MongoUserStore {
        -collection: Collection
    }
    class MongoPersonaStore {
        -collection: Collection
    }
    class MongoAuditStore {
        -collection: Collection
    }

    class ConnectionManager {
        +connectDB() Promise~Db~
        +getDb() Db
        +closeDB() Promise~void~
    }

    StoreFactory --> ConversationStore
    StoreFactory --> UserStore
    StoreFactory --> PersonaStore
    StoreFactory --> AuditStore
    StoreFactory --> ConnectionManager

    ConversationStore <|.. MongoConversationStore
    UserStore <|.. MongoUserStore
    PersonaStore <|.. MongoPersonaStore
    AuditStore <|.. MongoAuditStore

    MongoConversationStore --> ConnectionManager
    MongoUserStore --> ConnectionManager
    MongoPersonaStore --> ConnectionManager
    MongoAuditStore --> ConnectionManager
```

### Startup Sequence — MongoDB Backend

```mermaid
sequenceDiagram
    participant S as server.js
    participant F as Store Factory
    participant DB as db.js
    participant M as migration.js
    participant Mongo as MongoDB Atlas
    participant Conv as mongo/conversationStore
    participant User as mongo/userStore
    participant Pers as mongo/personaStore
    participant Aud as mongo/auditStore

    S->>F: init()
    F->>F: read STORE_BACKEND=mongodb
    F->>DB: connectDB()
    DB->>DB: build URI from MONGODB_URI or<br/>MONGODB_USERNAME + MONGODB_PASSWORD
    DB->>Mongo: MongoClient.connect()
    Mongo-->>DB: connected
    DB->>DB: store db reference (MONGODB_DB_NAME)
    DB->>Mongo: createIndexes()
    Mongo-->>DB: indexes ready
    DB-->>F: Db instance

    F->>M: runMigrations()
    M->>M: check for data/*.json files
    alt JSON files exist and no .migrated counterpart
        M->>M: parse JSON files
        M->>Mongo: insertMany(documents)
        M->>M: rename *.json → *.json.migrated
    else Already migrated or no files
        M->>M: skip
    end
    M-->>F: done

    F->>Conv: import module
    F->>User: import module
    F->>Pers: import module
    F->>Aud: import module
    F-->>S: stores ready

    S->>S: bootstrapAdminIfNeeded()
    S->>S: app.listen()
```

### Conversation CRUD — MongoDB Operations

```mermaid
sequenceDiagram
    participant Client as Browser
    participant Server as Express
    participant Store as mongo/conversationStore
    participant DB as db.js
    participant Mongo as MongoDB

    Note over Client,Mongo: Create Conversation
    Client->>Server: POST /api/conversations
    Server->>Store: createConversation(userId, message)
    Store->>DB: getDb()
    DB-->>Store: db
    Store->>Mongo: insertOne({id, userId, title, ...})
    Mongo-->>Store: result
    Store-->>Server: conversation object
    Server-->>Client: 201 Created

    Note over Client,Mongo: Append Message
    Client->>Server: POST /api/conversations/:id/messages
    Server->>Store: appendMessage(id, msg)
    Store->>Mongo: updateOne({id}, {$push: {messages: msg}, $set: {updatedAt}})
    Mongo-->>Store: result
    Store-->>Server: message object

    Note over Client,Mongo: Search Conversations
    Client->>Server: GET /api/conversations/search?q=...
    Server->>Store: searchConversations(userId, query, limit)
    Store->>Mongo: find({userId, "messages.content": {$regex}}).sort({updatedAt: -1}).limit()
    Mongo-->>Store: cursor
    Store->>Store: extract snippets (max 200 chars)
    Store-->>Server: search results
```

## Components and Interfaces

### 1. `src/db.js` — MongoDB Connection Manager

Manages the MongoDB client lifecycle. Only loaded when `STORE_BACKEND=mongodb`.

**Exports:**

| Function | Signature | Description |
|----------|-----------|-------------|
| `connectDB` | `() → Promise<Db>` | Connects to MongoDB, creates indexes, returns the Db instance |
| `getDb` | `() → Db` | Returns the cached Db instance; throws if not connected |
| `closeDB` | `() → Promise<void>` | Closes the MongoClient connection gracefully |

**Connection String Resolution:**
1. If `MONGODB_URI` is set, use it directly
2. Otherwise, compose from `MONGODB_USERNAME` and `MONGODB_PASSWORD` env vars using the Atlas connection string template: `mongodb+srv://{username}:{password}@solution-agent.ikuk2cg.mongodb.net/?appName=solution-agent`
3. If neither is available, log fatal error and exit with code 1

**Database Name:** Read from `MONGODB_DB_NAME` env var, default `capillary_agent`.

**Index Creation on Connect:**
Indexes are created via `createIndex` with `{ background: true }` after successful connection. See the Index Strategy section below for the full index specification.

**Error Handling:**
- Connection failure → log fatal error with sanitised URI (no password), `process.exit(1)`
- Index creation failure → log warning but do not exit (indexes may already exist)

### 2. `src/stores/mongo/conversationStore.js` — MongoDB Conversation Adapter

Implements the ConversationStore interface using the `conversations` MongoDB collection.

**Interface Methods:**

| Method | MongoDB Operation | Notes |
|--------|-------------------|-------|
| `listConversations(userId)` | `find({userId}).sort({updatedAt: -1}).project({messages: 0, plans: 0})` | Returns metadata only, no messages |
| `getConversation(id, userId)` | `findOne({id, userId})` | Returns full document with messages, or null |
| `createConversation(userId, firstMessage)` | `insertOne({id: uuid, userId, title, createdAt, updatedAt, compactedAt: null, messages: [], plans: []})` | Generates UUID via `crypto.randomUUID()` |
| `appendMessage(id, msg)` | `updateOne({id}, {$push: {messages: msg}, $set: {updatedAt: now}})` | Atomic `$push` — no read-modify-write |
| `deleteConversation(id, userId)` | `deleteOne({id, userId})` | Scoped by userId; returns `deletedCount > 0` |
| `setCompactedAt(id)` | `updateOne({id}, {$set: {compactedAt: now}})` | Timestamp marker for compaction |
| `savePlanState(id, plans)` | `updateOne({id}, {$set: {plans, updatedAt: now}})` | Replaces entire plans array |
| `searchConversations(userId, query, limit)` | `find({userId, "messages.content": {$regex: query, $options: "i"}}).sort({updatedAt: -1}).limit(limit)` | Case-insensitive regex on message content; extracts first matching snippet (max 200 chars) |

**Key Design Decisions:**
- `appendMessage` uses `$push` for atomic append — avoids the read-modify-write race condition that the JSON adapter handles with a write queue
- `searchConversations` uses `$regex` for case-insensitive search; a future optimisation could add a text index for `$text` search
- The `id` field (UUID) is used as the primary lookup key, not MongoDB's `_id`. The `_id` field is left as the default ObjectId for MongoDB internal use

### 3. `src/stores/mongo/userStore.js` — MongoDB User Adapter

Implements the UserStore interface using the `users` MongoDB collection.

**Interface Methods:**

| Method | MongoDB Operation | Notes |
|--------|-------------------|-------|
| `findUserByEmail(email)` | `findOne({email: {$regex: ^email$, $options: "i"}})` | Case-insensitive via regex; alternatively use collation |
| `createUser(opts)` | Hash password with bcrypt(12), `insertOne({id: uuid, ...fields})` | Catches `E11000` duplicate key → throws "User already exists" |
| `findUserById(id)` | `findOne({id})` | Direct lookup by UUID |
| `listUsers()` | `find({}).toArray()` | Returns all user documents |
| `updateUser(id, fields)` | `findOneAndUpdate({id}, {$set: fields}, {returnDocument: 'after'})` | Returns updated document or null |
| `deleteUser(id)` | `deleteOne({id})` | Returns `deletedCount > 0` |
| `upsertSsoUser(email)` | `findOneAndUpdate({email: regex}, {$setOnInsert: {id: uuid, ...defaults}}, {upsert: true, returnDocument: 'after'})` | Atomic find-or-create; `$setOnInsert` only sets fields on insert |

**Key Design Decisions:**
- Case-insensitive email lookup uses regex matching (consistent with the JSON adapter's `.toLowerCase()` approach). The unique index with case-insensitive collation enforces uniqueness at the DB level
- `upsertSsoUser` uses `findOneAndUpdate` with `upsert: true` for atomic find-or-create — no race condition between check and insert
- Password hashing with bcrypt(12 rounds) happens in the adapter before insert, matching the JSON adapter's behaviour
- The full user model includes all fields from the user-management spec: `id`, `firstName`, `lastName`, `email`, `passwordHash`, `role`, `passwordType`, `mustChangePassword`, `failedLoginAttempts`, `lockedUntil`, `createdAt`, `lastPasswordChange`, `createdBy`

### 4. `src/stores/mongo/personaStore.js` — MongoDB Persona Adapter

Implements the PersonaStore interface using the `personas` MongoDB collection.

**Interface Methods:**

| Method | MongoDB Operation | Notes |
|--------|-------------------|-------|
| `getPersona(slug)` | `findOne({slug: {$regex: ^slug$, $options: "i"}})` | Case-insensitive slug lookup |
| `appendRecentConversation(slug, entry)` | `updateOne({slug: regex}, {$push: {recentConversations: entry}, $set: {updatedAt: now}})` | Atomic `$push` append |
| `upsertPersona(slug, fields)` | `findOneAndUpdate({slug: regex}, {$set: {...fields, updatedAt: now}, $setOnInsert: {slug, ...defaults}}, {upsert: true, returnDocument: 'after'})` | Atomic upsert with defaults on insert |

**Key Design Decisions:**
- Case-insensitive slug lookup via regex, with uniqueness enforced by the collated unique index
- `appendRecentConversation` throws if the persona doesn't exist (matching JSON adapter behaviour)
- `upsertPersona` merges fields on update, sets defaults on insert — matching the JSON adapter's merge semantics

### 5. `src/stores/mongo/auditStore.js` — MongoDB Audit Adapter

Implements the AuditStore interface using the `audit` MongoDB collection. This adapter is currently missing from the store factory's MongoDB branch.

**Interface Methods:**

| Method | MongoDB Operation | Notes |
|--------|-------------------|-------|
| `appendEntry(entry)` | `insertOne(entry)` | Append-only; entries are never modified |
| `listEntries(filter?)` | `find(filter || {}).sort({timestamp: -1}).toArray()` | Optional filter by `event`, `actor`, `target` |

**Key Design Decisions:**
- Audit entries are append-only and immutable — no update or delete operations
- The `listEntries` filter matches the JSON adapter's field-based filtering: `event`, `actor`, `target`
- Sorted by `timestamp` descending (most recent first) by default

### 6. `src/migration.js` — One-Time Data Migration

Migrates existing JSON flat-file data into MongoDB when switching backends. Called once at startup after `connectDB()` when `STORE_BACKEND=mongodb`.

**Migration Flow:**

```mermaid
flowchart TD
    Start[runMigrations called] --> CheckConv{data/conversations.json<br/>exists?}
    CheckConv -->|Yes| CheckConvMig{.migrated<br/>exists?}
    CheckConv -->|No| CheckUsers
    CheckConvMig -->|No| MigrateConv[Parse JSON<br/>Insert conversations<br/>Rename to .migrated]
    CheckConvMig -->|Yes| CheckUsers
    MigrateConv --> CheckUsers

    CheckUsers{data/users.json<br/>exists?} -->|Yes| CheckUsersMig{.migrated<br/>exists?}
    CheckUsers -->|No| CheckPersonas
    CheckUsersMig -->|No| MigrateUsers[Parse JSON<br/>Insert users<br/>Rename to .migrated]
    CheckUsersMig -->|Yes| CheckPersonas
    MigrateUsers --> CheckPersonas

    CheckPersonas{data/personas.json<br/>exists?} -->|Yes| CheckPersMig{.migrated<br/>exists?}
    CheckPersonas -->|No| CheckAudit
    CheckPersMig -->|No| MigratePersonas[Parse JSON<br/>Insert personas<br/>Rename to .migrated]
    CheckPersMig -->|Yes| CheckAudit
    MigratePersonas --> CheckAudit

    CheckAudit{data/audit.json<br/>exists?} -->|Yes| CheckAuditMig{.migrated<br/>exists?}
    CheckAudit -->|No| Done
    CheckAuditMig -->|No| MigrateAudit[Parse JSON<br/>Insert audit entries<br/>Rename to .migrated]
    CheckAuditMig -->|Yes| Done
    MigrateAudit --> Done[Migration complete]
```

**Files Migrated:**

| Source File | Target Collection | Transform |
|-------------|-------------------|-----------|
| `data/conversations.json` | `conversations` | Extract values from `conversations` object → array of documents |
| `data/users.json` | `users` | Array → direct insert |
| `data/personas.json` | `personas` | Extract values from `personas` object → array of documents |
| `data/audit.json` | `audit` | Array → direct insert |

**Idempotency:** Each file is renamed to `*.json.migrated` after successful insertion. On subsequent startups, the migration checks for the `.migrated` counterpart and skips if present.

**Error Handling:**
- Corrupt/unparseable JSON → log error, skip that file, do NOT rename to `.migrated`
- Partial insert failure → log which records failed, do NOT rename (migration retries on next startup)
- Empty source file → skip gracefully (no documents to insert)

### 7. Store Factory Update — `src/stores/index.js`

The existing MongoDB branch in the store factory imports conversation, user, and persona stores but does NOT initialise the audit store. This needs to be fixed.

**Changes Required:**
- Import `src/stores/mongo/auditStore.js` in the MongoDB branch
- Assign it to the `auditStore` module variable
- Import and call `runMigrations()` from `src/migration.js` after `connectDB()` and before importing adapters

## Data Models

### MongoDB Collection Schemas

#### `conversations` Collection

```javascript
{
  _id: ObjectId,                    // MongoDB auto-generated
  id: String,                       // UUID — primary lookup key
  userId: String,                   // UUID — scoping key
  title: String,                    // First message truncated to 80 chars
  createdAt: String,                // ISO 8601 timestamp
  updatedAt: String,                // ISO 8601 timestamp
  compactedAt: String | null,       // ISO 8601 timestamp or null
  messages: [
    {
      role: "user" | "assistant",
      content: String,
      skillsUsed: [String],         // optional
      escalated: Boolean,           // optional
      files: [String],              // optional — original filenames
      timestamp: String             // ISO 8601
    }
  ],
  plans: [                          // persisted plan state
    {
      planId: String,
      title: String,
      steps: [
        { description: String, status: "pending" | "in_progress" | "completed" | "skipped" }
      ],
      createdAt: String,
      updatedAt: String
    }
  ]
}
```

#### `users` Collection

```javascript
{
  _id: ObjectId,
  id: String,                       // UUID
  firstName: String,
  lastName: String,
  email: String,                    // unique (case-insensitive via collation)
  passwordHash: String | null,      // null for SSO users
  role: "admin" | "user",
  passwordType: "one-time" | "permanent" | null,
  mustChangePassword: Boolean,
  failedLoginAttempts: Number,      // integer, default 0
  lockedUntil: String | null,       // ISO 8601 or null
  createdAt: String,                // ISO 8601
  lastPasswordChange: String | null,// ISO 8601 or null
  createdBy: String                 // admin email | "system" | "sso"
}
```

#### `personas` Collection

```javascript
{
  _id: ObjectId,
  slug: String,                     // unique (case-insensitive via collation)
  displayName: String,
  overview: String,
  modules: String,
  knownIssues: String,
  recentConversations: [
    {
      date: String,                 // ISO 8601
      summary: String
    }
  ],
  updatedAt: String                 // ISO 8601
}
```

#### `audit` Collection

```javascript
{
  _id: ObjectId,
  id: String,                       // UUID
  event: String,                    // USER_CREATED | PASSWORD_CHANGED | PASSWORD_RESET | LOGIN_FAILED | ACCOUNT_LOCKED | LOGIN_SUCCESS
  actor: String,                    // email of the user performing the action
  target: String | null,            // email of the affected user, if different
  details: Object | null,           // additional context
  timestamp: String                 // ISO 8601
}
```

### Index Strategy

All indexes are created by `src/db.js` on first connect using `createIndex` with `{ background: true }`.

#### `conversations` Collection Indexes

| Index | Fields | Options | Purpose |
|-------|--------|---------|---------|
| User listing | `{ userId: 1, updatedAt: -1 }` | — | List conversations sorted by recency, scoped by user |
| Unique ID | `{ id: 1 }` | `{ unique: true }` | Direct lookup by conversation UUID |

#### `users` Collection Indexes

| Index | Fields | Options | Purpose |
|-------|--------|---------|---------|
| Unique email | `{ email: 1 }` | `{ unique: true, collation: { locale: 'en', strength: 2 } }` | Case-insensitive email uniqueness |
| Unique ID | `{ id: 1 }` | `{ unique: true }` | Direct lookup by user UUID |

#### `personas` Collection Indexes

| Index | Fields | Options | Purpose |
|-------|--------|---------|---------|
| Unique slug | `{ slug: 1 }` | `{ unique: true, collation: { locale: 'en', strength: 2 } }` | Case-insensitive slug uniqueness |

#### `audit` Collection Indexes

| Index | Fields | Options | Purpose |
|-------|--------|---------|---------|
| Timestamp sort | `{ timestamp: -1 }` | — | List entries in reverse chronological order |
| Event filter | `{ event: 1, timestamp: -1 }` | — | Filter by event type with time ordering |

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STORE_BACKEND` | No | `json` | Storage backend: `json` or `mongodb` |
| `MONGODB_URI` | When `mongodb`* | — | Full MongoDB connection string |
| `MONGODB_USERNAME` | When `mongodb`* | — | MongoDB Atlas username (alternative to MONGODB_URI) |
| `MONGODB_PASSWORD` | When `mongodb`* | — | MongoDB Atlas password (alternative to MONGODB_URI) |
| `MONGODB_DB_NAME` | No | `capillary_agent` | MongoDB database name |

*Either `MONGODB_URI` or both `MONGODB_USERNAME` + `MONGODB_PASSWORD` must be set when `STORE_BACKEND=mongodb`.


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Conversation round-trip via MongoDB

*For any* valid conversation data (userId, firstMessage), creating a conversation via the MongoDB adapter and then retrieving it by ID (scoped to the same userId) SHALL return a document containing all original fields (`id`, `userId`, `title`, `createdAt`, `updatedAt`, `compactedAt: null`, `messages: []`, `plans: []`).

**Validates: ConversationStore interface contract — createConversation + getConversation**

### Property 2: Conversation user scoping via MongoDB

*For any* two distinct userIds and any set of conversations created by each user, listing or retrieving conversations for userId A via the MongoDB adapter SHALL never return conversations belonging to userId B, and vice versa.

**Validates: ConversationStore interface contract — listConversations, getConversation, deleteConversation**

### Property 3: Message append atomicity

*For any* conversation with N existing messages, appending a message via the MongoDB adapter SHALL result in N+1 messages where the first N messages are unchanged and the (N+1)th message matches the appended data. The `updatedAt` timestamp SHALL be updated.

**Validates: ConversationStore interface contract — appendMessage**

### Property 4: User round-trip with case-insensitive email lookup

*For any* valid user creation input (email, password, role, firstName, lastName, passwordType), creating a user via the MongoDB adapter and then looking up by email with any casing variation SHALL return the same user record with all original fields intact and `passwordHash` verifiable via bcrypt.compare against the original password.

**Validates: UserStore interface contract — createUser + findUserByEmail**

### Property 5: Duplicate email rejection is case-insensitive

*For any* email string and any case transformation of that email, attempting to create a second user with the case-transformed email via the MongoDB adapter SHALL throw an error with message "User already exists".

**Validates: UserStore interface contract — createUser uniqueness**

### Property 6: SSO upsert idempotence

*For any* email string, calling `upsertSsoUser` N times (N ≥ 1) via the MongoDB adapter SHALL always return the same user record (same `id`) and SHALL result in exactly one user document in the collection for that email. The returned user SHALL have `passwordHash: null` and `mustChangePassword: false`.

**Validates: UserStore interface contract — upsertSsoUser**

### Property 7: User update round-trip

*For any* existing user and any valid update fields (firstName, lastName, role, failedLoginAttempts, lockedUntil, mustChangePassword, passwordHash), calling `updateUser` and then `findUserById` SHALL return a user record reflecting the updated values while preserving all non-updated fields.

**Validates: UserStore interface contract — updateUser + findUserById**

### Property 8: Persona round-trip with case-insensitive slug lookup

*For any* valid persona data (slug, displayName, overview, modules, knownIssues), upserting a persona via the MongoDB adapter and then retrieving it by slug with any casing variation SHALL return the same persona document with all original fields.

**Validates: PersonaStore interface contract — upsertPersona + getPersona**

### Property 9: Persona recent conversation append preserves existing entries

*For any* persona with N existing `recentConversations` entries, appending a new entry via the MongoDB adapter SHALL result in N+1 entries where the first N entries are unchanged and the (N+1)th entry matches the appended data.

**Validates: PersonaStore interface contract — appendRecentConversation**

### Property 10: Audit entry append-only integrity

*For any* sequence of N audit entries appended via the MongoDB adapter, calling `listEntries()` SHALL return all N entries with all fields preserved. Entries SHALL never be modified or deleted.

**Validates: AuditStore interface contract — appendEntry + listEntries**

### Property 11: Audit entry filtering correctness

*For any* set of audit entries with varying `event`, `actor`, and `target` fields, calling `listEntries(filter)` SHALL return exactly those entries matching all specified filter fields (AND logic). Omitted filter fields SHALL not constrain the results.

**Validates: AuditStore interface contract — listEntries with filter**

### Property 12: Migration idempotency

*For any* valid source data (conversations JSON, users JSON, personas JSON, audit JSON), running the migration routine twice SHALL produce the same set of records in the database as running it once — no duplicates, no data corruption. The source files SHALL be renamed to `.migrated` after the first successful run.

**Validates: Migration correctness — src/migration.js**

### Property 13: Search results scoping and case-insensitivity

*For any* userId and any search query string, `searchConversations(userId, query, limit)` via the MongoDB adapter SHALL return only conversations belonging to that userId. Searching with any casing variation of the same query SHALL return the same set of conversation IDs.

**Validates: ConversationStore interface contract — searchConversations**

### Property 14: Search snippet length constraint

*For any* search result returned by `searchConversations` via the MongoDB adapter, the `snippet` field SHALL be at most 200 characters in length.

**Validates: ConversationStore interface contract — searchConversations snippet**

### Property 15: Connection manager lifecycle

*For any* sequence of `connectDB()` → `getDb()` → `closeDB()`, calling `getDb()` after `connectDB()` SHALL return a valid Db instance. Calling `getDb()` before `connectDB()` or after `closeDB()` SHALL throw an error.

**Validates: Connection manager contract — src/db.js**

## Error Handling

### Connection Errors

| Scenario | Behaviour |
|----------|-----------|
| `STORE_BACKEND=mongodb` and neither `MONGODB_URI` nor `MONGODB_USERNAME`+`MONGODB_PASSWORD` set | Log fatal error, `process.exit(1)` |
| MongoDB connection fails (network, auth, DNS) | Log fatal error with sanitised URI (no password), `process.exit(1)` |
| MongoDB connection drops during operation | MongoDB driver auto-reconnects; operations may fail with transient errors |
| `getDb()` called before `connectDB()` | Throws `"Database not connected — call connectDB() first"` |

### Store Adapter Errors

| Scenario | Behaviour |
|----------|-----------|
| `createUser` with duplicate email | Catches MongoDB `E11000` duplicate key error → throws `"User already exists"` |
| `appendMessage` on non-existent conversation | `updateOne` matches 0 documents → throws `"Conversation {id} not found"` |
| `appendRecentConversation` on non-existent persona | `updateOne` matches 0 documents → throws `"Persona {slug} not found"` |
| `deleteConversation` with wrong userId | `deleteOne({id, userId})` matches 0 → returns `false` |
| `findUserByEmail` / `findUserById` not found | Returns `null` |
| `getPersona` not found | Returns `null` |
| `updateUser` on non-existent user | `findOneAndUpdate` returns `null` → returns `null` |

### Migration Errors

| Scenario | Behaviour |
|----------|-----------|
| Source JSON file is corrupt/unparseable | Log error with filename, skip that file, do NOT rename to `.migrated` |
| Partial insert failure | Log which records failed, do NOT rename to `.migrated` (retries on next startup) |
| `.migrated` file already exists | Skip migration for that file entirely (idempotent) |
| Empty source file (empty array or empty object) | Skip gracefully — no documents to insert |
| `data/` directory doesn't exist | Skip all migrations — nothing to migrate |

### Index Creation Errors

| Scenario | Behaviour |
|----------|-----------|
| Index already exists with same spec | No-op (MongoDB handles this gracefully) |
| Index creation fails (permissions, conflicting index) | Log warning, continue startup — app may have degraded performance but remains functional |

## Testing Strategy

### Property-Based Tests (fast-check + vitest)

Property tests validate the MongoDB adapter contract. Since MongoDB requires a running instance, tests use `mongodb-memory-server` for an in-process MongoDB instance, or alternatively test against the store interface using the JSON adapter as a reference implementation.

**Configuration:** Minimum 100 iterations per property test. Tests involving bcrypt use 20 iterations due to hashing cost.

**Test Files:**

| File | Properties Covered | What's Tested |
|------|-------------------|---------------|
| `src/__tests__/mongoConversationStore.prop.test.js` | P1, P2, P3, P13, P14 | Conversation round-trip, user scoping, message append, search |
| `src/__tests__/mongoUserStore.prop.test.js` | P4, P5, P6, P7 | User round-trip, email uniqueness, SSO upsert, update |
| `src/__tests__/mongoPersonaStore.prop.test.js` | P8, P9 | Persona round-trip, append preservation |
| `src/__tests__/mongoAuditStore.prop.test.js` | P10, P11 | Audit append-only, filtering |
| `src/__tests__/migration.prop.test.js` | P12 | Migration idempotency |

### Unit Tests (vitest)

Example-based tests for specific scenarios and edge cases:

| File | What's Tested |
|------|---------------|
| `src/__tests__/db.test.js` | Connection lifecycle (P15), URI composition from env vars, missing env var handling, fatal exit on connection failure |
| `src/__tests__/migration.test.js` | Corrupt JSON handling, partial insert recovery, already-migrated skip, empty files, missing data directory |
| `src/__tests__/mongoConversationStore.test.js` | Empty conversation list, delete non-existent, setCompactedAt, savePlanState |
| `src/__tests__/mongoUserStore.test.js` | Duplicate email E11000 handling, listUsers empty, deleteUser non-existent |
| `src/__tests__/mongoPersonaStore.test.js` | Missing persona returns null, appendRecentConversation on missing persona throws |
| `src/__tests__/mongoAuditStore.test.js` | Empty filter returns all, filter by event type, filter by actor |
| `src/__tests__/storeFactory.test.js` | Factory initialises audit store for MongoDB backend, factory rejects invalid STORE_BACKEND |

### Integration Tests

| Test | What's Verified |
|------|-----------------|
| Store adapter swap | Same test suite passes against both JSON-file and MongoDB adapters |
| Full conversation lifecycle | Create → append → list (scoped) → search → delete via MongoDB |
| Full user lifecycle | Create → findByEmail → update → listUsers → delete via MongoDB |
| Startup migration flow | JSON files → MongoDB → `.migrated` rename → re-run skips |
| Audit logging end-to-end | Auth events → auditLogger → MongoDB audit collection |

### Test Configuration

- **Runner:** `vitest --run` (single execution, no watch mode)
- **PBT library:** `fast-check` v4.7.0 (already in devDependencies)
- **MongoDB for tests:** `mongodb-memory-server` (devDependency) for isolated in-process MongoDB
- **Minimum iterations:** 100 per property test
- **bcrypt-bound tests:** 20 iterations

## Performance Considerations

- **Index coverage:** All query patterns are covered by indexes. The `{ userId: 1, updatedAt: -1 }` compound index on conversations supports both the listing query and the search query (userId prefix match)
- **Atomic operations:** `$push` for message append and recent conversation append avoids read-modify-write cycles, reducing latency and eliminating race conditions
- **Projection:** `listConversations` projects out `messages` and `plans` arrays to avoid transferring large documents over the wire
- **Connection pooling:** The `mongodb` driver manages a connection pool internally (default 100 connections). The single `MongoClient` instance is shared across all adapters via `getDb()`
- **Search performance:** `$regex` search on `messages.content` performs a collection scan within userId-scoped documents. For the expected data volume (hundreds of conversations per user, not millions), this is acceptable. A text index can be added later if needed

## Security Considerations

- **Connection string secrets:** `MONGODB_USERNAME` and `MONGODB_PASSWORD` are read from environment variables, never hardcoded. The connection URI is sanitised (password replaced with `***`) in all log output
- **No raw `_id` exposure:** API responses use the application-level `id` (UUID) field, never MongoDB's `_id` ObjectId
- **Password hashing:** bcrypt with 12 rounds, matching the JSON adapter. Password hashes are stored in MongoDB but never returned in API responses (stripped by `stripPasswordHash` in `auth.js`)
- **User scoping:** All conversation operations are scoped by `userId` at the query level — the MongoDB adapter enforces this in every query, not just in application logic
- **Audit trail:** All security events are persisted to the `audit` collection, providing a tamper-evident log (append-only, no update/delete operations)

## Dependencies

| Dependency | Version | Type | Purpose |
|------------|---------|------|---------|
| `mongodb` | `^6.12.0` | production | MongoDB driver for Node.js |
| `mongodb-memory-server` | `^10.0.0` | dev | In-process MongoDB for testing |

The `mongodb` package is added to `package.json` `dependencies`. It is only loaded at runtime when `STORE_BACKEND=mongodb` (dynamic import in the store factory).

`mongodb-memory-server` is added to `devDependencies` for running property-based and unit tests against a real MongoDB instance without requiring external infrastructure.
