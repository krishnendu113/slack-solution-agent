# Solution Agent — Implementation Tasks

Status key: ⬜ todo · 🔄 in progress · ✅ done

See `requirements.md` for what and `design.md` for how.

---

## Phase A — Refactor: Extract Tool Handlers

_Foundation for all subsequent work. Must complete before B/C._

### A1 ✅ Create `src/tools/jira.js`

Extract Jira tool definitions and handlers from `src/orchestrator.js`:
- Tool definitions: `get_jira_ticket`, `search_jira`
- Handler functions: `handleGetJiraTicket()`, `handleSearchJira()`
- Helper: `adfToPlainText()`, `sanitiseQuery()`
- Export: `export const jiraDefinitions = [...]` and `export async function handleJiraTool(name, input)`

### A2 ✅ Create `src/tools/confluence.js`

Extract Confluence tool definitions and handlers from `src/orchestrator.js`:
- Tool definitions: `search_confluence`, `get_confluence_page`
- Handler functions with existing Hystrix retry logic intact
- Helper: `htmlToPlainText()`
- Export same pattern as jira.js

### A3 ✅ Create `src/tools/kapa.js`

Implement `search_kapa_docs` tool:
- Tool definition: `{ name: 'search_kapa_docs', description: '...', input_schema: { query: string } }`
- Handler: if `CAPILLARY_DOCS_MCP_URL` set → `GET ${url}/search?q=${query}&token=${token}`
  else return `{ error: 'Kapa docs not configured' }`
- Return: `[{ title, url, excerpt }]` (max 5 results)
- Export: `export const kapaDefinitions`, `export async function handleKapaTool(name, input)`

### A4 ✅ Create `src/tools/webSearch.js`

Implement `search_docs_site` tool:
- Tool definition: `{ name: 'search_docs_site', description: 'Search Capillary product docs', ... }`
- Fetch sitemap XML from `process.env.WEB_SEARCH_SITEMAP_URL` on first use, cache in module scope
- Parse all `<loc>` URLs from sitemap
- Score by keyword overlap between query words and URL path segments
- Fetch top 3 scoring pages, extract `<title>` and strip HTML tags for excerpt (first 500 chars)
- Return: `[{ title, url, excerpt }]`
- Graceful failure: if sitemap unreachable, return `{ error: 'Docs search unavailable' }`

### A5 ✅ Create `src/tools/index.js`

Aggregator that assembles the correct tool set based on env config:
```js
export function getTools() {
  // returns { definitions: [...], handle: async (name, input) => string }
}
```
- Always include: Jira (if `JIRA_BASE_URL` set), Confluence (if `CONFLUENCE_BASE_URL` set)
- Always include: kapa, webSearch, skill tools
- Log active tools at startup

### A6 ✅ Update `src/orchestrator.js` — import from tools/

- Remove all inline tool definitions and handler code
- Import `getTools` from `./tools/index.js`
- Replace `const tools = [...]` and `handleToolCall()` with getTools() output
- Verify: `npm run dev`, submit a Jira ticket ID, confirm tool still works

---

## Phase B — Sub-Agent Utility

### B1 ✅ Create `src/subAgent.js`

```js
import Anthropic from '@anthropic-ai/sdk';
const anthropic = new Anthropic();

export async function runSubAgent({ systemPrompt, userContent, model = 'claude-haiku-4-5-20251001' }) {
  const response = await anthropic.messages.create({
    model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  });
  return response.content[0].text;
}
```

### B2 ✅ Add request classification in orchestrator

Before the main agentic loop, call `runSubAgent` with Haiku:
- System prompt: classify the CS request into `{ type, confidence, missingInfo[] }`
- If `missingInfo.length > 0` AND `confidence < 0.5`:
  - Emit `onStatus` with the clarifying question
  - Return early with the question as the response text (no tools called)
- Otherwise: proceed to main loop, pass classification into system prompt context

### B3 ✅ Add result summarisation in orchestrator

After collecting tool results in the agentic loop (before feeding to Sonnet):
- For each tool result > 500 chars: call `runSubAgent` with Haiku to produce a
  2-sentence relevance summary + extracted URL
- Replace the raw tool result with the summary in the messages array
- This reduces tokens fed to Sonnet's synthesis turn

