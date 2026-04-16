/**
 * tools/jira.js
 *
 * Jira REST API tool definitions and handlers.
 * Uses JIRA_BASE_URL + JIRA_EMAIL + JIRA_API_TOKEN for Basic auth.
 */

function jiraAuth() {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!baseUrl || !email || !token) return null;
  return { baseUrl, auth: `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}` };
}

/**
 * Converts Atlassian Document Format (ADF) JSON to plain text.
 * Handles nested content nodes, paragraphs, headings, lists, code blocks.
 */
export function adfToPlainText(adf) {
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

/**
 * Sanitises a search query for safe use in JQL.
 * Strips injection characters, limits length to 100 chars.
 */
export function sanitiseQuery(str) {
  return str
    .replace(/\|\||&&|[!~^(){}\[\]:]/g, ' ')
    .replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    .replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ')
    .trim().slice(0, 200);
}

// ─── Tool Definitions ─────────────────────────────────────────────────────────

export const jiraDefinitions = [
  {
    name: 'get_jira_ticket',
    description: 'Fetch a specific Jira ticket by its ID (e.g. PSV-27923). Returns summary, description, status, priority, type, labels, and URL.',
    input_schema: {
      type: 'object',
      properties: { ticket_id: { type: 'string', description: 'Jira ticket ID, e.g. PSV-27923' } },
      required: ['ticket_id'],
    },
  },
  {
    name: 'search_jira',
    description: 'Search Jira tickets by keywords using JQL full-text search. Returns up to 5 matching tickets with summary, status, type, and URL.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keywords to search for in Jira tickets' },
        max_results: { type: 'number', description: 'Maximum results to return (default 5)' },
      },
      required: ['query'],
    },
  },
];

// ─── Tool Handlers ────────────────────────────────────────────────────────────

/**
 * Handles Jira tool calls. Returns a JSON string result.
 * Never throws — errors are returned as descriptive strings.
 */
export async function handleJiraTool(name, input) {
  switch (name) {
    case 'get_jira_ticket': {
      const creds = jiraAuth();
      if (!creds) return 'Jira credentials not configured (JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN).';
      try {
        const res = await fetch(
          `${creds.baseUrl}/rest/api/3/issue/${input.ticket_id}?fields=summary,description,status,priority,issuetype,assignee,labels`,
          { headers: { Authorization: creds.auth, Accept: 'application/json' }, signal: AbortSignal.timeout(5000) }
        );
        if (res.status === 404) return `Ticket ${input.ticket_id} not found.`;
        if (!res.ok) return `Jira API error: ${res.status}`;
        const data = await res.json();
        const f = data.fields;
        return JSON.stringify({
          id: input.ticket_id,
          summary: f.summary || '',
          description: adfToPlainText(f.description),
          status: f.status?.name,
          priority: f.priority?.name,
          type: f.issuetype?.name,
          labels: f.labels || [],
          url: `${creds.baseUrl}/browse/${input.ticket_id}`,
        }, null, 2);
      } catch (err) {
        return JSON.stringify({ error: `Jira fetch failed: ${err.message}`, partial: true });
      }
    }

    case 'search_jira': {
      const creds = jiraAuth();
      if (!creds) return 'Jira credentials not configured.';
      const limit = input.max_results || 5;
      const query = sanitiseQuery(input.query || '');
      if (!query) return '[]';
      const makeParams = (q) => new URLSearchParams({
        jql: `text ~ "${q}" ORDER BY updated DESC`,
        maxResults: String(limit),
        fields: 'summary,status,issuetype,priority,labels,description',
      });
      try {
        let res = await fetch(`${creds.baseUrl}/rest/api/3/search/jql?${makeParams(query)}`, {
          headers: { Authorization: creds.auth, Accept: 'application/json' },
          signal: AbortSignal.timeout(5000),
        });
        // Fallback: simplify multi-word query if it fails
        if (!res.ok && query.includes(' ')) {
          const simpler = query.split(' ').slice(0, 3).join(' ');
          res = await fetch(`${creds.baseUrl}/rest/api/3/search/jql?${makeParams(simpler)}`, {
            headers: { Authorization: creds.auth, Accept: 'application/json' },
            signal: AbortSignal.timeout(5000),
          });
        }
        if (!res.ok) return JSON.stringify({ error: `Jira search failed: ${res.status}`, partial: true });
        const data = await res.json();
        return JSON.stringify((data.issues || []).map(issue => ({
          id: issue.key,
          summary: issue.fields.summary || '',
          description: adfToPlainText(issue.fields.description).slice(0, 500),
          status: issue.fields.status?.name,
          type: issue.fields.issuetype?.name,
          url: `${creds.baseUrl}/browse/${issue.key}`,
        })), null, 2);
      } catch (err) {
        return JSON.stringify({ error: `Jira search error: ${err.message}`, partial: true });
      }
    }

    default:
      return `Unknown Jira tool: ${name}`;
  }
}
