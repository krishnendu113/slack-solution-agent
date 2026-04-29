# Requirements Document — Parallel Research Agents

## Introduction

This feature redesigns the Capillary Solution Agent's research phase to replace the current sequential Sonnet-driven tool-calling loop with parallel specialist sub-agents powered by Haiku. The current architecture requires 4–6 sequential Sonnet API calls per request — each carrying the full system prompt, conversation history, and all tool definitions — just to gather information from Jira, Confluence, Kapa docs, and web search. Additionally, the `cr-evaluator` skill is always loaded into every Sonnet call regardless of whether the user's question involves a CR or feasibility assessment, wasting tokens on general queries.

The new architecture introduces a **research dispatcher** that spawns domain-specific Haiku sub-agents (Jira Agent, Confluence Agent, Docs Agent, Web Agent) in parallel after the preflight classifier determines which sources are needed. Each sub-agent runs independently with a focused system prompt, makes multiple tool calls within its domain, and returns a concise structured summary. Sonnet then receives only these summaries — not raw tool outputs — for a single synthesis call. Skill loading is also restructured so that `cr-evaluator` is loaded conditionally based on intent classification rather than unconditionally.

The goal is to reduce per-request latency by 3–5×, reduce Anthropic API cost by 60–70%, and produce cleaner Sonnet context that leads to higher-quality synthesis.

---

## Glossary

- **Agent**: The Capillary Solution Agent — the main LLM-powered agentic loop in `src/graph.js` / `src/orchestrator.js`.
- **Research_Dispatcher**: The new orchestration component that spawns and manages parallel Research_Agents based on preflight tool tags.
- **Research_Agent**: A Haiku-powered specialist sub-agent that searches a single tool domain (Jira, Confluence, Kapa docs, or web), makes multiple tool calls, and returns a structured summary.
- **Jira_Agent**: A Research_Agent specialised for Jira operations (`search_jira`, `get_jira_ticket`, `add_jira_comment`).
- **Confluence_Agent**: A Research_Agent specialised for Confluence operations (`search_confluence`, `get_confluence_page`).
- **Docs_Agent**: A Research_Agent specialised for documentation operations (`search_kapa_docs`, `search_docs_site`).
- **Web_Agent**: An optional Research_Agent for general web search when no domain-specific tool suffices.
- **Research_Summary**: The structured output returned by each Research_Agent — containing key findings, source URLs, and a relevance assessment, capped at approximately 500 tokens.
- **Synthesis_Phase**: The single Sonnet call that receives all Research_Summaries and produces the final user-facing response.
- **Intent_Classifier**: The Haiku-powered preflight step (existing `src/preflight.js`) that determines which tool categories and skills are relevant.
- **Skill_Catalogue**: The lightweight metadata listing of all registered skills, injected into the system prompt for LLM discovery.
- **Sonnet**: `claude-sonnet-4-20250514` — the primary synthesis model.
- **Haiku**: `claude-haiku-4-5-20251001` — the cheap, fast model used for Research_Agents and other sub-tasks.
- **Context_Window**: The array of messages sent to the Anthropic API in a single call.
- **Tool_Handler**: The existing tool dispatcher function (`handle()` in `src/tools/index.js`) that routes tool calls to their implementations.
- **Preflight_Result**: The output of `runPreflight()` containing `toolTags`, `skillIds`, `onTopic`, and classification data.

---

## Requirements

### Requirement 1: Research Dispatcher

**User Story:** As a system operator, I want the agent to dispatch parallel research sub-agents instead of making sequential Sonnet tool calls, so that research completes faster and costs less.

#### Acceptance Criteria

1. WHEN the Preflight_Result contains one or more tool tags, THE Research_Dispatcher SHALL spawn one Research_Agent per tool tag category (`jira`, `confluence`, `kapa_docs`, `web_search`) in parallel.
2. THE Research_Dispatcher SHALL pass each Research_Agent only the tool definitions relevant to its domain — the Jira_Agent receives only Jira tool definitions, the Confluence_Agent receives only Confluence tool definitions, and so on.
3. THE Research_Dispatcher SHALL enforce a configurable timeout per Research_Agent (default: 15 seconds, configurable via `RESEARCH_AGENT_TIMEOUT_MS` environment variable); IF a Research_Agent exceeds this timeout, THEN THE Research_Dispatcher SHALL cancel the agent and use whatever partial results have been collected.
4. WHEN all Research_Agents have completed or timed out, THE Research_Dispatcher SHALL assemble their Research_Summaries into a single structured context block for the Synthesis_Phase.
5. THE Research_Dispatcher SHALL emit a `status` SSE event with text `"🔍 Researching in parallel..."` before spawning Research_Agents, and a `status` SSE event with text `"✍️ Synthesising..."` after all agents complete.
6. THE Research_Dispatcher SHALL log the number of Research_Agents spawned, their domains, and their individual completion times at `[graph:research]` log level.
7. IF the Preflight_Result contains no tool tags (empty array), THEN THE Research_Dispatcher SHALL skip the research phase entirely and proceed directly to the Synthesis_Phase with no research context.
8. THE Research_Dispatcher SHALL emit a `tool_status` SSE event for each Research_Agent with status `running` when spawned and `done` or `error` when completed.