---

## Phase C — Orchestrator System Prompt + Skills

### C1 ✅ Rewrite `BASE_SYSTEM_PROMPT` in `src/orchestrator.js`

New prompt must cover:
- Role: "You are a Solution Agent for the Capillary CS team..."
- Output format: required sections in order (`## Problem`, `## Verdict`, `## Approach`,
  `## Complexity`, `## References`, `## Open Questions`)
- Verdict vocabulary with definitions (OOTB / Config / Custom / Not Feasible)
- Citation rule: every source as `[Title](url)`, never invent URLs
- Escalation triggers: no precedent found, novel integration, >High complexity
- Ask rule: only ask when a specific fact would change the verdict; otherwise state uncertainty

### C2 ✅ Add `phase` SSE events in orchestrator agentic loop

At phase transitions emit:
```js
await onStatus?.('phase:understand');   // before classification
await onStatus?.('phase:research');     // before tool calls
await onStatus?.('phase:synthesise');   // before final synthesis turn
```

Or add a dedicated `onPhase` callback to `runAgent()` and pass it from `server.js` as
`sendEvent('phase', { name })`.

### C3 ✅ Create `skills/cr-evaluator/SKILL.md`

Content:
- What OOTB / Config / Custom / Not Feasible means in Capillary context with examples
- Capillary module map: Loyalty (tiers, earn/burn, catalogue), Engage+ (campaigns, push/email/SMS),
  Insights+ (analytics, dashboards), Connect+ (integrations, webhooks, APIs), Neo (workflows)
- Complexity factors: number of modules involved, custom API needed, data migration, client timeline
- Output format reminders (mirrors system prompt)

### C4 ✅ Update `skills/registry.json` — add cr-evaluator

```json
{
  "id": "cr-evaluator",
  "description": "CS feasibility evaluation rubric — always loaded",
  "alwaysLoad": true,
  "triggers": []
}
```

### C5 ✅ Update `src/skillLoader.js` — honour `alwaysLoad`

In `loadSkillsForProblem()`, before keyword matching:
```js
const alwaysOn = registry.filter(s => s.alwaysLoad);
```
Load these first, add to matched list regardless of keywords.

---

## Phase D — UI Redesign

_Can start in parallel with Phase C. Each task is independently deployable._

### D1 ✅ Switch CSS to light theme

In `public/index.html`, update `:root` CSS variables:
- Background: `#ffffff` / secondary `#f7f7f8`
- Text: `#1a1a1a` / muted `#6b7280`
- Accent: `#0066cc`
- Border: `#e5e7eb`

Add `[data-theme="dark"]` overrides with current dark values.
Add a `🌙` / `☀` toggle button in the header that sets `data-theme` on `<html>`.
Persist preference in `localStorage`.

### D2 ✅ Add Inter font + typographic polish

Add to `<head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
```

Update `body { font-family: 'Inter', system-ui, sans-serif; }`.
Code blocks: `font-family: 'JetBrains Mono', 'Fira Code', monospace`.

### D3 ✅ Add phase indicator bar

Above the chat messages area, below the header:
```html
<div id="phase-bar" class="phase-bar" hidden>
  <div class="phase-step" data-phase="understand">Understanding</div>
  <div class="phase-sep">→</div>
  <div class="phase-step" data-phase="research">Researching</div>
  <div class="phase-sep">→</div>
  <div class="phase-step" data-phase="synthesise">Synthesising</div>
</div>
```

Show on first SSE event, hide on `message` event.
Highlight active step with accent colour + `●` dot.

### D4 ✅ Add verdict badge rendering

After rendering agent message markdown, scan for `**Verdict:** OOTB/Config/Custom/Not Feasible`.
Replace with a styled inline badge:
```html
<span class="verdict-badge verdict-ootb">OOTB</span>
```

CSS classes: `verdict-ootb` (green), `verdict-config` (blue), `verdict-custom` (amber),
`verdict-not-feasible` (red).

### D5 ✅ Add reference cards

After rendering agent message, check for a `## References` section.
For each markdown link in that section, replace with a reference card:
```html
<a class="ref-card" href="..." target="_blank">
  <span class="ref-icon"><!-- Confluence/Jira/Docs icon --></span>
  <span class="ref-title">Page Title</span>
  <span class="ref-domain">capillarytech.atlassian.net</span>
</a>
```

