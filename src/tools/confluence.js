/**
 * tools/confluence.js
 *
 * Confluence REST API tool definitions and handlers.
 * Uses CONFLUENCE_BASE_URL + JIRA_EMAIL + CONFLUENCE_API_TOKEN for Basic auth.
 * Includes Hystrix circuit-breaker retry logic.
 */

function confluenceAuth() {
  const baseUrl = process.env.CONFLUENCE_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.CONFLUENCE_API_TOKEN;
  if (!baseUrl || !email || !token) return null;
  return { baseUrl, auth: `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}` };
}

/**
 * Converts HTML to plain text, preserving structure (headings, lists, code blocks).
 */
export function htmlToPlainText(html) {
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

/**
 * Sanitises a search query for safe use in CQL.
 * Strips injection characters, limits length to 100 chars.
 */
function sanitiseQuery(str) {
  return str
    .replace(/\|\||&&|[!~^(){}\[\]:]/g, ' ')
    .replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    .replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ')
    .trim().slice(0, 200);
}

// ─── Tool Definitions ─────────────────────────────────────────────────────────

export const confluenceDefinitions = [
  {
    name: 'search_confluence',
    description: 'Search Confluence pages by keywords using CQL. Returns up to 5 matching pages with title, space, URL, and content excerpt.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keywords to search for in Confluence' },
        max_results: { type: 'number', description: 'Maximum results to return (default 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_confluence_page',
    description: 'Fetch the full content of a specific Confluence page by its numeric page ID.',
    input_schema: {
      type: 'object',
      properties: { page_id: { type: 'string', description: 'Numeric Confluence page ID' } },
      required: ['page_id'],
    },
  },
];

// ─── Tool Handlers ────────────────────────────────────────────────────────────

/**
 * Handles Confluence tool calls. Returns a JSON string result.
 * Never throws — errors are returned as descriptive strings.
 * Includes Hystrix circuit-breaker retry (2s wait + retry on circuit-open errors).
 */
export async function handleConfluenceTool(name, input) {
  switch (name) {
    case 'search_confluence': {
      const creds = confluenceAuth();
      if (!creds) return 'Confluence credentials not configured (CONFLUENCE_BASE_URL, JIRA_EMAIL, CONFLUENCE_API_TOKEN).';
      const limit = input.max_results || 5;
      const query = sanitiseQuery(input.query || '');
      if (!query) return '[]';

      const doSearch = (q) => {
        const cql = `type = page AND text ~ "${q}"`;
        const p = new URLSearchParams({ cql, limit: String(limit), expand: 'body.view,space' });
        return fetch(`${creds.baseUrl}/rest/api/content/search?${p}`, {
          headers: { Authorization: creds.auth, Accept: 'application/json' },
          signal: AbortSignal.timeout(5000),
        });
      };

      try {
        let res = await doSearch(query);

        // Hystrix circuit-breaker retry
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          if (body.includes('Hystrix') || body.includes('circuit')) {
            await new Promise(r => setTimeout(r, 2000));
            res = await doSearch(query);
          }
        }
        // Fallback: simplify multi-word query
        if (!res.ok && query.includes(' ')) {
          await new Promise(r => setTimeout(r, 1000));
          res = await doSearch(query.split(' ').slice(0, 3).join(' '));
        }
        if (!res.ok) return JSON.stringify({ error: `Confluence search failed: ${res.status}`, partial: true });

        const data = await res.json();
        return JSON.stringify((data.results || []).map(page => ({
          id: page.id,
          title: page.title,
          space: page.space?.name || page.space?.key || '',
          url: `${creds.baseUrl}${page._links?.webui || `/pages/${page.id}`}`,
          body: htmlToPlainText(page.body?.view?.value || '').slice(0, 2000),
        })), null, 2);
      } catch (err) {
        return JSON.stringify({ error: `Confluence search error: ${err.message}`, partial: true });
      }
    }

    case 'get_confluence_page': {
      const creds = confluenceAuth();
      if (!creds) return 'Confluence credentials not configured.';
      try {
        const res = await fetch(
          `${creds.baseUrl}/rest/api/content/${input.page_id}?expand=body.view,space`,
          { headers: { Authorization: creds.auth, Accept: 'application/json' }, signal: AbortSignal.timeout(5000) }
        );
        if (!res.ok) return JSON.stringify({ error: `Confluence page fetch failed: ${res.status}`, partial: true });
        const page = await res.json();
        return JSON.stringify({
          id: page.id,
          title: page.title,
          space: page.space?.name || '',
          url: `${creds.baseUrl}${page._links?.webui || `/pages/${page.id}`}`,
          body: htmlToPlainText(page.body?.view?.value || ''),
        }, null, 2);
      } catch (err) {
        return JSON.stringify({ error: `Confluence page fetch error: ${err.message}`, partial: true });
      }
    }

    default:
      return `Unknown Confluence tool: ${name}`;
  }
}
