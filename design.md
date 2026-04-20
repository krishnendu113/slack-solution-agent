# Solution Agent — Technical Design

## Architecture Overview

```
Browser (public/index.html)
   │  REST + SSE
   ▼
Express (src/server.js)
   │
   ▼
Orchestrator (src/orchestrator.js)
   ├── SkillLoader (src/skillLoader.js)      ← keyword + dynamic activation
   ├── SubAgentRunner (src/subAgent.js)      ← NEW: Haiku sub-tasks
   ├── ToolRegistry (src/tools/)             ← Jira, Confluence, Kapa, Web
   └── Anthropic SDK → claude-sonnet-4      ← Synthesis model
```

---

## Model Strategy

| Task | Model | Rationale |
|------|-------|-----------|
| Main synthesis & reasoning | `claude-sonnet-4-20250514` | Complex multi-source reasoning |
| Ticket/doc summarisation | `claude-haiku-4-5-20251001` | Fast, cheap, 1-shot summaries |
| Request classification | `claude-haiku-4-5-20251001` | Light classification task |
| SDD / gap analysis writing | `claude-sonnet-4-20250514` | Document quality matters |

Sub-tasks run via a lightweight `runSubAgent({ prompt, content, model })` helper that
makes a single non-streaming `messages.create` call. Not a separate process — a utility
function in `src/subAgent.js`.

---

## Tool Architecture

### MCP-First, REST Fallback

```
ATLASSIAN_MCP_URL set?  → use MCP (Anthropic beta header)
                        → else use src/tools/jira.js + src/tools/confluence.js (REST)

CAPILLARY_DOCS_MCP_URL set? → use MCP for Kapa docs
                            → else use src/tools/kapa.js (HTTP)
```

Web search is always REST (`src/tools/webSearch.js`) — no MCP available for it.

### Tool Directory Structure (new)

```
src/tools/
  jira.js         ← get_jira_ticket, search_jira  (moved from orchestrator.js)
  confluence.js   ← search_confluence, get_confluence_page  (moved)
  kapa.js         ← search_kapa_docs  (NEW)
  webSearch.js    ← search_docs_site  (NEW)
  index.js        ← getTools(config) → { definitions[], handlers{} }
```

`getTools(config)` inspects env vars and returns the correct tool set (REST or MCP stubs).
Orchestrator imports only from `src/tools/index.js`.

### Tool: `search_docs_site`

Searches `docs.capillarytech.com` without any search API:

1. Fetch `WEB_SEARCH_SITEMAP_URL` XML once, parse all `<loc>` URLs, cache in memory
2. Score URLs by keyword overlap with query (path tokens + query words)
3. Fetch top 3 matching pages, extract `<title>` and first 500 chars of visible text
4. Return `[{ title, url, excerpt }]`

Deterministic, no API cost, works offline for cached sitemaps.

### Tool: `search_kapa_docs`

- If `CAPILLARY_DOCS_MCP_URL` is set: pass as an MCP server in the Anthropic call
- Else: `GET ${CAPILLARY_DOCS_MCP_URL}/search?q=${query}` with Bearer token
- Return: `[{ title, url, excerpt }]`

---

## Orchestrator Redesign

### Phase-Based Analysis

The agentic loop follows a soft 4-phase structure enforced through the system prompt
and tool design — not hard code branches.

```
Phase 1 — Understand (1–2 turns)
  • Restate the problem in CS terms
  • Sub-agent (Haiku): classify request → { type, confidence, missingInfo[] }
  • If missingInfo non-empty AND confidence < 0.5 → ask user, stop

Phase 2 — Research (2–5 turns)
  • Parallel tool calls: Jira search + Confluence search + Kapa search
  • Sub-agent (Haiku): summarise each result batch → short relevance blurb + URL
  • Accumulate references list

Phase 3 — Synthesise (1 turn)
  • Sonnet assembles structured response (see FR-2 output format)
  • Must include at least one citation; if none found, say so explicitly

Phase 4 — Escalation check (inline in synthesis)
  • If verdict = Not Feasible or confidence low → add escalation block
  • Emit shouldEscalate=true → server sends escalation summary
```

### System Prompt Changes

The new `BASE_SYSTEM_PROMPT` explicitly specifies:

- **Output format** with section headers: `## Problem`, `## Verdict`, `## Approach`,
  `## Complexity`, `## References`, `## Open Questions`
- **Verdict vocabulary**: OOTB / Config / Custom / Not Feasible (with definitions)
- **Citation rule**: every reference as `[Page Title](url)` — no bare URLs, no made-up links
- **Escalation triggers**: novel integration, no precedent found, >High complexity,
  requires product roadmap knowledge