Detect source type from URL domain: `atlassian.net/wiki` → Confluence icon,
`atlassian.net/browse` → Jira icon, `docs.capillarytech.com` → Docs icon.

### D6 ✅ Add escalation banner

In the message rendering function, before the message content:
```js
if (msg.escalated) {
  // prepend yellow banner with copy button
}
```
```html
<div class="escalation-banner">
  ⚠ SA Escalation Recommended
  <button onclick="copyEscalationSummary()">Copy summary</button>
</div>
```

### D7 ✅ Message layout polish

- User messages: `margin-left: auto; max-width: 65%; background: var(--bg-secondary)`
- Agent messages: `margin-right: auto; max-width: 100%; background: var(--bg)`
- Remove visible timestamps; add `title="HH:MM"` for hover
- Remove hard borders from message bubbles; use only background + padding

---

## Phase E — Reliability & Quality

### E1 ✅ Parallel tool call processing

The Anthropic API may return multiple `tool_use` blocks in one response turn.
Update the agentic loop in `orchestrator.js` to:
- Collect ALL `tool_use` blocks from a single turn (not just the first)
- Execute them all (can be sequential; Jira+Confluence+Kapa are fast)
- Append ALL tool results before the next turn

### E2 ✅ Graceful tool failure propagation

Each tool handler must catch errors and return:
```js
return JSON.stringify({ error: 'Confluence search failed: 503', partial: true });
```

Orchestrator passes this to Claude — the synthesis prompt notes which sources failed.
Never throw from a tool handler.

### E3 ✅ Post-synthesis validation sub-agent

After the synthesis turn completes, run a Haiku sub-agent:
- Check: does the response text contain at least one `https://` link?
- Check: does it contain a Verdict line?
- If either missing, append a structured note:
  `> Note: No precedent references were found. This analysis is based on product knowledge only.`

### E4 ✅ Input sanitisation review

Audit all tool inputs in `src/tools/`:
- Max query length: 200 chars (truncate silently)
- Strip: `; -- /* */ ' " \` (SQL/JQL injection chars) — already done for Jira/Confluence, verify for kapa/webSearch
- Handle: empty query (return empty results, don't call API)
- Handle: network timeout (5s max per tool call, return error object)

---

## Phase F — Documentation & Deployment

### F1 ✅ Update `CLAUDE.md`

Add sections reflecting new architecture:
- `src/tools/` directory and `getTools()` pattern
- `src/subAgent.js` and when it's called
- Phase-based analysis flow
- `cr-evaluator` always-on skill

### F2 ✅ Update `.env.example`

Add:
```
CAPILLARY_DOCS_MCP_URL=       # Kapa MCP endpoint (optional, leave blank to disable)
CAPILLARY_DOCS_MCP_TOKEN=     # Kapa MCP bearer token
WEB_SEARCH_SITEMAP_URL=https://docs.capillarytech.com/sitemap.xml
```

### F3 ✅ Deploy to Railway and smoke test

1. `git push origin main` → Railway auto-deploys ✅ (commit 99d4f86, pushed 2026-04-16)
2. Open deployed URL: https://slack-solution-agent-production.up.railway.app/ ✅
3. Submit: "Can Capillary handle a tiered cashback program for a petrol station chain?"
   ✅ Verified locally: phase bar (understand→research→synthesise), all tool pills running→done,
      response has ## Verdict (Config) + ## References (PSV-4042 BPCL, SCE-645 JioBP — real tickets)
4. Verify: phase bar animates, tools show running→done, response has Verdict + References ✅
5. Submit a real Jira ticket ID — verify on Railway once deployed
6. Verify: ticket fetched, structured analysis, no hallucinated content
7. Upload a PDF BRD — verify on Railway once deployed
8. Verify: gap analysis skill activates, output has download button

---

## Phase G — Post-Deployment Fixes

_All three tasks are independent and can be worked in parallel. G3A must land before G3B._

### G1 ✅ Fix intermediate narration leakage — `src/orchestrator.js`

Root cause: `onToken` is called on every streaming delta including turns that end with
`tool_use`. Intermediate narration snowballs into the message bubble.

Changes:
- Inside the per-turn loop (line ~386), declare `const turnTokens = []`
- In the streaming delta handler (line ~403), push to `turnTokens` instead of calling `onToken`
  and remove the `fullText +=` from the streaming path
- After stream completes (after line ~432), add:
  ```js
  if (stopReason !== 'tool_use') {
    for (const tok of turnTokens) {
      fullText += tok;
      if (onToken) await onToken(tok);
    }
  }
  ```

Verify: response bubble shows only `## Problem` onward — no "I'll search for…" preamble.
Tool pills still animate because `onToolStatus` is unaffected.

