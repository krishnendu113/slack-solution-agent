/**
 * preflight.js
 *
 * Combined gate + intent classifier + request classifier.
 * Replaces the separate `classifyRequest` in orchestrator.js and the
 * semantic skill matching in graph.js classify node.
 *
 * Single Haiku call returns gate decision, request classification,
 * tool tags, and skill IDs. 3-second timeout; fail-open on any error.
 */

import { runSubAgent } from './subAgent.js';
import { listSkills } from './skillLoader.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const PREFLIGHT_TIMEOUT_MS = 3000;
const OFF_TOPIC_CONFIDENCE_THRESHOLD = 0.85;

const VALID_TOOL_TAGS = new Set(['jira', 'confluence', 'kapa_docs', 'web_search', 'skills']);

const VALID_CLASSIFICATION_TYPES = new Set([
  'jira_ticket', 'cr', 'brd', 'issue', 'general_query',
]);

// ─── System Prompt ────────────────────────────────────────────────────────────

/**
 * Builds the combined preflight system prompt.
 * Includes the available skills list for skill matching.
 *
 * @param {string} skillList - Formatted skill list string
 * @returns {string}
 */
function buildSystemPrompt(skillList) {
  return `You are a pre-flight classifier for the Capillary Solution Agent — a Professional Services team assistant for Capillary Technologies.

Analyse the user message and return a single JSON object (no prose, no markdown fences) with these fields:

{
  "offTopicConfidence": 0.0-1.0,
  "refusalReason": "string (only if offTopicConfidence >= 0.85)",
  "classification": {
    "type": "jira_ticket" | "cr" | "brd" | "issue" | "general_query",
    "confidence": 0.0-1.0,
    "missingInfo": ["string", ...]
  },
  "toolTags": ["jira", "confluence", "kapa_docs", "web_search", "skills"],
  "skillIds": ["skill-id", ...],
  "skillReasons": { "skill-id": "one-sentence reason", ... }
}

## Gate Decision

offTopicConfidence: how confident you are that the message is NOT related to Capillary Professional Services work.
- 0.0: clearly on-topic (Capillary product, client request, Jira ticket, solution design, PS workflow)
- 1.0: clearly off-topic

IMPORTANT — set offTopicConfidence >= 0.90 for ANY of these:
- General knowledge questions (geography, history, science, math, trivia)
- Personal questions, greetings, jokes, small talk
- Technology questions NOT about Capillary products (e.g., "how does React work?")
- News, weather, sports, entertainment
- Coding help not related to Capillary integrations
- Any question that a general-purpose AI assistant would answer but has NOTHING to do with Capillary Technologies, its products, clients, Jira tickets, Confluence docs, or Professional Services team workflows

Set offTopicConfidence < 0.50 for:
- Questions mentioning Capillary products (Loyalty+, Engage+, Insights+, Connect+, Marvel Games, etc.)
- Jira ticket IDs or references
- Client names or client requirements
- Change requests, BRDs, feasibility questions
- Solution architecture or implementation questions
- Questions about Capillary APIs, modules, configurations

When in doubt between on-topic and off-topic, lean towards ON-TOPIC (lower confidence).

## Request Classification

type definitions:
- jira_ticket: user provided one or more Jira ticket IDs (e.g. PSV-123, LMP-456)
- cr: change request — client wants new or modified behaviour from Capillary
- brd: business requirements document or RFP evaluation
- issue: a bug, incident, or unexpected behaviour report
- general_query: a product knowledge question or capability lookup

confidence: how well-defined the request is (0.0-1.0)
missingInfo: list ONLY facts that would materially change the feasibility verdict. Keep short.

## Tool Tags

Return which tool categories are needed. Only include tags that are relevant:
- jira: when Jira tickets are mentioned or ticket search would help
- confluence: when Confluence docs or implementation notes would help
- kapa_docs: when product documentation lookup would help
- web_search: when searching docs.capillarytech.com would help
- skills: when a specialist skill should be activated

## Skill Matching

Available skills:
${skillList}

Return skillIds for skills that are relevant to the user's request.
For each skill ID in skillIds, provide a one-sentence reason in skillReasons.
Only include skills that are clearly relevant — do not guess.`;
}

// ─── Fail-Open Defaults ───────────────────────────────────────────────────────

/**
 * Returns fail-open defaults when the preflight call fails or times out.
 * Uses keyword-based skill matching as fallback.
 *
 * @param {string} problemText - The user's message
 * @returns {import('./preflight.js').PreflightResult}
 */
