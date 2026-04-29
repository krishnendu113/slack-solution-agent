# Tasks — Parallel Research Agents

## Task 1: Extend `src/subAgent.js` with `runToolAgent()`

- [x] 1.1 Add `runToolAgent()` function that supports multi-turn tool-calling loops with configurable `maxTurns`, `tools`, and `handle` parameters
- [x] 1.2 Implement the turn loop: call Anthropic API → extract tool-use blocks → execute via `handle()` → append results → repeat until `end_turn` or `maxTurns`
- [x] 1.3 Add `onToolCall` callback parameter for per-tool-call logging at `[research:<domain>]` level
- [x] 1.4 Add model validation (reuse existing `VALID_MODELS` set)
- [ ] 1.5 Write unit tests in `src/__tests__/toolAgent.test.js` for multi-turn loop, stop conditions, and error propagation
- [ ] 1.6 Write property test in `src/__tests__/toolAgent.prop.test.js` for Property 8 (max turns enforcement)

## Task 2: Create `src/researchAgents.js` module

- [x] 2.1 Define `DOMAIN_TOOLS` mapping (jira, confluence, kapa_docs, web_search → tool names)
- [x] 2.2 Define `DOMAIN_PROMPTS` with domain-specific system prompts for each Research Agent (Jira, Confluence, Docs, Web) including Research Summary JSON schema instruction
- [x] 2.3 Implement `validateResearchSummary(rawOutput, domain)` — parse JSON, validate against schema, return `{ valid, summary }`
- [x] 2.4 Implement `assembleResearchContext(summaries)` — format summaries into `[Research Results]` delimited context block
- [x] 2.5 Implement `dispatchResearch({ toolTags, problemText, userId, timeoutMs, maxTurns, onToolStatus })` — spawn parallel agents via `Promise.allSettled()` with `Promise.race()` timeout, validate summaries, return `{ summaries, allFailed }`
- [x] 2.6 Read `RESEARCH_AGENT_TIMEOUT_MS` and `RESEARCH_AGENT_MAX_TURNS` from environment variables with defaults (15000, 5)
- [x] 2.7 Emit `tool_status` SSE events for each Research Agent (running/done/error)
- [x] 2.8 Log agent count, domains, and completion times at `[graph:research]` level

## Task 3: Write property tests for research agents module

- [ ] 3.1 Write property test for Property 1 (dispatcher spawns one agent per tag) in `src/__tests__/researchDispatcher.prop.test.js`
- [ ] 3.2 Write property test for Property 2 (domain tool isolation) in `src/__tests__/researchDispatcher.prop.test.js`
- [ ] 3.3 Write property test for Property 3 (Research Summary schema round-trip) in `src/__tests__/researchSummary.prop.test.js`
- [ ] 3.4 Write property test for Property 4 (invalid output wrapping) in `src/__tests__/researchSummary.prop.test.js`
- [ ] 3.5 Write property test for Property 5 (assembly preserves non-error findings) in `src/__tests__/researchSummary.prop.test.js`
- [ ] 3.6 Write property test for Property 7 (failure detection correctness) in `src/__tests__/researchDispatcher.prop.test.js`
- [ ] 3.7 Write property test for Property 9 (timeout enforcement) in `src/__tests__/researchDispatcher.prop.test.js`

## Task 4: Write unit tests for research agents module

- [ ] 4.1 Write unit tests in `src/__tests__/researchAgents.test.js` for `dispatchResearch()`: SSE event emission, logging, empty tool tags, domain prompt selection
- [ ] 4.2 Write unit tests for `validateResearchSummary()`: valid summaries, invalid JSON, missing fields, status mapping (complete/partial/error)
- [ ] 4.3 Write unit tests for `assembleResearchContext()`: formatting, domain headers, error exclusion

## Task 5: Modify `src/skillLoader.js` for conditional cr-evaluator loading

- [x] 5.1 Add `classificationType` parameter to `loadSkillsForProblem()` function signature
- [x] 5.2 Implement conditional loading logic: load cr-evaluator for `cr`, `brd`, `issue` types; omit for `general_query`; load on `null` (fallback)
- [x] 5.3 Add logging at `[graph:skills]` level for cr-evaluator load/omit decisions
- [x] 5.4 Update `skills/registry.json`: set `cr-evaluator.alwaysLoad` to `false`, add triggers array
- [ ] 5.5 Update existing `src/__tests__/skillLoader.test.js` with tests for conditional loading
- [ ] 5.6 Write property test for Property 6 (conditional loading by classification type) in `src/__tests__/skillLoading.conditional.prop.test.js`

## Task 6: Modify `src/graph.js` — add `parallelResearch` and `synthesise` nodes

- [x] 6.1 Add new state channels: `researchContext`, `fallbackToSequential`, `researchSummaries`
- [x] 6.2 Implement `parallelResearchNode`: call `dispatchResearch()`, handle `allFailed` fallback, assemble context, emit phase/status SSE events
- [x] 6.3 Implement `synthesiseNode`: inject research context into messages, streaming Sonnet call with tool support for non-research tools (plans, skills, history), research tool fallback
- [x] 6.4 Wrap both nodes with `maybeTraceable()` for LangSmith tracing
- [x] 6.5 Import `dispatchResearch` and `assembleResearchContext` from `src/researchAgents.js`

## Task 7: Modify `src/graph.js` — rewire graph edges

- [x] 7.1 Change `skillRouter` conditional edge: `'single' → 'parallelResearch'` (was `'research'`)
- [x] 7.2 Add conditional edge from `parallelResearch`: `fallbackToSequential → 'research'`, else `'synthesise'`
- [x] 7.3 Add conditional edge from `synthesise`: `tool_use → 'compactIfNeeded'`, else `'validate'`
- [x] 7.4 Change `compactIfNeeded` edge to route to `synthesise` (was `'research'`) — note: this needs to be conditional based on which path we're on, or use a state flag
- [x] 7.5 Preserve existing multi-node path: `researchFanOut → sectionWriter → skillValidate → __end__`
- [x] 7.6 Preserve existing sequential research path for fallback: `research → compactIfNeeded → research → validate`

## Task 8: Update `src/graph.js` — pass classification type to skill loader

- [x] 8.1 Update `loadSkillsNode` to pass `state.classification.type` to `loadSkillsForProblem()` as the third argument
- [x] 8.2 Handle null classification gracefully (pass null, triggering fallback loading)

## Task 9: Update environment configuration

- [x] 9.1 Add `RESEARCH_AGENT_TIMEOUT_MS=15000` and `RESEARCH_AGENT_MAX_TURNS=5` to `.env.example`
- [x] 9.2 Verify environment variables are read with correct defaults in `src/researchAgents.js`

## Task 10: Write integration and routing tests

- [ ] 10.1 Write graph routing tests in `src/__tests__/graphRouting.test.js`: skillRouter → parallelResearch (single mode), skillRouter → researchFanOut (multi-node), parallelResearch → synthesise (success), parallelResearch → research (fallback)
- [ ] 10.2 Write synthesis node tests in `src/__tests__/synthesise.test.js`: research context injection, non-research tool support, streaming, compaction
- [ ] 10.3 Update existing `src/__tests__/graph.test.js` if needed to account for new node names and routing

## Task 11: End-to-end verification

- [ ] 11.1 Run full test suite (`vitest --run`) and verify all existing tests still pass
- [ ] 11.2 Verify the multi-node document generation path (SDD writer) is unaffected by running existing graph tests
- [ ] 11.3 Verify fallback path works by simulating all-agent-failure scenario in tests