### G2 ✅ Parallel Haiku summarisation with problem context — `src/orchestrator.js`

Root cause: sequential `for` loop with `await summariseToolResult()` per tool adds N × ~1 s.
Haiku also lacks context on what the agent is trying to answer.

Changes:
- Update `summariseToolResult(toolName, rawResult, problemContext = '')` — prepend
  `Agent is researching: "${problemContext.slice(0, 250)}"` to Haiku user content
- Replace the single-loop tool handler with three stages:
  1. Sequential tool execution → `rawResults[]`
  2. `Promise.all` summarisation (pass `problemText` as context)
  3. Assemble `toolResults[]`, emit `onToolStatus` done, handle `activate_skill` event

Verify: server logs show `[orchestrator] Summarising` lines appearing at near-identical
timestamps (parallel), not staggered.

### G3A ✅ Annotate matched triggers in skillLoader — `src/skillLoader.js`

Changes:
- `detectSkills(text)`: after filtering, `.map()` each skill to add
  `matchedTriggers: skill.triggers.filter(t => lower.includes(t))`
- `loadSkillsForProblem()`: always-on skills annotated with `alwaysActive: true`
  and `matchedTriggers: []`

No other files need changing — `matched[]` already flows through to orchestrator.

### G3B ✅ Pass trigger info in `onSkillActive` — `src/orchestrator.js`

_Depends on G3A (needs `matchedTriggers` and `alwaysActive` on skill entries)._

Changes:
- Initial skill load (line ~344): emit `{ id, description, triggers: skill.matchedTriggers || [], alwaysOn: skill.alwaysActive || false }`
- `activate_skill` tool path (line ~468): emit `{ id, description, triggers: [], alwaysOn: false }`

### G3C ✅ Render trigger tags in skill banner — `public/index.html`

_Depends on G3B (needs `triggers` and `alwaysOn` in SSE payload)._

Changes in the `skill_active` SSE handler:
- Build `triggerHtml`:
  - `alwaysOn` → `<span class="skill-tag skill-tag-always">always-on</span>`
  - `triggers.length` → one `<span class="skill-tag">"keyword"</span>` per trigger
  - neither → empty string
- Append `<span class="skill-banner-triggers">${triggerHtml}</span>` to banner innerHTML

New CSS (alongside `.skill-banner`):
```css
.skill-banner-triggers { margin-left: auto; display: flex; gap: 4px; flex-wrap: wrap; }
.skill-tag { font-size: 10px; padding: 1px 6px; border-radius: 4px;
  background: rgba(99,102,241,0.12); color: #4f46e5; font-family: monospace; }
.skill-tag-always { background: rgba(22,163,74,0.1); color: #16a34a; font-family: inherit; }
[data-theme="dark"] .skill-tag { background: rgba(139,92,246,0.15); color: #c4b5fd; }
[data-theme="dark"] .skill-tag-always { background: rgba(34,197,94,0.1); color: #4ade80; }
```

Verify: cr-evaluator banner shows `always-on` tag; SDD-triggered skill shows `"sdd"` tag.

---

## Execution Order

```
A1, A2, A3, A4  (parallel within phase)
        ↓
       A5
        ↓
       A6  ← test here before continuing
        ↓
    ┌───┴───┐
    B1      D1
    ↓       ↓
    B2      D2
    ↓       ↓
    B3      D3, D4, D5, D6, D7  (any order)
    ↓
   C1
    ↓
   C2
    ↓
   C3, C4, C5  (parallel)
    ↓
   E1, E2, E3, E4  (any order)
    ↓
   F1, F2, F3
```

UI (D) can run in parallel with B and C once A is complete.
