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

// Pre-load wrapAnthropic if tracing is enabled
const _wrapAnthropicPromise = process.env.LANGCHAIN_TRACING_V2 === 'true'
  ? import('langsmith/wrappers/anthropic').then(m => m.wrapAnthropic).catch(() => null)
  : Promise.resolve(null);

async function getClient() {
  if (!_client) {
    const raw = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const wrapAnthropic = await _wrapAnthropicPromise;
    _client = wrapAnthropic ? wrapAnthropic(raw) : raw;
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


// ─── Tool Agent (Multi-Turn Tool-Calling Loop) ───────────────────────────────

/**
 * Runs a multi-turn tool-calling Haiku agent.
 * Loops until the model stops requesting tools or maxTurns is reached.
 *
 * @param {object} opts
 * @param {string} opts.systemPrompt  - Domain-specific system prompt
 * @param {string} opts.userContent   - User message content (the query)
 * @param {Array}  opts.tools         - Anthropic tool definitions array
 * @param {Function} opts.handle      - Tool handler: (toolName, input) => Promise<string>
 * @param {string} [opts.model]       - Model ID (default: claude-haiku-4-5-20251001)
 * @param {number} [opts.maxTokens]   - Max output tokens per turn (default: 1024)
 * @param {number} [opts.maxTurns]    - Max API calls / tool-call turns (default: 5)
 * @param {string} [opts.operation]   - Label for logging (e.g. 'research:jira')
 * @param {Function|null} [opts.onToolCall] - Optional callback: (toolName, input) => void
 * @returns {Promise<string>}         - Final text response from the agent
 */
export async function runToolAgent({
  systemPrompt,
  userContent,
  tools,
  handle,
  model = 'claude-haiku-4-5-20251001',
  maxTokens = 1024,
  maxTurns = 5,
  operation = 'unknown',
  onToolCall = null,
}) {
  if (!VALID_MODELS.has(model)) {
    throw new Error(
      `[subAgent] Invalid model "${model}". Must be one of: ${[...VALID_MODELS].join(', ')}`
    );
  }

  const client = await getClient();
  const messages = [{ role: 'user', content: userContent }];

  let lastResponse = null;

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
      tools,
    });

    lastResponse = response;

    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    console.log(`[subAgent] op=${operation} model=${model} in=${inputTokens} out=${outputTokens}`);

    if (response.stop_reason === 'tool_use') {
      // Append the full assistant response (text + tool_use blocks)
      messages.push({ role: 'assistant', content: response.content });

      // Process each tool_use block
      const toolResults = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        // Fire optional callback
        onToolCall?.(block.name, block.input);

        // Execute the tool handler, catching errors
        let result;
        try {
          result = await handle(block.name, block.input);
        } catch (err) {
          result = JSON.stringify({ error: err.message });
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result,
        });
      }

      // Append tool results as a user message
      messages.push({ role: 'user', content: toolResults });

      // Continue to next turn (loop will check turn < maxTurns)
    } else {
      // stop_reason === 'end_turn' or other — extract text and return
      const textBlock = response.content.find(b => b.type === 'text');
      return textBlock ? textBlock.text : '';
    }
  }

  // maxTurns reached — extract any text from the last response
  if (lastResponse) {
    const textBlock = lastResponse.content.find(b => b.type === 'text');
    return textBlock ? textBlock.text : '';
  }

  return '';
}
