/**
 * preflight.test.js — Unit tests for src/preflight.js
 *
 * Task 7.1: Tests for the combined gate + intent classifier + request classifier.
 * Mocks runSubAgent to return deterministic responses.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runPreflight } from '../preflight.js';

// ─── Mock runSubAgent ─────────────────────────────────────────────────────────

vi.mock('../subAgent.js', () => ({
  runSubAgent: vi.fn(),
}));

vi.mock('../skillLoader.js', () => ({
  listSkills: vi.fn(() => [
    {
      id: 'cr-evaluator',
      description: 'CS feasibility evaluation rubric',
      triggers: [],
      alwaysLoad: true,
    },
    {
      id: 'capillary-sdd-writer',
      description: 'Generate a developer-ready Capillary SDD',
      triggers: ['sdd', 'system design document', 'technical spec'],
      alwaysLoad: false,
    },
    {
      id: 'solution-gap-analyzer',
      description: 'Analyze a BRD to predict Capillary match percentage',
      triggers: ['gap', 'gap analysis', 'brd', 'business requirements'],
      alwaysLoad: false,
    },
    {
      id: 'excalidraw-diagram',
      description: 'Create Excalidraw diagram JSON files',
      triggers: ['diagram', 'flow diagram', 'excalidraw'],
      alwaysLoad: false,
    },
  ]),
}));

import { runSubAgent } from '../subAgent.js';

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── On-Topic Request ─────────────────────────────────────────────────────────

describe('runPreflight — on-topic requests', () => {
  it('returns on-topic result with classification, tools, and skills', async () => {
    runSubAgent.mockResolvedValueOnce(JSON.stringify({
      offTopicConfidence: 0.1,
      classification: {
        type: 'cr',
        confidence: 0.9,
        missingInfo: ['client name'],
      },
      toolTags: ['jira', 'confluence'],
      skillIds: ['capillary-sdd-writer'],
      skillReasons: { 'capillary-sdd-writer': 'User wants a technical design document' },
    }));

    const result = await runPreflight('Can you create an SDD for the new loyalty integration?');

    expect(result.onTopic).toBe(true);
    expect(result.refusalMessage).toBeUndefined();
    expect(result.classification.type).toBe('cr');
    expect(result.classification.confidence).toBe(0.9);
    expect(result.classification.missingInfo).toEqual(['client name']);
    expect(result.toolTags).toEqual(['jira', 'confluence']);
    expect(result.skillIds).toEqual(['capillary-sdd-writer']);
    expect(result.skillReasons['capillary-sdd-writer']).toBe('User wants a technical design document');
  });

  it('returns on-topic for borderline confidence (below 0.85)', async () => {
    runSubAgent.mockResolvedValueOnce(JSON.stringify({
      offTopicConfidence: 0.84,
      classification: { type: 'general_query', confidence: 0.6, missingInfo: [] },
      toolTags: ['kapa_docs'],
      skillIds: [],
      skillReasons: {},
    }));

    const result = await runPreflight('Tell me about Capillary loyalty features');

    expect(result.onTopic).toBe(true);
    expect(result.refusalMessage).toBeUndefined();
  });

  it('filters unknown tool tags from response', async () => {
    runSubAgent.mockResolvedValueOnce(JSON.stringify({
      offTopicConfidence: 0.0,
      classification: { type: 'general_query', confidence: 0.8, missingInfo: [] },
      toolTags: ['jira', 'unknown_tool', 'confluence', 'fake_tag'],
      skillIds: [],
      skillReasons: {},
    }));

    const result = await runPreflight('Search for PSV-123');

    expect(result.toolTags).toEqual(['jira', 'confluence']);
  });

  it('filters unregistered skill IDs from response', async () => {
    runSubAgent.mockResolvedValueOnce(JSON.stringify({
      offTopicConfidence: 0.0,
      classification: { type: 'general_query', confidence: 0.8, missingInfo: [] },
      toolTags: [],
      skillIds: ['capillary-sdd-writer', 'nonexistent-skill'],
      skillReasons: {
        'capillary-sdd-writer': 'relevant',
        'nonexistent-skill': 'should be filtered',
      },
    }));

    const result = await runPreflight('Write an SDD');

    expect(result.skillIds).toEqual(['capillary-sdd-writer']);
    expect(result.skillReasons).toEqual({ 'capillary-sdd-writer': 'relevant' });
    expect(result.skillReasons['nonexistent-skill']).toBeUndefined();
  });

  it('defaults classification type to general_query for unknown types', async () => {
    runSubAgent.mockResolvedValueOnce(JSON.stringify({
      offTopicConfidence: 0.0,
      classification: { type: 'unknown_type', confidence: 0.5, missingInfo: [] },
      toolTags: [],
      skillIds: [],
      skillReasons: {},
    }));

    const result = await runPreflight('Something');

    expect(result.classification.type).toBe('general_query');
  });
});

// ─── Off-Topic Request ────────────────────────────────────────────────────────

describe('runPreflight — off-topic requests', () => {
  it('returns off-topic with refusal message when confidence >= 0.85', async () => {
    runSubAgent.mockResolvedValueOnce(JSON.stringify({
      offTopicConfidence: 0.95,
      refusalReason: 'This is a recipe request, not related to Capillary CS work',
      classification: { type: 'general_query', confidence: 0.3, missingInfo: [] },
      toolTags: [],
      skillIds: [],
      skillReasons: {},
    }));

    const result = await runPreflight('What is the best recipe for chocolate cake?');

    expect(result.onTopic).toBe(false);
    expect(result.refusalMessage).toBeDefined();
    expect(result.refusalMessage).toContain('Capillary');
    expect(result.refusalMessage).toContain('rephrase');
  });

  it('returns off-topic at exactly 0.85 threshold', async () => {
    runSubAgent.mockResolvedValueOnce(JSON.stringify({
      offTopicConfidence: 0.85,
      refusalReason: 'Off-topic',
      classification: { type: 'general_query', confidence: 0.5, missingInfo: [] },
      toolTags: [],
      skillIds: [],
      skillReasons: {},
    }));

    const result = await runPreflight('Tell me a joke');

    expect(result.onTopic).toBe(false);
    expect(result.refusalMessage).toBeDefined();
  });

  it('refusal message acknowledges user and explains scope', async () => {
    runSubAgent.mockResolvedValueOnce(JSON.stringify({
      offTopicConfidence: 0.92,
      refusalReason: 'General knowledge question',
      classification: { type: 'general_query', confidence: 0.2, missingInfo: [] },
      toolTags: [],
      skillIds: [],
      skillReasons: {},
    }));

    const result = await runPreflight('What is the capital of France?');

    expect(result.refusalMessage).toContain('appreciate');
    expect(result.refusalMessage).toContain('Capillary');
    expect(result.refusalMessage).toContain('rephrase');
  });
});

// ─── Fail-Open Behaviour ──────────────────────────────────────────────────────

describe('runPreflight — fail-open on errors', () => {
  it('returns fail-open defaults when runSubAgent throws', async () => {
    runSubAgent.mockRejectedValueOnce(new Error('API error'));

    const result = await runPreflight('Check PSV-123 status');

    expect(result.onTopic).toBe(true);
    expect(result.refusalMessage).toBeUndefined();
    expect(result.classification.type).toBe('general_query');
    expect(result.toolTags).toEqual(['jira', 'confluence', 'kapa_docs', 'web_search', 'skills']);
  });

  it('returns fail-open defaults when response is not valid JSON', async () => {
    runSubAgent.mockResolvedValueOnce('not valid json at all');

    const result = await runPreflight('Analyse this BRD');

    expect(result.onTopic).toBe(true);
    expect(result.toolTags).toEqual(['jira', 'confluence', 'kapa_docs', 'web_search', 'skills']);
  });

  it('returns fail-open defaults on timeout', async () => {
    // Simulate a call that takes longer than 3 seconds
    runSubAgent.mockImplementationOnce(() =>
      new Promise(resolve => setTimeout(() => resolve('{}'), 5000))
    );

    const result = await runPreflight('Check something');

    expect(result.onTopic).toBe(true);
    expect(result.toolTags).toEqual(['jira', 'confluence', 'kapa_docs', 'web_search', 'skills']);
  }, 10000);

  it('uses keyword-based skill matching in fail-open mode', async () => {
    runSubAgent.mockRejectedValueOnce(new Error('timeout'));

    const result = await runPreflight('I need a gap analysis for this BRD');

    expect(result.onTopic).toBe(true);
    expect(result.skillIds).toContain('solution-gap-analyzer');
    expect(result.skillReasons['solution-gap-analyzer']).toContain('fallback');
  });

  it('keyword matching finds SDD writer skill', async () => {
    runSubAgent.mockRejectedValueOnce(new Error('timeout'));

    const result = await runPreflight('Create a system design document for the integration');

    expect(result.skillIds).toContain('capillary-sdd-writer');
  });
});

// ─── Edge Cases ───────────────────────────────────────────────────────────────

describe('runPreflight — edge cases', () => {
  it('handles missing fields in Haiku response gracefully', async () => {
    runSubAgent.mockResolvedValueOnce(JSON.stringify({
      offTopicConfidence: 0.1,
      // classification, toolTags, skillIds all missing
    }));

    const result = await runPreflight('Hello');

    expect(result.onTopic).toBe(true);
    expect(result.classification.type).toBe('general_query');
    expect(result.classification.confidence).toBe(0.8);
    expect(result.classification.missingInfo).toEqual([]);
    expect(result.toolTags).toEqual([]);
    expect(result.skillIds).toEqual([]);
    expect(result.skillReasons).toEqual({});
  });

  it('handles missing offTopicConfidence (defaults to 0 = on-topic)', async () => {
    runSubAgent.mockResolvedValueOnce(JSON.stringify({
      classification: { type: 'issue', confidence: 0.7, missingInfo: [] },
      toolTags: ['jira'],
      skillIds: [],
      skillReasons: {},
    }));

    const result = await runPreflight('There is a bug in loyalty module');

    expect(result.onTopic).toBe(true);
    expect(result.classification.type).toBe('issue');
  });

  it('calls runSubAgent with correct parameters', async () => {
    runSubAgent.mockResolvedValueOnce(JSON.stringify({
      offTopicConfidence: 0.0,
      classification: { type: 'general_query', confidence: 0.8, missingInfo: [] },
      toolTags: [],
      skillIds: [],
      skillReasons: {},
    }));

    await runPreflight('Test message');

    expect(runSubAgent).toHaveBeenCalledOnce();
    const call = runSubAgent.mock.calls[0][0];
    expect(call.operation).toBe('preflight');
    expect(call.userContent).toBe('Test message');
    expect(call.systemPrompt).toContain('pre-flight classifier');
    expect(call.systemPrompt).toContain('capillary-sdd-writer');
    expect(call.systemPrompt).toContain('solution-gap-analyzer');
    expect(call.systemPrompt).toContain('excalidraw-diagram');
    // alwaysLoad skills (cr-evaluator) should NOT be in the skill list
    // since they're always loaded regardless
    expect(call.systemPrompt).not.toContain('- cr-evaluator:');
  });
});
