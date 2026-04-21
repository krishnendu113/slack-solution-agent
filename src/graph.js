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
import { loadSkillsForProblem, loadSkillFiles, listSkills } from './skillLoader.js';
import { getTools } from './tools/index.js';
import { runSubAgent } from './subAgent.js';
import { getClientContext, updateClientPersona } from './clientPersona.js';
import { storeDocument } from './documentStore.js';

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
 * @param {object} callbacks - { onStatus, onToken, onToolStatus, onSkillActive, onPhase }
 * @param {string} baseSystemPrompt - The BASE_SYSTEM_PROMPT string from orchestrator
 * @returns CompiledStateGraph
 */
export function buildGraph(callbacks, baseSystemPrompt) {
  const { onStatus, onToken, onToolStatus, onSkillActive, onPhase, onDocumentReady } = callbacks;

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
            operation: 'skill-select',
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
    const { skillIds, prompt: skillPrompt, matched, manifests } = await loadSkillsForProblem(
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

    return { skillIds, skillPrompt, systemPrompt, manifests: Object.fromEntries(manifests) };
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
    const { handle } = getTools();
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
  /**
   * Writes one section of a document using the appropriate model.
   * Never throws — returns placeholder content on error.
   */
  async function writeSectionContent({ section, problemText, researchResults, sectionInstructions, skillId }) {
    const MODEL_MAP = {
      haiku:  'claude-haiku-4-5-20251001',
      sonnet: 'claude-sonnet-4-20250514',
    };
    const model = MODEL_MAP[section.model] || MODEL_MAP.haiku;
    const maxTokens = section.maxTokens || (section.model === 'sonnet' ? 4096 : 1024);

    // Filter research results to only the sources this section cares about
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
  /**
   * Extracts the content between SECTION markers for a given section name.
   * Falls back to the full skill prompt if no marker is found.
   */
  function extractSectionInstructions(skillPrompt, sectionName) {
    const startMarker = `<!-- SECTION: ${sectionName} -->`;
    const endMarker = `<!-- END SECTION: ${sectionName} -->`;
    const start = skillPrompt.indexOf(startMarker);
    const end = skillPrompt.indexOf(endMarker);
    if (start === -1 || end === -1) return skillPrompt; // fallback: full prompt
    return skillPrompt.slice(start + startMarker.length, end).trim();
  }

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
          turnTokens.push(event.delta.text);  // buffer instead of streaming immediately
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
    // Only accumulate text into fullText for synthesis turns (non-tool-use).
    // Tool-use turn text was already streamed to the client in real-time via onToken
    // but should NOT be included in the stored message to avoid duplication.
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

    // Check required JSON fields (for JSON output skills like excalidraw)
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

      // Generate ≤150-word summary via Haiku
      const summaryPrompt = `Summarise this document in under 150 words for a chat message.
Cover: what was produced, key findings or verdict, and available delivery options.
End with exactly this line: "📄 ${filename} ready — [Download] or say 'write to Confluence' / 'comment on JIRA-123'."
Return plain text only.`;

      const summary = await runSubAgent({
        systemPrompt: summaryPrompt,
        userContent: `Filename: ${filename}\n\nDocument:\n${finalDoc.slice(0, 8000)}`,
        model: 'claude-haiku-4-5-20251001',
        maxTokens: 512,
        operation: 'doc-summary',
      });

      // Stream summary via onToken
      if (onToken) await onToken(summary);

      // Emit document_ready SSE event
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
    },
  });

  graph.addNode('classify', classifyNode);
  graph.addNode('loadSkills', loadSkillsNode);
  graph.addNode('skillRouter', skillRouterNode);
  graph.addNode('researchFanOut', researchFanOutNode);
  graph.addNode('sectionWriter', sectionWriterNode);
  graph.addNode('skillValidate', skillValidateNode);
  graph.addNode('research', researchNode);
  graph.addNode('validate', validateNode);

  graph.addEdge('__start__', 'classify');
  graph.addEdge('classify', 'loadSkills');
  graph.addEdge('loadSkills', 'skillRouter');

  graph.addConditionalEdges('skillRouter', (state) => {
    return state.executionMode === 'multi-node' ? 'researchFanOut' : 'research';
  });

  graph.addConditionalEdges('research', (state) => {
    if (state.stopReason === 'tool_use' && state.turnCount < MAX_TURNS) return 'research';
    return 'validate';
  });

  graph.addEdge('validate', '__end__');
  graph.addEdge('researchFanOut', 'sectionWriter');
  graph.addEdge('sectionWriter', 'skillValidate');
  graph.addEdge('skillValidate', '__end__');

  return graph.compile();
}