### Requirement 2: Research Agent Execution

**User Story:** As a system operator, I want each research sub-agent to be an expert in its tool domain, so that it can make multiple targeted tool calls and return a high-quality summary without polluting the main agent context.

#### Acceptance Criteria

1. THE Research_Agent SHALL use Haiku (`claude-haiku-4-5-20251001`) as its model for all internal reasoning and tool-call decisions.
2. THE Research_Agent SHALL receive a domain-specific system prompt that instructs it to: search for information relevant to the user's query, make follow-up tool calls to retrieve details (e.g., fetch a specific Jira ticket after a search returns results), and produce a structured summary.
3. THE Research_Agent SHALL have access only to the tool definitions and handlers for its assigned domain — the Jira_Agent SHALL only call `search_jira`, `get_jira_ticket`, and `add_jira_comment`; the Confluence_Agent SHALL only call `search_confluence` and `get_confluence_page`; the Docs_Agent SHALL only call `search_kapa_docs` and `search_docs_site`.
4. THE Research_Agent SHALL support up to 5 internal tool-call turns (configurable via `RESEARCH_AGENT_MAX_TURNS` environment variable, default: 5) to allow multi-step research within its domain.
5. THE Research_Agent SHALL use the existing tool handlers from `src/tools/index.js` — the tool definitions and handler implementations remain unchanged.
6. WHEN the Research_Agent completes its research, THE Research_Agent SHALL return a Research_Summary as a structured JSON object containing: `domain` (string), `findings` (array of objects with `title`, `summary`, `url` fields), `relevanceNote` (string, one sentence assessing how relevant the findings are to the query), and `toolCallCount` (integer).
7. THE Research_Summary SHALL not exceed 500 tokens (approximately 1,750 characters) to keep the Synthesis_Phase context lean.
8. IF a Research_Agent encounters a tool error, THEN THE Research_Agent SHALL include the error in its summary with a `status: "partial"` field rather than failing entirely.
9. THE Research_Agent SHALL log each tool call it makes at `[research:domain]` log level (e.g., `[research:jira]`), including the tool name and a brief input summary.

### Requirement 3: Research Summary Format

**User Story:** As a system operator, I want research summaries to follow a consistent structured format, so that the Synthesis_Phase receives clean, predictable input regardless of which domains were queried.

#### Acceptance Criteria

1. THE Research_Summary SHALL be a JSON object with the following schema: `{ domain: string, status: "complete" | "partial" | "error", findings: Array<{ title: string, summary: string, url: string | null }>, relevanceNote: string, toolCallCount: number, durationMs: number }`.
2. WHEN a Research_Agent completes all tool calls without errors, THE Research_Summary SHALL have `status: "complete"`.
3. WHEN a Research_Agent encounters one or more tool errors but still produces some findings, THE Research_Summary SHALL have `status: "partial"` and include an `errors` array with error descriptions.
4. WHEN a Research_Agent fails entirely (all tool calls error or timeout), THE Research_Summary SHALL have `status: "error"`, an empty `findings` array, and an `errors` array describing the failures.
5. THE `findings` array SHALL contain at most 5 entries, prioritised by relevance to the user's query.
6. Each `summary` field within a finding SHALL not exceed 100 words.
7. THE `url` field SHALL contain the source URL returned by the tool (Jira ticket URL, Confluence page URL, docs page URL) or `null` if no URL was returned.
8. THE Research_Dispatcher SHALL validate each Research_Summary against the schema before passing it to the Synthesis_Phase; IF validation fails, THEN THE Research_Dispatcher SHALL wrap the raw output in an error-status summary.

### Requirement 4: Synthesis Phase with Assembled Research Context

**User Story:** As a CS engineer, I want the agent to synthesise research findings in a single Sonnet call with clean context, so that responses are faster and more coherent.

#### Acceptance Criteria

