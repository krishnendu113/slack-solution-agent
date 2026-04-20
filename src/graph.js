/**
 * graph.js — LangGraph state machine for the Solution Agent agentic loop.
 *
 * Nodes: classify → loadSkills → research (loop) → synthesise → validate → END
 * SSE callbacks are passed via closures at graph construction time.
 * LangSmith tracing wraps each node with traceable() when LANGCHAIN_TRACING_V2=true.
 */

import { StateGraph, END } from '@langchain/langgraph';
import { traceable } from 'langsmith/traceable';
import Anthropic from '@anthropic-ai/sdk';
import { loadSkillsForProblem, listSkills } from './skillLoader.js';
import { getTools } from './tools/index.js';
import { runSubAgent } from './subAgent.js';
import { getClientContext, updateClientPersona } from './clientPersona.js';

const MAX_TURNS = 15;

// ─── LangSmith tracing guard ──────────────────────────────────────────────────

function maybeTraceable(name, fn) {
  if (process.env.LANGCHAIN_TRACING_V2 !== 'true') return fn;
  try {
    return traceable(fn, { name, run_type: 'chain' });
  } catch {
    return fn;
  }
}

// ─── Anthropic client ────────────────────────────────────────────────────────

let _client = null;
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

// ─── Shared prompts (imported from orchestrator patterns) ─────────────────────

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
missingInfo: list ONLY facts that would materially change the feasibility verdict.`;

const SKILL_SELECT_SYSTEM_PROMPT = `You are a skill selector for the Capillary CS Solution Agent.
Your job: given a user's problem, decide which specialist skills (if any) are needed.
Only recommend a skill when the user is clearly asking for that type of deliverable.

Available skills:
{{SKILL_LIST}}

Return JSON only — no prose, no markdown fences:
[{ "id": "skill-id", "reason": "one sentence why this skill fits the request" }]

Return [] if no specialist skills are needed.`;

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
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.error) return { text: parsed.error };
    switch (name) {
      case 'get_jira_ticket': return { text: `"${parsed.summary}" (${parsed.status}, ${parsed.priority})`, url: parsed.url };
      case 'search_jira': return Array.isArray(parsed) ? { text: `Found ${parsed.length} ticket(s)`, links: parsed.map(t => ({ label: t.id, url: t.url })) } : { text: 'Done' };
      case 'search_confluence': return Array.isArray(parsed) ? { text: `Found ${parsed.length} page(s)`, links: parsed.map(p => ({ label: (p.title || '').slice(0, 40) || p.id, url: p.url })) } : { text: 'Done' };
      case 'get_confluence_page': return { text: `"${parsed.title || 'Untitled'}"`, url: parsed.url };
      case 'search_kapa_docs': return Array.isArray(parsed) ? { text: `Found ${parsed.length} doc(s)`, links: parsed.map(d => ({ label: (d.title || '').slice(0, 40), url: d.url })) } : { text: 'Done' };
      case 'search_docs_site': return Array.isArray(parsed) ? { text: `Found ${parsed.length} page(s)`, links: parsed.map(d => ({ label: (d.title || '').slice(0, 40), url: d.url })) } : { text: 'Done' };
      case 'list_skills': return { text: `${Array.isArray(parsed) ? parsed.length : '?'} skill(s) available` };
      default: return { text: 'Done' };
    }
  } catch { return { text: 'Done' }; }
}

async function summariseToolResult(toolName, rawResult, problemContext = '') {
  const SUMMARISE_SYSTEM_PROMPT = `You are a tool result summariser for a Capillary CS Solution Agent.
