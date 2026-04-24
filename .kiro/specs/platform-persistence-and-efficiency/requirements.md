# Requirements Document — Platform Persistence & Efficiency

## Introduction

This feature upgrades the Capillary Solution Agent's infrastructure across eight interconnected dimensions: database-backed persistence (replacing flat JSON files), client persona storage in the database, in-session context compaction to keep LLM context windows lean, dynamic tool loading based on user intent, dynamic skill loading based on user intent, an off-topic request filter that intercepts irrelevant queries before they reach the main agent loop, full skill exposure so the agent can discover and use any registered skill, and agent planning tools that let the agent decompose complex requests into trackable step-by-step plans.

The goal is to reduce per-request cost, improve response quality under long conversations, make the system maintainable as the user base grows beyond a handful of CS engineers, and give the agent better autonomy through full skill visibility and structured planning.

---

## Glossary

- **Agent**: The Capillary Solution Agent — the main LLM-powered agentic loop in `src/graph.js` / `src/orchestrator.js`.
- **Compaction_Service**: The subsystem responsible for replacing older messages in the context window with a running summary.
- **Context_Window**: The array of messages sent to the Anthropic API in a single call.
- **DB**: The chosen database backend (MongoDB or PostgreSQL) that replaces flat JSON files.
- **Gate**: The off-topic classification step that runs before the main agent loop.
- **Haiku**: `claude-haiku-4-5-20251001` — the cheap, fast model used for lightweight sub-tasks.
- **Intent_Classifier**: The Haiku-powered sub-agent that determines which tools and skills are relevant to a given user message.
- **Persona_Store**: The DB collection/table that holds client persona documents (replacing `data/clients/{slug}.md`).
- **Session**: A single browser session for an authenticated user.
- **Skill**: A specialist prompt bundle loaded from `skills/<id>/` that extends the agent's capabilities.
- **Sonnet**: `claude-sonnet-4-20250514` — the primary synthesis model.
- **Tool**: An Anthropic-SDK tool definition (Jira, Confluence, Kapa, web search, skill activation) passed to the API call.
- **Plan**: A structured list of steps the agent creates to decompose a complex request, stored in conversation state and visible to the user via SSE events.
- **Plan_Tool**: The set of Anthropic-SDK tool definitions (`create_plan`, `update_plan_step`, `get_plan`) that the agent uses to manage plans.
- **Skill_Registry**: The full set of skills defined in `skills/registry.json`, surfaced to the agent for discovery and activation.
- **User_Store**: The DB collection/table that holds user accounts (replacing `data/users.json`).
- **History_Lookup_Tool**: The `lookup_conversation_history` Anthropic-SDK tool that retrieves the full uncompacted message history for the current conversation from the DB.
- **Cross_Conversation_Search_Tool**: The `search_user_conversations` Anthropic-SDK tool that searches across other conversations belonging to the same authenticated user.

---

## Requirements

### Requirement 1: Database Persistence for Conversations

**User Story:** As a CS engineer, I want my conversation history to be stored reliably in a database, so that conversations survive server restarts and scale as the team grows.

#### Acceptance Criteria

1. THE DB SHALL store every conversation with fields: `id`, `userId`, `title`, `createdAt`, `updatedAt`, and an ordered list of messages.
2. WHEN a new message is appended to a conversation, THE DB SHALL persist the message atomically before the API response is returned to the client.
3. WHEN the server restarts, THE DB SHALL return all previously stored conversations without data loss.
4. THE Agent SHALL scope conversation list and retrieval operations to the authenticated user's `userId`, so that one user cannot read another user's conversations.
5. IF the DB write operation fails, THEN THE Agent SHALL return an HTTP 500 error to the client and log the failure with the conversation ID and error details.
6. THE DB SHALL support at least 10,000 conversations and 500,000 messages without requiring schema changes.
7. WHEN `data/conversations.json` exists at startup, THE DB SHALL import its contents as a one-time migration and rename the file to `data/conversations.json.migrated`.

### Requirement 2: Database Persistence for User Accounts

**User Story:** As an admin, I want user accounts stored in a database, so that user management is consistent with the rest of the system and does not require file-system access.

#### Acceptance Criteria

