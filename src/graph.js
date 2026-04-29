/**
 * graph.js — LangGraph state machine for the Solution Agent agentic loop.
 *
 * Nodes: preflight → loadSkills → research (loop) → synthesise → validate → END
 * SSE callbacks are passed via closures at graph construction time.
 * LangSmith tracing wraps each node with traceable() when LANGCHAIN_TRACING_V2=true.
 */

import { StateGraph, END } from '@langchain/langgraph';
import { traceable } from 'langsmith/traceable';
import Anthropic from '@anthropic-ai/sdk';
import { loadSkillsForProblem, loadSkillFiles, listSkills, getSkillCatalogue } from './skillLoader.js';
import { getToolsByIntent } from './tools/index.js';
import { runSubAgent } from './subAgent.js';
import { dispatchResearch, assembleResearchContext } from './researchAgents.js';
import { getClientContext, updateClientPersona } from './clientPersona.js';
import { storeDocument } from './documentStore.js';
import { runPreflight } from './preflight.js';
import { compactIfNeeded as compactMessages, estimateTokens } from './compaction.js';
import { getAllPlans } from './planManager.js';
import { getConversationStore } from './stores/index.js';

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

// Pre-load wrapSDK if tracing is enabled
const _wrapSDKPromise = process.env.LANGCHAIN_TRACING_V2 === 'true'
  ? import('langsmith/wrappers').then(m => m.wrapSDK).catch(() => null)
  : Promise.resolve(null);

async function getClientAsync() {
  if (!_client) {
    const raw = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const wrapSDK = await _wrapSDKPromise;
    _client = wrapSDK ? wrapSDK(raw) : raw;
  }
  return _client;
}

