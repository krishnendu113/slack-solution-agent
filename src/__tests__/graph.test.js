/**
 * graph.test.js — Property-based and unit tests for graph helper functions
 *
 * Task 4.5: Property 2 — Routing determinism
 * Task 4.6: Property 3 — Research phase merge (deduplicated union)
 * Task 5.4: Property 4 — Branch tool isolation
 * Task 5.5: Property 5 — Branch failure isolation
 * Task 6.5: Property 6 — Section assembly order
 * Task 6.6: Property 7 — Section writer model matching
 * Task 7.3: Property 10 — Validator notes
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  computeRoutingDecision,
  mergeResearchPhases,
  BRANCH_TOOLS,
  runResearchBranch,
  assembleSections,
  resolveModel,
  MODEL_MAP,
  runSkillValidation,
} from '../graphHelpers.js';

// ─── Task 4.5: Property 2 — Routing determinism ─────────────────────────────

describe('computeRoutingDecision (Property 2)', () => {
  const manifestArb = fc.record({
    executionMode: fc.oneof(fc.constant('single'), fc.constant('multi-node')),
    researchPhase: fc.array(
      fc.constantFrom('jira', 'confluence', 'kapa_docs', 'web_search'),
      { maxLength: 4 }
    ),
  });

  /**
   * Property 2: Skill router routing is deterministic from skill set
   *
   * For any array of manifests with executionMode in ['single', 'multi-node'],
   * the router returns 'multi-node' iff at least one manifest has executionMode: 'multi-node'.
   *
   * **Validates: Requirements 2.2, 2.3, 2.4**
   */
  it('Property 2: returns multi-node iff any manifest is multi-node', () => {
    fc.assert(
      fc.property(
        fc.array(manifestArb, { minLength: 0, maxLength: 10 }),
        (manifests) => {
          const hasMultiNode = manifests.some(m => m.executionMode === 'multi-node');
          const result = computeRoutingDecision(manifests);
          expect(result).toBe(hasMultiNode ? 'multi-node' : 'single');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns single for empty manifest array', () => {
    expect(computeRoutingDecision([])).toBe('single');
  });

  it('returns single for null/undefined', () => {
    expect(computeRoutingDecision(null)).toBe('single');
    expect(computeRoutingDecision(undefined)).toBe('single');
  });
});

// ─── Task 4.6: Property 3 — Research phase merge ────────────────────────────

describe('mergeResearchPhases (Property 3)', () => {
  const toolArb = fc.constantFrom('jira', 'confluence', 'kapa_docs', 'web_search');

  /**
   * Property 3: Research phase merge is a deduplicated union
   *
   * For any collection of researchPhase arrays, the merged result has no duplicates
   * and equals the set-union of all inputs.
   *
   * **Validates: Requirements 2.5**
   */
  it('Property 3: merged result is deduplicated union of all inputs', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.array(toolArb, { maxLength: 4 }),
          { minLength: 1, maxLength: 5 }
        ),
        (researchPhases) => {
          const manifests = researchPhases.map(rp => ({
            executionMode: 'multi-node',
            researchPhase: rp,
          }));
          const merged = mergeResearchPhases(manifests);

          // No duplicates
          expect(merged.length).toBe(new Set(merged).size);

          // Contains all tools from all manifests
          const expectedSet = new Set(researchPhases.flat());
          expect(new Set(merged)).toEqual(expectedSet);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('ignores single-mode manifests', () => {
    const manifests = [
      { executionMode: 'single', researchPhase: ['jira'] },
      { executionMode: 'multi-node', researchPhase: ['confluence'] },
    ];
    const merged = mergeResearchPhases(manifests);
    expect(merged).toEqual(['confluence']);
  });
});

// ─── Task 5.4: Property 4 — Branch tool isolation ───────────────────────────

describe('runResearchBranch tool isolation (Property 4)', () => {
  /**
   * Property 4: Research branch tool isolation
   *
   * For any branch type and problem text, the branch only calls tools
   * from its designated set.
   *
   * **Validates: Requirements 3.3**
   */
  it('Property 4: branch only calls tools from its designated set', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('jira', 'confluence', 'kapa_docs', 'web_search'),
        fc.string({ minLength: 1, maxLength: 200 }),
        async (branchType, problemText) => {
          const calledTools = [];
          const mockHandle = async (name) => {
            calledTools.push(name);
            return '[]';
          };

          await runResearchBranch(branchType, problemText, mockHandle, null);

          const allowedTools = BRANCH_TOOLS[branchType];
          expect(calledTools.every(t => allowedTools.includes(t))).toBe(true);
          // Should call exactly the tools in the branch
          expect(calledTools).toEqual(allowedTools);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns error for unknown source', async () => {
    const result = await runResearchBranch('unknown_source', 'test', async () => '[]', null);
    expect(result.error).toBeDefined();
    expect(result.results).toEqual([]);
  });
});

// ─── Task 5.5: Property 5 — Branch failure isolation ────────────────────────

describe('runResearchBranch failure isolation (Property 5)', () => {
  /**
   * Property 5: Research branch failure isolation
   *
   * For any branch type where all tool calls throw, the branch returns a result
   * with error fields rather than propagating the exception.
   *
   * **Validates: Requirements 3.5, 4.7**
   */
  it('Property 5: never propagates exceptions from tool calls', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('jira', 'confluence', 'kapa_docs', 'web_search'),
        fc.string({ minLength: 1, maxLength: 100 }),
        async (branchType, errorMessage) => {
          const failingHandle = async () => {
            throw new Error(errorMessage);
          };

          // Should NOT throw
          const result = await runResearchBranch(branchType, 'test problem', failingHandle, null);

          expect(result).toHaveProperty('source', branchType);
          expect(result.results.length).toBeGreaterThan(0);
          expect(result.results.every(r => r.error !== undefined)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Task 6.5: Property 6 — Section assembly order ──────────────────────────

describe('assembleSections (Property 6)', () => {
  /**
   * Property 6: Section assembly preserves manifest order
   *
   * For any array of section names, the assembled document contains sections
   * in the same order as the input array.
   *
   * **Validates: Requirements 4.5**
   */
  it('Property 6: sections appear in manifest order', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('\0')),
          { minLength: 1, maxLength: 10 }
        ),
        (sectionNames) => {
          // Create unique content for each section to track order
          const sections = sectionNames.map((name, i) => ({
            name,
            content: `===SECTION_${i}_START===\nContent for ${name}\n===SECTION_${i}_END===`,
          }));

          const assembled = assembleSections(sections);

          // Verify each section's content appears in order
          let lastIndex = -1;
          for (const section of sections) {
            const idx = assembled.indexOf(section.content);
            expect(idx).toBeGreaterThan(lastIndex);
            lastIndex = idx;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns empty string for empty sections array', () => {
    expect(assembleSections([])).toBe('');
  });
});

// ─── Task 6.6: Property 7 — Section writer model matching ──────────────────

describe('resolveModel (Property 7)', () => {
  /**
   * Property 7: Section_Writer model matches manifest declaration
   *
   * For any section config with model: 'haiku' or model: 'sonnet',
   * the resolved model is the correct full model ID.
   *
   * **Validates: Requirements 4.3, 8.4, 8.5, 8.6**
   */
  it('Property 7: model shorthand resolves to correct full model ID', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant('haiku'), fc.constant('sonnet')),
        (modelShorthand) => {
          const resolved = resolveModel(modelShorthand);
          const expected = modelShorthand === 'haiku'
            ? 'claude-haiku-4-5-20251001'
            : 'claude-sonnet-4-20250514';
          expect(resolved).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('defaults to haiku for unknown model shorthand', () => {
    expect(resolveModel('unknown')).toBe(MODEL_MAP.haiku);
    expect(resolveModel('')).toBe(MODEL_MAP.haiku);
    expect(resolveModel(undefined)).toBe(MODEL_MAP.haiku);
  });
});

// ─── Task 7.3: Property 10 — Validator notes ────────────────────────────────

describe('runSkillValidation (Property 10)', () => {
  /**
   * Property 10: Skill validator appends notes only on failure
   *
   * For any document and validation config: if all checks pass, output equals input;
   * if any check fails, output is longer than input (notes appended).
   *
   * **Validates: Requirements 6.7, 6.8**
   */
  it('Property 10: appends notes only when checks fail', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 500 }),
        fc.record({
          requiredPatterns: fc.array(
            // Use simple literal patterns to avoid regex syntax issues
            fc.stringMatching(/^[a-zA-Z0-9 ]{1,20}$/),
            { maxLength: 3 }
          ),
        }),
        (doc, validation) => {
          const result = runSkillValidation(doc, validation);

          const allPass = (validation.requiredPatterns || []).every(p => {
            try {
              return new RegExp(p).test(doc);
            } catch {
              return true; // Invalid regex is skipped, counts as pass
            }
          });

          if (allPass) {
            expect(result).toBe(doc); // unchanged
          } else {
            expect(result.length).toBeGreaterThan(doc.length); // notes appended
            expect(result).toContain('⚠️');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns document unchanged when all checks pass', () => {
    const doc = '## 9. API Flows\nhttps://capillarytech.atlassian.net/browse/PSV-123';
    const validation = {
      requiredHeadings: ['## 9\\.'],
      requiredPatterns: ['https://capillarytech\\.atlassian\\.net/'],
    };
    const result = runSkillValidation(doc, validation);
    expect(result).toBe(doc);
  });

  it('appends warning when required heading is missing', () => {
    const doc = 'Some document without the required heading';
    const validation = {
      requiredHeadings: ['## 9\\.'],
    };
    const result = runSkillValidation(doc, validation);
    expect(result).toContain('⚠️');
    expect(result).toContain('Required heading pattern');
    expect(result.length).toBeGreaterThan(doc.length);
  });

  it('appends warning when required pattern is missing', () => {
    const doc = '## 9. API Flows\nNo URLs here';
    const validation = {
      requiredPatterns: ['https://capillarytech\\.atlassian\\.net/'],
    };
    const result = runSkillValidation(doc, validation);
    expect(result).toContain('⚠️');
    expect(result).toContain('Required pattern');
  });

  it('validates JSON fields correctly', () => {
    const validDoc = JSON.stringify({ elements: [1, 2, 3], version: 2 });
    const invalidDoc = JSON.stringify({ version: 2 });
    const notJson = 'not json at all';
    const validation = { requiredJsonFields: ['elements'] };

    expect(runSkillValidation(validDoc, validation)).toBe(validDoc);
    expect(runSkillValidation(invalidDoc, validation)).toContain('Required JSON field');
    expect(runSkillValidation(notJson, validation)).toContain('not valid JSON');
  });

  it('returns document unchanged when validation is null/empty', () => {
    const doc = 'Some document';
    expect(runSkillValidation(doc, null)).toBe(doc);
    expect(runSkillValidation(doc, {})).toBe(doc);
  });
});