- **Ask vs proceed rule**: ask only when a specific piece of information would
  materially change the verdict; otherwise proceed and note uncertainty

### New SSE Event: `phase`

```js
sendEvent('phase', { name: 'understand' | 'research' | 'synthesise' })
```

Emitted at phase transitions in the agentic loop. UI uses this to animate the phase bar.

---

## Skill System Changes

### New: `cr-evaluator` (always-on)

```
skills/cr-evaluator/
  SKILL.md          ← evaluation rubric, Capillary module map, complexity factors
```

`skills/registry.json` entry:

```json
{
  "id": "cr-evaluator",
  "description": "CS feasibility evaluation rubric",
  "alwaysLoad": true,
  "triggers": []
}
```

`skillLoader.js` change: load skills where `alwaysLoad === true` before keyword matching.

### Existing Skills (unchanged)

- `capillary-sdd-writer` — triggered by SDD/LLD keywords
- `solution-gap-analyzer` — triggered by gap/BRD keywords
- `excalidraw-diagram` — triggered by diagram/flow keywords

---

## UI Redesign

### Theme

Switch from dark-only to **light default** with optional dark mode toggle.

```css
/* Light (default) */
--bg: #ffffff;
--bg-secondary: #f7f7f8;
--text: #1a1a1a;
--text-muted: #6b7280;
--accent: #0066cc;
--border: #e5e7eb;

/* Dark (data-theme="dark") */
--bg: #1a1a1a;
/* ... */
```

### Typography

Load Inter from Google Fonts. Apply to `body`. Code blocks use `JetBrains Mono` or `Fira Code`.

### Layout (unchanged structure, polished details)

```
┌──────────────────────────────────────────────────────┐
│  ☰  Solution Agent                         [New Chat] │
├─────────────┬────────────────────────────────────────┤
│             │  [Phase bar: Understanding→Researching→Synthesising]
│  Sidebar    │  ────────────────────────────────────── │
│  (conv      │  Chat messages                          │
│   list)     │                                        │
│             ├────────────────────────────────────────┤
│             │  Input (textarea + file chips + send)  │
└─────────────┴────────────────────────────────────────┘
```

### New UI Components

**Phase bar** — slim progress indicator above chat, visible while agent is working:

```
● Understanding  →  ○ Researching  →  ○ Synthesising
```

**Verdict badge** — parsed from `## Verdict` section, rendered inline:

```
[OOTB]   green   #16a34a
[Config]  blue    #0066cc
[Custom]  amber   #d97706
[Not Feasible]  red  #dc2626
```

**Reference cards** — parsed from `## References` section, each link becomes a card:

```
┌─────────────────────────────────────┐
│ [Confluence icon] Page Title        │
│ capillarytech.atlassian.net/wiki/…  │
└─────────────────────────────────────┘
```

**Escalation banner** — shown above message when `escalated === true`:

```
⚠ SA Escalation Recommended   [Copy summary]
```

### Message Layout

- User messages: right-aligned, max-width 65%, `--bg-secondary` background, no border
- Agent messages: left-aligned, full chat width, white background
- Tool pills: inline, collapsible, below thinking indicator
- No timestamps visible (show on hover via `title` attribute)

---

## Persistence

No changes to `src/store.js`. JSON-file backed at `data/conversations.json`.

Future upgrade path (when team > 10 users): swap to `better-sqlite3` — single file,
no separate process, Node.js native bindings.

---

## Environment Variables

New vars to add to `.env.example`:

```
CAPILLARY_DOCS_MCP_URL=       # Kapa MCP endpoint (optional)
CAPILLARY_DOCS_MCP_TOKEN=     # Kapa MCP bearer token (optional)
WEB_SEARCH_SITEMAP_URL=https://docs.capillarytech.com/sitemap.xml
```

All existing vars unchanged.

---

## Files Changed / Created

| File | Change |
|------|--------|
| `src/tools/jira.js` | NEW — Jira handlers extracted from orchestrator |
| `src/tools/confluence.js` | NEW — Confluence handlers extracted |
| `src/tools/kapa.js` | NEW — Kapa docs search |
| `src/tools/webSearch.js` | NEW — Sitemap-based docs search |
| `src/tools/index.js` | NEW — `getTools(config)` aggregator |
| `src/subAgent.js` | NEW — Haiku sub-task runner |
| `src/orchestrator.js` | CHANGED — import tools, new prompt, phase events |
| `src/skillLoader.js` | CHANGED — honour `alwaysLoad` flag |
| `skills/cr-evaluator/SKILL.md` | NEW — CR evaluation rubric |
| `skills/registry.json` | CHANGED — add cr-evaluator entry |
| `public/index.html` | CHANGED — light theme, phase bar, verdict badge, ref cards |
| `.env.example` | CHANGED — new vars |
| `CLAUDE.md` | CHANGED — updated architecture docs |

