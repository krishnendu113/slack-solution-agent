# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A web-based chat agent for the Capillary Technologies Customer Success team.
CS team members describe problems or paste Jira ticket IDs in the chat UI.
The agent analyses them using Claude (claude-sonnet-4), searches Capillary docs and
Confluence via MCP, dynamically loads specialist skills (SDD writer, gap analyzer,
Excalidraw), and returns solution options — or flags for SA escalation.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Run locally with --watch (auto-restart on file changes)
npm start            # Production start
npm run lint         # ESLint on src/
```

No automated tests exist yet. Manual testing: run `npm run dev`, open `http://localhost:3000`.

## Architecture

**Request flow:** Browser (`public/index.html`) → Express (`src/server.js`) REST + SSE → `src/orchestrator.js` → Anthropic API → SSE stream back to browser.

**`src/server.js`** — Express entry point. Serves static files from `public/`, exposes REST API for conversation CRUD and an SSE streaming endpoint for agent messages.

**`src/store.js`** — JSON-file persistence at `data/conversations.json`. In-memory with write-through to disk. Conversations keyed by UUID.

**`src/orchestrator.js`** — The core agent logic:
1. Calls `skillLoader.js` which keyword-matches the problem text against `skills/registry.json` triggers, then loads all `.md` files from matched `skills/<id>/` folders into a prompt block (SKILL.md always first).
2. Calls `mcpConfig.js` which reads `mcp.json` server definitions and resolves URLs/tokens from env vars. Servers without a URL env var are silently skipped.
3. Assembles system prompt (base prompt + skill blocks), attaches MCP servers, calls Anthropic API via raw `fetch()`.
4. Returns response text + escalation flag.

**Streaming pattern:** `server.js` opens an SSE connection for each message. The `onStatus` callback from `runAgent()` pushes `event: status` frames. The final response is sent as `event: message`, then the stream closes.

**Jira integration:** `src/tools/jira.js` does direct REST API fetches for specific ticket IDs (separate from any MCP). Uses `JIRA_EMAIL` + `JIRA_API_TOKEN` for Basic auth (base64-encoded at runtime).

## API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/conversations` | List conversations (sidebar) |
| POST | `/api/conversations` | Create new conversation |
| GET | `/api/conversations/:id` | Get conversation with messages |
| DELETE | `/api/conversations/:id` | Delete conversation |
| POST | `/api/conversations/:id/messages` | Send message, returns SSE stream |

## Key decisions — do not change

- **ESM modules** — `"type": "module"` in package.json. Use `import/export`, not `require()`.
  The `createRequire` calls in `skillLoader.js` and `mcpConfig.js` for JSON loading are intentional — do not change to `fs.readFileSync + JSON.parse`.
- **Skills are files, not code** — never hardcode skill logic in JS. Always load from `skills/`.
- **MCP URLs and tokens are always env vars** — never hardcode in `mcp.json` or JS.
- **claude-sonnet-4-20250514** is the model. Do not change without testing cost impact.
- **Single-file UI** — `public/index.html` contains all HTML, CSS, and JS inline. No build step.

## Environment variables

All documented in `.env.example`. Required to start:
- `ANTHROPIC_API_KEY` — for the agent to work

Optional but recommended:
- `PORT` — defaults to 3000
- `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` — for Jira ticket fetching
- MCP server env vars — for doc search quality

## Skills system

Skills live in `skills/<skill-id>/`. Each has a `SKILL.md` (loaded first) plus supporting `.md` files.
`skillLoader.js` auto-discovers all `.md`/`.txt`/`.json`/`.jsonl` files recursively.
Activation is keyword-based via `skills/registry.json` triggers.

**To add a new skill:** create `skills/my-skill/SKILL.md`, add supporting files, add an entry to `skills/registry.json` with triggers. No code changes needed.

## Deployment

Push to GitHub → Railway auto-deploys. Env vars set in Railway dashboard. See `plan.md §7`.
