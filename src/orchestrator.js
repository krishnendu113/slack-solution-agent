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
import { loadSkillsForProblem, listSkills } from './skillLoader.js';
import { getTools } from './tools/index.js';
import { runSubAgent } from './subAgent.js';
import { getClientContext, updateClientPersona } from './clientPersona.js';

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

// ─── Tool UI Helpers ──────────────────────────────────────────────────────────

function inputSummary(name, input) {
  switch (name) {
    case 'get_jira_ticket': return input.ticket_id || '';
    case 'search_jira': return `"${input.query || ''}"`;
    case 'search_confluence': return `"${input.query || ''}"`;
    case 'get_confluence_page': return `page ${input.page_id || ''}`;
    case 'search_kapa_docs': return `"${input.query || ''}"`;
    case 'search_docs_site': return `"${input.query || ''}"`;
    case 'activate_skill': return input.skill_id || '';
    case 'list_skills': return '';
    default: return name;
  }
}

function resultSummary(name, result) {
  try {
    if (typeof result === 'string' && (
      result.startsWith('Error:') || result.startsWith('Jira') ||
      result.startsWith('Confluence') || result.startsWith('Failed') ||
      result.startsWith('Unknown')
    )) return { text: result };

    if (name === 'activate_skill') return { text: 'Skill loaded' };

    const parsed = JSON.parse(result);

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.error) {
      return { text: parsed.error };
    }

    switch (name) {
      case 'get_jira_ticket':
        return { text: `"${parsed.summary}" (${parsed.status}, ${parsed.priority})`, url: parsed.url };
      case 'search_jira':
        return Array.isArray(parsed)
          ? { text: `Found ${parsed.length} ticket(s)`, links: parsed.map(t => ({ label: t.id, url: t.url })) }
          : { text: 'Done' };
      case 'search_confluence':
        return Array.isArray(parsed)
          ? { text: `Found ${parsed.length} page(s)`, links: parsed.map(p => ({ label: (p.title || '').slice(0, 40) || p.id, url: p.url })) }
          : { text: 'Done' };
      case 'get_confluence_page':
        return { text: `"${parsed.title || 'Untitled'}"`, url: parsed.url };
      case 'search_kapa_docs':
        return Array.isArray(parsed)
          ? { text: `Found ${parsed.length} doc(s)`, links: parsed.map(d => ({ label: (d.title || '').slice(0, 40), url: d.url })) }
          : { text: 'Done' };
      case 'search_docs_site':
        return Array.isArray(parsed)
          ? { text: `Found ${parsed.length} page(s)`, links: parsed.map(d => ({ label: (d.title || '').slice(0, 40), url: d.url })) }
          : { text: 'Done' };
      case 'list_skills':
        return { text: `${Array.isArray(parsed) ? parsed.length : '?'} skill(s) available` };
      default:
        return { text: 'Done' };
    }
  } catch {
    return { text: 'Done' };
  }
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

// ─── Sub-Agent: Tool Result Summarisation ─────────────────────────────────────

const SUMMARISE_SYSTEM_PROMPT = `You are a tool result summariser for a Capillary CS Solution Agent.
Given a raw tool result (JSON from Jira, Confluence, or docs search), produce:
1. A 2-sentence relevance summary — what this result means for the CS request
2. The primary URL from the result (the most relevant link)

Return JSON only — no prose, no markdown fences:
{ "summary": "...", "url": "https://..." }

If no URL is present in the result, set url to null.
Keep the summary concise and actionable (under 150 words total).`;

/**
 * Summarises a large tool result to reduce tokens sent to Sonnet.
 * Returns the summary string on success, or the original result on failure.
 */
async function summariseToolResult(toolName, rawResult, problemContext = '') {
  try {
    const raw = await runSubAgent({
      systemPrompt: SUMMARISE_SYSTEM_PROMPT,
      userContent: [
        problemContext ? `Agent is researching: "${problemContext.slice(0, 250)}"\n\n` : '',
        `Tool: ${toolName}\n\nResult:\n${rawResult.slice(0, 4000)}`,
      ].join(''),
    });
    const parsed = JSON.parse(raw);
    const url = parsed.url ? `\n\nSource: ${parsed.url}` : '';
    return `${parsed.summary}${url}`;
  } catch (err) {
    console.warn(`[orchestrator] Summarisation failed for ${toolName}:`, err.message);
    return rawResult; // fall back to raw result
  }
}

// ─── Sub-Agent: Semantic Skill Detection ─────────────────────────────────────

const SKILL_SELECT_SYSTEM_PROMPT = `You are a skill selector for the Capillary CS Solution Agent.

Your job: given a user's problem, decide which specialist skills (if any) are needed.
Only recommend a skill when the user is clearly asking for that type of deliverable.

Available skills:
{{SKILL_LIST}}

Return JSON only — no prose, no markdown fences:
[{ "id": "skill-id", "reason": "one sentence why this skill fits the request" }]

Return [] if no specialist skills are needed. Most feasibility questions do not need one.`;