function failOpenDefaults(problemText) {
  const skills = listSkills();
  const lower = problemText.toLowerCase();

  // Keyword-based skill matching fallback
  const matchedSkills = skills
    .filter(s => s.triggers && s.triggers.some(t => lower.includes(t)))
    .map(s => s.id);

  const skillReasons = {};
  for (const id of matchedSkills) {
    skillReasons[id] = 'keyword match (preflight fallback)';
  }

  return {
    onTopic: true,
    classification: { type: 'general_query', confidence: 0.8, missingInfo: [] },
    toolTags: ['jira', 'confluence', 'kapa_docs', 'web_search', 'skills'],
    skillIds: matchedSkills,
    skillReasons,
  };
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Runs the combined preflight check: gate, classification, tool tags, skill IDs.
 * Single Haiku call with 3-second timeout. Fails open on any error.
 *
 * @param {string} problemText - The user's message
 * @returns {Promise<PreflightResult>}
 *
 * @typedef {object} PreflightResult
 * @property {boolean} onTopic - Whether the message is on-topic
 * @property {string} [refusalMessage] - Polite refusal message (only when off-topic)
 * @property {{ type: string, confidence: number, missingInfo: string[] }} classification
 * @property {string[]} toolTags - Tool category tags from fixed vocabulary
 * @property {string[]} skillIds - Matched skill IDs
 * @property {Record<string, string>} skillReasons - Skill ID → reason mapping
 */
export async function runPreflight(problemText) {
  try {
    // Build skill list for the prompt
    const skills = listSkills();
    const skillList = skills
      .filter(s => !s.alwaysLoad)
      .map(s => `- ${s.id}: ${s.description} (triggers: ${(s.triggers || []).join(', ')})`)
      .join('\n');

    const systemPrompt = buildSystemPrompt(skillList);

    // Race the Haiku call against a 3-second timeout
    const result = await Promise.race([
      runSubAgent({
        systemPrompt,
        userContent: problemText,
        operation: 'preflight',
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Preflight timeout (3s)')), PREFLIGHT_TIMEOUT_MS)
      ),
    ]);

    // Parse the response
    const parsed = JSON.parse(result);

    // Validate and extract fields
    const offTopicConfidence = typeof parsed.offTopicConfidence === 'number'
      ? parsed.offTopicConfidence
      : 0;

    const onTopic = offTopicConfidence < OFF_TOPIC_CONFIDENCE_THRESHOLD;

    // Build classification
    const rawClassification = parsed.classification || {};
    const classification = {
      type: VALID_CLASSIFICATION_TYPES.has(rawClassification.type)
        ? rawClassification.type
        : 'general_query',
      confidence: typeof rawClassification.confidence === 'number'
        ? rawClassification.confidence
        : 0.8,
      missingInfo: Array.isArray(rawClassification.missingInfo)
        ? rawClassification.missingInfo
        : [],
    };

    // Filter tool tags to valid vocabulary
    const toolTags = Array.isArray(parsed.toolTags)
      ? parsed.toolTags.filter(t => VALID_TOOL_TAGS.has(t))
      : [];

    // Validate skill IDs against registry
    const registeredIds = new Set(skills.map(s => s.id));
    const skillIds = Array.isArray(parsed.skillIds)
      ? parsed.skillIds.filter(id => registeredIds.has(id))
      : [];

    const skillReasons = {};
    if (parsed.skillReasons && typeof parsed.skillReasons === 'object') {
      for (const id of skillIds) {
        if (typeof parsed.skillReasons[id] === 'string') {
          skillReasons[id] = parsed.skillReasons[id];
        }
      }
    }

    const output = { onTopic, classification, toolTags, skillIds, skillReasons };

    // Generate refusal message if off-topic
    if (!onTopic) {
      output.refusalMessage = buildRefusalMessage(parsed.refusalReason);
    }

    console.log(
      `[preflight] onTopic=${onTopic} offTopicConf=${offTopicConfidence.toFixed(2)} ` +
      `type=${classification.type} tools=[${toolTags}] skills=[${skillIds}]`
    );

    return output;
  } catch (err) {
    console.warn(`[preflight] Failed (${err.message}), using fail-open defaults`);
    return failOpenDefaults(problemText);
  }
}

// ─── Refusal Message Builder ──────────────────────────────────────────────────

/**
 * Builds a polite refusal message for off-topic requests.
 *
 * @param {string} [reason] - Optional reason from the classifier
 * @returns {string}
 */
function buildRefusalMessage(reason) {
  return "This doesn't seem related to Capillary Professional Services work. I can help with product feasibility, change requests, Jira tickets, and solution design. Please rephrase if your question is Capillary-related.";
}
