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

## Out of Scope (v1)

- Role-based access control (single shared login is fine)
- Slack integration (removed; web UI only)
- Real-time collaboration / shared conversations
- Automated ticket creation from agent output
