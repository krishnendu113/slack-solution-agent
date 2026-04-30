/**
 * researchAgents.js
 *
 * Parallel Research Dispatcher — spawns domain-specific Haiku sub-agents
 * in parallel, each scoped to a single tool domain (Jira, Confluence, Docs, Web).
 * Agents independently make multi-turn tool calls, return structured summaries,
 * and hand off to a single Sonnet synthesis call.
 *
 * Exports:
 *   - DOMAIN_TOOLS        — mapping of domain → allowed tool names
 *   - DOMAIN_PROMPTS      — domain-specific system prompts
 *   - validateResearchSummary(rawOutput, domain) — parse & validate agent output
 *   - assembleResearchContext(summaries) — format summaries into context block
 *   - dispatchResearch(opts) — orchestrate parallel research agents
 */

import { runToolAgent, runSubAgent } from './subAgent.js';
import { getToolsByIntent } from './tools/index.js';

// ─── Environment Configuration (Task 2.6) ─────────────────────────────────────

const RESEARCH_AGENT_TIMEOUT_MS = parseInt(process.env.RESEARCH_AGENT_TIMEOUT_MS, 10) || 15000;
const RESEARCH_AGENT_MAX_TURNS = parseInt(process.env.RESEARCH_AGENT_MAX_TURNS, 10) || 5;

// ─── Domain Tool Mapping (Task 2.1) ───────────────────────────────────────────

export const DOMAIN_TOOLS = {
  jira:       ['search_jira', 'get_jira_ticket', 'add_jira_comment'],
  confluence: ['search_confluence', 'get_confluence_page'],
  kapa_docs:  ['search_kapa_docs', 'search_docs_site'],
  web_search: ['search_docs_site'],
};

// ─── Domain System Prompts (Task 2.2) ─────────────────────────────────────────

const RESEARCH_SUMMARY_SCHEMA_INSTRUCTION = `Return your findings as a JSON object with this exact schema:
{
  "domain": "<your domain>",
  "status": "complete" | "partial",
  "findings": [{ "title": "...", "summary": "... (max 100 words)", "url": "..." | null }],
  "relevanceNote": "One sentence about relevance",
  "toolCallCount": <number>
}
Maximum 5 findings. Return ONLY the JSON object, no other text.`;

export const DOMAIN_PROMPTS = {
  jira: `You are a Jira research agent for the Capillary CS team. Your job is to search Jira for tickets related to the user's query and retrieve detailed information.

You have access to these tools:
- search_jira: Search for Jira tickets by keyword
- get_jira_ticket: Fetch full details for a specific ticket
- add_jira_comment: Add a comment to a ticket (use only if explicitly requested)

Instructions:
1. Start by searching Jira for tickets related to the query.
2. From the search results, fetch full details for the most relevant tickets (up to 3).
3. Extract key fields: summary, status, priority, description excerpt, assignee.
4. Note any linked tickets or epics that provide additional context.
5. If the initial search is too broad, refine with more specific terms.

${RESEARCH_SUMMARY_SCHEMA_INSTRUCTION}`,

  confluence: `You are a Confluence research agent for the Capillary CS team. Your job is to search Confluence for pages related to the user's query and retrieve detailed content.

You have access to these tools:
- search_confluence: Search for Confluence pages by keyword
- get_confluence_page: Fetch full content of a specific page

Instructions:
1. Start by searching Confluence for pages related to the query.
2. From the search results, fetch full content for the most relevant pages (up to 2).
3. Extract implementation details, configuration steps, and architecture notes.
4. If the initial search returns too many results, refine with more specific terms.
5. Prioritise pages with recent updates and technical depth.

${RESEARCH_SUMMARY_SCHEMA_INSTRUCTION}`,

  kapa_docs: `You are a documentation research agent for the Capillary CS team. Your job is to search product documentation for information related to the user's query.

You have access to these tools:
- search_kapa_docs: Search Kapa AI-indexed documentation
- search_docs_site: Search the documentation site by keyword

Instructions:
1. Start by searching Kapa docs for information related to the query.
2. Also search the docs site for additional coverage.
3. Prioritise official product documentation over community content.
4. Extract feature descriptions, API references, and configuration guides.
5. Make follow-up searches if initial results are too broad or miss key aspects.

${RESEARCH_SUMMARY_SCHEMA_INSTRUCTION}`,

  web_search: `You are a web search research agent for the Capillary CS team. Your job is to search the documentation site for pages related to the user's query when other domain-specific agents have not been spawned.

You have access to these tools:
- search_docs_site: Search the documentation site by keyword

Instructions:
1. Search the docs site for pages related to the query.
2. Extract relevant technical content, feature descriptions, and guides.
3. If the initial search is too broad, refine with more specific terms.
4. Focus on actionable information that helps answer the user's question.

${RESEARCH_SUMMARY_SCHEMA_INSTRUCTION}`,
};

