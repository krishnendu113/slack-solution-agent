# Solution Agent — Product Requirements

## Purpose

A web-based AI agent for the Capillary Technologies Customer Success (CS) team.
CS engineers and SAs submit client problems — new feature requests, change requests,
reported issues, or requirements from prospect BRDs — and get a structured analysis
covering feasibility, recommended approach, implementation complexity, and references
to how similar problems were solved before.

The agent must reduce dependency on the SA team for initial assessments.

---

## Users

- **CS Engineers**: Day-to-day client-facing team. Need quick, credible answers.
- **SAs (Solution Architects)**: Escalation target. Agent should reduce how often
  they are pulled in for routine evaluations.

---

## Core Functional Requirements

### FR-1 — Input Acceptance

The agent must accept problem descriptions in any of these forms:

- Free-text description of a client requirement, CR, or issue
- One or more Jira ticket IDs (e.g. `PSV-27923`, `LMP-443`)
- Attached documents: PDF, plain text, images (screenshots/wireframes)
- Any combination of the above

### FR-2 — Structured Analysis Output

For every request the agent must produce:

1. **Problem restatement** — confirms it understood the requirement correctly
2. **Feasibility verdict** — one of: OOTB / Config / Custom / Not Feasible
3. **Recommended approach** — step-by-step implementation guidance
4. **Complexity estimate** — Low / Medium / High with brief justification
5. **Precedent references** — links to Confluence solution docs or Jira tickets where
   this or a similar requirement was solved before
6. **Open questions** — anything that would change the recommendation if answered differently

If the agent cannot produce a confident answer, it must ask for the missing information
rather than hallucinate or hedge without specifics.

### FR-3 — Information Sources (in priority order)

1. **Confluence** — Solution Docs, Architecture pages, past implementation notes
2. **Jira** — Related tickets, similar past CRs, implementation references
3. **Capillary Kapa docs** — Product documentation at docs.capillarytech.com
4. **Web search scoped to docs.capillarytech.com** — via sitemap at
   `https://docs.capillarytech.com/sitemap.xml` for product capability lookups
5. Skills loaded at runtime (SDD writer, gap analyzer, diagram generator)

The agent must always search before answering. It must not rely on training-data
knowledge alone for product-specific questions.

### FR-4 — Grounded in Past Solutions

Every recommendation must cite at least one real reference (Confluence page, Jira
ticket, or docs.capillarytech.com URL). If no references are found, the agent must
say so explicitly and flag lower confidence.

### FR-5 — Progressive Disclosure UI

The UI must show what the agent is doing while it works:

- Which tools are being called (Jira, Confluence, Kapa, web)
- Status: running → done / failed
- Final response streamed token-by-token

Users must not see a blank screen for more than 2 seconds at any point.

### FR-6 — Conversation Context

Multi-turn conversations must be supported. Follow-up questions refine the original
analysis without losing context. Each conversation is persistent across browser sessions.

### FR-7 — File Output

When the agent produces structured output (SDD, gap analysis, diagram JSON), the user
must be able to download it as a file.

### FR-8 — Escalation Signalling

If the agent determines the request requires SA-level judgement (novel integration,
unclear feasibility, >High complexity), it must clearly flag this and provide a
pre-filled escalation summary the user can copy.

---

## Non-Functional Requirements

### NFR-1 — Response Quality

- Answers must be actionable by a CS engineer with no further SA input for ≥80% of
  routine evaluations (OOTB / Config class problems).
- References must be real and verifiable (no hallucinated URLs or ticket IDs).

### NFR-2 — Response Time

- First visible output (status or token) within 3 seconds of send.
- Full response for a typical CR evaluation within 45 seconds.

### NFR-3 — Reliability

- Tool failures (Jira/Confluence API down) must degrade gracefully: continue with
  available sources, note what was unavailable.
- No blank error screens. All errors shown as friendly, actionable messages.

### NFR-4 — Cost Efficiency

- Use `claude-haiku-4-5` for lightweight sub-tasks (summarisation, classification,
  question generation) and `claude-sonnet-4` for final synthesis.
- Skip costly operations (web search, full Confluence page fetch) when simpler
  lookups already answer the question.

### NFR-5 — Security

