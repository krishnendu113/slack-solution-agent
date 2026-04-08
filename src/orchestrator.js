/**
 * orchestrator.js
 *
 * Agentic orchestrator using the Anthropic SDK:
 *   - Atlassian MCP for Jira/Confluence (preferred) or REST API fallback
 *   - Capillary docs MCP
 *   - Skill tools (list_skills, activate_skill)
 *   - Streaming with token-by-token + tool status forwarding
 */

import Anthropic from '@anthropic-ai/sdk';
import { getMcpServers } from './mcpConfig.js';
import { loadSkillsForProblem, loadSkill, listSkills } from './skillLoader.js';

// ─── REST API fallback helpers (used only when Atlassian MCP is not configured) ─

function jiraAuth() {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!baseUrl || !email || !token) return null;
  return { baseUrl, auth: `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}` };
}

function confluenceAuth() {
  const baseUrl = process.env.CONFLUENCE_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.CONFLUENCE_API_TOKEN;
  if (!baseUrl || !email || !token) return null;
  return { baseUrl, auth: `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}` };
}

function adfToPlainText(adf) {
  if (!adf) return '';
  if (typeof adf === 'string') return adf;
  function walk(node) {
    if (!node) return '';
    if (node.type === 'text') return node.text || '';
    if (node.type === 'hardBreak') return '\n';
    if (node.type === 'mention') return `@${node.attrs?.text || 'user'}`;
    const children = (node.content || []).map(walk).join('');
    switch (node.type) {
      case 'paragraph': return children + '\n';
      case 'heading': return `\n${'#'.repeat(node.attrs?.level || 1)} ${children}\n`;
      case 'bulletList': case 'orderedList': return children;
      case 'listItem': return `- ${children}`;
      case 'codeBlock': return `\`\`\`\n${children}\n\`\`\`\n`;
      case 'blockquote': return `> ${children}`;
      default: return children;
    }
  }
  return walk(adf).trim();
}

