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
 */

import Anthropic from '@anthropic-ai/sdk';
import { runSubAgent } from './subAgent.js';
import { updateClientPersona } from './clientPersona.js';
import { buildGraph } from './graph.js';

// ─── SDK Client ───────────────────────────────────────────────────────────────

let _client = null;
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

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
  if (msg.includes('credit balance is too low')) return new AgentError("The AI's piggy bank is empty. Top up at console.anthropic.com.", msg);
  if (msg.includes('invalid x-api-key') || status === 401) return new AgentError("API key didn't pass the bouncer. Check ANTHROPIC_API_KEY in .env.", msg);
  if (msg.includes('overloaded') || status === 529) return new AgentError("Claude is juggling too many requests. Try again in a moment.", msg);
  if (status === 429) return new AgentError("Rate limit hit — wait a few seconds and retry.", msg);
  if (status >= 500) return new AgentError("Anthropic's servers are having a rough day. Try again shortly.", msg);
  if (msg.includes('context length') || msg.includes('too long')) return new AgentError("Conversation too long for Claude. Start a new chat.", msg);
  return new AgentError(`Something unexpected happened (${status || 'unknown'}). Check server logs.`, msg);
}

// ─── Sub-Agent: Request Classification ───────────────────────────────────────

const CLASSIFY_SYSTEM_PROMPT = `You are a CS request classifier for Capillary Technologies.
Classify the given request and return JSON only — no prose, no markdown fences.

Output schema:
{
  "type": "jira_ticket" | "cr" | "brd" | "issue" | "general_query",
  "confidence": 0.0-1.0,
  "missingInfo": ["string", ...]
}

type definitions:
- jira_ticket: user provided one or more Jira ticket IDs (e.g. PSV-123, LMP-456)
- cr: change request — client wants new or modified behaviour from Capillary
- brd: business requirements document or RFP evaluation
- issue: a bug, incident, or unexpected behaviour report
- general_query: a product knowledge question or capability lookup

confidence: how well-defined the request is (not how feasible it is)
- 0.8-1.0: clear, specific, actionable without further information
- 0.5-0.79: mostly clear but some context would help
- 0.0-0.49: too vague or ambiguous to assess without more information

missingInfo: list ONLY facts that would materially change the feasibility verdict.
Keep this list short — only include genuinely blocking gaps.
If the request is clear enough to proceed, return an empty array.`;

/**
 * Classifies the incoming CS request using Haiku.
 * Returns { type, confidence, missingInfo } — falls back to a permissive default on error.
 */
async function classifyRequest(problemText) {
  try {
    const raw = await runSubAgent({
      systemPrompt: CLASSIFY_SYSTEM_PROMPT,
      userContent: problemText,
    });
    const parsed = JSON.parse(raw);
    return {
      type: parsed.type || 'general_query',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
      missingInfo: Array.isArray(parsed.missingInfo) ? parsed.missingInfo : [],
    };
  } catch (err) {
    console.warn('[orchestrator] Classification failed, proceeding without it:', err.message);
    return { type: 'general_query', confidence: 0.8, missingInfo: [] };
  }
}

// ─── Base System Prompt ───────────────────────────────────────────────────────

const BASE_SYSTEM_PROMPT = `
You are the Capillary Solution Agent — a Solutions Architect assistant for the Capillary Technologies Customer Success (CS) team.

Your job is to evaluate client requirements, change requests (CRs), Jira tickets, and BRD extracts, then deliver a structured feasibility assessment that a CS engineer can act on without SA involvement.

---

## Required Output Format

Every response MUST contain these six sections in this exact order. Do not skip any section.

### ## Problem
Restate the requirement in 2–3 sentences in CS terms. Confirm what the client wants and the business context.

### ## Verdict
One word verdict on its own line, then 1–2 sentences of justification.

Allowed values (use exactly these words — no variations):
- **OOTB** — Capability exists today with no configuration or dev work required
- **Config** — Available but requires implementation team configuration (no custom code)
- **Custom** — Requires engineering: custom API, new workflow, or non-standard integration
- **Not Feasible** — Not achievable with current Capillary product or roadmap

### ## Approach
Step-by-step implementation guidance. Be specific: name the Capillary module, the configuration screen or API endpoint, the sequence of steps. Audience is CS engineers and SAs who need actionable instructions.

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
- Do NOT ask for information you can look up with tools
- Do NOT omit the ## Verdict section
- Do NOT invent Confluence page titles, Jira ticket IDs, or URLs
- Do NOT use bare https:// links — always wrap in [Title](url)
- Do NOT narrate tool usage — use tools silently and present findings in the sections above
`.trim();

// ─── Main Agent Entry Point ───────────────────────────────────────────────────

export async function runAgent({ problemText, history, onStatus, onToken, onToolStatus, onSkillActive, onPhase }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AgentError("No API key found. Add ANTHROPIC_API_KEY to .env.", 'ANTHROPIC_API_KEY not set');
  }

  // Pre-flight clarification check — run classify in parallel with skill detection
  // before handing off to the graph, so vague requests get a question immediately.
  await onPhase?.('understand');
  await onStatus('🔍 Analysing request...');

  const classification = await classifyRequest(problemText);
  console.log(`[orchestrator] Classification: type=${classification.type} confidence=${classification.confidence} missing=${classification.missingInfo.length}`);

  if (classification.missingInfo.length > 0 && classification.confidence < 0.5) {
    const question = [
      'To give you an accurate feasibility assessment, I need a few more details:',
      '',
      ...classification.missingInfo.map(q => `- ${q}`),
    ].join('\n');
    await onStatus('❓ Need clarification...');
    if (onToken) await onToken(question);
    return { text: question, skillsUsed: [], shouldEscalate: false };
  }

  // Delegate to LangGraph state machine
  const graph = buildGraph(
    { onStatus, onToken, onToolStatus, onSkillActive, onPhase },
    BASE_SYSTEM_PROMPT
  );

  let result;
  try {
    result = await graph.invoke({
      problemText,
      messages: [...history],
      classification,
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
    const anthropic = getClient();
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `Summarise this CS escalation for the SA team in under 400 words. Include: problem statement, what was researched, why SA is needed, suggested next steps.\n\nProblem: ${problemText}\nAgent response: ${agentResponse}\nTurns: ${history.length}`,
      }],
    });
    return response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  } catch {
    return `**Escalation**\n\n**Problem:** ${problemText}\n\n**Agent Assessment:** ${agentResponse}`;
  }
}
