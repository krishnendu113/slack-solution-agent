/**
 * orchestrator.js
 *
 * Agentic orchestrator using the Anthropic SDK.
 * Tool definitions and handlers live in src/tools/.
 * Skills are loaded by src/skillLoader.js.
 * Sub-tasks (classification, summarisation) use src/subAgent.js.
 *
 * runAgent() streams a response to the caller via callbacks:
 *   onStatus(text)                    — status updates between turns
 *   onToken(text)                     — streamed text deltas
 *   onToolStatus({ id, name, ... })   — tool start / done / error
 *   onSkillActive({ id, description }) — when a skill is loaded
 *   onPhase(name)                     — phase transitions: 'understand' | 'research' | 'synthesise'
 *   onDocumentReady({ filename, ... })— when a downloadable document is ready
 *   onPlanUpdate(plan)                — when a plan is created or updated
 */

import Anthropic from '@anthropic-ai/sdk';
import { runSubAgent } from './subAgent.js';
import { updateClientPersona } from './clientPersona.js';
import { buildGraph } from './graph.js';

// ─── Friendly Error Messages ──────────────────────────────────────────────────

export class AgentError extends Error {
  constructor(userMessage, technical) {
    super(userMessage);
    this.name = 'AgentError';
    this.technical = technical;
  }
}

function friendlyError(err) {
  const msg = err.message || '';
  const status = err.status || 0;
  const body = err.error?.error?.message || err.error?.message || msg;

  // Budget / billing errors
  if (body.includes('credit balance is too low') || body.includes('billing') || body.includes('insufficient_quota'))
    return new AgentError("The AI budget has been exhausted. Please contact your admin to top up credits at console.anthropic.com.", body);
  if (body.includes('exceeded your current quota') || body.includes('spending limit'))
    return new AgentError("The AI spending limit has been reached. Please contact your admin to increase the limit at console.anthropic.com.", body);

  // Auth errors
  if (body.includes('invalid x-api-key') || body.includes('invalid api key') || status === 401)
    return new AgentError("The AI API key is invalid or expired. Please contact your admin.", body);

  // Rate limits
  if (status === 429) return new AgentError("The AI is receiving too many requests right now. Please wait a moment and try again.", body);
  if (body.includes('overloaded') || status === 529) return new AgentError("The AI service is temporarily overloaded. Please try again in a moment.", body);

  // Server errors
  if (status >= 500) return new AgentError("The AI service is experiencing issues. Please try again shortly.", body);

  // Context length
  if (body.includes('context length') || body.includes('too long') || body.includes('maximum'))
    return new AgentError("This conversation has become too long for the AI to process. Please start a new chat.", body);

  // Invalid request (catch-all for 400s with useful message)
  if (status === 400) return new AgentError(`The AI request was invalid: ${body.slice(0, 150)}`, body);

  return new AgentError(`Something went wrong while processing your request. Please try again or start a new chat.`, body);
}

// ─── Base System Prompt ───────────────────────────────────────────────────────