**Not changed:** `src/server.js`, `src/store.js`, `src/fileHandler.js`, `src/mcpConfig.js`

---

## Phase G — Post-Deployment Fixes

### G1 — Per-turn token buffer (fixes intermediate narration leakage)

**Problem:** `onToken` was called unconditionally on every streaming text delta across
all turns. Turns that end with `tool_use` emit narration ("I'll search for…") into the
UI bubble before the tools have run. The next turn narrates again, producing a snowball.

**Fix:** Declare `turnTokens = []` inside the per-turn loop. Push text deltas into the
buffer instead of calling `onToken`. After streaming ends, check `stopReason`:
- `=== 'tool_use'` → discard buffer (intermediate narration never sent to client)
- `!== 'tool_use'` → emit all buffered tokens via `onToken` and accumulate into `fullText`

`fullText` therefore contains only synthesis-turn text, which is what the post-synthesis
validator checks and what is stored in conversation history.

### G2 — Parallel Haiku summarisation with problem context

**Problem:** Summarisation ran in a `for` loop — N sequential Haiku round-trips added
N × ~1 s before Sonnet received results. Haiku also had no context about what the agent
was trying to answer, so it could summarise irrelevant details.

**Fix:** Restructure the tool result phase into three sequential stages:
1. **Execute all tools** — stays sequential (fast I/O, avoids burst rate-limiting)
2. **Parallel summarisation** — `Promise.all` over all results > 500 chars; each call
   receives a `problemContext` prefix (first 250 chars of `problemText`) so Haiku knows
   what to preserve
3. **Assemble + emit status** — build `tool_result` messages, emit `onToolStatus` done

`summariseToolResult(toolName, rawResult, problemContext = '')` gains the third param.

### G3 — Skill trigger visibility

**Annotation flow:**

```
skillLoader detectSkills()
  → adds matchedTriggers: string[] to each matched entry
  → always-on skills annotated with alwaysActive: true

loadSkillsForProblem()
  → passes annotated entries through in matched[]

orchestrator onSkillActive callback
  → emits { id, description, triggers: matchedTriggers, alwaysOn: alwaysActive }

SSE skill_active event
  → client receives triggers[] and alwaysOn flag

index.html skill banner
  → alwaysOn  → renders <span class="skill-tag skill-tag-always">always-on</span>
  → triggers  → renders <span class="skill-tag">"keyword"</span> per trigger
  → agent-activated (triggers=[]) → no tag rendered
```

**Files changed in Phase G:**

| File | Change |
|------|--------|
| `src/orchestrator.js` | G1 token buffer; G2 parallel summarise + context param; G3B trigger payload |
| `src/skillLoader.js` | G3A: `detectSkills()` returns `matchedTriggers[]`; always-on annotated `alwaysActive: true` |
| `public/index.html` | G3C: skill banner renders trigger tags; new `.skill-tag` CSS |

---

## Phase H — Semantic Skill Detection

### H1: Haiku semantic skill selector

**Problem:** `detectSkills()` uses substring matching. Misses intent-equivalent requests
that don't use exact trigger vocabulary.

**Fix:** New `detectSkillsSemantic(problemText)` in `src/orchestrator.js`. Haiku sub-agent
call that receives skill ids + descriptions (not full content) and returns
`[{ id, reason }]`. Runs in `Promise.all` parallel with `classifyRequest()` — zero added
latency vs. the existing sequential flow.

Fallback chain:
```
detectSkillsSemantic()
  ├─ returns [{id, reason}] → loadSkillsForProblem uses these, annotates matchReason
  ├─ returns []             → no skills needed (valid answer), always-on still load
  └─ returns null (error)   → loadSkillsForProblem falls back to detectSkills() keywords
```

`loadSkillsForProblem(problemText, semanticMatches = null)` gains a second param. When
`semanticMatches` is not null, keyword matching is skipped entirely.

The `matchReason` string (Haiku's one-sentence explanation) is threaded through to
`onSkillActive` as `reason` and rendered in the UI skill banner as an italic sky-blue
tag, replacing the monospace keyword tags.

**Files changed in Phase H:**

| File | Change |
|------|--------|
| `src/orchestrator.js` | `detectSkillsSemantic()`; `Promise.all([classifyRequest, detectSkillsSemantic])`; `reason` in `onSkillActive` |
| `src/skillLoader.js` | `loadSkillsForProblem(problemText, semanticMatches)` second param; `matchReason` annotation |
| `public/index.html` | Skill banner shows `reason` tag (`.skill-tag-semantic`); new CSS |