- Session-cookie auth (HttpOnly, SameSite=Strict). No credentials in client JS.
- All external API calls server-side only. No Jira/Confluence tokens exposed to browser.

### NFR-6 — Deployability

- Railway-compatible: single Node.js process, env vars for all secrets.
- No database — JSON file persistence is acceptable for team-scale usage.

---

## Phase G — Post-Deployment Fixes

### FR-G1 — No intermediate narration in response bubble

The agent must not render intermediate "thinking" narration (text produced during
tool-calling turns) in the final message bubble. Only the synthesis-turn text — the
structured `## Problem / ## Verdict…` output — must appear as streamed tokens. Tool
pills already communicate what is happening during research; repetitive narration adds
no value and confuses users.

### FR-G2 — Parallel, context-aware tool result summarisation

Tool result summarisation must run in parallel across all results collected from a
single agent turn (not sequentially). Each Haiku summarisation call must receive the
original problem statement as a context hint, so it preserves the most relevant
details rather than summarising generically.

### FR-G3 — Skill trigger visibility

Each skill activation banner must clearly show why the skill loaded:
- Keyword-matched skills: display the trigger keyword(s) that matched (e.g. `"sdd"`, `"gap"`)
- Always-on skills: display an `always-on` label
- Agent-activated skills (`activate_skill` tool): no trigger tag needed (agent decision)

---

## Phase H — Semantic Skill Detection

### FR-H1 — Skill loading based on semantic intent, not keyword matching

Skills must be selected based on understanding the user's intent, not substring matching
of trigger keywords. A request for "a technical architecture document" must load the SDD
skill even if the word "sdd" is absent. A BRD comparison request must load the gap
analyzer even without the exact word "gap".

Keyword matching is retained as a fallback when the semantic detection call fails.

---

## Out of Scope (v1)

- Role-based access control (single shared login is fine)
- Slack integration (removed; web UI only)
- Real-time collaboration / shared conversations
- Automated ticket creation from agent output

---

## Phase I Requirements

### FR-I1 — Multi-user authentication

The application must support multiple named user accounts with individual email/password credentials. A single shared `AUTH_PASS` env var is insufficient for a team.

- Users stored in `data/users.json` as `[{ id, email, passwordHash, role, createdAt }]`
- Passwords hashed with bcrypt (cost factor 12)
- Sessions via `express-session` with `SESSION_SECRET` env var (required on startup)
- First admin seeded from `BOOTSTRAP_ADMIN_EMAIL` + `BOOTSTRAP_ADMIN_PASS` env vars when `data/users.json` is empty
- Admin can register additional users via `POST /api/auth/register`
- `SESSION_SECRET` absence must cause a hard crash on startup

### FR-I2 — Google / Microsoft SSO

CS engineers must be able to sign in with their Capillary Google or Microsoft work accounts. No separate password required.

- SSO via passport-google-oauth20 and passport-microsoft
- Domain restriction: reject OAuth users whose email does not end in `ALLOWED_EMAIL_DOMAIN` (default `capillarytech.com`)
- First SSO login auto-creates a user with `role: 'user'`; subsequent logins update the session
- SSO buttons displayed on the login page alongside password login
- Password login must continue to work unchanged

### FR-I3 — Client persona (vector-less RAG)

When a conversation mentions a known client, the agent must automatically inject client-specific context (integration history, modules, known issues) into the system prompt without a vector database.

- Client files stored as `data/clients/{slug}.md` with sections: Overview, Modules, Known Issues, Recent Conversations
- Client name extracted from problem text by Haiku
- Context injected before the base system prompt
- After synthesis, a delta summary is appended to the client file (fire-and-forget)
- Messages with no recognisable client name must not touch any client file

### FR-I4 — LangGraph orchestration + LangSmith observability

The hand-rolled agentic loop must be replaced with a LangGraph state machine for cleaner control flow. Each phase must be traceable in LangSmith when `LANGCHAIN_TRACING_V2=true`.

- Graph nodes: classify, loadSkills, research (looping), validate
- Tracing: each node wrapped with `traceable()` from `langsmith`; silently disabled when env var absent
- All existing Phase A–H behaviour (skills, tools, streaming, escalation) must be preserved
