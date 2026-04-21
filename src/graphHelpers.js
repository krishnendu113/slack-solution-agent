/**
 * graphHelpers.js — Pure helper functions extracted from graph.js buildGraph() closure.
 *
 * These functions contain no closure dependencies and can be tested independently.
 * graph.js imports and uses them inside the closure; tests import them directly.
 */

// ─── BRANCH_TOOLS mapping ────────────────────────────────────────────────────

export const BRANCH_TOOLS = {
  jira:       ['search_jira', 'get_jira_ticket'],
  confluence: ['search_confluence', 'get_confluence_page'],
  kapa_docs:  ['search_kapa_docs'],
  web_search: ['search_docs_site'],
};

// ─── MODEL_MAP ───────────────────────────────────────────────────────────────

export const MODEL_MAP = {
  haiku:  'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-20250514',
};

// ─── extractSectionInstructions ──────────────────────────────────────────────

/**
 * Extracts the content between SECTION markers for a given section name.
 * Falls back to the full skill prompt if no marker is found.
 *
 * @param {string} skillPrompt - Full assembled skill prompt
 * @param {string} sectionName - Section name to extract
 * @returns {string}
 */
export function extractSectionInstructions(skillPrompt, sectionName) {
  const startMarker = `<!-- SECTION: ${sectionName} -->`;
  const endMarker = `<!-- END SECTION: ${sectionName} -->`;
  const start = skillPrompt.indexOf(startMarker);
  const end = skillPrompt.indexOf(endMarker);
  if (start === -1 || end === -1) return skillPrompt; // fallback: full prompt
  return skillPrompt.slice(start + startMarker.length, end).trim();
}

// ─── computeRoutingDecision ──────────────────────────────────────────────────

/**
 * Determines the execution mode from an array of manifests.
 * Returns 'multi-node' if any manifest has executionMode: 'multi-node',
 * otherwise returns 'single'.
 *
 * @param {Array<{executionMode: string}>} manifests
 * @returns {'single' | 'multi-node'}
 */
export function computeRoutingDecision(manifests) {
  if (!manifests || manifests.length === 0) return 'single';
  const hasMultiNode = manifests.some(m => m.executionMode === 'multi-node');
  return hasMultiNode ? 'multi-node' : 'single';
}

// ─── mergeResearchPhases ─────────────────────────────────────────────────────

/**
 * Merges researchPhase arrays from all multi-node manifests into a deduplicated union.
 *
 * @param {Array<{executionMode: string, researchPhase?: string[]}>} manifests
 * @returns {string[]}
 */
export function mergeResearchPhases(manifests) {
  const set = new Set();
  for (const m of manifests) {
    if (m.executionMode === 'multi-node') {
      for (const tool of (m.researchPhase || [])) set.add(tool);
    }
  }
  return [...set];
}

// ─── runResearchBranch ───────────────────────────────────────────────────────

/**
 * Runs one research branch targeting a single tool category.
 * Never throws — returns partial results with error fields on failure.
 *
 * @param {string} source - "jira" | "confluence" | "kapa_docs" | "web_search"
 * @param {string} problemText
 * @param {Function} handle - tool handler function
 * @param {Function|null} onToolStatusCb - SSE callback
 * @param {Function|null} summariseToolResult - optional summariser
 * @returns {Promise<{source: string, results: Array, error?: string}>}
 */
export async function runResearchBranch(source, problemText, handle, onToolStatusCb, summariseToolResult = null) {
  const tools = BRANCH_TOOLS[source];
  if (!tools) return { source, results: [], error: `Unknown source: ${source}` };

  const results = [];
  for (const toolName of tools) {
    const toolId = `${toolName}-branch-${source}`;
    try {
      await onToolStatusCb?.({ id: toolId, name: toolName, inputSummary: `"${problemText.slice(0, 60)}"`, status: 'running' });
      const raw = await handle(toolName, { query: problemText, max_results: 5 });
      const summary = raw && raw.length > 500 && summariseToolResult
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

// ─── runSkillValidation ──────────────────────────────────────────────────────

/**
 * Runs skill-specific validation checks on an assembled document.
 * Returns the document with appended warning notes if any checks fail,
 * or the original document unchanged if all checks pass.
 *
 * @param {string} assembledDoc - The assembled document content
 * @param {object} validation - Validation config from manifest
 * @param {string[]} [validation.requiredHeadings] - Regex patterns for required headings
 * @param {string[]} [validation.requiredPatterns] - Regex patterns that must appear
 * @param {string[]} [validation.requiredJsonFields] - Required top-level JSON keys
 * @param {string} [skillId] - Skill ID for error messages
 * @returns {string} The document, possibly with appended warning notes
 */
export function runSkillValidation(assembledDoc, validation, skillId = 'unknown') {
  if (!validation) return assembledDoc;

  const notes = [];

  // Check required headings
  for (const pattern of (validation.requiredHeadings || [])) {
    try {
      const re = new RegExp(pattern, 'm');
      if (!re.test(assembledDoc)) {
        notes.push(`> ⚠️ **Validation warning:** Required heading pattern \`${pattern}\` not found in output.`);
      }
    } catch {
      // Invalid regex pattern — skip
    }
  }

  // Check required patterns
  for (const pattern of (validation.requiredPatterns || [])) {
    try {
      const re = new RegExp(pattern);
      if (!re.test(assembledDoc)) {
        notes.push(`> ⚠️ **Validation warning:** Required pattern \`${pattern}\` not found in output.`);
      }
    } catch {
      // Invalid regex pattern — skip
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
      notes.push(`> ⚠️ **Validation warning:** Output is not valid JSON (required for ${skillId}).`);
    }
  }

  if (notes.length === 0) return assembledDoc;
  return assembledDoc + '\n\n' + notes.join('\n\n');
}

// ─── assembleSections ────────────────────────────────────────────────────────

/**
 * Assembles section results in order by joining their content.
 *
 * @param {Array<{name: string, content: string}>} sectionResults
 * @returns {string}
 */
export function assembleSections(sectionResults) {
  return sectionResults.map(r => r.content).join('\n\n');
}

// ─── resolveModel ────────────────────────────────────────────────────────────

/**
 * Resolves a manifest model shorthand ('haiku' | 'sonnet') to the full model ID.
 *
 * @param {string} modelShorthand - 'haiku' or 'sonnet'
 * @returns {string} Full model ID
 */
export function resolveModel(modelShorthand) {
  return MODEL_MAP[modelShorthand] || MODEL_MAP.haiku;
}