// ─── Research Summary Validation (Task 2.3) ────────────────────────────────────

/**
 * Validates a Research Summary against the expected schema.
 * Parses JSON from rawOutput, checks required fields and constraints.
 *
 * @param {string} rawOutput - Raw text output from the Research Agent
 * @param {string} domain - The domain this agent was researching
 * @returns {{ valid: boolean, summary: object }}
 */
export function validateResearchSummary(rawOutput, domain) {
  const errorSummary = (reason) => ({
    valid: false,
    summary: {
      domain,
      status: 'error',
      findings: [],
      relevanceNote: '',
      toolCallCount: 0,
      durationMs: 0,
      errors: [`Validation failed: ${reason}`],
    },
  });

  // Try to parse JSON
  let parsed;
  try {
    parsed = JSON.parse(rawOutput);
  } catch {
    return errorSummary('Invalid JSON output');
  }

  // Validate required fields
  if (typeof parsed.domain !== 'string') {
    return errorSummary('Missing or invalid "domain" field');
  }
  if (!['complete', 'partial', 'error'].includes(parsed.status)) {
    return errorSummary('Invalid "status" field — must be "complete", "partial", or "error"');
  }
  if (!Array.isArray(parsed.findings)) {
    return errorSummary('Missing or invalid "findings" array');
  }
  if (parsed.findings.length > 5) {
    return errorSummary('Too many findings — maximum 5 allowed');
  }
  if (typeof parsed.relevanceNote !== 'string') {
    return errorSummary('Missing or invalid "relevanceNote" field');
  }
  if (typeof parsed.toolCallCount !== 'number') {
    return errorSummary('Missing or invalid "toolCallCount" field');
  }

  // Validate each finding
  for (let i = 0; i < parsed.findings.length; i++) {
    const f = parsed.findings[i];
    if (typeof f.title !== 'string') {
      return errorSummary(`Finding ${i}: missing or invalid "title"`);
    }
    if (typeof f.summary !== 'string') {
      return errorSummary(`Finding ${i}: missing or invalid "summary"`);
    }
    if (f.url !== null && typeof f.url !== 'string') {
      return errorSummary(`Finding ${i}: "url" must be a string or null`);
    }
  }

  // Add durationMs if missing
  if (typeof parsed.durationMs !== 'number') {
    parsed.durationMs = 0;
  }

  return { valid: true, summary: parsed };
}

// ─── Research Context Assembly (Task 2.4) ──────────────────────────────────────

/**
 * Assembles Research Summaries into a formatted context block.
 * Filters out summaries with status "error". Returns empty string if no valid summaries.
 *
 * @param {Array<object>} summaries - Array of ResearchSummary objects
 * @returns {string} Formatted context block
 */
export function assembleResearchContext(summaries) {
  const validSummaries = summaries.filter(s => s.status !== 'error');

  if (validSummaries.length === 0) {
    return '';
  }

  return validSummaries
    .map(s => {
      const header = `### ${s.domain.toUpperCase()} Research (${s.status})`;
      const findings = s.findings
        .map(f => `- **${f.title}**: ${f.summary}${f.url ? ` ([source](${f.url}))` : ''}`)
        .join('\n');
      const note = s.relevanceNote ? `\n_Relevance: ${s.relevanceNote}_` : '';
      return `${header}\n${findings}${note}`;
    })
    .join('\n\n---\n\n');
}

