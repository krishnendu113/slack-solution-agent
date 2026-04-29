/**
 * skillLoading.prop.test.js — Property-based tests for src/skillLoader.js
 *
 * Uses fast-check to verify skill catalogue completeness/compactness
 * and skill loading respects intent classification.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { getSkillCatalogue, loadSkillsForProblem, listSkills } from '../skillLoader.js';

// ─── Property 12: Skill catalogue completeness and compactness ───────────────

// Feature: platform-persistence-and-efficiency, Property 12: Skill catalogue completeness and compactness
describe('Property 12: Skill catalogue completeness and compactness', () => {
  // **Validates: Requirements 8.1, 8.3**

  it('catalogue contains ID and description of every skill, does NOT contain full SKILL.md content', () => {
    const skills = listSkills();
    const catalogue = getSkillCatalogue();

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: skills.length - 1 }),
        (skillIndex) => {
          const skill = skills[skillIndex];

          // (a) Catalogue contains the skill ID
          expect(catalogue).toContain(skill.id);

          // (a) Catalogue contains the skill description
          expect(catalogue).toContain(skill.description);

          // (b) Does NOT contain full SKILL.md content markers
          expect(catalogue).not.toContain(`## ═══ ACTIVE SKILL:`);
          expect(catalogue).not.toContain(`## ═══ END SKILL:`);
          expect(catalogue).not.toContain('### [SKILL.md]');

          // Catalogue should be compact — no long content blocks
          // Each line should be reasonably short (metadata only)
          const lines = catalogue.split('\n');
          for (const line of lines) {
            // No single line should be excessively long (SKILL.md content would be)
            expect(line.length).toBeLessThan(500);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 10: Skill loading respects intent classification ───────────────

// Feature: platform-persistence-and-efficiency, Property 10: Skill loading respects intent classification
describe('Property 10: Skill loading respects intent classification', () => {
  // **Validates: Requirements 6.2, 6.3, 6.4**

  // Get the non-alwaysLoad skill IDs from the real registry
  const allSkills = listSkills();
  const nonAlwaysLoadIds = allSkills.filter(s => !s.alwaysLoad).map(s => s.id);
  const alwaysLoadIds = allSkills.filter(s => s.alwaysLoad).map(s => s.id);

  // Generate random semantic match subsets from non-alwaysLoad skills
  const arbSemanticMatches = fc.subarray(nonAlwaysLoadIds, { minLength: 0 }).map(ids =>
    ids.map(id => ({ id, reason: `Test reason for ${id}` })),
  );

  it('loaded skills equal union of intent-identified skills + alwaysLoad skills + conditionally loaded cr-evaluator', async () => {
    await fc.assert(
      fc.asyncProperty(arbSemanticMatches, async (semanticMatches) => {
        const result = await loadSkillsForProblem(
          'test problem text that does not match any keyword triggers',
          semanticMatches,
        );

        // Expected: alwaysLoad skills + semantic matches + cr-evaluator (conditionally loaded when classificationType is null)
        const expectedIds = new Set([
          ...alwaysLoadIds,
          ...semanticMatches.map(m => m.id),
          'cr-evaluator', // conditionally loaded because classificationType defaults to null
        ]);

        const resultIdSet = new Set(result.skillIds);

        // Every expected skill should be loaded
        for (const id of expectedIds) {
          expect(resultIdSet.has(id)).toBe(true);
        }

        // No unexpected skills should be loaded
        for (const id of result.skillIds) {
          expect(expectedIds.has(id)).toBe(true);
        }

        // Total count matches
        expect(result.skillIds.length).toBe(expectedIds.size);
      }),
      { numRuns: 100 },
    );
  });
});