1. THE User_Store SHALL store every user account with fields: `id`, `email`, `passwordHash`, `role`, `createdAt`.
2. WHEN a user logs in with email and password, THE User_Store SHALL retrieve the account by email in a case-insensitive lookup.
3. WHEN an SSO user logs in for the first time, THE User_Store SHALL create a new account with `role: 'user'` and `passwordHash: null`.
4. WHEN an SSO user logs in on a subsequent visit, THE User_Store SHALL return the existing account without creating a duplicate.
5. IF a `POST /api/auth/register` request is made with an email that already exists, THEN THE User_Store SHALL return a conflict error without modifying the existing account.
6. WHEN `data/users.json` exists at startup, THE User_Store SHALL import its contents as a one-time migration and rename the file to `data/users.json.migrated`.
7. THE User_Store SHALL enforce a unique index on the `email` field to prevent duplicate accounts at the database level.

### Requirement 3: Database Persistence for Client Personas

**User Story:** As a CS engineer, I want client persona data stored in the database, so that it is queryable, consistent, and not dependent on the file system.

#### Acceptance Criteria

1. THE Persona_Store SHALL store each client persona document with fields: `slug`, `displayName`, `overview`, `modules`, `knownIssues`, `recentConversations` (array), `updatedAt`.
2. WHEN the Agent detects a client name in a user message, THE Persona_Store SHALL retrieve the persona by slug in a case-insensitive lookup.
3. WHEN a persona does not exist for a detected client slug, THE Persona_Store SHALL return null without creating a placeholder document.
4. WHEN the Agent completes a synthesis turn for a conversation that references a known client, THE Persona_Store SHALL append a new entry to `recentConversations` with fields: `date`, `summary` (max 150 words, produced by Haiku).
5. THE Agent SHALL expose a `get_client_persona` tool that the LLM can call to retrieve a client persona by slug, returning the structured document as JSON.
6. WHEN `data/clients/` contains `.md` files at startup, THE Persona_Store SHALL import each file as a one-time migration and rename the source directory to `data/clients.migrated/`.
7. THE Persona_Store SHALL enforce a unique index on the `slug` field.

### Requirement 4: In-Session Context Compaction

**User Story:** As a CS engineer, I want long conversations to remain fast and accurate, so that the agent does not degrade or hit context limits after many turns.

#### Acceptance Criteria

1. THE Compaction_Service SHALL monitor the total token count of the messages array before each Anthropic API call.
2. WHEN the estimated token count of the Context_Window exceeds a configurable threshold (default: 60,000 tokens), THE Compaction_Service SHALL replace the oldest messages — excluding the most recent 4 messages — with a single summary message produced by Haiku.
3. THE Compaction_Service SHALL produce the summary by calling Haiku with a prompt that instructs it to preserve: the original user intent, all feasibility verdicts reached, all tool results cited, and any open questions.
4. THE DB SHALL always store the full uncompacted message history regardless of what is sent to the Anthropic API.
5. WHEN compaction occurs, THE Agent SHALL emit a `status` SSE event with the text `"🗜️ Compacting context..."` before the next API call.
6. THE Compaction_Service SHALL be configurable via a `CONTEXT_COMPACTION_THRESHOLD` environment variable (integer, token count); if absent, the default of 60,000 SHALL apply.
7. IF the Haiku compaction call fails, THEN THE Compaction_Service SHALL log the error and proceed with the full uncompacted message array rather than aborting the request.

### Requirement 5: Dynamic Tool Loading Based on Intent

**User Story:** As a system operator, I want only relevant tools loaded into each Anthropic API call, so that token usage is reduced and the model is not distracted by irrelevant tool definitions.

#### Acceptance Criteria

1. THE Intent_Classifier SHALL analyse each user message using Haiku and return a set of tool category tags from a fixed vocabulary: `jira`, `confluence`, `kapa_docs`, `web_search`, `skills`.
2. WHEN the Intent_Classifier returns a non-empty tag set, THE Agent SHALL include only the tool definitions whose category matches a returned tag in the Anthropic API call.
3. THE Agent SHALL always include the `list_skills` and `activate_skill` tool definitions regardless of the Intent_Classifier output, because skill activation is a meta-capability.
4. WHEN the Intent_Classifier call fails or returns an empty tag set, THE Agent SHALL fall back to including all configured tool definitions (current behaviour).
5. THE Intent_Classifier SHALL complete within 3 seconds; IF it exceeds this limit, THEN THE Agent SHALL fall back to all tools without waiting.
6. THE Agent SHALL log the selected tool names and the Intent_Classifier tags at `[graph:tools]` log level for each request.
7. WHEN a tool is excluded from the API call due to intent filtering, THE Agent SHALL NOT call that tool's handler during the current turn.

### Requirement 6: Dynamic Skill Loading Based on Intent

**User Story:** As a system operator, I want skills loaded into the system prompt only when the user's intent indicates they are needed, so that the system prompt stays concise and token usage is reduced.