// Sync getter for backward compat — falls back to unwrapped if async hasn't resolved
function getClient() {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

// ─── Shared prompts ───────────────────────────────────────────────────────────

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
    case 'create_plan': return input.title || '';
    case 'update_plan_step': return `step ${input.stepIndex ?? '?'} → ${input.status || '?'}`;
    case 'get_plan': return input.planId || '';
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
    if (name === 'create_plan' || name === 'update_plan_step' || name === 'get_plan') return { text: 'Plan updated' };
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
      operation: 'summarise',
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
 * @param {object} callbacks - { onStatus, onToken, onToolStatus, onSkillActive, onPhase, onDocumentReady, onPlanUpdate }
 * @param {string} baseSystemPrompt - The BASE_SYSTEM_PROMPT string from orchestrator
 * @returns CompiledStateGraph
 */
export function buildGraph(callbacks, baseSystemPrompt) {
  const { onStatus, onToken, onToolStatus, onSkillActive, onPhase, onDocumentReady, onPlanUpdate } = callbacks;


  // ── Node: preflight ────────────────────────────────────────────────────────
  // Replaces the old classifyNode. Runs gate + classification + tool tags + skill matching
  // in parallel with client context detection.
  const preflightNode = maybeTraceable('preflight', async (state) => {
    const [preflightResult, { context: clientContext, slug: clientSlug }] = await Promise.all([
      runPreflight(state.problemText),
      getClientContext(state.problemText),
    ]);

    const { classification, toolTags, onTopic, refusalMessage, skillIds, skillReasons } = preflightResult;

    // Map preflight skillIds/skillReasons to the semanticMatches format expected by loadSkillsForProblem
    const semanticMatches = skillIds.map(id => ({
      id,
      reason: skillReasons[id] || 'preflight match',
    }));

    console.log(`[graph:preflight] onTopic=${onTopic} type=${classification.type} confidence=${classification.confidence} tools=[${toolTags}] skills=[${skillIds}]`);

    return {
      classification,
      semanticMatches: semanticMatches.length > 0 ? semanticMatches : [],
      clientContext,
      clientSlug,
      toolTags,
      onTopic,
      refusalMessage: refusalMessage || '',
    };
  });

  // ── Node: loadSkills ───────────────────────────────────────────────────────
  const loadSkillsNode = maybeTraceable('loadSkills', async (state) => {
    const classificationType = state.classification?.type || null;
    const { skillIds, prompt: skillPrompt, matched, manifests } = await loadSkillsForProblem(
      state.problemText, state.semanticMatches, classificationType
    );

    if (skillIds.length) {
      await onStatus(`🧩 Loading skills: ${skillIds.join(', ')}...`);
      if (onSkillActive) {
        for (const skill of matched) {
          await onSkillActive({ id: skill.id, description: skill.description, triggers: skill.matchedTriggers || [], alwaysOn: skill.alwaysActive || false, reason: skill.matchReason || null });
        }
      }
    }

    // Log loaded skill IDs and reasons at [graph:skills] level
    if (skillIds.length) {
      for (const skill of matched) {
        console.log(`[graph:skills] Loaded skill: ${skill.id} reason=${skill.matchReason || skill.alwaysActive ? 'always-on' : 'keyword match'}`);
      }
    }

    // Inject skill catalogue into system prompt (always present)
    const skillCatalogue = getSkillCatalogue();

    const classificationContext = `\n\n---\n## Request Context (pre-classified)\nType: ${state.classification.type} | Confidence: ${Math.round(state.classification.confidence * 100)}%`;
    const catalogueBlock = `\n\n---\n${skillCatalogue}`;
    const systemPrompt = (state.clientContext ? state.clientContext + '\n\n' : '') + baseSystemPrompt + classificationContext + catalogueBlock + skillPrompt;

    return { skillIds, skillPrompt, systemPrompt, manifests: Object.fromEntries(manifests), skillCatalogue };
  });

  // ── Node: skillRouter ────────────────────────────────────────────────────
  const skillRouterNode = maybeTraceable('skillRouter', async (state) => {
    await onPhase?.('routing');

    const manifests = state.manifests || {};
    const skillIds = state.skillIds || [];

    // No skills loaded → single mode
    if (!skillIds.length) {
      return { executionMode: 'single', mergedManifest: null };
    }

    const allManifests = skillIds.map(id => manifests[id]).filter(Boolean);
    const hasMultiNode = allManifests.some(m => m.executionMode === 'multi-node');

    if (!hasMultiNode) {
      return { executionMode: 'single', mergedManifest: null };
    }

    // Merge researchPhase: union of all tool categories, deduplicated
    const researchPhaseSet = new Set();
    for (const m of allManifests) {
      if (m.executionMode === 'multi-node') {
        for (const tool of (m.researchPhase || [])) researchPhaseSet.add(tool);
      }
    }

    // Use the first multi-node skill's synthesisPhase and validation
    const primaryManifest = allManifests.find(m => m.executionMode === 'multi-node');

    const mergedManifest = {
      ...primaryManifest,
      researchPhase: [...researchPhaseSet],
    };

    return { executionMode: 'multi-node', mergedManifest };
  });

  // ── Helper: runResearchBranch ────────────────────────────────────────────
  const BRANCH_TOOLS = {
    jira:       ['search_jira', 'get_jira_ticket'],
    confluence: ['search_confluence', 'get_confluence_page'],
    kapa_docs:  ['search_kapa_docs'],
    web_search: ['search_docs_site'],
  };

  /**
   * Runs one research branch targeting a single tool category.
   * Never throws — returns partial results with error fields on failure.
   */
  async function runResearchBranch(source, problemText, handle, onToolStatusCb) {
    const tools = BRANCH_TOOLS[source];
    if (!tools) return { source, results: [], error: `Unknown source: ${source}` };

    const results = [];
    for (const toolName of tools) {
      const toolId = `${toolName}-branch-${source}`;
      try {
        await onToolStatusCb?.({ id: toolId, name: toolName, inputSummary: `"${problemText.slice(0, 60)}"`, status: 'running' });
        const raw = await handle(toolName, { query: problemText, max_results: 5 });
        const summary = raw && raw.length > 500
          ? await summariseToolResult(toolName, raw, problemText)
          : raw;
        await onToolStatusCb?.({ id: toolId, name: toolName, inputSummary: `"${problemText.slice(0, 60)}"`, status: 'done', text: 'Done' });
        results.push({ tool: toolName, content: summary });
      } catch (err) {
        await onToolStatusCb?.({ id: toolId, name: toolName, inputSummary: '', status: 'error', text: err.message });
        results.push({ tool: toolName, content: null, error: err.message });
      }
    }

    return { source, results };
  }

  // ── Node: researchFanOut ─────────────────────────────────────────────────
  const researchFanOutNode = maybeTraceable('researchFanOut', async (state) => {
    const { handle } = getToolsByIntent(state.toolTags, { userId: state.userId });
    const { mergedManifest, problemText } = state;
    const sources = mergedManifest?.researchPhase || [];

    await onStatus('🔍 Researching in parallel...');

    const branchResults = await Promise.all(
      sources.map(source => runResearchBranch(source, problemText, handle, onToolStatus))
    );

    // researchResults: Record<source, BranchResult>
    const researchResults = Object.fromEntries(
      branchResults.map(r => [r.source, r])
    );

    // If all branches failed, fall back to single-mode
    const allFailed = branchResults.length > 0 && branchResults.every(r =>
      r.error || (r.results.length > 0 && r.results.every(tr => tr.error))
    );

    if (allFailed) {
      console.warn('[graph:researchFanOut] All branches failed — falling back to single mode');
      return { researchResults, executionMode: 'single' };
    }

    await onPhase?.('synthesise');

    return { researchResults };
  });

  // ── Node: sectionWriter ──────────────────────────────────────────────────
  const sectionWriterNode = maybeTraceable('sectionWriter', async (state) => {
    const { mergedManifest, researchResults, problemText, skillIds, skillPrompt } = state;
    const sections = mergedManifest?.synthesisPhase || [];

    await onStatus(`✍️ Writing ${sections.length} sections...`);

    const fileMapping = mergedManifest?.fileMapping || {};
    const primarySkillId = skillIds[0] || 'unknown';

    const sectionResults = await Promise.all(
      sections.map(async (section) => {
        await onStatus(`✍️ Writing section: ${section.name} (${section.model})...`);

        // Load only the reference files this section needs (via fileMapping)
        // Falls back to full skillPrompt if no fileMapping entry exists
        let instructions;
        if (fileMapping[section.name]) {
          const sectionPrompt = await loadSkillFiles(primarySkillId, fileMapping[section.name]);
          instructions = extractSectionInstructions(sectionPrompt, section.name);
          console.log(`[sectionWriter] Section "${section.name}": loaded ${fileMapping[section.name].length} reference files via fileMapping`);
        } else {
          instructions = extractSectionInstructions(skillPrompt, section.name);
          console.log(`[sectionWriter] Section "${section.name}": no fileMapping entry, using full skill prompt`);
        }

        return writeSectionContent({
          section,
          problemText,
          researchResults,
          sectionInstructions: instructions,
          skillId: primarySkillId,
        });
      })
    );

    // Assemble in manifest order
    const assembledDoc = sectionResults
      .map(r => r.content)
      .join('\n\n');

    return { assembledDoc, sectionResults };
  });

  // ── Helper: writeSectionContent ──────────────────────────────────────────
  async function writeSectionContent({ section, problemText, researchResults, sectionInstructions, skillId }) {
    const MODEL_MAP = {
      haiku:  'claude-haiku-4-5-20251001',
      sonnet: 'claude-sonnet-4-20250514',
    };
    const model = MODEL_MAP[section.model] || MODEL_MAP.haiku;
    const maxTokens = section.maxTokens || (section.model === 'sonnet' ? 4096 : 1024);

    const relevantSources = section.researchSources || Object.keys(researchResults);
    const relevantResearch = relevantSources
      .filter(s => researchResults[s])
      .map(s => {
        const branch = researchResults[s];
        const content = branch.results
          .filter(r => r.content)
          .map(r => `[${r.tool}]\n${r.content}`)
          .join('\n\n');
        return content ? `### Research from ${s}:\n${content}` : null;
      })
      .filter(Boolean)
      .join('\n\n---\n\n');

    const systemPrompt = [
      `You are writing the "${section.name}" section of a ${skillId} document.`,
      `Follow these instructions precisely:`,
      '',
      sectionInstructions,
    ].join('\n');

    const userContent = [
      `## Problem / Request\n${problemText}`,
      relevantResearch ? `## Research Results\n${relevantResearch}` : '',
      `## Task\nWrite the "${section.name}" section now. Output only the section content — no preamble.`,
    ].filter(Boolean).join('\n\n');

    try {
      const content = await runSubAgent({
        systemPrompt,
        userContent,
        model,
        maxTokens,
        operation: `section:${section.name}`,
      });
      return { name: section.name, content };
    } catch (err) {
      console.error(`[sectionWriter] Section "${section.name}" failed: ${err.message}`);
      return {
        name: section.name,
        content: `\n\n> ⚠️ **Section "${section.name}" could not be generated.** Error: ${err.message}\n\n`,
        error: err.message,
      };
    }
  }

  // ── Helper: extractSectionInstructions ───────────────────────────────────
  function extractSectionInstructions(skillPrompt, sectionName) {
    const startMarker = `<!-- SECTION: ${sectionName} -->`;
    const endMarker = `<!-- END SECTION: ${sectionName} -->`;
    const start = skillPrompt.indexOf(startMarker);
    const end = skillPrompt.indexOf(endMarker);
    if (start === -1 || end === -1) return skillPrompt;
    return skillPrompt.slice(start + startMarker.length, end).trim();
  }

  // ── Node: compactIfNeeded ────────────────────────────────────────────────
  // Runs between research turns: after tool execution, before next Anthropic API call.
  // Checks estimated token count and compacts if above threshold.
  const compactIfNeededNode = maybeTraceable('compactIfNeeded', async (state) => {
    const beforeTokens = estimateTokens(state.messages);
    const { messages: compactedMessages, compacted } = await compactMessages(state.messages);

    if (compacted) {
      await onStatus('🗜️ Compacting context...');
      const afterTokens = estimateTokens(compactedMessages);
      console.log(`[graph:compaction] Compacted context: before=${Math.round(beforeTokens)} after=${Math.round(afterTokens)} tokens`);

      // Store compactedAt timestamp via the conversation store
      if (state.conversationId) {
        try {
          const store = getConversationStore();
          await store.setCompactedAt(state.conversationId);
        } catch (err) {
          console.warn(`[graph:compaction] Failed to set compactedAt: ${err.message}`);
        }
      }

      return { messages: compactedMessages, compacted: true };
    }

    return {};
  });

  // ── Node: parallelResearch ──────────────────────────────────────────────────
  const parallelResearchNode = maybeTraceable('parallelResearch', async (state) => {
    await onPhase?.('research');
    await onStatus('🔍 Researching in parallel...');

    try {
      const { summaries, allFailed } = await dispatchResearch({
        toolTags: state.toolTags,
        problemText: state.problemText,
        userId: state.userId,
        onToolStatus,
      });

      if (allFailed) {
        console.warn('[graph:research] All parallel agents failed — falling back to sequential research');
        await onStatus('⚠️ Some research sources unavailable, falling back...');
        return { researchSummaries: summaries, researchContext: '', fallbackToSequential: true, synthesisPath: false };
      }

      const researchContext = assembleResearchContext(summaries);

      // Emit partial results status
      const errorCount = summaries.filter(s => s.status === 'error').length;
      if (errorCount > 0) {
        await onStatus('⚠️ Some research sources unavailable, proceeding with available data');
      }

      await onPhase?.('synthesise');
      await onStatus('✍️ Synthesising...');

      return { researchSummaries: summaries, researchContext, fallbackToSequential: false, synthesisPath: true };
    } catch (err) {
      console.error('[graph:research] Dispatcher error — falling back to sequential:', err.message);
      return { researchContext: '', fallbackToSequential: true, synthesisPath: false };
    }
  });

  // ── Node: synthesise ──────────────────────────────────────────────────────
  const synthesiseNode = maybeTraceable('synthesise', async (state) => {
    const anthropic = await getClientAsync();
    const { definitions: tools, handle } = getToolsByIntent(state.toolTags, { userId: state.userId });
    const maxTokens = parseInt(process.env.MAX_AGENT_TOKENS || '8000', 10);

    // Inject research context into messages
    const researchMessage = state.researchContext
      ? { role: 'user', content: `[Research Results]\n\n${state.researchContext}\n\nNow synthesise a response based on the research above and the conversation context.` }
      : null;
    const messages = researchMessage
      ? [...state.messages, researchMessage]
      : state.messages;

    // Log selected tool names and intent tags
    console.log(`[graph:tools] Intent tags=[${(state.toolTags || []).join(', ')}] Selected tools=[${tools.map(t => t.name).join(', ')}]`);

    await onStatus(state.turnCount === 0 ? '✍️ Synthesising...' : '🔄 Processing tool results...');

    const contentBlocks = [];
    let currentBlock = null;
    let stopReason = null;
    let deltaText = '';
    const turnTokens = [];

    console.log(`[graph:synthesise] Turn ${state.turnCount + 1}, ${tools.length} tools, ${messages.length} messages`);

    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system: state.systemPrompt,
      messages,
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
          turnTokens.push(event.delta.text);
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

    // Emit buffered tokens only for synthesis turns (not tool-use turns)
    if (stopReason !== 'tool_use') {
      for (const tok of turnTokens) {
        if (onToken) await onToken(tok);
      }
    }

    const cleanBlocks = contentBlocks
      .filter(b => stopReason !== 'tool_use' || b.type !== 'text')
      .map(b => b.type === 'tool_use'
        ? { type: 'tool_use', id: b.id, name: b.name, input: b.input }
        : b);

    const newMessages = [...state.messages, { role: 'assistant', content: cleanBlocks }];
    const fullText = stopReason !== 'tool_use'
      ? state.fullText + deltaText
      : state.fullText;

    if (stopReason !== 'tool_use') {
      return { messages: newMessages, fullText, stopReason, turnCount: state.turnCount + 1 };
    }

    // Execute tools
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

      // Emit plan_update SSE event after create_plan or update_plan_step tool execution
      if ((block.name === 'create_plan' || block.name === 'update_plan_step') && !err) {
        try {
          const planResult = JSON.parse(content);
          if (planResult && !planResult.error && onPlanUpdate) {
            await onPlanUpdate(planResult);
          }
          // Persist plan state via the conversation store
          if (state.conversationId) {
            try {
              const store = getConversationStore();
              await store.savePlanState(state.conversationId, getAllPlans());
            } catch (persistErr) {
              console.warn(`[graph:plans] Failed to persist plan state: ${persistErr.message}`);
            }
          }
        } catch {
          // JSON parse failed — skip plan update
        }
      }

      if (err) {
        if (onToolStatus) await onToolStatus({ id: block._toolId, name: block.name, inputSummary: inputSummary(block.name, block.input), status: 'error', text: err.message });
      } else {
        const rs = resultSummary(block.name, content);
        if (onToolStatus) await onToolStatus({ id: block._toolId, name: block.name, inputSummary: inputSummary(block.name, block.input), status: 'done', ...rs });
      }
    }

    const finalMessages = [...newMessages, { role: 'user', content: toolResults }];

    // Update plans state channel
    const plans = getAllPlans();

    return {
      messages: finalMessages,
      fullText,
      stopReason,
      turnCount: state.turnCount + 1,
      plans,
    };
  });

  // ── Node: research (one tool-use turn) ────────────────────────────────────
  const researchNode = maybeTraceable('research', async (state) => {
    const anthropic = await getClientAsync();
    const { definitions: tools, handle } = getToolsByIntent(state.toolTags, { userId: state.userId });
    const maxTokens = parseInt(process.env.MAX_AGENT_TOKENS || '8000', 10);

    // Log selected tool names and intent tags
    console.log(`[graph:tools] Intent tags=[${(state.toolTags || []).join(', ')}] Selected tools=[${tools.map(t => t.name).join(', ')}]`);

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
    const turnTokens = [];

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
          turnTokens.push(event.delta.text);
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

    // Phase G: emit buffered tokens only for synthesis turns (not tool-use turns)
    if (stopReason !== 'tool_use') {
      for (const tok of turnTokens) {
        if (onToken) await onToken(tok);
      }
    }

    const cleanBlocks = contentBlocks
      .filter(b => stopReason !== 'tool_use' || b.type !== 'text')
      .map(b => b.type === 'tool_use'
        ? { type: 'tool_use', id: b.id, name: b.name, input: b.input }
        : b);

    const newMessages = [...state.messages, { role: 'assistant', content: cleanBlocks }];
    const fullText = stopReason !== 'tool_use'
      ? state.fullText + deltaText
      : state.fullText;

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

      // Emit plan_update SSE event after create_plan or update_plan_step tool execution
      if ((block.name === 'create_plan' || block.name === 'update_plan_step') && !err) {
        try {
          const planResult = JSON.parse(content);
          if (planResult && !planResult.error && onPlanUpdate) {
            await onPlanUpdate(planResult);
          }
          // Persist plan state via the conversation store
          if (state.conversationId) {
            try {
              const store = getConversationStore();
              await store.savePlanState(state.conversationId, getAllPlans());
            } catch (persistErr) {
              console.warn(`[graph:plans] Failed to persist plan state: ${persistErr.message}`);
            }
          }
        } catch {
          // JSON parse failed — skip plan update
        }
      }

      if (err) {
        if (onToolStatus) await onToolStatus({ id: block._toolId, name: block.name, inputSummary: inputSummary(block.name, block.input), status: 'error', text: err.message });
      } else {
        const rs = resultSummary(block.name, content);
        if (onToolStatus) await onToolStatus({ id: block._toolId, name: block.name, inputSummary: inputSummary(block.name, block.input), status: 'done', ...rs });
      }
    }

    const finalMessages = [...newMessages, { role: 'user', content: toolResults }];

    // Update plans state channel
    const plans = getAllPlans();

    return {
      messages: finalMessages,
      fullText,
      stopReason,
      turnCount: state.turnCount + 1,
      hasUsedTools: true,
      researchEmitted: true,
      synthesiseEmitted: state.synthesiseEmitted,
      plans,
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

  // ── Node: skillValidate (multi-node path) ───────────────────────────────
  const skillValidateNode = maybeTraceable('skillValidate', async (state) => {
    const { assembledDoc, mergedManifest, skillIds } = state;
    if (!assembledDoc || !mergedManifest) return {};

    const validation = mergedManifest.validation || {};
    const notes = [];

    // Check required headings
    for (const pattern of (validation.requiredHeadings || [])) {
      const re = new RegExp(pattern, 'm');
      if (!re.test(assembledDoc)) {
        notes.push(`> ⚠️ **Validation warning:** Required heading pattern \`${pattern}\` not found in output.`);
      }
    }

    // Check required patterns
    for (const pattern of (validation.requiredPatterns || [])) {
      const re = new RegExp(pattern);
      if (!re.test(assembledDoc)) {
        notes.push(`> ⚠️ **Validation warning:** Required pattern \`${pattern}\` not found in output.`);
      }
    }

    // Check required JSON fields
    if (validation.requiredJsonFields?.length) {
      try {
        const parsed = JSON.parse(assembledDoc);
        for (const field of validation.requiredJsonFields) {
          if (!(field in parsed)) {
            notes.push(`> ⚠️ **Validation warning:** Required JSON field \`${field}\` not found in output.`);
          }
        }
      } catch {
        notes.push(`> ⚠️ **Validation warning:** Output is not valid JSON (required for ${skillIds[0]}).`);
      }
    }

    const finalDoc = notes.length
      ? assembledDoc + '\n\n' + notes.join('\n\n')
      : assembledDoc;

    // Document delivery: downloadable vs inline
    if (mergedManifest.downloadable === true) {
      const filename = `${skillIds[0]}-${new Date().toISOString().slice(0, 10)}.md`;
      const downloadToken = storeDocument({ content: finalDoc, filename });

      const summaryPrompt = `Summarise this document in under 150 words for a chat message.
Cover: what was produced, key findings or verdict, and available delivery options.
End by noting that 📄 ${filename} is ready and a download card is provided below. Mention the user can also say "write to Confluence" or "comment on JIRA-123" for other delivery options.
Do NOT include bracket-enclosed action text — the download card handles that.
Return plain text only.`;

      const summary = await runSubAgent({
        systemPrompt: summaryPrompt,
        userContent: `Filename: ${filename}\n\nDocument:\n${finalDoc.slice(0, 8000)}`,
        model: 'claude-haiku-4-5-20251001',
        maxTokens: 512,
        operation: 'doc-summary',
      });

      if (onToken) await onToken(summary);

      if (onDocumentReady) {
        await onDocumentReady({
          filename,
          sizeBytes: Buffer.byteLength(finalDoc),
          downloadToken,
        });
      }

      return { assembledDoc: finalDoc, fullText: summary, downloadToken };
    }

    // Not downloadable: stream the full document
    if (onToken) await onToken(finalDoc);
    return { assembledDoc: finalDoc, fullText: finalDoc };
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
      manifests: { value: (_, n) => n ?? {}, default: () => ({}) },
      executionMode: { value: (_, n) => n ?? 'single', default: () => 'single' },
      mergedManifest: { value: (_, n) => n ?? null, default: () => null },
      researchResults: { value: (_, n) => n ?? {}, default: () => ({}) },
      sectionResults: { value: (_, n) => n ?? [], default: () => [] },
      assembledDoc: { value: (_, n) => n ?? '', default: () => '' },
      downloadToken: { value: (_, n) => n ?? null, default: () => null },
      // New state channels for tasks 10.1–10.3
      plans: { value: (_, n) => n ?? [], default: () => [] },
      toolTags: { value: (_, n) => n ?? [], default: () => [] },
      onTopic: { value: (_, n) => n ?? true, default: () => true },
      refusalMessage: { value: (_, n) => n ?? '', default: () => '' },
      skillCatalogue: { value: (_, n) => n ?? '', default: () => '' },
      compacted: { value: (_, n) => n ?? false, default: () => false },
      conversationId: { value: (_, n) => n ?? null, default: () => null },
      userId: { value: (_, n) => n ?? null, default: () => null },
      // Parallel research state channels
      researchContext: { value: (_, n) => n ?? '', default: () => '' },
      fallbackToSequential: { value: (_, n) => n ?? false, default: () => false },
      researchSummaries: { value: (_, n) => n ?? [], default: () => [] },
      synthesisPath: { value: (_, n) => n ?? false, default: () => false },
    },
  });

  graph.addNode('preflight', preflightNode);
  graph.addNode('loadSkills', loadSkillsNode);
  graph.addNode('skillRouter', skillRouterNode);
  graph.addNode('parallelResearch', parallelResearchNode);
  graph.addNode('synthesise', synthesiseNode);
  graph.addNode('researchFanOut', researchFanOutNode);
  graph.addNode('sectionWriter', sectionWriterNode);
  graph.addNode('skillValidate', skillValidateNode);
  graph.addNode('research', researchNode);
  graph.addNode('compactIfNeeded', compactIfNeededNode);
  graph.addNode('validate', validateNode);

  // Wire: __start__ → preflight → conditional (off-topic → __end__, on-topic → loadSkills)
  graph.addEdge('__start__', 'preflight');

  graph.addConditionalEdges('preflight', async (state) => {
    if (!state.onTopic) {
      // Off-topic: emit status and stream refusal, then short-circuit to END
      await onStatus('🚫 Off-topic request detected');
      if (onToken && state.refusalMessage) {
        await onToken(state.refusalMessage);
      }
      return '__end__';
    }
    return 'loadSkills';
  });

  graph.addEdge('loadSkills', 'skillRouter');

  graph.addConditionalEdges('skillRouter', (state) => {
    return state.executionMode === 'multi-node' ? 'researchFanOut' : 'parallelResearch';
  });

  // Parallel research: parallelResearch → synthesise (success) or research (fallback)
  graph.addConditionalEdges('parallelResearch', (state) => {
    return state.fallbackToSequential ? 'research' : 'synthesise';
  });

  // Synthesise loop: synthesise → compactIfNeeded (on tool_use), synthesise → validate (on end_turn)
  graph.addConditionalEdges('synthesise', (state) => {
    if (state.stopReason === 'tool_use' && state.turnCount < MAX_TURNS) return 'compactIfNeeded';
    return 'validate';
  });

  // Research loop: research → compactIfNeeded → research (on tool_use), research → validate (on end_turn)
  graph.addConditionalEdges('research', (state) => {
    if (state.stopReason === 'tool_use' && state.turnCount < MAX_TURNS) return 'compactIfNeeded';
    return 'validate';
  });

  // compactIfNeeded routes back to synthesise or research depending on which path we're on
  graph.addConditionalEdges('compactIfNeeded', (state) => {
    return state.synthesisPath ? 'synthesise' : 'research';
  });

  graph.addEdge('validate', '__end__');
  graph.addEdge('researchFanOut', 'sectionWriter');
  graph.addEdge('sectionWriter', 'skillValidate');
  graph.addEdge('skillValidate', '__end__');

  return graph.compile();
}
