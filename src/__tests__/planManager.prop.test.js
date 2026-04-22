/**
 * planManager.prop.test.js — Property-based tests for src/planManager.js
 *
 * Uses fast-check to verify universal properties of the plan manager.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import {
  createPlan,
  updatePlanStep,
  getPlan,
  clearPlans,
  getAllPlans,
} from '../planManager.js';

beforeEach(() => {
  clearPlans();
});

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const arbTitle = fc.string({ minLength: 1, maxLength: 80 }).filter(s => s.trim().length > 0);

const arbStep = fc.string({ minLength: 1, maxLength: 100 }).filter(s => typeof s === 'string');

const arbSteps = fc.array(arbStep, { minLength: 1, maxLength: 15 });

const arbStatus = fc.constantFrom('pending', 'in_progress', 'completed', 'skipped');

// ─── Property 13: Plan update isolation ──────────────────────────────────────

// Feature: platform-persistence-and-efficiency, Property 13: Plan update isolation
describe('Property 13: Plan update isolation', () => {
  // **Validates: Requirements 9.2**

  it('updating step I to status S changes only step I, all others unchanged', () => {
    fc.assert(
      fc.property(arbTitle, arbSteps, arbStatus, (title, steps, status) => {
        clearPlans();

        const plan = createPlan(title, steps);
        // Ensure plan was created successfully (not a validation error)
        fc.pre(!plan.error);

        const N = plan.steps.length;

        // Pick a random valid step index
        const stepIndex = Math.floor(Math.random() * N);

        // Capture step statuses before update
        const beforeStatuses = plan.steps.map(s => s.status);
        const beforeDescriptions = plan.steps.map(s => s.description);

        // Perform update
        const updated = updatePlanStep(plan.planId, stepIndex, status);
        fc.pre(!updated.error);

        // Step I should have the new status
        expect(updated.steps[stepIndex].status).toBe(status);

        // All other steps should be unchanged
        for (let j = 0; j < N; j++) {
          if (j !== stepIndex) {
            expect(updated.steps[j].status).toBe(beforeStatuses[j]);
          }
          // Descriptions should never change
          expect(updated.steps[j].description).toBe(beforeDescriptions[j]);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 14: Plan create-get round-trip ─────────────────────────────────

// Feature: platform-persistence-and-efficiency, Property 14: Plan create-get round-trip
describe('Property 14: Plan create-get round-trip', () => {
  // **Validates: Requirements 9.1, 9.3**

  it('create a plan, call getPlan — title matches, steps match, all statuses pending', () => {
    fc.assert(
      fc.property(arbTitle, arbSteps, (title, steps) => {
        clearPlans();

        const created = createPlan(title, steps);
        fc.pre(!created.error);

        const retrieved = getPlan(created.planId);

        // Plan should exist
        expect(retrieved).not.toBeNull();

        // Title matches
        expect(retrieved.title).toBe(title);

        // Steps match input descriptions
        expect(retrieved.steps).toHaveLength(steps.length);
        for (let i = 0; i < steps.length; i++) {
          expect(retrieved.steps[i].description).toBe(steps[i]);
        }

        // All statuses are 'pending'
        for (const step of retrieved.steps) {
          expect(step.status).toBe('pending');
        }

        // planId, createdAt, updatedAt should be present
        expect(retrieved.planId).toBe(created.planId);
        expect(retrieved.createdAt).toBeDefined();
        expect(retrieved.updatedAt).toBeDefined();
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 15: Plan input validation ──────────────────────────────────────

// Feature: platform-persistence-and-efficiency, Property 15: Plan input validation
describe('Property 15: Plan input validation', () => {
  // **Validates: Requirements 9.8**

  it('empty/whitespace title → error returned, no plan created', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('', ' ', '  ', '\t', '\n', '   \t\n  '),
        arbSteps,
        (badTitle, steps) => {
          clearPlans();

          const result = createPlan(badTitle, steps);

          // Should return an error
          expect(result.error).toBeDefined();

          // No plan should have been created
          expect(getAllPlans()).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('empty steps array → error returned, no plan created', () => {
    fc.assert(
      fc.property(arbTitle, (title) => {
        clearPlans();

        const result = createPlan(title, []);

        // Should return an error
        expect(result.error).toBeDefined();

        // No plan should have been created
        expect(getAllPlans()).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });
});