#### Acceptance Criteria

1. THE Intent_Classifier SHALL determine which skills (if any) are relevant to the user message, using the same Haiku call as Requirement 5 (single combined classification call).
2. WHEN the Intent_Classifier identifies no relevant skills, THE Agent SHALL omit all non-always-on skill content from the system prompt.
3. THE `cr-evaluator` skill SHALL be re-evaluated for always-on status; WHERE the user's message is classified as `general_query` type with no CR or feasibility indicators, THE Agent SHALL omit `cr-evaluator` from the system prompt.
4. WHEN the Intent_Classifier identifies one or more relevant skills, THE Agent SHALL load only those skills into the system prompt, in addition to any skills with `alwaysLoad: true` that pass the re-evaluation in criterion 3.
5. IF the Intent_Classifier fails, THEN THE Agent SHALL fall back to the existing `alwaysLoad` + keyword-matching behaviour.
6. THE Agent SHALL emit a `skill_active` SSE event for each skill loaded, including a `reason` field containing the Intent_Classifier's one-sentence justification.
7. THE Agent SHALL log the loaded skill IDs and the reason for each at `[graph:skills]` log level.

### Requirement 7: Off-Topic Request Filtering

**User Story:** As a system operator, I want off-topic requests intercepted before reaching the main agent loop, so that compute cost is minimised and the tool stays focused on Capillary CS work.

#### Acceptance Criteria

1. THE Gate SHALL classify every incoming user message using Haiku before the main agent loop is invoked.
2. THE Gate SHALL classify a message as off-topic if it does not relate to: Capillary product capabilities, client requirements, change requests, Jira tickets, solution design, or CS team workflows.
3. WHEN THE Gate classifies a message as off-topic, THE Agent SHALL return a polite refusal message without invoking the LangGraph state machine, without calling any tools, and without consuming Sonnet tokens.
4. THE Gate refusal message SHALL acknowledge the user's message, explain that the agent is scoped to Capillary CS work, and suggest the user rephrase if their intent was CS-related.
5. THE Gate SHALL complete its classification within 2 seconds; IF it exceeds this limit, THEN THE Agent SHALL proceed to the main loop (fail open, not fail closed).
6. THE Gate SHALL NOT block messages that are ambiguous or borderline — only messages that are clearly unrelated to Capillary CS work (confidence threshold ≥ 0.85 for off-topic classification).
7. WHEN THE Gate blocks a request, THE Agent SHALL emit a `status` SSE event with text `"🚫 Off-topic request detected"` and then stream the refusal message as `token` events.
8. THE Gate classification SHALL run in parallel with any other pre-flight checks (e.g. existing `classifyRequest`) to avoid adding latency to on-topic requests.

### Requirement 8: Full Skill Exposure

**User Story:** As a CS engineer, I want the agent to be aware of all registered skills, so that it can discover and activate any skill without relying solely on keyword matching or semantic classification.

#### Acceptance Criteria

1. THE Agent SHALL surface all skills from `skills/registry.json` in the system prompt as a concise skill catalogue (ID, description, and trigger hints) so the LLM can discover any skill.
2. WHEN the agent receives a user message, THE Agent SHALL include the full skill catalogue regardless of Intent_Classifier output, so that no skill is hidden from the LLM.
3. THE skill catalogue SHALL be lightweight — containing only metadata (ID, description, trigger hints) — not the full skill prompt content, to minimise token overhead.
4. WHEN the LLM determines a skill is relevant based on the catalogue, THE Agent SHALL allow the LLM to call `activate_skill` to load the full skill prompt on demand.
5. THE Agent SHALL continue to use the Intent_Classifier (Requirement 6) to pre-load skill prompts for obvious matches, but the catalogue ensures the LLM can also discover and activate skills the classifier missed.
6. THE skill catalogue SHALL be generated dynamically from `skills/registry.json` at startup and refreshed if the registry changes.
7. THE Agent SHALL log when a skill is activated via catalogue discovery (LLM-initiated) versus Intent_Classifier pre-loading, to track discovery effectiveness.

### Requirement 9: Agent Planning Tools

**User Story:** As a CS engineer, I want the agent to create and follow a structured plan for complex requests, so that I can see its approach and track progress through each step.

#### Acceptance Criteria