1. THE Synthesis_Phase SHALL make a single Sonnet API call that receives: the user's message, conversation history, the assembled Research_Summaries block, the relevant skill prompt (if any), and the skill catalogue.
2. THE Synthesis_Phase SHALL NOT receive raw tool outputs — only the structured Research_Summaries produced by Research_Agents.
3. THE Synthesis_Phase SHALL format the Research_Summaries into a clearly delimited context block within the messages array, prefixed with `[Research Results]` and separated by domain headers.
4. THE Synthesis_Phase SHALL still support the existing tool-use loop for non-research tools (plan tools, skill activation, history lookup) — the Sonnet model can still call `create_plan`, `activate_skill`, `lookup_conversation_history`, and `search_user_conversations` during synthesis.
5. WHEN the Synthesis_Phase Sonnet call requests a tool use for a research tool (`search_jira`, `search_confluence`, `search_kapa_docs`, `search_docs_site`), THE Agent SHALL execute the tool call normally as a fallback — the research phase does not prevent Sonnet from making additional research calls if needed.
6. THE Synthesis_Phase SHALL stream tokens to the client via the existing `onToken` SSE callback, preserving the current real-time streaming behaviour.
7. THE Synthesis_Phase SHALL include the compaction check (`compactIfNeeded`) before the Sonnet call, preserving the existing context management behaviour.

### Requirement 5: Conditional Skill Loading

**User Story:** As a system operator, I want the `cr-evaluator` skill loaded only when the user's intent indicates a CR or feasibility question, so that general queries do not waste tokens on irrelevant skill prompts.

#### Acceptance Criteria

1. THE `cr-evaluator` skill SHALL have its `alwaysLoad` flag set to `false` in `skills/registry.json`.
2. WHEN the Intent_Classifier classifies a message as type `cr`, `brd`, or `issue`, THE Agent SHALL load the `cr-evaluator` skill prompt into the system prompt.
3. WHEN the Intent_Classifier classifies a message as type `general_query` with no CR or feasibility indicators in the tool tags, THE Agent SHALL omit the `cr-evaluator` skill prompt from the system prompt.
4. THE Skill_Catalogue (lightweight metadata listing all skills including `cr-evaluator`) SHALL remain in the system prompt for every request, so the LLM can still discover and activate `cr-evaluator` via `activate_skill` if needed.
5. WHEN the Intent_Classifier fails or times out, THE Agent SHALL fall back to loading `cr-evaluator` (current behaviour) to avoid degrading CR evaluation quality.
6. THE Agent SHALL log whether `cr-evaluator` was loaded or omitted, and the reason, at `[graph:skills]` log level.
7. THE `loadSkillsForProblem` function in `src/skillLoader.js` SHALL accept the classification type from the Preflight_Result and use it to determine whether `cr-evaluator` should be loaded, replacing the unconditional `alwaysLoad` behaviour.

### Requirement 6: Research Agent System Prompts

**User Story:** As a system operator, I want each research sub-agent to have a focused, domain-specific system prompt, so that it searches effectively without carrying irrelevant instructions.

#### Acceptance Criteria

1. THE Jira_Agent system prompt SHALL instruct the agent to: search Jira for tickets related to the query, fetch full details for the most relevant tickets (up to 3), extract key fields (summary, status, priority, description excerpt, assignee), and note any linked tickets or epics.
2. THE Confluence_Agent system prompt SHALL instruct the agent to: search Confluence for pages related to the query, fetch full content for the most relevant pages (up to 2), extract implementation details, configuration steps, and architecture notes.
3. THE Docs_Agent system prompt SHALL instruct the agent to: search both Kapa docs and the docs site for product documentation related to the query, prioritise official product documentation over community content, and extract feature descriptions, API references, and configuration guides.
4. THE Web_Agent system prompt SHALL instruct the agent to: search the docs site for pages related to the query when other domain-specific agents have not been spawned, and extract relevant technical content.
5. THE Research_Agent system prompts SHALL NOT include the base system prompt from `src/orchestrator.js`, the CR evaluator skill prompt, or any other skill prompts — they are research-only prompts.
6. THE Research_Agent system prompts SHALL include a structured output instruction that specifies the Research_Summary JSON schema, so the agent returns findings in the correct format.
7. THE Research_Agent system prompts SHALL be defined as constants in a new `src/researchAgents.js` module, co-located with the Research_Dispatcher logic.

### Requirement 7: Graceful Degradation

**User Story:** As a system operator, I want the system to fall back gracefully when research sub-agents fail, so that the user still gets a response even if parallel research encounters errors.

#### Acceptance Criteria

1. IF all Research_Agents fail (all return `status: "error"`), THEN THE Agent SHALL fall back to the existing sequential Sonnet research loop (current behaviour) and log a warning at `[graph:research]` level.
2. IF one or more Research_Agents succeed while others fail, THEN THE Agent SHALL proceed to the Synthesis_Phase with the available summaries and include a note in the research context indicating which domains failed.
3. IF the Research_Dispatcher itself throws an unexpected error, THEN THE Agent SHALL catch the error, log it, and fall back to the existing sequential research loop.
4. THE fallback to sequential research SHALL be transparent to the user — the response format and quality SHALL remain the same regardless of whether parallel or sequential research was used.
5. THE Agent SHALL emit a `status` SSE event with text `"⚠️ Some research sources unavailable, proceeding with available data"` when partial research results are used.

