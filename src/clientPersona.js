import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runSubAgent } from './subAgent.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENTS_DIR = path.join(__dirname, '../data/clients');

function ensureClientsDir() {
  if (!existsSync(CLIENTS_DIR)) mkdirSync(CLIENTS_DIR, { recursive: true });
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const DETECT_SYSTEM_PROMPT = `You are a client name extractor. Given a CS support request, extract the client/company name if explicitly mentioned.

Return JSON only — no prose, no markdown:
{ "client": "Client Name" }

Return { "client": null } if no specific client name is mentioned.
Only return a name if it is clearly a client/company name (not Capillary itself).`;

/**
 * Extracts client name from problem text using Haiku.
 * Returns slug string or null.
 */
export async function detectClientName(problemText) {
  try {
    const raw = await runSubAgent({
      systemPrompt: DETECT_SYSTEM_PROMPT,
      userContent: problemText.slice(0, 500),
    });
    const parsed = JSON.parse(raw);
    if (!parsed.client) return null;
    const slug = slugify(parsed.client);
    if (!slug) return null;
    console.log(`[clientPersona] Detected client: ${slug}`);
    return slug;
  } catch (err) {
    console.warn('[clientPersona] Client detection failed:', err.message);
    return null;
  }
}

/**
 * Loads data/clients/{slug}.md if it exists.
 * Returns string (markdown content) or null.
 */
export function loadClientPersona(slug) {
  ensureClientsDir();
  const file = path.join(CLIENTS_DIR, `${slug}.md`);
  if (!existsSync(file)) return null;
  try { return readFileSync(file, 'utf8'); }
  catch { return null; }
}

/**
 * Assembles client context block for injection into system prompt.
 * Returns non-empty string or ''.
 */
export async function getClientContext(problemText) {
  const slug = await detectClientName(problemText);
  if (!slug) return { context: '', slug: null };

  const persona = loadClientPersona(slug);
  if (!persona) return { context: '', slug };

  const displayName = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const context = `## Client Context: ${displayName}\n\n${persona}\n\n---`;
  return { context, slug };
}

const UPDATE_SYSTEM_PROMPT = `You are a client knowledge base updater. Given prior client context and a new conversation, write a concise update (max 150 words) for the ## Recent Conversations section only. Do not repeat existing content verbatim. Focus on new findings, verdicts, and modules discussed.

Return plain text only — no JSON, no markdown headers.`;

/**
 * After synthesis, generate a delta summary and append to client file.
 * Creates file if it doesn't exist.
 */
export async function updateClientPersona(slug, problemText, agentResponse) {
  if (!slug) return;
  ensureClientsDir();
  const file = path.join(CLIENTS_DIR, `${slug}.md`);
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : '';

  try {
    const delta = await runSubAgent({
      systemPrompt: UPDATE_SYSTEM_PROMPT,
      userContent: `Prior context:\n${existing || '(none)'}\n\nNew conversation:\nUser: ${problemText.slice(0, 300)}\n\nAgent: ${agentResponse.slice(0, 800)}`,
    });

    const date = new Date().toISOString().slice(0, 10);
    const entry = `\n- **${date}:** ${delta.trim()}`;

    let updated;
    if (!existing) {
      const displayName = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      updated = `# ${displayName}\n\n## Overview\n\n_Auto-created from conversation._\n\n## Modules\n\n_Unknown_\n\n## Known Issues\n\n_None recorded_\n\n## Recent Conversations\n${entry}\n`;
    } else if (existing.includes('## Recent Conversations')) {
      updated = existing.replace('## Recent Conversations', `## Recent Conversations\n${entry}`);
    } else {
      updated = existing + `\n\n## Recent Conversations\n${entry}\n`;
    }

    writeFileSync(file, updated, 'utf8');
    console.log(`[clientPersona] Updated persona for: ${slug}`);
  } catch (err) {
    console.warn(`[clientPersona] Failed to update persona for ${slug}:`, err.message);
  }
}
