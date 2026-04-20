# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A web-based chat agent for the Capillary Technologies Customer Success (CS) team.
CS engineers paste Jira ticket IDs, describe client requirements, or upload documents.
The agent analyses them using Claude, searches Jira, Confluence, Kapa docs, and
docs.capillarytech.com, dynamically loads specialist skills, and returns structured
solution assessments — or flags for SA escalation.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Run locally with --watch (auto-restart on file changes)
npm start            # Production start
npm run lint         # ESLint on src/
```

No automated tests. Manual testing: `npm run dev`, open `http://localhost:3000`.

## Architecture

**Request flow:**
```
Browser (public/index.html)
  → POST /api/conversations/:id/messages  (multipart or JSON)
  → server.js opens SSE stream
  → orchestrator.js agentic loop (up to 15 turns)
  → Anthropic SDK streaming → SSE events back to browser
```

**SSE event types** (client subscribes to all):
- `status` — status text (e.g. "Thinking...", "Processing tool results...")
- `token` — streamed text delta from Claude
- `tool_status` — `{ id, name, inputSummary, status: 'running'|'done'|'error', text?, url?, links? }`
- `skill_active` — `{ id, description }` when a skill is loaded
- `phase` — `{ name: 'understand'|'research'|'synthesise' }` at phase transitions
- `message` — final `{ role, content, skillsUsed, escalated }` object
- `error` — `{ text }` friendly error message

**`src/subAgent.js`** — Lightweight non-streaming Anthropic helper. `runSubAgent({ systemPrompt, userContent, model? })` makes a single `messages.create` call and returns the text string. Used for: request classification (Haiku, before main loop), tool result summarisation (Haiku, for results > 500 chars). Default model: `claude-haiku-4-5-20251001`.

**`src/orchestrator.js`** — Core agent logic. `runAgent()` runs the agentic loop:
1. **Understand phase** — Haiku classifies request into `{ type, confidence, missingInfo[] }`. If `confidence < 0.5 AND missingInfo.length > 0`, returns early with clarifying question.
2. **Skill loading** — always-on skills (cr-evaluator) + keyword-matched skills loaded.
3. **Main loop** — up to 15 turns. Streams from Anthropic SDK, accumulates `content_block_*` events into `contentBlocks[]`, executes all `tool_use` blocks. Critical: strips `_toolId` from `contentBlocks` before pushing to `messages` — Anthropic rejects extra fields.
4. **Research phase** — emitted on first turn with `stopReason === 'tool_use'`. Tool results > 500 chars are summarised by Haiku before feeding to Sonnet.
5. **Synthesise phase** — emitted when entering a turn after tool usage.
6. **Post-synthesis validation** — appends structured notes if response lacks a Verdict or any URL references.
Does not own tool code — all tools are in `src/tools/`.

**`src/tools/`** — Tool definitions and handlers, one file per integration:
- `jira.js` — `get_jira_ticket`, `search_jira`. Exports `jiraDefinitions`, `handleJiraTool()`, `adfToPlainText()`, `sanitiseQuery()`.
- `confluence.js` — `search_confluence`, `get_confluence_page`. Exports `confluenceDefinitions`, `handleConfluenceTool()`, `htmlToPlainText()`. Includes Hystrix circuit-breaker retry.
- `kapa.js` — `search_kapa_docs`. HTTP to `CAPILLARY_DOCS_MCP_URL`. Degrades gracefully if unconfigured.
- `webSearch.js` — `search_docs_site`. Fetches sitemap XML (cached in memory, 1hr TTL), scores URLs by keyword overlap, fetches top 3 pages. No external search API needed.
- `index.js` — `getTools()` returns `{ definitions: [...], handle: async (name, input) => string }`. Jira and Confluence tools are conditional on their env vars; Kapa and web search are always included. Also exports `logToolStatus()` for startup logging.

**`src/skillLoader.js`** — Loads skills from `skills/registry.json`. Skills with `alwaysLoad: true` (e.g. `cr-evaluator`) are loaded first unconditionally; keyword-matched skills are appended after, deduplicated. `SKILL.md` is always loaded first within each skill folder. Returns `{ skillIds, prompt, matched }`.

**`src/store.js`** — In-memory conversation store with write-through to
`data/conversations.json`. Uses a `writeChain` promise queue to prevent concurrent write
corruption.

**`src/fileHandler.js`** — Multer config for up to 5 file uploads. Extracts PDF text via
`pdf-parse`, encodes images as base64. `buildAnthropicContent()` returns the array-format
content block for the Anthropic API.

**`public/index.html`** — Single-file UI (all HTML/CSS/JS inline). Light theme default with dark mode toggle (persisted in localStorage). Features: phase indicator bar (Understanding → Researching → Synthesising), verdict badges (OOTB/Config/Custom/Not Feasible coloured), reference cards (Confluence/Jira/Docs icons), escalation banner with copy button, tool activity pills (spinner → checkmark), collapsible tool groups, skill banners, activity pulse bar, file upload chips, code block download buttons. Inter font (D2), JetBrains Mono for code.