function htmlToPlainText(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n').replace(/<\/li>/gi, '\n').replace(/<li[^>]*>/gi, '- ')
    .replace(/<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi, (_m, l, t) => `\n${'#'.repeat(+l)} ${t}\n`)
    .replace(/<t[hd][^>]*>/gi, ' | ')
    .replace(/<pre[^>]*>(.*?)<\/pre>/gis, (_m, c) => `\`\`\`\n${c}\n\`\`\`\n`)
    .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function sanitiseQuery(str) {
  return str
    .replace(/\|\||&&|[!~^(){}\[\]:]/g, ' ')
    .replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    .replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ')
    .trim().slice(0, 100);
}

// ─── Tool Definitions ────────────────────────────────────────────────────────

// REST fallback tools — only included when Atlassian MCP is NOT configured
const REST_TOOL_DEFINITIONS = [
  {
    name: 'get_jira_ticket',
    description: 'Fetch a specific Jira ticket by its ID (e.g. PSV-27923). Returns summary, description, status, priority, type, labels, and URL.',
    input_schema: { type: 'object', properties: { ticket_id: { type: 'string', description: 'Jira ticket ID' } }, required: ['ticket_id'] },
  },
  {
    name: 'search_jira',
    description: 'Search Jira tickets by keywords. Returns up to 5 matching tickets.',
    input_schema: { type: 'object', properties: { query: { type: 'string' }, max_results: { type: 'number' } }, required: ['query'] },
  },
  {
    name: 'search_confluence',
    description: 'Search Confluence pages by keywords. Returns up to 5 matching pages with content.',
    input_schema: { type: 'object', properties: { query: { type: 'string' }, max_results: { type: 'number' } }, required: ['query'] },
  },
  {
    name: 'get_confluence_page',
    description: 'Fetch a specific Confluence page by its numeric ID.',
    input_schema: { type: 'object', properties: { page_id: { type: 'string' } }, required: ['page_id'] },
  },
];

// Skill tools — always included
const SKILL_TOOL_DEFINITIONS = [
  {
    name: 'list_skills',
    description: 'List all available specialist skills for structured deliverables (SDDs, gap analyses, diagrams).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'activate_skill',
    description: 'Activate a specialist skill to get detailed instructions for producing a deliverable. Use for SDDs, gap analyses, or diagrams.',
    input_schema: { type: 'object', properties: { skill_id: { type: 'string', description: 'e.g. capillary-sdd-writer, solution-gap-analyzer, excalidraw-diagram' } }, required: ['skill_id'] },
  },
];

// ─── REST Tool Handlers ──────────────────────────────────────────────────────

async function handleToolCall(name, input) {
  switch (name) {
    case 'get_jira_ticket': {
      const creds = jiraAuth();
      if (!creds) return 'Jira credentials not configured (JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN).';
      const res = await fetch(
        `${creds.baseUrl}/rest/api/3/issue/${input.ticket_id}?fields=summary,description,status,priority,issuetype,assignee,labels`,
        { headers: { Authorization: creds.auth, Accept: 'application/json' } }
      );
      if (res.status === 404) return `Ticket ${input.ticket_id} not found.`;
      if (!res.ok) return `Jira API error: ${res.status}`;
      const data = await res.json();
      const f = data.fields;
      return JSON.stringify({
        id: input.ticket_id, summary: f.summary || '', description: adfToPlainText(f.description),
        status: f.status?.name, priority: f.priority?.name, type: f.issuetype?.name,
        labels: f.labels || [], url: `${creds.baseUrl}/browse/${input.ticket_id}`,
      }, null, 2);
    }

    case 'search_jira': {
      const creds = jiraAuth();
      if (!creds) return 'Jira credentials not configured.';
      const limit = input.max_results || 5;
      const query = sanitiseQuery(input.query);
      if (!query) return '[]';
      const jql = `text ~ "${query}" ORDER BY updated DESC`;
      const params = new URLSearchParams({ jql, maxResults: String(limit), fields: 'summary,status,issuetype,priority,labels,description' });
      let res = await fetch(`${creds.baseUrl}/rest/api/3/search/jql?${params}`, {
        headers: { Authorization: creds.auth, Accept: 'application/json' },
      });
      if (!res.ok && query.includes(' ')) {
        const simpler = query.split(' ').slice(0, 3).join(' ');
        const rp = new URLSearchParams({ jql: `text ~ "${simpler}" ORDER BY updated DESC`, maxResults: String(limit), fields: 'summary,status,issuetype,priority,labels,description' });
        res = await fetch(`${creds.baseUrl}/rest/api/3/search/jql?${rp}`, { headers: { Authorization: creds.auth, Accept: 'application/json' } });
      }
      if (!res.ok) return `Jira search failed: ${res.status}`;
      const data = await res.json();
      return JSON.stringify((data.issues || []).map(issue => ({
        id: issue.key, summary: issue.fields.summary || '',
        description: adfToPlainText(issue.fields.description).slice(0, 500),
        status: issue.fields.status?.name, type: issue.fields.issuetype?.name,
        url: `${creds.baseUrl}/browse/${issue.key}`,
      })), null, 2);
    }

    case 'search_confluence': {
      const creds = confluenceAuth();
      if (!creds) return 'Confluence credentials not configured.';
      const limit = input.max_results || 5;
      const query = sanitiseQuery(input.query);
      if (!query) return '[]';
      const doSearch = (q) => {
        const cql = `type = page AND text ~ "${q}"`;
        const p = new URLSearchParams({ cql, limit: String(limit), expand: 'body.view,space' });
        return fetch(`${creds.baseUrl}/rest/api/content/search?${p}`, { headers: { Authorization: creds.auth, Accept: 'application/json' } });
      };
      let res = await doSearch(query);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        if (body.includes('Hystrix') || body.includes('circuit')) {
          await new Promise(r => setTimeout(r, 2000));
          res = await doSearch(query);
        }
      }
      if (!res.ok && query.includes(' ')) {
        await new Promise(r => setTimeout(r, 1000));
        res = await doSearch(query.split(' ').slice(0, 3).join(' '));
      }
      if (!res.ok) return `Confluence search failed: ${res.status}`;
      const data = await res.json();
      return JSON.stringify((data.results || []).map(page => ({
        id: page.id, title: page.title, space: page.space?.name || page.space?.key || '',
        url: `${creds.baseUrl}${page._links?.webui || `/pages/${page.id}`}`,
        body: htmlToPlainText(page.body?.view?.value || '').slice(0, 2000),
      })), null, 2);
    }

    case 'get_confluence_page': {
      const creds = confluenceAuth();
      if (!creds) return 'Confluence credentials not configured.';
      const res = await fetch(`${creds.baseUrl}/rest/api/content/${input.page_id}?expand=body.view,space`,
        { headers: { Authorization: creds.auth, Accept: 'application/json' } });
      if (!res.ok) return `Confluence API error: ${res.status}`;
      const page = await res.json();
      return JSON.stringify({ id: page.id, title: page.title, space: page.space?.name || '',
        body: htmlToPlainText(page.body?.view?.value || '') }, null, 2);
    }

    case 'list_skills':
      return JSON.stringify(listSkills(), null, 2);

    case 'activate_skill': {
      try {
        const prompt = await loadSkill(input.skill_id);
        return `Skill "${input.skill_id}" activated. Follow these instructions precisely:\n\n${prompt}`;
      } catch (err) {
        return `Failed to load skill: ${err.message}. Use list_skills to see available skills.`;
      }
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

// ─── Tool Summary Helpers ────────────────────────────────────────────────────

function inputSummary(name, input) {
  switch (name) {
    case 'get_jira_ticket': return input.ticket_id || '';
    case 'search_jira': case 'search_confluence': return `"${input.query || ''}"`;
    case 'get_confluence_page': return `page ${input.page_id || ''}`;
    case 'activate_skill': return input.skill_id || '';
    case 'list_skills': return '';
    default: return name; // MCP tools — show tool name
  }
}

function resultSummary(name, result) {
  try {
    if (typeof result === 'string' && (result.startsWith('Error:') || result.startsWith('Jira') || result.startsWith('Confluence') || result.startsWith('Failed'))) return { text: result };
    if (name === 'activate_skill') return { text: 'Skill loaded' };
    const parsed = JSON.parse(result);
    switch (name) {
      case 'get_jira_ticket': return { text: `"${parsed.summary}" (${parsed.status}, ${parsed.priority})`, url: parsed.url };
      case 'search_jira': return Array.isArray(parsed) ? { text: `Found ${parsed.length} ticket(s)`, links: parsed.map(t => ({ label: t.id, url: t.url })) } : { text: 'Done' };
      case 'search_confluence': return Array.isArray(parsed) ? { text: `Found ${parsed.length} page(s)`, links: parsed.map(p => ({ label: (p.title || '').slice(0, 40) || p.id, url: p.url })) } : { text: 'Done' };
      case 'get_confluence_page': return { text: `"${parsed.title || 'Untitled'}"`, url: parsed.url };
      case 'list_skills': return { text: `${parsed.length} skill(s) available` };
      default: return { text: 'Done' };
    }
  } catch { return { text: 'Done' }; }
}

// ─── SDK Client ──────────────────────────────────────────────────────────────

let client = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

// ─── Friendly Error Messages ─────────────────────────────────────────────────

class AgentError extends Error {
  constructor(userMessage, technical) { super(userMessage); this.name = 'AgentError'; this.technical = technical; }
}

function friendlyError(err) {
  const msg = err.message || ''; const status = err.status || 0;
  if (msg.includes('credit balance is too low')) return new AgentError("The AI's piggy bank is empty. Top up at console.anthropic.com.", msg);
  if (msg.includes('invalid x-api-key') || status === 401) return new AgentError("API key didn't pass the bouncer. Check ANTHROPIC_API_KEY in .env.", msg);
  if (msg.includes('overloaded') || status === 529) return new AgentError("Claude is juggling too many requests. Try again in a moment.", msg);
  if (status === 429) return new AgentError("Rate limit hit — wait a few seconds and retry.", msg);
  if (status >= 500) return new AgentError("Anthropic's servers are having a rough day. Try again shortly.", msg);
  if (msg.includes('context length') || msg.includes('too long')) return new AgentError("Conversation too long for Claude. Start a new chat.", msg);
  return new AgentError(`Something unexpected happened (${status || 'unknown'}). Check server logs.`, msg);
}

// ─── Base System Prompt ───────────────────────────────────────────────────────

const BASE_SYSTEM_PROMPT = `
You are the Capillary Solution Agent — an expert Solutions Architect assistant for the Capillary Technologies Customer Success team.

## Core behaviour — ACT FIRST, DON'T ASK

You are an autonomous agent with tools. When given a task, DO THE WORK immediately:
- Use your tools to fetch Jira tickets, search Jira/Confluence, and look up Capillary docs
- Do not ask the user for information you can look up yourself
- Do not list what you *could* do — just do it
- If information is missing after searching all sources, state what you searched and what was not found. Do NOT assume or guess.
- ONLY ask the user a question if critical information is unavailable in any source and you cannot proceed without it.

## Available tools

You have tools for searching and fetching data — USE THEM proactively:
- Jira tools: fetch tickets by ID, search by keywords
- Confluence tools: search pages, fetch page content
- Capillary docs: search product APIs and documentation
- Skills: activate specialist skills for SDDs, gap analysis, diagrams

When you receive a request:
1. First, use tools to gather all relevant data (fetch the ticket, search for related context)
2. Then synthesise and produce your answer based on what you found
3. Cite every source with clickable links

## Skills — specialist deliverables

You have access to specialist skills for structured deliverables:
- **capillary-sdd-writer** — System Design Documents / LLDs / technical specs
- **solution-gap-analyzer** — BRD gap analysis with Capillary capability matching
- **excalidraw-diagram** — Architecture and workflow diagrams

When the task requires a structured deliverable, use **activate_skill** to load instructions. Activate proactively — if a ticket is about building something, activate the SDD writer. If evaluating requirements, activate the gap analyzer.

## Output format

- Brief summary of what you understood (1-2 lines max)
- Markdown: headers, bullet points, code blocks, tables
- Technical and specific — audience is CS engineers and SAs
- **Citations must be clickable markdown links**: use [TICKET-ID](url) for Jira and [Page Title](url) for Confluence. Always include the URL from tool results.
- If not found in any source, say "not found in [source searched]"

## What NOT to do

- Do NOT ask "What would you like me to do?" — the user already told you
- Do NOT list capabilities — just do the relevant one
- Do NOT say "I don't have access to..." — you have tools, use them
- Do NOT narrate tool calls — just use the tools silently
- Do NOT make assumptions — every claim must trace to a source
`.trim();

// ─── Main Agent Entry Point ───────────────────────────────────────────────────

export { AgentError };

export async function runAgent({ problemText, history, onStatus, onToken, onToolStatus, onSkillActive }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AgentError("No API key found. Add ANTHROPIC_API_KEY to .env.", 'ANTHROPIC_API_KEY not set');
  }

  const anthropic = getClient();

  // Step 1: Load skills (keyword-based fast path)
  await onStatus('🔍 Analysing request...');
  const { skillIds, prompt: skillPrompt, matched } = await loadSkillsForProblem(problemText);
  if (skillIds.length) {
    await onStatus(`🧩 Loading skills: ${skillIds.join(', ')}...`);
    if (onSkillActive) {
      for (const skill of matched) await onSkillActive({ id: skill.id, description: skill.description });
    }
  }

  // Step 2: Assemble system prompt
  const systemPrompt = BASE_SYSTEM_PROMPT + skillPrompt;

  // Step 3: Build tools — MCP toolsets + conditional REST or skill-only tools
  const mcpServers = getMcpServers();
  const hasAtlassianMcp = mcpServers.some(s => s.name === 'atlassian');

  const tools = [...SKILL_TOOL_DEFINITIONS];
  if (!hasAtlassianMcp) {
    // No Atlassian MCP — include REST API fallback tools
    tools.push(...REST_TOOL_DEFINITIONS);
  }
  if (mcpServers.length) {
    tools.push(...mcpServers.map(s => ({ type: 'mcp_toolset', mcp_server_name: s.name })));
  }

  const maxTokens = parseInt(process.env.MAX_AGENT_TOKENS || '8000', 10);

  // Step 4: Agentic loop
  let messages = [...history];
  let fullText = '';
  const MAX_TURNS = 15;

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      await onStatus(turn === 0 ? '🤖 Thinking...' : '🔄 Processing tool results...');

      const params = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages,
        tools,
        stream: true,
      };

      if (mcpServers.length) {
        params.mcp_servers = mcpServers;
      }

      // Stream the response
      const contentBlocks = [];
      let currentBlock = null;
      let stopReason = null;

      const stream = await anthropic.beta.messages.stream(params, {
        headers: mcpServers.length ? { 'anthropic-beta': 'mcp-client-2025-11-20' } : {},
      });

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          currentBlock = { ...event.content_block, _text: '', _inputJson: '' };
          // Emit tool_status for ALL tool calls (MCP + REST)
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
            contentBlocks.push({ type: 'tool_use', id: currentBlock.id, name: currentBlock.name, input, _toolId: currentBlock._toolId });
            // Update tool_status with parsed input summary (now we have the full input)
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

      // Strip internal metadata before sending back to API
      const cleanBlocks = contentBlocks.map(b => {
        if (b.type === 'tool_use') return { type: 'tool_use', id: b.id, name: b.name, input: b.input };
        return b;
      });
      messages.push({ role: 'assistant', content: cleanBlocks });

      if (stopReason === 'tool_use') {
        const toolResults = [];
        for (const block of contentBlocks) {
          if (block.type !== 'tool_use') continue;

          try {
            const result = await handleToolCall(block.name, block.input);
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
            // Skill activation event
            if (block.name === 'activate_skill' && onSkillActive) {
              const skillInfo = listSkills().find(s => s.id === block.input.skill_id);
              await onSkillActive({ id: block.input.skill_id, description: skillInfo?.description || '' });
            }
            const rs = resultSummary(block.name, result);
            if (onToolStatus) await onToolStatus({ id: block._toolId, name: block.name, inputSummary: inputSummary(block.name, block.input), status: 'done', ...rs });
          } catch (err) {
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: `Error: ${err.message}`, is_error: true });
            if (onToolStatus) await onToolStatus({ id: block._toolId, name: block.name, inputSummary: inputSummary(block.name, block.input), status: 'error', text: err.message });
          }
        }
        messages.push({ role: 'user', content: toolResults });
        continue;
      }

      // MCP tool calls are handled internally by Anthropic — they appear as tool_use + tool_result
      // in the stream but we don't execute them ourselves. Mark them as done.
      for (const block of contentBlocks) {
        if (block.type === 'tool_use' && block._toolId && onToolStatus) {
          // If we didn't handle it above (i.e. it's an MCP tool), mark it done
          const isCustomTool = ['get_jira_ticket', 'search_jira', 'search_confluence', 'get_confluence_page', 'list_skills', 'activate_skill'].includes(block.name);
          if (!isCustomTool) {
            await onToolStatus({ id: block._toolId, name: block.name, inputSummary: inputSummary(block.name, block.input), status: 'done', text: 'Done' });
          }
        }
      }

      break; // end_turn or max_tokens
    }
  } catch (err) {
    if (err instanceof Anthropic.APIError) throw friendlyError(err);
    throw new AgentError(`Something went wrong: ${err.message}`, err.message);
  }

  const escalationPhrases = ['escalate', 'human sa', 'cannot determine', 'insufficient information', 'need more context from sa'];
  const shouldEscalate = escalationPhrases.some(p => fullText.toLowerCase().includes(p));

  return { text: fullText, skillsUsed: skillIds, shouldEscalate };
}

export async function buildEscalationSummary({ problemText, history, agentResponse }) {
  try {
    const anthropic = getClient();
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 1000,
      messages: [{ role: 'user', content: `Summarise this CS escalation for the SA team in under 400 words. Include: problem statement, what was researched, why SA is needed, suggested next steps.\n\nProblem: ${problemText}\nAgent response: ${agentResponse}\nTurns: ${history.length}` }],
    });
    return response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  } catch {
    return `**Escalation**\n\n**Problem:** ${problemText}\n\n**Agent Assessment:** ${agentResponse}`;
  }
}
