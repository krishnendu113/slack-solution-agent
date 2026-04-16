/**
 * tools/kapa.js
 *
 * Capillary Kapa docs search tool.
 * Makes HTTP requests to the Kapa MCP/REST endpoint at CAPILLARY_DOCS_MCP_URL.
 * Returns an empty-results response (not an error) when not configured,
 * so the agent degrades gracefully.
 */

// ─── Tool Definitions ─────────────────────────────────────────────────────────

export const kapaDefinitions = [
  {
    name: 'search_kapa_docs',
    description: 'Search Capillary product documentation via Kapa AI. Returns relevant docs, API references, feature descriptions, and implementation guides from the Capillary knowledge base.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query for Capillary product docs (e.g. "loyalty tier configuration", "earn rules API")' },
      },
      required: ['query'],
    },
  },
];

// ─── Tool Handler ─────────────────────────────────────────────────────────────

/**
 * Handles Kapa docs search. Returns a JSON string result.
 * Never throws — errors are returned as { error, partial: true }.
 */
export async function handleKapaTool(name, input) {
  if (name !== 'search_kapa_docs') return `Unknown Kapa tool: ${name}`;

  const url = process.env.CAPILLARY_DOCS_MCP_URL;
  const token = process.env.CAPILLARY_DOCS_MCP_TOKEN;

  if (!url) {
    return JSON.stringify({ error: 'Kapa docs not configured (CAPILLARY_DOCS_MCP_URL not set)' });
  }

  const query = (input.query || '').trim().slice(0, 200);
  if (!query) return '[]';

  try {
    const params = new URLSearchParams({ q: query });
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${url}/search?${params}`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return JSON.stringify({ error: `Kapa search failed: ${res.status}`, partial: true });
    }

    const data = await res.json();

    // Normalise response — Kapa may return { results: [] } or a bare array
    const raw = Array.isArray(data) ? data : (data.results || data.hits || []);

    const results = raw.slice(0, 5).map(r => ({
      title: r.title || r.name || 'Untitled',
      url: r.url || r.link || '',
      excerpt: (r.excerpt || r.snippet || r.content || r.body || '').slice(0, 500),
    }));

    return JSON.stringify(results, null, 2);
  } catch (err) {
    return JSON.stringify({ error: `Kapa search error: ${err.message}`, partial: true });
  }
}