## API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/conversations` | List conversations (sidebar) |
| POST | `/api/conversations` | Create new conversation |
| GET | `/api/conversations/:id` | Get full conversation with messages |
| DELETE | `/api/conversations/:id` | Delete conversation |
| POST | `/api/conversations/:id/messages` | Send message — returns SSE stream |
| POST | `/api/auth/login` | Email + password login, sets session cookie |
| GET | `/api/auth/logout` | Destroy session, redirect to `/login.html` |
| GET | `/api/auth/me` | Returns `{ email, role }` or 401 |
| POST | `/api/auth/register` | Admin-only: create new user |
| GET | `/api/auth/providers` | Returns `{ google, microsoft }` booleans |
| GET | `/auth/google` | Initiate Google OAuth flow |
| GET | `/auth/google/callback` | Google OAuth callback |
| GET | `/auth/microsoft` | Initiate Microsoft OAuth flow |
| GET | `/auth/microsoft/callback` | Microsoft OAuth callback |
| GET | `/about` | Serves `src/about.html` presentation page |

## Key decisions — do not change

- **ESM modules** — `"type": "module"` in package.json. Use `import/export` everywhere.
  The `createRequire` calls in `skillLoader.js` and `mcpConfig.js` for JSON loading are intentional.
- **Skills are files, not code** — never hardcode skill logic in JS. All skill content lives in `skills/`.
- **MCP is disabled** — `mcp.json` has an empty `servers` array. All Jira/Confluence calls are REST. Do not re-enable MCP without resolving OAuth token handling.
- **`claude-sonnet-4-20250514`** is the model. Do not change without testing cost impact.
- **Single-file UI** — `public/index.html` is all HTML/CSS/JS inline. No build step.
- **Tool metadata must be stripped** — never include `_toolId` or other internal fields in the `messages` array sent to the Anthropic API. The `cleanBlocks` mapping in the agentic loop is load-bearing.
- **Jira search uses `/rest/api/3/search/jql`** — the old `/rest/api/3/search` endpoint returns 410. Do not revert.
- **Tool handlers never throw** — all handlers in `src/tools/` catch errors internally and return `JSON.stringify({ error: '...', partial: true })`. The orchestrator loop will never see an exception from a tool call.

## Environment variables

All in `.env.example`. Only `ANTHROPIC_API_KEY` is required to start.

Jira REST: `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`
Confluence REST: `CONFLUENCE_BASE_URL`, `JIRA_EMAIL` (shared), `CONFLUENCE_API_TOKEN`
Kapa docs: `CAPILLARY_DOCS_MCP_URL`, `CAPILLARY_DOCS_MCP_TOKEN` (optional — degrades gracefully if absent)
Web search: `WEB_SEARCH_SITEMAP_URL` (optional — defaults to `https://docs.capillarytech.com/sitemap.xml`)
Auth (required): `SESSION_SECRET` — hard crash on absence
Auth (bootstrap): `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASS` — seeds first admin when `data/users.json` is empty
SSO (optional): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
SSO (optional): `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_CALLBACK_URL`
SSO domain: `ALLOWED_EMAIL_DOMAIN` (default `capillarytech.com`)
LangSmith (optional): `LANGCHAIN_TRACING_V2=true`, `LANGCHAIN_API_KEY`, `LANGCHAIN_PROJECT`
Tuning: `MAX_AGENT_TOKENS` (default 8000; set to 24000 for SDD generation)

## Skills system

Skills live in `skills/<skill-id>/`. Each has a `SKILL.md` (loaded first) plus supporting
files (`.md`, `.txt`, `.json`, `.jsonl`). Subfolders are included recursively.

Two activation modes via `skills/registry.json`:
- `alwaysLoad: true` — loaded unconditionally before keyword matching (e.g. `cr-evaluator`)
- `triggers: [...]` — keyword-matched against the problem text at runtime

The agent can also call `activate_skill` dynamically at runtime.

**Always-on skills:** `cr-evaluator` — the CS feasibility evaluation rubric (OOTB/Config/Custom/Not Feasible definitions, Capillary module map, complexity scoring guide). Always included in every request.

**To add a skill:** create `skills/my-skill/SKILL.md`, add an entry to `skills/registry.json`
with `id`, `folder`, `description`, and `triggers` (and optionally `alwaysLoad: true`). No JS changes needed.

## Deployment

Push to GitHub → Railway auto-deploys from `main`. Set all env vars in the Railway dashboard.

**Live URL:** https://slack-solution-agent-production.up.railway.app/

Required env vars in Railway:
- `ANTHROPIC_API_KEY` — required
- `SESSION_SECRET` — required (hard crash on absence)
- `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` — for Jira tools
- `CONFLUENCE_BASE_URL`, `CONFLUENCE_API_TOKEN` — for Confluence tools
- `CAPILLARY_DOCS_MCP_URL`, `CAPILLARY_DOCS_MCP_TOKEN` — optional (Kapa docs)
- `WEB_SEARCH_SITEMAP_URL` — defaults to `https://docs.capillarytech.com/sitemap.xml`
- `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASS` — seeds first admin on fresh deploy
- `ALLOWED_EMAIL_DOMAIN` — defaults to `capillarytech.com`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` — optional SSO
- `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_CALLBACK_URL` — optional SSO
- `LANGCHAIN_TRACING_V2`, `LANGCHAIN_API_KEY`, `LANGCHAIN_PROJECT` — optional LangSmith tracing
- `MAX_AGENT_TOKENS` — default 8000; set to 24000 for SDD generation