const BASE_SYSTEM_PROMPT = `
You are the Capillary Solution Agent — a Solutions Architect assistant for the Capillary Technologies Professional Services (PS) team.

Your job is to evaluate client requirements, change requests (CRs), Jira tickets, and BRD extracts, then deliver a structured feasibility assessment that a PS engineer can act on without SA involvement.

---

## Required Output Format

Every response MUST contain these six sections in this exact order. Do not skip any section.

### ## Problem
Restate the requirement in 2–3 sentences in PS terms. Confirm what the client wants and the business context.

### ## Verdict
One word verdict on its own line, then 1–2 sentences of justification.

Allowed values (use exactly these words — no variations):
- **OOTB** — Capability exists today with no configuration or dev work required
- **Config** — Available but requires implementation team configuration (no custom code)
- **Custom** — Requires engineering: custom API, new workflow, or non-standard integration
- **Not Feasible** — Not achievable with current Capillary product or roadmap

### ## Approach
Step-by-step implementation guidance. Be specific: name the Capillary module, the configuration screen or API endpoint, the sequence of steps. Audience is PS engineers and SAs who need actionable instructions.

### ## Complexity
**Low** / **Medium** / **High** followed by 1–2 sentences covering: number of modules involved, whether custom code is needed, data migration requirements, client timeline pressure.

### ## References
Every source MUST be a clickable markdown link: [Title](url)
- Confluence pages: [Page Title](https://capillarytech.atlassian.net/wiki/...)
- Jira tickets: [TICKET-ID: Short Summary](https://capillarytech.atlassian.net/browse/...)
- Product docs: [Doc Title](https://docs.capillarytech.com/...)

If no references were found after searching all sources, write: "No precedent found in Confluence or Jira. Analysis based on product knowledge only."

### ## Open Questions
List specific facts that, if answered differently, would change the verdict or approach. Example: "Is the client on Loyalty+ or legacy Loyalty?" If none, write: "None."

---

## Verdict Rules

- Default to the most lenient verdict you can justify with evidence (prefer OOTB > Config > Custom)
- Never leave Verdict blank. Never use words other than the four defined terms
- If you genuinely cannot determine feasibility: use "Custom" with a note, and flag for escalation

## Citation Rules

- ONLY use URLs returned by your tools — never invent or guess URLs
- Wrap every URL in [Title](url) — no bare links
- If a tool returned a URL but no title, use the ticket ID or page ID as the label
- Never reference a Confluence page or Jira ticket you did not actually retrieve

## Escalation Triggers

Add a **⚠️ SA Escalation Required** block at the end of your response when ANY apply:
- Verdict is **Not Feasible** or you cannot determine it
- No precedent found AND requirement is novel or complex (Custom class)
- Complexity is **High** with multi-module scope or roadmap dependency
- Net-new third-party integration with no Capillary precedent
- Client timeline is shorter than a reasonable delivery estimate
- Regulatory or compliance constraints (PCI, GDPR, local data residency)

The escalation block format:

> ⚠️ **SA Escalation Required**
>
> **Reason:** [why escalation is needed]
> **What SA needs:** [specific questions or decisions the SA must resolve]
> **Preliminary Assessment:** [your best current verdict and confidence]

## Ask vs Proceed

DO proceed (and note uncertainty in Open Questions) when:
- Some context is missing but the core feasibility question can be answered
- You can give a conditional answer: "Config if X, Custom if Y"

ONLY ask the user for information when:
- A specific fact would flip the verdict and you cannot determine it from any source
- The requirement is completely ambiguous and no tool lookup can resolve it

## Tools — Search Before Answering

You have tools. Use them before every answer. Never rely on training-data knowledge alone.
- **get_jira_ticket** — fetch a specific Jira ticket by ID
- **search_jira** — search for related tickets by keyword
- **search_confluence** — search for solution docs and implementation notes
- **get_confluence_page** — fetch full content of a Confluence page
- **search_kapa_docs** — search Capillary product documentation
- **search_docs_site** — search docs.capillarytech.com by keyword
- **activate_skill** — load a specialist skill (SDD writer, gap analyzer, diagram)
- **list_skills** — see all available skills

When you receive a request:
1. Use tools to gather all relevant data (fetch tickets, search for precedents)
2. Synthesise findings into the structured output format above
3. Cite every source with a clickable link

## What NOT to Do

- Do NOT start with "Sure!" or "Great question!" — get straight to the assessment

## Planning for Complex Tasks

You have planning tools. Use them to break down complex requests into trackable steps.

**Automatically create a plan when:**
- The request involves multiple research steps across different sources (e.g., "evaluate this BRD" or "write an SDD")
- The request requires sequential actions (e.g., "check Jira, then search Confluence, then write a summary")
- The user asks for a multi-part analysis or comparison
- The task will take more than 2-3 tool calls to complete

**How to use plans:**
- **create_plan** — Create a plan with a title and list of steps at the start of a complex task
- **update_plan_step** — Mark each step as in_progress when you start it, completed when done, or skipped if not needed
- **get_plan** — Check the current plan state (useful when continuing a plan from a previous turn)

**Plan step guidelines:**
- Keep steps concrete and actionable (e.g., "Search Jira for related tickets" not "Research")
- 3-7 steps is ideal — enough to show progress without being noisy
- Update steps in real-time so the user can see progress
- If a step reveals the answer is simpler than expected, skip remaining steps

**Do NOT create a plan for:**
- Simple single-tool lookups (e.g., "what's the status of PSV-30126?")
- Quick factual questions that need one search
- Follow-up questions in an ongoing conversation
- Do NOT ask for information you can look up with tools
- Do NOT omit the ## Verdict section
- Do NOT invent Confluence page titles, Jira ticket IDs, or URLs
- Do NOT use bare https:// links — always wrap in [Title](url)
- Do NOT narrate tool usage — use tools silently and present findings in the sections above
`.trim();

