/**
 * tools/kapa.js
 *
 * Capillary Kapa docs search tool.
 * Communicates with the Kapa MCP endpoint using JSON-RPC 2.0 over SSE.
 * The MCP server exposes `search_capillary_knowledge_sources` which performs
 * semantic retrieval over Capillary documentation.
 *
 * Returns an empty-results response (not an error) when not configured,
 * so the agent degrades gracefully.
 */

// ─── Tool Definitions ─────────────────────────────────────────────────────────

export const kapaDefinitions = [
  {
    name: 'search_kapa_docs',
    description: 'Search Capillary product documentation via Kapa AI semantic search. Returns relevant doc chunks with source URLs from the Capillary knowledge base including API references, feature descriptions, implementation guides, and FAQs.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query — must be a complete sentence (e.g. "How does loyalty tier configuration work in Capillary?")' },
      },
      required: ['query'],
    },
  },
];

// ─── MCP JSON-RPC Helper ──────────────────────────────────────────────────────

/**
 * Calls the Kapa MCP endpoint using JSON-RPC 2.0 over SSE.
 * The endpoint returns `event: message\ndata: {...}` format.
 *
 * @param {string} url - MCP endpoint URL
 * @param {string} token - Bearer token
 * @param {string} method - JSON-RPC method (e.g. 'tools/call')
 * @param {object} params - Method parameters
 * @returns {Promise<object>} Parsed JSON-RPC result
 */
async function mcpCall(url, token, method, params) {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    method,
    params,
    id: Date.now(),
  });

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(15000), // MCP calls can be slower than REST
  });

  if (!res.ok) {
    throw new Error(`MCP HTTP error: ${res.status}`);
  }

  // Response is SSE format: "event: message\ndata: {...}"
  const text = await res.text();
  const dataLine = text.split('\n').find(line => line.startsWith('data: '));
  if (!dataLine) throw new Error('No data line in MCP SSE response');

  const parsed = JSON.parse(dataLine.slice(6));
  if (parsed.error) {
    throw new Error(`MCP error ${parsed.error.code}: ${parsed.error.message}`);
  }

  return parsed.result;
}

// ─── Tool Handler ─────────────────────────────────────────────────────────────

/**
 * Handles Kapa docs search via MCP protocol.
 * Never throws — errors are returned as { error, partial: true }.
 */
export async function handleKapaTool(name, input) {
  if (name !== 'search_kapa_docs') return `Unknown Kapa tool: ${name}`;

  const url = process.env.CAPILLARY_DOCS_MCP_URL;
  const token = process.env.CAPILLARY_DOCS_MCP_TOKEN;

  if (!url) {
    return JSON.stringify({ error: 'Kapa docs not configured (CAPILLARY_DOCS_MCP_URL not set)' });
  }

  const query = (input.query || '').trim().slice(0, 500);
  if (!query) return '[]';

  try {
    const result = await mcpCall(url, token, 'tools/call', {
      name: 'search_capillary_knowledge_sources',
      arguments: { query },
    });

    // MCP returns { content: [{ type: 'text', text: '...' }], structuredContent: { results: [...] } }
    // Use structuredContent.results if available (has source_url + content), else parse from content[].text
    const structured = result?.structuredContent?.results;
    if (structured && Array.isArray(structured)) {
      const results = structured.slice(0, 8).map(r => ({
        title: extractTitle(r.content) || 'Capillary Docs',
        url: r.source_url || '',
        excerpt: cleanExcerpt(r.content, 600),
      }));
      return JSON.stringify(results, null, 2);
    }

    // Fallback: parse from content[] text blocks
    const contentBlocks = result?.content;
    if (Array.isArray(contentBlocks)) {
      const results = contentBlocks.slice(0, 8).map(block => {
        const text = block.text || '';
        return {
          title: extractTitle(text) || 'Capillary Docs',
          url: extractFirstUrl(text) || '',
          excerpt: cleanExcerpt(text, 600),
        };
      });
      return JSON.stringify(results, null, 2);
    }

    return JSON.stringify({ error: 'Unexpected MCP response format', partial: true });
  } catch (err) {
    console.warn(`[kapa] MCP search error: ${err.message}`);
    return JSON.stringify({ error: `Kapa search error: ${err.message}`, partial: true });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extracts the first heading or meaningful title from markdown content */
function extractTitle(markdown) {
  if (!markdown) return null;
  // Try ## heading first, then # heading
  const h2 = markdown.match(/^##\s+(.+)$/m);
  if (h2) return h2[1].trim();
  const h1 = markdown.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].trim();
  // Try first line if short enough
  const firstLine = markdown.split('\n').find(l => l.trim().length > 0);
  if (firstLine && firstLine.length < 80) return firstLine.trim();
  return null;
}

/** Extracts the first URL from markdown content */
function extractFirstUrl(text) {
  const match = text.match(/https?:\/\/[^\s)]+/);
  return match ? match[0] : '';
}

/** Cleans markdown content into a readable excerpt */
function cleanExcerpt(markdown, maxLen = 600) {
  if (!markdown) return '';
  return markdown
    .replace(/!\[.*?\]\(.*?\)/g, '')  // remove images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // [text](url) → text
    .replace(/#{1,6}\s+/g, '')  // remove heading markers
    .replace(/[*_`]/g, '')  // remove emphasis markers
    .replace(/\n{3,}/g, '\n\n')  // collapse multiple newlines
    .trim()
    .slice(0, maxLen);
}
