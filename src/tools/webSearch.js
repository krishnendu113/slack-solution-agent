/**
 * tools/webSearch.js
 *
 * Sitemap-guided search of docs.capillarytech.com.
 * No search API required — fetches the sitemap once, scores URLs by keyword
 * overlap, then fetches and extracts text from the top matching pages.
 *
 * Sitemap URL is read from WEB_SEARCH_SITEMAP_URL env var (defaults to
 * https://docs.capillarytech.com/sitemap.xml).
 */

// ─── Sitemap Cache ────────────────────────────────────────────────────────────

let sitemapCache = null;
let sitemapFetchedAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function parseSitemapUrls(xml) {
  const matches = xml.match(/<loc>([^<]+)<\/loc>/g) || [];
  return matches.map(m => m.replace(/<\/?loc>/g, '').trim());
}

async function getSitemapUrls() {
  const now = Date.now();
  if (sitemapCache && (now - sitemapFetchedAt) < CACHE_TTL_MS) return sitemapCache;

  const sitemapUrl = process.env.WEB_SEARCH_SITEMAP_URL || 'https://docs.capillarytech.com/sitemap.xml';
  try {
    const res = await fetch(sitemapUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const xml = await res.text();
    sitemapCache = parseSitemapUrls(xml);
    sitemapFetchedAt = now;
    console.log(`[webSearch] Sitemap loaded: ${sitemapCache.length} URLs from ${sitemapUrl}`);
    return sitemapCache;
  } catch {
    return [];
  }
}

// ─── HTML Extraction ──────────────────────────────────────────────────────────

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim().replace(/\s*[|–-].*$/, '').trim() : '';
}

function extractText(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function scoreUrl(url, queryWords) {
  const path = url.toLowerCase();
  // Count how many query words appear in the URL path
  return queryWords.reduce((score, word) => score + (path.includes(word) ? 1 : 0), 0);
}

// ─── Tool Definitions ─────────────────────────────────────────────────────────

export const webSearchDefinitions = [
  {
    name: 'search_docs_site',
    description: 'Search the Capillary product documentation site (docs.capillarytech.com) for feature descriptions, configuration guides, and API references. Use this to verify product capabilities before making recommendations.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keywords to search in Capillary docs (e.g. "loyalty tiers earn rules", "points expiry configuration")' },
      },
      required: ['query'],
    },
  },
];

// ─── Tool Handler ─────────────────────────────────────────────────────────────

/**
 * Handles docs site search. Returns a JSON string result.
 * Never throws — errors are returned as { error, partial: true }.
 */
export async function handleWebSearchTool(name, input) {
  if (name !== 'search_docs_site') return `Unknown web search tool: ${name}`;

  const query = (input.query || '').trim().slice(0, 200);
  if (!query) return '[]';

  try {
    const urls = await getSitemapUrls();
    if (!urls.length) {
      return JSON.stringify({ error: 'Docs search unavailable: could not fetch sitemap', partial: true });
    }

    // Score URLs by keyword overlap (filter out short words like "a", "in", "of")
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (!queryWords.length) return '[]';

    const scored = urls
      .map(url => ({ url, score: scoreUrl(url, queryWords) }))
      .filter(u => u.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (!scored.length) {
      return JSON.stringify([], null, 2);
    }

    // Fetch each matching page and extract text
    const results = await Promise.all(scored.map(async ({ url }) => {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Capillary-SolutionAgent/1.0' },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return null;
        const html = await res.text();
        const title = extractTitle(html) || url.split('/').filter(Boolean).pop() || 'Untitled';
        const excerpt = extractText(html).slice(0, 500);
        return { title, url, excerpt };
      } catch {
        return null;
      }
    }));

    return JSON.stringify(results.filter(Boolean), null, 2);
  } catch (err) {
    return JSON.stringify({ error: `Docs search error: ${err.message}`, partial: true });
  }
}