// ─── Research Dispatcher (Tasks 2.5, 2.7, 2.8) ────────────────────────────────

// ─── Query Reformulation ───────────────────────────────────────────────────────

const REFORMULATE_PROMPT = `You are a search query reformulator for a Capillary CS Solution Agent.

Given a user's message and conversation history, produce 1-3 specific search queries that would find relevant information in Jira, Confluence, and Capillary product documentation.

Rules:
- If the user's message is a follow-up (e.g., "any other way?", "can we do it differently?"), use the conversation context to understand what "it" refers to.
- Convert conversational language into specific technical search terms related to Capillary products.
- Include Capillary product names, feature names, module names, and technical terms from the conversation.
- Focus on Capillary-relevant terms: Loyalty+, Engage+, Insights+, Connect+, Marvel Games, CRM, campaigns, rewards, points, tiers, segments, etc.
- If the query has NOTHING to do with Capillary products or CS work, return: { "queries": [], "context": "off-topic" }
- Return JSON only: { "queries": ["query1", "query2"], "context": "one sentence summary of what the user is asking about" }
- Each query should be 3-10 words, suitable for searching Jira/Confluence/docs.
- Return ONLY the JSON object, no other text.`;

/**
 * Reformulates a conversational user message into specific search queries
 * using conversation history for context.
 *
 * @param {string} problemText - The user's latest message
 * @param {Array} messages - Conversation history (role/content pairs)
 * @returns {Promise<{ queries: string[], context: string }>}
 */
async function reformulateQuery(problemText, messages) {
  // If the message already looks like a specific query (contains technical terms, ticket IDs, etc.), skip reformulation
  if (/[A-Z]+-\d+/.test(problemText) || problemText.length > 100) {
    return { queries: [problemText], context: problemText };
  }

  // Build a concise conversation summary (last 4 messages max)
  const recentMessages = (messages || []).slice(-4);
  const historyBlock = recentMessages
    .map(m => `${m.role}: ${(typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).slice(0, 300)}`)
    .join('\n');

  try {
    const raw = await runSubAgent({
      systemPrompt: REFORMULATE_PROMPT,
      userContent: `Conversation history:\n${historyBlock}\n\nLatest user message: "${problemText}"`,
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 256,
      operation: 'query-reformulate',
    });

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.queries) && parsed.queries.length > 0) {
      console.log(`[research:reformulate] "${problemText}" → ${JSON.stringify(parsed.queries)}`);
      return { queries: parsed.queries, context: parsed.context || problemText };
    }
    // Empty queries means reformulation determined it's off-topic or irrelevant
    console.log(`[research:reformulate] "${problemText}" → no relevant queries (context: ${parsed.context || 'none'})`);
    return { queries: [], context: parsed.context || problemText };
  } catch (err) {
    console.warn(`[research:reformulate] Failed: ${err.message}, using raw query`);
  }

  return { queries: [problemText], context: problemText };
}

/**
 * Dispatches parallel Research Agents based on tool tags from preflight.
 * Each agent runs in its own runToolAgent() call with domain-scoped tools.
 * Uses Promise.allSettled() for parallel execution with per-agent timeouts.
 *
 * @param {object} opts
 * @param {string[]} opts.toolTags - Tool category tags from preflight
 * @param {string} opts.problemText - The user's query
 * @param {string} opts.userId - For tool handler context
 * @param {Array} [opts.messages] - Conversation history for query reformulation
 * @param {number} [opts.timeoutMs] - Per-agent timeout (default: RESEARCH_AGENT_TIMEOUT_MS)
 * @param {number} [opts.maxTurns] - Per-agent max turns (default: RESEARCH_AGENT_MAX_TURNS)
 * @param {Function} [opts.onToolStatus] - SSE callback for tool status events
 * @returns {Promise<{ summaries: object[], allFailed: boolean }>}
 */
