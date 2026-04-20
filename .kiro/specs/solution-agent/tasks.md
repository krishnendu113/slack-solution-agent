# Solution Agent — Implementation Tasks

See `requirements.md` for what and `design.md` for how.

---

## Phase A — Refactor: Extract Tool Handlers

- [x] A1 Create `src/tools/jira.js` — extract `get_jira_ticket`, `search_jira`, `adfToPlainText`, `sanitiseQuery`
- [x] A2 Create `src/tools/confluence.js` — extract `search_confluence`, `get_confluence_page`, `htmlToPlainText`, Hystrix retry
- [x] A3 Create `src/tools/kapa.js` — implement `search_kapa_docs` with `CAPILLARY_DOCS_MCP_URL` fallback
- [x] A4 Create `src/tools/webSearch.js` — sitemap-based `search_docs_site`, cached in memory
- [x] A5 Create `src/tools/index.js` — `getTools()` aggregator, conditional on env vars
- [x] A6 Update `src/orchestrator.js` — remove inline tool code, import from `src/tools/index.js`

---

## Phase B — Sub-Agent Utility

- [x] B1 Create `src/subAgent.js` — `runSubAgent({ systemPrompt, userContent, model? })` non-streaming helper
- [x] B2 Add request classification in orchestrator — Haiku classifies into `{ type, confidence, missingInfo[] }`, early return if vague
- [x] B3 Add result summarisation — Haiku summarises tool results > 500 chars before feeding to Sonnet

---

## Phase C — Orchestrator System Prompt + Skills

- [x] C1 Rewrite `BASE_SYSTEM_PROMPT` — structured output format, verdict vocabulary, citation rules, escalation triggers
- [x] C2 Add `phase` SSE events — emit `understand` / `research` / `synthesise` at phase transitions
- [x] C3 Create `skills/cr-evaluator/SKILL.md` — OOTB/Config/Custom/Not Feasible rubric, Capillary module map
- [x] C4 Update `skills/registry.json` — add `cr-evaluator` with `alwaysLoad: true`
- [x] C5 Update `src/skillLoader.js` — honour `alwaysLoad` flag, load always-on skills before keyword matching

---

## Phase D — UI Redesign

- [x] D1 Switch CSS to light theme with dark mode toggle, persist in `localStorage`
- [x] D2 Add Inter font + JetBrains Mono for code blocks
- [x] D3 Add phase indicator bar (Understanding → Researching → Synthesising)
- [x] D4 Add verdict badge rendering (OOTB/Config/Custom/Not Feasible with colour coding)
- [x] D5 Add reference cards — Confluence/Jira/Docs icons, parsed from `## References` section
- [x] D6 Add escalation banner with copy button, shown when `escalated === true`
- [x] D7 Message layout polish — user right-aligned 65%, agent full-width, timestamps on hover

---

## Phase E — Reliability & Quality

- [x] E1 Parallel tool call processing — collect all `tool_use` blocks per turn, execute all before next turn
- [x] E2 Graceful tool failure propagation — handlers return `{ error, partial: true }`, never throw
- [x] E3 Post-synthesis validation — Haiku checks for Verdict and URL references, appends note if missing
- [x] E4 Input sanitisation — max 200 chars, strip injection chars, handle empty query and network timeout

---

## Phase F — Documentation & Deployment

- [x] F1 Update `CLAUDE.md` — document new architecture (tools/, subAgent, phase flow, cr-evaluator)
- [x] F2 Update `.env.example` — add `CAPILLARY_DOCS_MCP_URL`, `CAPILLARY_DOCS_MCP_TOKEN`, `WEB_SEARCH_SITEMAP_URL`
- [x] F3 Deploy to Railway and smoke test — phase bar, tool pills, Verdict + References verified

---

## Phase G — Post-Deployment Fixes

- [x] G1 Fix intermediate narration leakage — per-turn token buffer, discard on `tool_use` stop reason
- [x] G2 Parallel Haiku summarisation with problem context — `Promise.all`, prepend `problemContext` to each call
- [x] G3A Annotate matched triggers in `skillLoader.js` — `matchedTriggers[]` on keyword matches, `alwaysActive: true` on always-on
- [x] G3B Pass trigger info in `onSkillActive` — emit `{ triggers, alwaysOn }` from orchestrator
- [x] G3C Render trigger tags in skill banner — `always-on` label, keyword tags, or empty for agent-activated

---

## Phase H — Semantic Skill Detection

- [x] H1 Add `detectSkillsSemantic()` in `src/graph.js` — Haiku selects skills by intent, parallel with classify, null fallback to keywords
- [x] H2 Update `loadSkillsForProblem()` in `src/skillLoader.js` — `semanticMatches` second param, `matchReason` annotation
- [x] H3 Render semantic reason in skill banner — `.skill-tag-semantic` italic sky-blue tag

---

## Phase I — Multi-user Auth, SSO, Client Persona, LangGraph

- [x] I1.1 Install `bcrypt` and `express-session`
- [x] I1.2 Create `src/auth.js` — login/logout/me/register routes, `requireAuth`, `bootstrapAdminIfNeeded()`
- [x] I1.3 Update `src/server.js` — mount express-session, auth router, requireAuth guard; remove old AUTH_PASS auth
- [x] I1.4 Update `public/login.html` — email field, `/api/auth/login` endpoint
- [x] I1.5 Update `public/index.html` — logout → `/api/auth/logout`, display user email from `/api/auth/me`
- [x] I2.1 Install `passport`, `passport-google-oauth20`, `passport-microsoft`
- [x] I2.2 Add passport strategies + SSO routes to `src/auth.js` — domain restriction via `ALLOWED_EMAIL_DOMAIN`
- [x] I2.3 Add Google and Microsoft SSO buttons to `public/login.html`
- [x] I3.1 Create `src/clientPersona.js` — `detectClientName`, `loadClientPersona`, `getClientContext`, `updateClientPersona`
- [x] I3.2 Wire client persona into `src/orchestrator.js` — inject context into system prompt, fire-and-forget update
- [x] I4.1 Install `@langchain/langgraph`, `@langchain/core`, `langsmith`
- [x] I4.2 Create `src/graph.js` — StateGraph with classify, loadSkills, research (looping), validate nodes
- [x] I4.3 Wrap each node with `maybeTraceable()` using `langsmith/traceable`
- [x] I4.4 Refactor `src/orchestrator.js` to thin adapter — pre-flight classify, then `buildGraph().invoke()`
- [x] I4.5 Remove dead helper functions from orchestrator — `inputSummary`, `resultSummary`, `summariseToolResult`, `detectSkillsSemantic`
- [x] I-misc Serve `src/about.html` at `/about` route in `server.js`
