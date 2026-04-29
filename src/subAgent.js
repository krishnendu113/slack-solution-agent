/**
 * subAgent.js
 *
 * Lightweight non-streaming Anthropic call for sub-tasks (classification,
 * summarisation, section writing, validation). Uses claude-haiku-4-5-20251001
 * by default for cost efficiency; caller can override with model param.
 *
 * Model validation enforced: only VALID_MODELS are accepted. Any other value
 * throws immediately rather than passing an invalid model to the Anthropic API.
 *
 * Usage:
 *   const text = await runSubAgent({ systemPrompt, userContent, operation: 'classify' });
 *   const text = await runSubAgent({ systemPrompt, userContent, model: 'claude-sonnet-4-20250514', maxTokens: 4096, operation: 'section:api-flows' });
 */

import Anthropic from '@anthropic-ai/sdk';

// ─── Valid Models ─────────────────────────────────────────────────────────────

const VALID_MODELS = new Set([
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-20250514',
]);

// ─── SDK Client ───────────────────────────────────────────────────────────────

let _client = null;

// Pre-load wrapSDK if tracing is enabled
const _wrapSDKPromise = process.env.LANGCHAIN_TRACING_V2 === 'true'
  ? import('langsmith/wrappers').then(m => m.wrapSDK).catch(() => null)
  : Promise.resolve(null);

async function getClient() {
  if (!_client) {
    const raw = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const wrapSDK = await _wrapSDKPromise;
    _client = wrapSDK ? wrapSDK(raw) : raw;
  }
  return _client;
}

/**
 * Runs a single non-streaming Anthropic call.
 *
 * @param {object} opts
 * @param {string} opts.systemPrompt  - System prompt for the sub-agent
 * @param {string} opts.userContent   - User message content
 * @param {string} [opts.model]       - Model ID (default: claude-haiku-4-5-20251001)
 * @param {number} [opts.maxTokens]   - Max output tokens (default: 1024)
 * @param {string} [opts.operation]   - Label for logging (e.g. 'classify', 'section:api-flows')
 * @returns {Promise<string>}         - Text content of the first response block
 */
export async function runSubAgent({
  systemPrompt,
  userContent,
  model = 'claude-haiku-4-5-20251001',
  maxTokens = 1024,
  operation = 'unknown',
}) {
  if (!VALID_MODELS.has(model)) {
    throw new Error(
      `[subAgent] Invalid model "${model}". Must be one of: ${[...VALID_MODELS].join(', ')}`
    );
  }

  const client = await getClient();
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  });

  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  console.log(`[subAgent] op=${operation} model=${model} in=${inputTokens} out=${outputTokens}`);

  return response.content[0].text;
}