export async function dispatchResearch({
  toolTags,
  problemText,
  userId,
  messages = [],
  timeoutMs = RESEARCH_AGENT_TIMEOUT_MS,
  maxTurns = RESEARCH_AGENT_MAX_TURNS,
  onToolStatus,
}) {
  // 1. Filter toolTags to research-relevant domains (keys of DOMAIN_TOOLS)
  const researchDomains = Object.keys(DOMAIN_TOOLS);
  const domains = (toolTags || []).filter(tag => researchDomains.includes(tag));

  if (domains.length === 0) {
    return { summaries: [], allFailed: false };
  }

  // 1.5. Reformulate the query using conversation context
  const { queries, context: queryContext } = await reformulateQuery(problemText, messages);

  // If reformulation returned no queries (off-topic or irrelevant), skip research
  if (!queries.length) {
    console.log(`[graph:research] Reformulation returned no queries — skipping research`);
    return { summaries: [], allFailed: false };
  }

  const agentUserContent = `User's question: ${problemText}\n\nSearch context: ${queryContext}\n\nSuggested search queries:\n${queries.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;

  // 2. Build agent promises for each domain
  const agentPromises = domains.map(async (domain) => {
    // a. Get tool definitions filtered to only this domain's tools
    const { definitions: allDefs, handle } = getToolsByIntent([domain], { userId });
    const domainToolNames = new Set(DOMAIN_TOOLS[domain]);
    const domainTools = allDefs.filter(def => domainToolNames.has(def.name));

    // b. Emit running status (Task 2.7)
    onToolStatus?.({
      id: `research-${domain}`,
      name: `${domain} Research`,
      inputSummary: problemText.slice(0, 60),
      status: 'running',
    });

    // c. Start timer
    const startTime = Date.now();

    // d. Run the agent with timeout via Promise.race
    const agentPromise = runToolAgent({
      systemPrompt: DOMAIN_PROMPTS[domain],
      userContent: agentUserContent,
      tools: domainTools,
      handle,
      model: 'claude-haiku-4-5-20251001',
      maxTurns,
      operation: `research:${domain}`,
      onToolCall: (name, input) => {
        console.log(`[research:${domain}] ${name} ${JSON.stringify(input).slice(0, 100)}`);
      },
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Research agent ${domain} timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    const rawOutput = await Promise.race([agentPromise, timeoutPromise]);
    const durationMs = Date.now() - startTime;

    return { rawOutput, domain, durationMs };
  });

  // 3. Run all agents in parallel
  const results = await Promise.allSettled(agentPromises);

  // 4. Process results
  const summaries = results.map((result, i) => {
    const domain = domains[i];

    if (result.status === 'fulfilled') {
      const { rawOutput, durationMs } = result.value;
      const { valid, summary } = validateResearchSummary(rawOutput, domain);

      if (valid) {
        summary.durationMs = durationMs;
      }

      // Emit done status (Task 2.7)
      onToolStatus?.({
        id: `research-${domain}`,
        name: `${domain} Research`,
        inputSummary: problemText.slice(0, 60),
        status: 'done',
      });

      return summary;
    } else {
      // Rejected (timeout or error)
      const errorMessage = result.reason?.message || 'Unknown error';

      // Emit error status (Task 2.7)
      onToolStatus?.({
        id: `research-${domain}`,
        name: `${domain} Research`,
        inputSummary: problemText.slice(0, 60),
        status: 'error',
      });

      return {
        domain,
        status: 'error',
        findings: [],
        relevanceNote: '',
        toolCallCount: 0,
        durationMs: 0,
        errors: [errorMessage],
      };
    }
  });

  // 5. Log completion (Task 2.8)
  const maxDuration = Math.max(...summaries.map(s => s.durationMs || 0), 0);
  console.log(
    `[graph:research] Dispatched ${domains.length} agents: ${domains.join(', ')} completed in ${maxDuration}ms`
  );

  // 6. Return summaries and allFailed flag
  return {
    summaries,
    allFailed: summaries.every(s => s.status === 'error'),
  };
}