Given a raw tool result, produce a 2-sentence relevance summary and the primary URL.
Return JSON only: { "summary": "...", "url": "https://..." }
If no URL is present, set url to null. Keep summary under 150 words.`;
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
  } catch {
    return rawResult;
  }
}

// ─── Graph factory ────────────────────────────────────────────────────────────

/**
 * Builds and compiles the LangGraph state machine.
 * SSE callbacks are captured as closures so nodes can stream events.
 *
 * @param {object} callbacks - { onStatus, onToken, onToolStatus, onSkillActive, onPhase }
 * @param {string} baseSystemPrompt - The BASE_SYSTEM_PROMPT string from orchestrator
 * @returns CompiledStateGraph
 */
export function buildGraph(callbacks, baseSystemPrompt) {
  const { onStatus, onToken, onToolStatus, onSkillActive, onPhase } = callbacks;

  // ── Node: classify ─────────────────────────────────────────────────────────
  // If classification was pre-computed by the orchestrator adapter, skip the Haiku call.
  const classifyNode = maybeTraceable('classify', async (state) => {
    const [semanticMatches, { context: clientContext, slug: clientSlug }] = await Promise.all([
      (async () => {
        try {
          const skills = listSkills().filter(s => !s.alwaysLoad);
          if (!skills.length) return [];
          const skillList = skills.map(s => `- ${s.id}: ${s.description}`).join('\n');
          const raw = await runSubAgent({
            systemPrompt: SKILL_SELECT_SYSTEM_PROMPT.replace('{{SKILL_LIST}}', skillList),
            userContent: state.problemText,
          });
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed : [];
        } catch { return null; }
      })(),
      getClientContext(state.problemText),
    ]);

    const classification = state.classification || { type: 'general_query', confidence: 0.8, missingInfo: [] };
    console.log(`[graph:classify] type=${classification.type} confidence=${classification.confidence}`);
    return { classification, semanticMatches, clientContext, clientSlug };
  });

  // ── Node: loadSkills ───────────────────────────────────────────────────────
  const loadSkillsNode = maybeTraceable('loadSkills', async (state) => {
    const { skillIds, prompt: skillPrompt, matched } = await loadSkillsForProblem(
      state.problemText, state.semanticMatches
    );

    if (skillIds.length) {
      await onStatus(`🧩 Loading skills: ${skillIds.join(', ')}...`);
      if (onSkillActive) {
        for (const skill of matched) {
          await onSkillActive({ id: skill.id, description: skill.description, triggers: skill.matchedTriggers || [], alwaysOn: skill.alwaysActive || false, reason: skill.matchReason || null });
        }
      }
    }

    const classificationContext = `\n\n---\n## Request Context (pre-classified)\nType: ${state.classification.type} | Confidence: ${Math.round(state.classification.confidence * 100)}%`;
    const systemPrompt = (state.clientContext ? state.clientContext + '\n\n' : '') + baseSystemPrompt + classificationContext + skillPrompt;

    return { skillIds, skillPrompt, systemPrompt };
  });

  // ── Node: research (one tool-use turn) ────────────────────────────────────
  const researchNode = maybeTraceable('research', async (state) => {
    const anthropic = getClient();
    const { definitions: tools, handle } = getTools();
    const maxTokens = parseInt(process.env.MAX_AGENT_TOKENS || '8000', 10);

    if (state.hasUsedTools && !state.synthesiseEmitted) {
      await onPhase?.('synthesise');
      await onStatus('✍️ Synthesising...');
    } else {
      await onStatus(state.turnCount === 0 ? '🤖 Thinking...' : '🔄 Processing tool results...');
    }

    const contentBlocks = [];
    let currentBlock = null;
    let stopReason = null;
    let deltaText = '';

    console.log(`[graph:research] Turn ${state.turnCount + 1}, ${tools.length} tools, ${state.messages.length} messages`);

    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system: state.systemPrompt,
      messages: state.messages,
      tools,
      stream: true,
    });

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
          deltaText += event.delta.text;
          if (onToken) await onToken(event.delta.text);
        } else if (event.delta?.type === 'input_json_delta' && currentBlock?.type === 'tool_use') {
          currentBlock._inputJson += event.delta.partial_json;
        }
      } else if (event.type === 'content_block_stop') {
        if (currentBlock?.type === 'tool_use') {
          let input = {};
          try { input = JSON.parse(currentBlock._inputJson || '{}'); } catch {}
          contentBlocks.push({ type: 'tool_use', id: currentBlock.id, name: currentBlock.name, input, _toolId: currentBlock._toolId });
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

    const cleanBlocks = contentBlocks
      .filter(b => stopReason !== 'tool_use' || b.type !== 'text')
      .map(b => b.type === 'tool_use'
        ? { type: 'tool_use', id: b.id, name: b.name, input: b.input }
        : b);

    const newMessages = [...state.messages, { role: 'assistant', content: cleanBlocks }];
    const fullText = state.fullText + deltaText;

    if (stopReason !== 'tool_use') {
      return { messages: newMessages, fullText, stopReason, turnCount: state.turnCount + 1, hasUsedTools: state.hasUsedTools, synthesiseEmitted: state.synthesiseEmitted, researchEmitted: state.researchEmitted };
    }

    // Execute tools
    if (!state.researchEmitted) await onPhase?.('research');

    const rawResults = [];
    for (const block of contentBlocks) {
      if (block.type !== 'tool_use') continue;
      try {
        const result = await handle(block.name, block.input);
        rawResults.push({ block, result, err: null });
      } catch (err) {
        rawResults.push({ block, result: null, err });
      }
    }

    const summarised = await Promise.all(
      rawResults.map(({ block, result, err }) => {
        if (err || !result || result.length <= 500) return Promise.resolve(result);
        return summariseToolResult(block.name, result, state.problemText);
      })
    );

    const toolResults = [];
    for (let i = 0; i < rawResults.length; i++) {
      const { block, err } = rawResults[i];
      const content = err ? JSON.stringify({ error: err.message, partial: true }) : summarised[i];
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content });

      if (block.name === 'activate_skill' && onSkillActive) {
        const skillInfo = listSkills().find(s => s.id === block.input.skill_id);
        await onSkillActive({ id: block.input.skill_id, description: skillInfo?.description || '', triggers: [], alwaysOn: false });
      }

      if (err) {
        if (onToolStatus) await onToolStatus({ id: block._toolId, name: block.name, inputSummary: inputSummary(block.name, block.input), status: 'error', text: err.message });
      } else {
        const rs = resultSummary(block.name, content);
        if (onToolStatus) await onToolStatus({ id: block._toolId, name: block.name, inputSummary: inputSummary(block.name, block.input), status: 'done', ...rs });
      }
    }

    const finalMessages = [...newMessages, { role: 'user', content: toolResults }];
    return {
      messages: finalMessages,
      fullText,
      stopReason,
      turnCount: state.turnCount + 1,
      hasUsedTools: true,
      researchEmitted: true,
      synthesiseEmitted: state.synthesiseEmitted,
    };
  });

  // ── Node: validate (post-synthesis) ───────────────────────────────────────
  const validateNode = maybeTraceable('validate', async (state) => {
    let { fullText } = state;
    if (!fullText) return {};

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

    return { fullText };
  });

  // ── Graph wiring ───────────────────────────────────────────────────────────

  const graph = new StateGraph({
    channels: {
      problemText: { value: (_, n) => n ?? '', default: () => '' },
      messages: { value: (_, n) => n ?? [], default: () => [] },
      classification: { value: (_, n) => n ?? null, default: () => null },
      semanticMatches: { value: (_, n) => n ?? null, default: () => null },
      clientContext: { value: (_, n) => n ?? '', default: () => '' },
      clientSlug: { value: (_, n) => n ?? null, default: () => null },
      skillIds: { value: (_, n) => n ?? [], default: () => [] },
      skillPrompt: { value: (_, n) => n ?? '', default: () => '' },
      systemPrompt: { value: (_, n) => n ?? '', default: () => '' },
      turnCount: { value: (_, n) => n ?? 0, default: () => 0 },
      fullText: { value: (_, n) => n ?? '', default: () => '' },
      stopReason: { value: (_, n) => n ?? null, default: () => null },
      hasUsedTools: { value: (_, n) => n ?? false, default: () => false },
      researchEmitted: { value: (_, n) => n ?? false, default: () => false },
      synthesiseEmitted: { value: (_, n) => n ?? false, default: () => false },
    },
  });

  graph.addNode('classify', classifyNode);
  graph.addNode('loadSkills', loadSkillsNode);
  graph.addNode('research', researchNode);
  graph.addNode('validate', validateNode);

  graph.addEdge('__start__', 'classify');
  graph.addEdge('classify', 'loadSkills');
  graph.addEdge('loadSkills', 'research');

  graph.addConditionalEdges('research', (state) => {
    if (state.stopReason === 'tool_use' && state.turnCount < MAX_TURNS) return 'research';
    return 'validate';
  });

  graph.addEdge('validate', '__end__');

  return graph.compile();
}
