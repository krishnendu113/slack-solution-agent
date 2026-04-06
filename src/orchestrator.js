/**
 * orchestrator.js
 *
 * Agentic orchestrator using the Anthropic SDK:
 *   - Claude decides when to search Jira/Confluence (tool use)
 *   - MCP servers for Capillary docs (SDK handles protocol)
 *   - Dynamic skill loading into system prompt
 *   - Streaming with token-by-token forwarding
 */

import Anthropic from '@anthropic-ai/sdk';
import { getMcpServers } from './mcpConfig.js';
import { loadSkillsForProblem } from './skillLoader.js';

// ─── Jira & Confluence helpers (inlined from former tools/) ──────────────────

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

function escapeQuery(str) {
  return str.replace(/["\\\n\r]/g, ch => ch === '"' ? '\\"' : ch === '\\' ? '\\\\' : ' ');
}

// ─── Tool Definitions (Claude calls these during inference) ──────────────────

const TOOL_DEFINITIONS = [
  {
    name: 'get_jira_ticket',
    description: 'Fetch a specific Jira ticket by its ID (e.g. PSV-27923, PROJ-1234). Returns summary, description, status, priority, type, labels, and URL.',
    input_schema: {
      type: 'object',
      properties: { ticket_id: { type: 'string', description: 'Jira ticket ID, e.g. PSV-27923' } },
      required: ['ticket_id'],
    },
  },
  {
    name: 'search_jira',
    description: 'Search Jira tickets by keywords using JQL text search. Returns up to 5 matching tickets with summaries and descriptions.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keywords' },
        max_results: { type: 'number', description: 'Max results (default 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_confluence',
    description: 'Search Confluence pages by keywords using CQL. Returns up to 5 matching pages with titles, spaces, and body content.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keywords' },
        max_results: { type: 'number', description: 'Max results (default 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_confluence_page',
    description: 'Fetch a specific Confluence page by its numeric ID. Returns the full page content.',
    input_schema: {
      type: 'object',
      properties: { page_id: { type: 'string', description: 'Confluence page ID (numeric)' } },
      required: ['page_id'],
    },
  },
];

// ─── Tool Handlers ───────────────────────────────────────────────────────────

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
        id: input.ticket_id,
        summary: f.summary || '',
        description: adfToPlainText(f.description),
        status: f.status?.name, priority: f.priority?.name, type: f.issuetype?.name,
        labels: f.labels || [],
        url: `${creds.baseUrl}/browse/${input.ticket_id}`,
      }, null, 2);
    }

    case 'search_jira': {
      const creds = jiraAuth();
      if (!creds) return 'Jira credentials not configured.';
      const limit = input.max_results || 5;
      const jql = `text ~ "${escapeQuery(input.query)}" ORDER BY updated DESC`;
      const params = new URLSearchParams({ jql, maxResults: String(limit), fields: 'summary,status,issuetype,priority,labels,description' });
      const res = await fetch(`${creds.baseUrl}/rest/api/3/search?${params}`, {
        headers: { Authorization: creds.auth, Accept: 'application/json' },
      });
      if (!res.ok) return `Jira search failed: ${res.status}`;
      const data = await res.json();
      const results = (data.issues || []).map(issue => ({
        id: issue.key,
        summary: issue.fields.summary || '',
        description: adfToPlainText(issue.fields.description).slice(0, 500),
        status: issue.fields.status?.name, type: issue.fields.issuetype?.name,
        url: `${creds.baseUrl}/browse/${issue.key}`,
      }));
      return JSON.stringify(results, null, 2);
    }

    case 'search_confluence': {
      const creds = confluenceAuth();
      if (!creds) return 'Confluence credentials not configured.';
      const limit = input.max_results || 5;
      const cql = `type = page AND text ~ "${escapeQuery(input.query)}"`;
      const params = new URLSearchParams({ cql, limit: String(limit), expand: 'body.view,space' });
      const res = await fetch(`${creds.baseUrl}/rest/api/content/search?${params}`, {
        headers: { Authorization: creds.auth, Accept: 'application/json' },
      });
      if (!res.ok) return `Confluence search failed: ${res.status}`;
      const data = await res.json();
      const results = (data.results || []).map(page => ({
        id: page.id, title: page.title,
        space: page.space?.name || page.space?.key || '',
        url: `${creds.baseUrl}${page._links?.webui || `/pages/${page.id}`}`,
        body: htmlToPlainText(page.body?.view?.value || '').slice(0, 2000),
      }));
      return JSON.stringify(results, null, 2);
    }

    case 'get_confluence_page': {
      const creds = confluenceAuth();
      if (!creds) return 'Confluence credentials not configured.';
      const res = await fetch(
        `${creds.baseUrl}/rest/api/content/${input.page_id}?expand=body.view,space`,
        { headers: { Authorization: creds.auth, Accept: 'application/json' } }
      );
      if (res.status === 404) return `Page ${input.page_id} not found.`;
      if (!res.ok) return `Confluence API error: ${res.status}`;
      const page = await res.json();
      return JSON.stringify({
        id: page.id, title: page.title,
        space: page.space?.name || '',
        body: htmlToPlainText(page.body?.view?.value || ''),
      }, null, 2);
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

// ─── SDK Client ──────────────────────────────────────────────────────────────

let client = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

// ─── Friendly Error Messages ─────────────────────────────────────────────────

class AgentError extends Error {
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

You have these tools — USE THEM proactively:
- **get_jira_ticket** — Fetch a specific Jira ticket by ID (always use this when a ticket ID is mentioned)
- **search_jira** — Search Jira by keywords to find related tickets
- **search_confluence** — Search Confluence for past implementations, runbooks, and solution designs
- **get_confluence_page** — Read a specific Confluence page in full
- **Capillary docs MCP** — Search Capillary product APIs and documentation (if MCP tools are available)

When you receive a request:
1. First, use tools to gather all relevant data (fetch the ticket, search for related context)
2. Then synthesise and produce your answer based on what you found
3. Cite every source: Jira ticket IDs, Confluence page titles, API doc references

## What you do

1. Analyse problems using data from Jira, Confluence, Capillary docs, and user-attached files
2. Identify the solution approach: product configuration, integration pattern, API usage, or custom build
3. Produce structured, actionable output — concrete recommendations with evidence, not a menu of options
4. If a skill is active (SDD writer, gap analyzer, etc.), follow its instructions to produce the deliverable

## Output format

- Brief summary of what you understood (1–2 lines max)
- Markdown: headers, bullet points, code blocks, tables
- Technical and specific — your audience is CS engineers and SAs
- Every claim backed by a cited source
- If not found in any source, say "not found in [source searched]"

## What NOT to do

- Do NOT ask "What would you like me to do?" — the user already told you
- Do NOT list capabilities ("I can do X, Y, Z") — just do the relevant one
- Do NOT say "I don't have access to..." — you have tools, use them
- Do NOT narrate tool calls ("Let me search...", "I'll look up...") — just use the tools silently
- Do NOT make assumptions — every claim must trace to a source
`.trim();

// ─── Main Agent Entry Point ───────────────────────────────────────────────────

export { AgentError };

export async function runAgent({ problemText, history, onStatus, onToken }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AgentError("No API key found. Add ANTHROPIC_API_KEY to .env.", 'ANTHROPIC_API_KEY not set');
  }

  const anthropic = getClient();

  // Step 1: Load skills
  await onStatus('🔍 Analysing request...');
  const { skillIds, prompt: skillPrompt } = await loadSkillsForProblem(problemText);
  if (skillIds.length) await onStatus(`🧩 Loading skills: ${skillIds.join(', ')}...`);

  // Step 2: Assemble system prompt
  const systemPrompt = BASE_SYSTEM_PROMPT + skillPrompt;

  // Step 3: Build tools array (Jira/Confluence tools + MCP toolsets)
  const mcpServers = getMcpServers();
  const tools = [...TOOL_DEFINITIONS];
  if (mcpServers.length) {
    tools.push(...mcpServers.map(s => ({ type: 'mcp_toolset', mcp_server_name: s.name })));
  }

  const maxTokens = parseInt(process.env.MAX_AGENT_TOKENS || '8000', 10);

  // Step 4: Agentic loop — Claude calls tools, we execute them, repeat until done
  let messages = [...history];
  let fullText = '';
  const MAX_TURNS = 15; // safety limit

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

      const stream = await anthropic.beta.messages.stream(params, {
        headers: mcpServers.length ? { 'anthropic-beta': 'mcp-client-2025-11-20' } : {},
      });

      let stopReason = null;

      for await (const event of stream) {
        if (event.type === 'message_start') {
          // nothing
        } else if (event.type === 'content_block_start') {
          currentBlock = { ...event.content_block, _text: '' };
          if (currentBlock.type === 'tool_use') {
            await onStatus(`🔧 Using ${currentBlock.name}...`);
            currentBlock._inputJson = '';
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
          if (currentBlock) {
            if (currentBlock.type === 'tool_use') {
              let input = {};
              try { input = JSON.parse(currentBlock._inputJson || '{}'); } catch {}
              contentBlocks.push({ type: 'tool_use', id: currentBlock.id, name: currentBlock.name, input });
            } else if (currentBlock.type === 'text') {
              contentBlocks.push({ type: 'text', text: currentBlock._text });
            }
          }
          currentBlock = null;
        } else if (event.type === 'message_delta') {
          stopReason = event.delta?.stop_reason;
        }
      }

      // Add assistant response to messages
      messages.push({ role: 'assistant', content: contentBlocks });

      // If Claude stopped because it wants to use tools, execute them and loop
      if (stopReason === 'tool_use') {
        const toolResults = [];
        for (const block of contentBlocks) {
          if (block.type !== 'tool_use') continue;
          try {
            const result = await handleToolCall(block.name, block.input);
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
          } catch (err) {
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: `Error: ${err.message}`, is_error: true });
          }
        }
        messages.push({ role: 'user', content: toolResults });
        continue; // next turn — Claude will process tool results
      }

      // Claude is done (stop_reason: 'end_turn' or 'max_tokens')
      break;
    }
  } catch (err) {
    if (err instanceof Anthropic.APIError) throw friendlyError(err);
    throw new AgentError(`Something went wrong: ${err.message}`, err.message);
  }

  // Step 5: Detect escalation
  const escalationPhrases = ['escalate', 'human sa', 'cannot determine', 'insufficient information', 'need more context from sa'];
  const shouldEscalate = escalationPhrases.some(p => fullText.toLowerCase().includes(p));

  return { text: fullText, skillsUsed: skillIds, shouldEscalate };
}

/**
 * Builds a concise SA escalation summary.
 */
export async function buildEscalationSummary({ problemText, history, agentResponse }) {
  try {
    const anthropic = getClient();
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: `Summarise this CS escalation for the SA team in under 400 words. Include: problem statement, what was researched, why SA is needed, suggested next steps. Be concise.\n\nProblem: ${problemText}\nAgent response: ${agentResponse}\nTurns: ${history.length}` }],
    });
    return response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  } catch {
    return `**Escalation**\n\n**Problem:** ${problemText}\n\n**Agent Assessment:** ${agentResponse}`;
  }
}