// ─── Main Agent Entry Point ───────────────────────────────────────────────────

/**
 * Runs the agentic loop for a user message.
 *
 * @param {object} opts
 * @param {string} opts.problemText - The user's message
 * @param {Array} opts.history - Conversation message history
 * @param {string} opts.userId - Authenticated user ID for store scoping
 * @param {string} opts.conversationId - Conversation ID for persisting compactedAt and plan state
 * @param {Function} opts.onStatus - Status update callback
 * @param {Function} opts.onToken - Streamed text delta callback
 * @param {Function} opts.onToolStatus - Tool status callback
 * @param {Function} opts.onSkillActive - Skill activation callback
 * @param {Function} opts.onPhase - Phase transition callback
 * @param {Function} opts.onDocumentReady - Document ready callback
 * @param {Function} opts.onPlanUpdate - Plan update callback
 */
export async function runAgent({ problemText, history, userId, conversationId, onStatus, onToken, onToolStatus, onSkillActive, onPhase, onDocumentReady, onPlanUpdate }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AgentError("No API key found. Add ANTHROPIC_API_KEY to .env.", 'ANTHROPIC_API_KEY not set');
  }

  await onPhase?.('understand');
  await onStatus('🔍 Analysing request...');

  // Delegate to LangGraph state machine — the graph's preflight node handles
  // gate classification, intent classification, and skill matching.
  const graph = buildGraph(
    { onStatus, onToken, onToolStatus, onSkillActive, onPhase, onDocumentReady, onPlanUpdate },
    BASE_SYSTEM_PROMPT
  );

  let result;
  try {
    result = await graph.invoke({
      problemText,
      messages: [...history],
      conversationId,
      userId,
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) throw friendlyError(err);
    throw new AgentError(`Something went wrong: ${err.message}`, err.message);
  }

  const { fullText = '', skillIds = [], clientSlug = null } = result;

  const escalationPhrases = ['escalate', 'sa escalation required', 'human sa', 'cannot determine', 'insufficient information', 'need more context from sa'];
  const shouldEscalate = escalationPhrases.some(p => fullText.toLowerCase().includes(p));

  // Fire-and-forget: update client persona in the background
  if (clientSlug) {
    updateClientPersona(clientSlug, problemText, fullText).catch(err =>
      console.warn('[orchestrator] Client persona update error:', err.message)
    );
  }

  return { text: fullText, skillsUsed: skillIds, shouldEscalate };
}

// ─── Escalation Summary ───────────────────────────────────────────────────────

export async function buildEscalationSummary({ problemText, history, agentResponse }) {
  try {
    return await runSubAgent({
      systemPrompt: 'Summarise this PS escalation for the SA team in under 400 words. Include: problem statement, what was researched, why SA is needed, suggested next steps. Be concise and factual.',
      userContent: `Problem: ${problemText}\nAgent response: ${agentResponse}\nTurns: ${history.length}`,
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 1024,
      operation: 'escalation-summary',
    });
  } catch {
    return `**Escalation**\n\n**Problem:** ${problemText}\n\n**Agent Assessment:** ${agentResponse}`;
  }
}
