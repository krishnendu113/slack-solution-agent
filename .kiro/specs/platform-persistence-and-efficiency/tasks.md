# Implementation Plan: Platform Persistence & Efficiency

## Overview

This plan implements the store adapter pattern for the Capillary Solution Agent, adds context compaction, intent-based dynamic tool/skill loading, an off-topic gate, full skill catalogue exposure, and agent planning tools. Tasks are ordered in two phases:

- **Phase 1 (JSON-file adapters):** Define store interfaces, implement JSON-file adapters (upgrading existing flat-file code), wire all features to the adapter interface. Ships immediately with zero new infrastructure.
- **Phase 2 (MongoDB adapters):** Add MongoDB adapter implementations behind the same interface, plus data migration. Swap in when MongoDB is provisioned.

All features (compaction, preflight, plans, skill catalogue, tool filtering) work with either backend via the store factory.

## Tasks

- [x] 1. Create store interfaces and factory
  - [x] 1.1 Create `src/stores/index.js` — store factory module
    - Export `init()`, `getConversationStore()`, `getUserStore()`, `getPersonaStore()`
    - Read `STORE_BACKEND` env var (default: `json`, valid values: `json`, `mongodb`)
    - When `json`: import and return JSON-file adapter instances
    - When `mongodb`: import and return MongoDB adapter instances, call `connectDB()` in `init()`
    - On invalid `STORE_BACKEND` value: log fatal error and `process.exit(1)`
    - Update `.env.example` with `STORE_BACKEND`, `MONGODB_URI`, `MONGODB_DB_NAME`, and `CONTEXT_COMPACTION_THRESHOLD` with descriptions and example values
    - _Requirements: 1.1, NFR-2, NFR-3_

- [x] 2. Implement JSON-file adapters (Phase 1)
  - [x] 2.1 Create `src/stores/json/conversationStore.js`
    - Implement `ConversationStore` interface using JSON file persistence (`data/conversations.json`)
    - Upgrade existing `src/store.js` logic to match new interface: add `userId` scoping to all list/get operations, add `compactedAt` and `plans` fields
    - Use write-queue pattern from existing `src/store.js` for atomic writes
    - Export `init()` to load data from disk, `listConversations(userId)`, `getConversation(id, userId)`, `createConversation(userId, firstMessage)`, `appendMessage(id, msg)`, `deleteConversation(id, userId)`, `setCompactedAt(id)`, `savePlanState(id, plans)`
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 9.6, NFR-4_

  - [x]* 2.2 Write property test for conversation round-trip (Property 1)
    - **Property 1: Conversation round-trip**
    - Create a conversation via the store interface, append messages, retrieve by ID scoped to same userId — all fields and messages preserved in order
    - Test against the JSON-file adapter
    - **Validates: Requirements 1.1, 1.2**

  - [x]* 2.3 Write property test for conversation user scoping (Property 2)
    - **Property 2: Conversation user scoping**
    - Create conversations for two distinct userIds, verify listing/retrieval for userId A never returns userId B's conversations
    - Test against the JSON-file adapter
    - **Validates: Requirements 1.4**

  - [x] 2.4 Create `src/stores/json/userStore.js`
    - Implement `UserStore` interface using JSON file persistence (`data/users.json`)
    - Upgrade existing `src/auth.js` user helpers to match new interface
    - `findUserByEmail` uses `.toLowerCase()` comparison for case-insensitive lookup
    - `createUser` hashes password with bcrypt before insert
    - `upsertSsoUser` checks in-memory, creates if not found, returns existing if found
    - Throw on duplicate email (matching current behaviour)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.7_

  - [x]* 2.5 Write property test for user store round-trip (Property 4)
    - **Property 4: User store round-trip with case-insensitive lookup**
    - Create a user, look up by email with any casing variation — same user record returned
    - Test against the JSON-file adapter
    - **Validates: Requirements 2.1, 2.2**

  - [x]* 2.6 Write property test for SSO upsert idempotence (Property 5)
    - **Property 5: SSO upsert idempotence**
    - Call `upsertSsoUser` N times for the same email — always returns same record, exactly one user in store
    - Test against the JSON-file adapter
    - **Validates: Requirements 2.4**

  - [x] 2.7 Create `src/stores/json/personaStore.js`
    - Implement `PersonaStore` interface using JSON file persistence (`data/personas.json`)
    - `getPersona` uses case-insensitive lookup on `slug`, returns `null` for missing slugs
    - `appendRecentConversation` appends to array in-memory, flushes to disk
    - `upsertPersona` creates or updates persona document
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.7_

  - [x]* 2.8 Write property test for persona store round-trip (Property 6)
    - **Property 6: Persona store round-trip with case-insensitive lookup**
    - Upsert a persona, retrieve by slug with any casing variation — same document returned
    - Test against the JSON-file adapter
    - **Validates: Requirements 3.1, 3.2**

  - [x]* 2.9 Write property test for persona append preservation (Property 7)
    - **Property 7: Persona append preserves existing entries**
    - Persona with N existing `recentConversations` entries, append one — result has N+1 entries, first N unchanged
    - Test against the JSON-file adapter
    - **Validates: Requirements 3.4**