1. THE Agent SHALL expose a `create_plan` tool that accepts a `title` (string) and `steps` (array of strings) and returns a plan object with a unique `planId` and each step initialised to `pending` status.
2. THE Agent SHALL expose an `update_plan_step` tool that accepts `planId`, `stepIndex` (integer), and `status` (one of `pending`, `in_progress`, `completed`, `skipped`) and updates the specified step.
3. THE Agent SHALL expose a `get_plan` tool that accepts `planId` and returns the current plan state including all steps and their statuses.
4. WHEN the agent creates or updates a plan, THE Agent SHALL emit a `plan_update` SSE event containing the full current plan state, so the UI can render progress in real time.
5. THE plan state SHALL be stored in the conversation context (as part of the LangGraph state) so that it persists across turns within the same conversation.
6. WHEN a conversation is persisted to the DB, THE plan state SHALL be stored alongside the conversation messages so that plans survive page refreshes.
7. THE Agent SHALL include the plan tools in every Anthropic API call (similar to `list_skills` and `activate_skill`), so the LLM can create plans for any request type.
8. THE `create_plan` tool SHALL validate that `steps` is a non-empty array and `title` is a non-empty string; IF validation fails, THEN the tool SHALL return an error message without creating a plan.

### Requirement 10: Conversation History Lookup Tools

**User Story:** As a CS engineer, I want the agent to be able to look up the full uncompacted conversation history and search my other conversations, so that the agent can recover context lost during compaction and draw on relevant past interactions.

#### Acceptance Criteria

1. THE Agent SHALL expose a `lookup_conversation_history` tool that accepts a `conversationId` (string) and an optional `messageRange` object with `start` (integer, zero-based index) and `count` (integer, max messages to return), and returns the full uncompacted messages from the DB for the specified conversation.
2. WHEN the `lookup_conversation_history` tool is called without a `messageRange`, THE Agent SHALL return all messages from the conversation's full uncompacted history stored in the DB.
3. THE `lookup_conversation_history` tool SHALL scope the lookup to the authenticated user's `userId`, so that the agent cannot retrieve conversations belonging to a different user.
4. THE Agent SHALL expose a `search_user_conversations` tool that accepts a `query` (string) and an optional `limit` (integer, default 5, max 20), and returns a list of matching conversations belonging to the authenticated user, each containing `conversationId`, `title`, `createdAt`, `updatedAt`, and a snippet of the matching message content.
5. WHEN the `search_user_conversations` tool is called, THE DB SHALL perform a case-insensitive text search across all message content in the authenticated user's conversations and return results ordered by relevance.
6. THE `search_user_conversations` tool SHALL return only conversation metadata and message snippets (max 200 characters per snippet), not full message content, to minimise token usage in the agent's context.
7. THE Agent SHALL include the `lookup_conversation_history` and `search_user_conversations` tool definitions in every Anthropic API call, so the LLM can use them for any request type.
8. IF the `lookup_conversation_history` tool is called with a `conversationId` that does not exist or does not belong to the authenticated user, THEN THE Agent SHALL return an error message stating the conversation was not found.
9. IF the `search_user_conversations` tool returns no matching conversations, THEN THE Agent SHALL return an empty results array with a message indicating no matches were found.
10. THE Agent SHALL log each invocation of the `lookup_conversation_history` and `search_user_conversations` tools at `[graph:tools]` log level, including the `conversationId` or `query` used.

---

## Non-Functional Requirements

### NFR-1 — Migration Safety

THE DB migration routines SHALL be idempotent: running them twice SHALL NOT duplicate data or corrupt existing records.

### NFR-2 — Backward Compatibility

WHILE the DB is unavailable at startup, THE Agent SHALL log a fatal error and exit with a non-zero code rather than silently falling back to flat files, to prevent split-brain state.

### NFR-3 — Environment Configuration

THE Agent SHALL read all DB connection parameters from environment variables. No connection strings SHALL be hardcoded. THE `.env.example` file SHALL document all new variables with example values.

### NFR-4 — Compaction Transparency

THE DB SHALL store a `compactedAt` timestamp on each conversation record whenever compaction occurs, so that operators can audit which conversations have been compacted.

### NFR-5 — Gate Accuracy

THE Gate SHALL not block more than 1% of legitimate CS requests in normal operation (false positive rate ≤ 1%). This SHALL be validated by manual review of a sample of blocked requests during the first week of deployment.

### NFR-6 — Latency Budget

The combined overhead of the Gate classification, Intent_Classifier call, and DB reads for a new user message SHALL not exceed 2 seconds before the first `status` SSE event is emitted to the client.

### NFR-7 — Token Accounting

THE Compaction_Service SHALL log the before and after estimated token counts whenever compaction occurs, to allow cost monitoring.