/**
 * Semantically selects relevant skills using Haiku.
 * Returns [{id, reason}] on success, [] if none needed, null on failure (triggers keyword fallback).
 */
async function detectSkillsSemantic(problemText) {
  try {
    const skills = listSkills().filter(s => !s.alwaysLoad);
    if (!skills.length) return [];

    const skillList = skills.map(s => `- ${s.id}: ${s.description}`).join('\n');
    const raw = await runSubAgent({
      systemPrompt: SKILL_SELECT_SYSTEM_PROMPT.replace('{{SKILL_LIST}}', skillList),
      userContent: problemText,
    });

    const parsed = JSON.parse(raw);
    const result = Array.isArray(parsed) ? parsed : [];
    console.log(`[orchestrator] Semantic skill detection → [${result.map(r => r.id).join(', ') || 'none'}]`);
    return result;
  } catch (err) {
    console.warn('[orchestrator] Semantic skill detection failed, falling back to keyword matching:', err.message);
    return null;
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

  const anthropic = getClient();

  // ── Phase: Understand ──────────────────────────────────────────────────────
  await onPhase?.('understand');
  await onStatus('🔍 Analysing request...');

  // H1: Run classification, semantic skill detection, and client persona in parallel (all Haiku calls)
  const [classification, semanticMatches, { context: clientContext, slug: clientSlug }] = await Promise.all([
    classifyRequest(problemText),
    detectSkillsSemantic(problemText),
    getClientContext(problemText),
  ]);
  console.log(`[orchestrator] Classification: type=${classification.type} confidence=${classification.confidence} missing=${classification.missingInfo.length}`);

  // If the request is too vague AND has blocking gaps, ask for clarification immediately
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

  // Step 1: Load skills (always-on + semantic/keyword-matched)
  // semanticMatches: [{id,reason}] = semantic hit, [] = none needed, null = fallback to keywords
  const { skillIds, prompt: skillPrompt, matched } = await loadSkillsForProblem(problemText, semanticMatches);
  if (skillIds.length) {
    await onStatus(`🧩 Loading skills: ${skillIds.join(', ')}...`);
    if (onSkillActive) {
      for (const skill of matched) {
        await onSkillActive({
          id: skill.id,
          description: skill.description,
          triggers: skill.matchedTriggers || [],
          alwaysOn: skill.alwaysActive || false,
          reason: skill.matchReason || null,
        });
      }
    }
  }

  // Step 2: Assemble system prompt with classification context and optional client persona
  const classificationContext = `\n\n---\n## Request Context (pre-classified)\nType: ${classification.type} | Confidence: ${Math.round(classification.confidence * 100)}%`;
  const systemPrompt = (clientContext ? clientContext + '\n\n' : '') + BASE_SYSTEM_PROMPT + classificationContext + skillPrompt;

  // Step 3: Build tools from registry
  const { definitions: tools, handle } = getTools();

  const maxTokens = parseInt(process.env.MAX_AGENT_TOKENS || '8000', 10);

  // Step 4: Agentic loop — up to 15 turns
  const messages = [...history];
  let fullText = '';
  const MAX_TURNS = 15;
  let researchEmitted = false;
  let synthesiseEmitted = false;
  let hasUsedTools = false;

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      // Emit synthesise phase when entering a turn that follows tool usage —
      // this is the turn where Sonnet writes the structured output.
      if (hasUsedTools && !synthesiseEmitted) {
        await onPhase?.('synthesise');
        synthesiseEmitted = true;
        await onStatus('✍️ Synthesising...');
      } else {
        await onStatus(turn === 0 ? '🤖 Thinking...' : '🔄 Processing tool results...');
      }

      const params = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages,
        tools,
        stream: true,
      };

      const contentBlocks = [];
      let currentBlock = null;
      let stopReason = null;

      console.log(`[orchestrator] Turn ${turn + 1}, ${tools.length} tools, ${messages.length} messages`);

      const stream = anthropic.messages.stream(params);

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          currentBlock = { ...event.content_block, _text: '', _inputJson: '' };
          if (currentBlock.type === 'tool_use' && onToolStatus) {
            const toolId = `${currentBlock.name}-${currentBlock.id}`;
            currentBlock._toolId = toolId;
            await onToolStatus({ id: toolId, name: currentBlock.name, inputSummary: '', status: 'running' });
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta?.type === 'text_delta' && currentBlock?.type === 'text') {
            currentBlock._text += event.delta.text;
            fullText += event.delta.text;
            if (onToken) await onToken(event.delta.text);
          } else if (event.delta?.type === 'input_json_delta' && currentBlock?.type === 'tool_use') {
            currentBlock._inputJson += event.delta.partial_json;
          }
        } else if (event.type === 'content_block_stop') {
          if (currentBlock?.type === 'tool_use') {
            let input = {};
            try { input = JSON.parse(currentBlock._inputJson || '{}'); } catch {}
            contentBlocks.push({
              type: 'tool_use',
              id: currentBlock.id,
              name: currentBlock.name,
              input,
              _toolId: currentBlock._toolId,
            });
            if (onToolStatus) {
              const summary = inputSummary(currentBlock.name, input);
              await onToolStatus({ id: currentBlock._toolId, name: currentBlock.name, inputSummary: summary, status: 'running' });
            }
          } else if (currentBlock?.type === 'text') {
            contentBlocks.push({ type: 'text', text: currentBlock._text });
          }
          currentBlock = null;
        } else if (event.type === 'message_delta') {
          stopReason = event.delta?.stop_reason;
        }
      }

      // Strip internal metadata before sending back to the API.
      // For tool-calling turns, also strip text blocks — the model's narration ("I'll search for...")
      // is included in context for the next turn, causing it to repeat all prior narration verbatim.
      // Keeping only tool_use blocks breaks the snowball: each turn starts fresh.
      const cleanBlocks = contentBlocks
        .filter(b => stopReason !== 'tool_use' || b.type !== 'text')
        .map(b => b.type === 'tool_use'
          ? { type: 'tool_use', id: b.id, name: b.name, input: b.input }
          : b);
      messages.push({ role: 'assistant', content: cleanBlocks });

      if (stopReason === 'tool_use') {
        // ── Phase: Research (emit once on first tool turn) ─────────────────
        if (!researchEmitted) {
          await onPhase?.('research');
          researchEmitted = true;
        }
        hasUsedTools = true;

        // G2 Stage 1: Execute all tools sequentially (fast I/O, avoids rate-limit burst)
        const rawResults = [];
        for (const block of contentBlocks) {
          if (block.type !== 'tool_use') continue;
          try {
            const result = await handle(block.name, block.input);
            console.log(`[orchestrator] Tool ${block.name} → ${result.length} chars`);
            rawResults.push({ block, result, err: null });
          } catch (err) {
            console.error(`[orchestrator] Tool ${block.name} threw:`, err.message);
            rawResults.push({ block, result: null, err });
          }
        }

        // G2 Stage 2: Parallel summarisation of large results with problem context
        const summarised = await Promise.all(
          rawResults.map(({ block, result, err }) => {
            if (err || !result || result.length <= 500) return Promise.resolve(result);
            console.log(`[orchestrator] Summarising ${block.name} (${result.length} chars)`);
            return summariseToolResult(block.name, result, problemText);
          })
        );

        // G2 Stage 3: Assemble tool_result messages, emit status, handle skill activation
        const toolResults = [];
        for (let i = 0; i < rawResults.length; i++) {
          const { block, err } = rawResults[i];
          const content = err
            ? JSON.stringify({ error: err.message, partial: true })
            : summarised[i];

          if (!err && rawResults[i].result?.length > 500) {
            console.log(`[orchestrator] Summary (${block.name}) → ${content.length} chars`);
          }

          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content });

          // G3B: Emit skill activation event with trigger info
          if (block.name === 'activate_skill' && onSkillActive) {
            const skillInfo = listSkills().find(s => s.id === block.input.skill_id);
            await onSkillActive({
              id: block.input.skill_id,
              description: skillInfo?.description || '',
              triggers: [],
              alwaysOn: false,
            });
          }

          if (err) {
            if (onToolStatus) {
              await onToolStatus({
                id: block._toolId,
                name: block.name,
                inputSummary: inputSummary(block.name, block.input),
                status: 'error',
                text: err.message,
              });
            }
          } else {
            const rs = resultSummary(block.name, content);
            if (onToolStatus) {
              await onToolStatus({
                id: block._toolId,
                name: block.name,
                inputSummary: inputSummary(block.name, block.input),
                status: 'done',
                ...rs,
              });
            }
          }
        }
        messages.push({ role: 'user', content: toolResults });
        continue;
      }

      break; // end_turn or max_tokens
    }
  } catch (err) {
    if (err instanceof Anthropic.APIError) throw friendlyError(err);
    throw new AgentError(`Something went wrong: ${err.message}`, err.message);
  }

  // E3: Post-synthesis validation — append structured notes for missing required elements
  if (fullText) {
    const hasLink = /https?:\/\/\S+/.test(fullText);
    const hasVerdict = /\b(OOTB|Config|Custom|Not Feasible)\b/i.test(fullText);
    const notes = [];
    if (!hasVerdict) notes.push('> **Note:** A formal verdict (OOTB / Config / Custom / Not Feasible) could not be determined from the available information. Manual SA review is recommended.');
    if (!hasLink) notes.push('> **Note:** No precedent references were found. This analysis is based on product knowledge only — citations have not been verified against live sources.');
    if (notes.length) {
      const noteText = '\n\n' + notes.join('\n\n');
      fullText += noteText;
      if (onToken) await onToken(noteText);
    }
  }

  const escalationPhrases = ['escalate', 'sa escalation required', 'human sa', 'cannot determine', 'insufficient information', 'need more context from sa'];
  const shouldEscalate = escalationPhrases.some(p => fullText.toLowerCase().includes(p));

  // Fire-and-forget: update client persona in the background (do not await)
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