- [x] 3. Checkpoint — Verify JSON-file adapters compile and pass tests
  - Ensure all store interface tests pass against JSON-file adapters, ask the user if questions arise.

- [x] 4. Implement context compaction service
  - [x] 4.1 Create `src/compaction.js`
    - Export `estimateTokens(messages)` — sums `content.length / 3.5` across all messages
    - Export `compactIfNeeded(messages, threshold?)` — if estimate > threshold, summarise oldest messages (excluding last 4) via Haiku, replace with single summary message
    - Threshold from `CONTEXT_COMPACTION_THRESHOLD` env var, default 60000
    - On Haiku failure: log error, return original messages unchanged
    - Works with either store backend (no store dependency)
    - _Requirements: 4.1, 4.2, 4.3, 4.6, 4.7_

  - [x]* 4.2 Write property test for compaction (Property 8)
    - **Property 8: Compaction preserves recent messages and reduces total**
    - For any message array exceeding threshold: last 4 messages identical to original, total count strictly less, first message is summary with role `user`
    - Mock Haiku call to return deterministic summary
    - **Validates: Requirements 4.2**

- [x] 5. Implement plan manager
  - [x] 5.1 Create `src/planManager.js`
    - Export `createPlan(title, steps)`, `updatePlanStep(planId, stepIndex, status)`, `getPlan(planId)`, `getAllPlans()`, `clearPlans()`
    - Plans stored in module-level `Map<string, Plan>`
    - `createPlan` validates non-empty title and steps, generates UUID `planId`, initialises all steps to `pending`
    - `updatePlanStep` validates `stepIndex` bounds and `status` enum (`pending`, `in_progress`, `completed`, `skipped`)
    - Return descriptive error strings for invalid inputs
    - Works with either store backend (plans persisted via store interface's `savePlanState`)
    - _Requirements: 9.1, 9.2, 9.3, 9.8_

  - [x]* 5.2 Write property test for plan update isolation (Property 13)
    - **Property 13: Plan update isolation**
    - For any plan with N steps, updating step I to status S changes only step I, all others unchanged
    - **Validates: Requirements 9.2**

  - [x]* 5.3 Write property test for plan create-get round-trip (Property 14)
    - **Property 14: Plan create-get round-trip**
    - Create a plan, call `getPlan` — title matches, steps match, all statuses `pending`
    - **Validates: Requirements 9.1, 9.3**

  - [x]* 5.4 Write property test for plan input validation (Property 15)
    - **Property 15: Plan input validation**
    - Empty/whitespace title or empty steps array → error returned, no plan created
    - **Validates: Requirements 9.8**

- [x] 6. Checkpoint — Verify compaction and plan manager pass tests
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement preflight gate and intent classifier
  - [x] 7.1 Create `src/preflight.js`
    - Export `runPreflight(problemText)` returning `{ onTopic, refusalMessage?, classification, toolTags, skillIds, skillReasons }`
    - Single Haiku call with combined prompt for gate decision, request classification, tool tags, and skill IDs
    - 3-second timeout; on timeout or failure, return fail-open defaults (`onTopic: true`, all tools, keyword-based skill matching)
    - Gate confidence threshold: ≥ 0.85 to classify as off-topic
    - Works with either store backend (no store dependency)
    - _Requirements: 5.1, 5.2, 5.5, 6.1, 7.1, 7.2, 7.5, 7.6, 7.8_

  - [x]* 7.2 Write property test for gate confidence threshold (Property 11)
    - **Property 11: Gate confidence threshold**
    - Message blocked iff `offTopicConfidence >= 0.85`; all below 0.85 proceed
    - **Validates: Requirements 7.6**

- [x] 8. Add dynamic tool filtering and skill catalogue
  - [x] 8.1 Update `src/tools/index.js` — add `getToolsByIntent(toolTags)` and plan tool definitions
    - Add `PLAN_DEFINITIONS` array with `create_plan`, `update_plan_step`, `get_plan` tool definitions
    - Add `getToolsByIntent(toolTags)` function: filters tools by category tags, always includes `list_skills`, `activate_skill`, and plan tools
    - If `toolTags` is empty/null, return all tools (fallback)
    - Add tool-to-category mapping: `jira`, `confluence`, `kapa_docs`, `web_search`
    - Add plan tool handling in the `handle()` dispatcher (route to `planManager`)
    - _Requirements: 5.2, 5.3, 5.4, 9.1, 9.2, 9.3, 9.7_

  - [x]* 8.2 Write property test for tool filtering (Property 9)
    - **Property 9: Tool filtering respects tags and always includes meta-tools**
    - For any non-empty tag set: every non-meta tool belongs to a tagged category, `list_skills`/`activate_skill` always present, plan tools always present
    - **Validates: Requirements 5.2, 5.3, 9.7**

  - [x] 8.3 Add `getSkillCatalogue()` to `src/skillLoader.js`
    - Return compact markdown block listing all skills from `registry.json` (ID, description, trigger hints)
    - Does NOT include full SKILL.md content
    - _Requirements: 8.1, 8.3, 8.6_

  - [x]* 8.4 Write property test for skill catalogue completeness (Property 12)
    - **Property 12: Skill catalogue completeness and compactness**
    - For N skills in registry: catalogue contains ID and description of every skill, does NOT contain full SKILL.md content
    - **Validates: Requirements 8.1, 8.3**

- [x] 9. Checkpoint — Verify tool filtering, skill catalogue, and preflight pass tests
  - Ensure all tests pass, ask the user if questions arise.

- [-] 10. Rewire LangGraph state machine
  - [x] 10.1 Update `src/graph.js` — replace `classify` with `preflight` node
    - Replace the `classifyNode` with a new `preflightNode` that calls `runPreflight()`
    - If `onTopic === false`, short-circuit to END with refusal message (emit `status` SSE `"🚫 Off-topic request detected"` and stream refusal via `token` events)
    - Run gate classification in parallel with existing pre-flight checks
    - _Requirements: 7.1, 7.3, 7.4, 7.7, 7.8_

  - [x] 10.2 Update `src/graph.js` — add `compactIfNeeded` node in research loop
    - Add new `compactIfNeeded` graph node that calls `compactIfNeeded()` from `src/compaction.js`
    - Insert between research turns: after tool execution, before next Anthropic API call
    - Emit `status` SSE `"🗜️ Compacting context..."` when compaction occurs
    - Store `compactedAt` timestamp via `setCompactedAt()` on the conversation store (via adapter interface)
    - _Requirements: 4.1, 4.2, 4.5, NFR-4, NFR-7_

  - [x] 10.3 Update `src/graph.js` — integrate plan tools and skill catalogue
    - Add `plans`, `toolTags`, `onTopic`, `refusalMessage`, `skillCatalogue`, `compacted` state channels
    - In `loadSkillsNode`, inject `getSkillCatalogue()` output into system prompt (always present)
    - Use `getToolsByIntent(toolTags)` instead of `getTools()` in the research node
    - Wire `onPlanUpdate` SSE callback: emit `plan_update` event after `create_plan` or `update_plan_step` tool execution
    - Persist plan state via `savePlanState()` on the conversation store (via adapter interface)
    - Log selected tool names and intent tags at `[graph:tools]` level
    - Log loaded skill IDs and reasons at `[graph:skills]` level
    - _Requirements: 5.2, 5.6, 6.6, 6.7, 8.1, 8.2, 8.7, 9.4, 9.5, 9.7_

  - [x] 10.4 Update `src/graph.js` — update graph wiring and conditional edges
    - Wire: `__start__` → `preflight` → conditional (off-topic → `__end__`, on-topic → `loadSkills`)
    - Wire research loop: `research` → `compactIfNeeded` → `research` (on tool_use), `research` → `validate` (on end_turn)
    - Ensure `skillRouter` conditional edges remain intact for single vs multi-node paths
    - _Requirements: 7.3, 4.1_

- [x] 11. Update orchestrator and auth modules
  - [x] 11.1 Update `src/orchestrator.js` — use preflight instead of `classifyRequest`
    - Remove the inline `classifyRequest` function (now handled by `preflight` node in graph)
    - Pass `userId` through to graph invocation for store scoping
    - Add `onPlanUpdate` callback to the callbacks object passed to `buildGraph()`
    - _Requirements: 7.1, 1.4, 9.4_

  - [x] 11.2 Update `src/auth.js` — use store adapter instead of file-based helpers
    - Replace `loadUsers()`, `saveUsers()`, `findUserByEmail()`, `createUser()`, `upsertSsoUser()` with imports from `src/stores/index.js` (via `getUserStore()`)
    - Update `bootstrapAdminIfNeeded()` to use `getUserStore().findUserByEmail` and `getUserStore().createUser`
    - Update login route to use `getUserStore().findUserByEmail`
    - Update register route to use `getUserStore().createUser` (catch duplicate → 409)
    - Update SSO callback to use `getUserStore().upsertSsoUser`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 12. Update server startup and routes
  - [x] 12.1 Update `src/server.js` — use store factory and new store routes
    - Import `init` from `src/stores/index.js` and call at startup before `app.listen()` (replaces `store.init()`)
    - Import conversation store via `getConversationStore()` from `src/stores/index.js`
    - Replace `import * as store from './store.js'` with store factory imports
    - Update all conversation routes to pass `req.session.userId` for user scoping
    - Pass `userId` to `runAgent()` call for downstream store scoping
    - Add `plan_update` SSE event forwarding in the message endpoint
    - _Requirements: 1.4, NFR-2_

  - [x]* 12.2 Write property test for skill loading respects intent (Property 10)
    - **Property 10: Skill loading respects intent classification**
    - Loaded skills equal union of intent-identified skills + alwaysLoad skills (with cr-evaluator re-evaluation for general_query)
    - **Validates: Requirements 6.2, 6.3, 6.4**

- [x] 13. Checkpoint — Verify all Phase 1 features pass tests with JSON-file backend
  - Ensure all tests pass with `STORE_BACKEND=json` (default), ask the user if questions arise.

- [ ] 14. Implement MongoDB adapters (Phase 2)
  - [ ] 14.1 Add `mongodb` dependency and create `src/db.js`
    - Add `mongodb` to dependencies in `package.json`
    - Create `src/db.js` — MongoDB connection manager
    - Export `connectDB()`, `getDb()`, `closeDB()`
    - Read `MONGODB_URI` (required when `STORE_BACKEND=mongodb`) and `MONGODB_DB_NAME` (default: `capillary_agent`) from env
    - On connection failure, log fatal error and `process.exit(1)`
    - Create indexes on first connect: conversations (`userId`, `id` unique), users (`email` unique with case-insensitive collation, `id` unique), personas (`slug` unique with case-insensitive collation)
    - _Requirements: 1.1, 2.7, 3.7, NFR-2, NFR-3_

  - [ ] 14.2 Create `src/stores/mongo/conversationStore.js`
    - Implement `ConversationStore` interface using MongoDB
    - `appendMessage` uses `$push` for atomic message append
    - `savePlanState` uses `$set` on the `plans` field
    - All list/get operations scoped by `userId`
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 9.6, NFR-4_

  - [ ] 14.3 Create `src/stores/mongo/userStore.js`
    - Implement `UserStore` interface using MongoDB
    - `findUserByEmail` uses case-insensitive regex query
    - `createUser` hashes password with bcrypt before insert
    - `upsertSsoUser` uses `findOneAndUpdate` with `upsert: true`
    - Unique index on `email` prevents duplicates (catch `E11000` → 409 Conflict)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.7_

  - [ ] 14.4 Create `src/stores/mongo/personaStore.js`
    - Implement `PersonaStore` interface using MongoDB
    - `getPersona` uses case-insensitive lookup on `slug`, returns `null` for missing slugs
    - `appendRecentConversation` uses `$push` for atomic append
    - `upsertPersona` uses `findOneAndUpdate` with `upsert: true`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.7_

  - [ ] 14.5 Update store factory to wire MongoDB adapters
    - Update `src/stores/index.js` to dynamically import MongoDB adapters when `STORE_BACKEND=mongodb`
    - Call `connectDB()` during `init()` when backend is `mongodb`
    - _Requirements: NFR-2_

- [ ] 15. Implement data migration (Phase 2)
  - [ ] 15.1 Create `src/migration.js`
    - Export `runMigrations()`
    - Check for `data/conversations.json`, `data/users.json`, `data/clients/` directory
    - For each existing source (without `.migrated` counterpart): read, insert into MongoDB, rename to `.migrated`
    - Idempotent: skip if `.migrated` already exists
    - Handle corrupt JSON: log error, skip that migration, do NOT rename
    - Handle partial insert failure: log which records failed, do NOT rename
    - Only runs when `STORE_BACKEND=mongodb`
    - _Requirements: 1.7, 2.6, 3.6, NFR-1_

  - [ ]* 15.2 Write property test for migration idempotency (Property 3)
    - **Property 3: Migration idempotency**
    - Run migration twice on the same source data — same set of records in DB, no duplicates
    - Uses `mongodb-memory-server` for testing
    - **Validates: Requirements 1.7, 2.6, 3.6**

  - [ ] 15.3 Update `src/stores/index.js` — call `runMigrations()` during init when `STORE_BACKEND=mongodb`
    - After `connectDB()` succeeds, call `runMigrations()` to import any existing flat-file data
    - _Requirements: 1.7, 2.6, 3.6_

- [ ] 16. Final checkpoint — Ensure all tests pass with both backends
  - Ensure all tests pass, ask the user if questions arise.
  - Verify JSON-file adapter works with `STORE_BACKEND=json` (default)
  - Verify MongoDB adapter works with `STORE_BACKEND=mongodb` (requires MongoDB)

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major layer
- Property tests validate universal correctness properties from the design document using fast-check
- Unit tests validate specific examples and edge cases
- Phase 1 (tasks 1–13) ships with JSON-file adapters — no MongoDB dependency needed
- Phase 2 (tasks 14–16) adds MongoDB adapters — swap in by setting `STORE_BACKEND=mongodb`
- The `mongodb` npm dependency is only added in Phase 2 (task 14.1) and is only needed when `STORE_BACKEND=mongodb`
- All features (compaction, preflight, plans, skill catalogue, tool filtering) are backend-agnostic and work with either adapter
- Store property tests (P1, P2, P4–P7) run against the JSON-file adapter in Phase 1 and can be re-run against MongoDB adapter in Phase 2
- DB-dependent property tests (P3) use `mongodb-memory-server` and only apply to Phase 2
- Compaction and preflight tests should mock `runSubAgent` for deterministic responses