### Requirement 8: Preserve Existing Multi-Node Document Generation

**User Story:** As a system operator, I want the existing multi-node document generation path (researchFanOut → sectionWriter → skillValidate) to continue working unchanged, so that SDD generation and other multi-node skills are not disrupted.

#### Acceptance Criteria

1. THE Research_Dispatcher SHALL only replace the single-mode research loop (`research → compactIfNeeded → research`); the multi-node path (`researchFanOut → sectionWriter → skillValidate`) SHALL remain unchanged.
2. WHEN the `skillRouter` node determines `executionMode: 'multi-node'`, THE graph SHALL route to the existing `researchFanOut` node, not the new Research_Dispatcher.
3. THE existing `researchFanOut` node, `sectionWriter` node, and `skillValidate` node SHALL not be modified by this feature.
4. THE `skillRouter` conditional edge logic SHALL remain: `'multi-node' → researchFanOut`, `'single' → parallelResearch` (new node replacing the old `research` entry point).

### Requirement 9: SSE Streaming and Tracing Preservation

**User Story:** As a system operator, I want SSE streaming and LangSmith tracing to work with the new parallel research architecture, so that real-time status updates and observability are maintained.

#### Acceptance Criteria

1. THE Research_Dispatcher SHALL emit `tool_status` SSE events for each Research_Agent, using the existing `onToolStatus` callback format: `{ id, name, inputSummary, status }`.
2. THE Research_Dispatcher node SHALL be wrapped with `maybeTraceable('parallelResearch', ...)` for LangSmith tracing, consistent with existing graph nodes.
3. EACH Research_Agent call SHALL be traced as a child span under the `parallelResearch` trace, with the operation label `research:<domain>` (e.g., `research:jira`, `research:confluence`).
4. THE Synthesis_Phase SHALL continue to stream tokens via the existing `onToken` callback, preserving real-time response delivery.
5. THE Research_Dispatcher SHALL emit `phase` SSE events: `'research'` when spawning agents, `'synthesise'` when all agents complete.

### Requirement 10: Store Backend Compatibility

**User Story:** As a system operator, I want the parallel research architecture to work with both JSON and MongoDB store backends, so that the feature does not introduce backend-specific dependencies.

#### Acceptance Criteria

1. THE Research_Dispatcher SHALL not directly interact with any store backend — all persistence operations remain in the existing graph nodes (`compactIfNeeded`, `research`/synthesis, `validate`).
2. THE Research_Agents SHALL not read from or write to any store — they only call tool handlers and return summaries.
3. THE conversation persistence flow (message append, compactedAt, plan state) SHALL remain unchanged and continue to work with both `STORE_BACKEND=json` and `STORE_BACKEND=mongodb`.

---

## Non-Functional Requirements

### NFR-1 — Latency Improvement

THE parallel research phase SHALL complete in less time than the equivalent sequential Sonnet research loop for the same query. For a typical 3-source research query, the parallel phase SHALL complete within the duration of the slowest single Research_Agent plus 500ms overhead, rather than the sum of all sequential Sonnet calls.

### NFR-2 — Cost Reduction

THE Research_Agents SHALL use Haiku for all internal reasoning. THE Synthesis_Phase SHALL use Sonnet for the final response. For a typical request that previously required 4–6 sequential Sonnet calls, the new architecture SHALL require 1 Sonnet call plus 2–4 parallel Haiku calls, reducing per-request Anthropic API cost.

### NFR-3 — Context Size Reduction

THE assembled Research_Summaries block passed to the Synthesis_Phase SHALL not exceed 2,500 tokens total (approximately 5 summaries × 500 tokens each), compared to the current approach where raw tool outputs can consume 5,000–15,000 tokens in the Sonnet context.

### NFR-4 — Research Agent Isolation

EACH Research_Agent SHALL run in its own `runSubAgent` call with an independent message array. Research_Agent failures SHALL NOT corrupt the main graph state or affect other Research_Agents running in parallel.

### NFR-5 — Environment Configuration

THE Agent SHALL read all new configuration parameters from environment variables. THE `.env.example` file SHALL document: `RESEARCH_AGENT_TIMEOUT_MS` (default: 15000), `RESEARCH_AGENT_MAX_TURNS` (default: 5). No new configuration values SHALL be hardcoded.

### NFR-6 — Backward Compatibility

THE existing tool definitions and handlers in `src/tools/` SHALL remain unchanged. THE Research_Agents call the same `handle()` function that the current sequential loop uses. No tool API changes are required.
