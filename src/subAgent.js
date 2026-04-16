/**
 * subAgent.js
 *
 * Lightweight non-streaming Anthropic call for sub-tasks (classification,
 * summarisation, validation). Uses claude-haiku-4-5-20251001 by default
 * for cost efficiency; caller can override with model param.
 *
 * Usage:
 *   const text = await runSubAgent({ systemPrompt, userContent });
 *   const text = await runSubAgent({ systemPrompt, userContent, model: 'claude-sonnet-4-20250514' });
 */

import Anthropic from '@anthropic-ai/sdk';

let _client = null;
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

/**
 * Runs a single non-streaming Anthropic call.
 *
 * @param {object} opts
 * @param {string} opts.systemPrompt - System prompt for the sub-agent
 * @param {string} opts.userContent  - User message content
 * @param {string} [opts.model]      - Model ID (default: claude-haiku-4-5-20251001)
 * @returns {Promise<string>}        - Text content of the first response block
 */
export async function runSubAgent({ systemPrompt, userContent, model = 'claude-haiku-4-5-20251001' }) {
  const response = await getClient().messages.create({
    model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  });
  return response.content[0].text;
}
