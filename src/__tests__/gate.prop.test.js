/**
 * gate.prop.test.js — Property-based tests for src/preflight.js gate logic
 *
 * Uses fast-check to verify the gate confidence threshold property.
 */

// Feature: platform-persistence-and-efficiency, Property 11: Gate confidence threshold

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

// ─── Mock subAgent and skillLoader ───────────────────────────────────────────

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
      triggers: ['sdd', 'system design document'],
      alwaysLoad: false,
    },
    {
      id: 'solution-gap-analyzer',
      description: 'Analyze a BRD to predict Capillary match percentage',
      triggers: ['gap', 'brd'],
      alwaysLoad: false,
    },
    {
      id: 'excalidraw-diagram',
      description: 'Create Excalidraw diagram JSON files',
      triggers: ['diagram', 'excalidraw'],
      alwaysLoad: false,
    },
  ]),
}));

import { runSubAgent } from '../subAgent.js';
import { runPreflight } from '../preflight.js';

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Property 11: Gate confidence threshold ──────────────────────────────────

describe('Property 11: Gate confidence threshold', () => {
  // **Validates: Requirements 7.6**

  it('message is blocked iff offTopicConfidence >= 0.85', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        async (offTopicConfidence) => {
          // Build the JSON response the mock will return
          const mockResponse = JSON.stringify({
            offTopicConfidence,
            refusalReason: offTopicConfidence >= 0.85 ? 'Off-topic request' : undefined,
            classification: {
              type: 'general_query',
              confidence: 0.8,
              missingInfo: [],
            },
            toolTags: ['kapa_docs'],
            skillIds: [],
            skillReasons: {},
          });

          runSubAgent.mockResolvedValueOnce(mockResponse);

          const result = await runPreflight('Test message for gate property');

          // The message should be blocked iff confidence >= 0.85
          if (offTopicConfidence >= 0.85) {
            expect(result.onTopic).toBe(false);
            expect(result.refusalMessage).toBeDefined();
          } else {
            expect(result.onTopic).toBe(true);
            expect(result.refusalMessage).toBeUndefined();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
