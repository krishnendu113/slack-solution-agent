/**
 * planManager.test.js — Unit tests for src/planManager.js
 *
 * Tests the plan manager's CRUD operations, validation logic,
 * and error handling for invalid inputs.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createPlan,
  updatePlanStep,
  getPlan,
  getAllPlans,
  clearPlans,
} from '../planManager.js';

beforeEach(() => {
  clearPlans();
});

// ─── createPlan ──────────────────────────────────────────────────────────────

describe('createPlan', () => {
  it('creates a plan with all required fields', () => {
    const result = createPlan('My Plan', ['Step 1', 'Step 2']);

    expect(result.planId).toBeDefined();
    expect(result.title).toBe('My Plan');
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]).toEqual({ description: 'Step 1', status: 'pending' });
    expect(result.steps[1]).toEqual({ description: 'Step 2', status: 'pending' });
    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();
  });

  it('initialises all steps to pending status', () => {
    const result = createPlan('Plan', ['A', 'B', 'C']);

    expect(result.steps.every(s => s.status === 'pending')).toBe(true);
  });

  it('generates a unique planId', () => {
    const plan1 = createPlan('Plan 1', ['Step']);
    const plan2 = createPlan('Plan 2', ['Step']);

    expect(plan1.planId).not.toBe(plan2.planId);
  });

  it('stores the plan in the internal map', () => {
    const plan = createPlan('Plan', ['Step']);
    const retrieved = getPlan(plan.planId);

    expect(retrieved).not.toBeNull();
    expect(retrieved.planId).toBe(plan.planId);
  });

  it('returns validation error for empty title', () => {
    const result = createPlan('', ['Step']);
    expect(result).toEqual({
      error: 'Validation error: title and steps are required and must be non-empty',
    });
  });

  it('returns validation error for whitespace-only title', () => {
    const result = createPlan('   ', ['Step']);
    expect(result).toEqual({
      error: 'Validation error: title and steps are required and must be non-empty',
    });
  });

  it('returns validation error for non-string title', () => {
    const result = createPlan(123, ['Step']);
    expect(result).toEqual({
      error: 'Validation error: title and steps are required and must be non-empty',
    });
  });

  it('returns validation error for empty steps array', () => {
    const result = createPlan('Plan', []);
    expect(result).toEqual({
      error: 'Validation error: title and steps are required and must be non-empty',
    });
  });

  it('returns validation error for non-array steps', () => {
    const result = createPlan('Plan', 'not an array');
    expect(result).toEqual({
      error: 'Validation error: title and steps are required and must be non-empty',
    });
  });

  it('returns validation error for steps containing non-strings', () => {
    const result = createPlan('Plan', [123, 'valid']);
    expect(result).toEqual({
      error: 'Validation error: title and steps are required and must be non-empty',
    });
  });

  it('does not store a plan when validation fails', () => {
    createPlan('', []);
    expect(getAllPlans()).toHaveLength(0);
  });
});

// ─── updatePlanStep ──────────────────────────────────────────────────────────

describe('updatePlanStep', () => {
  it('updates a step status and returns the updated plan', () => {
    const plan = createPlan('Plan', ['Step 1', 'Step 2']);
    const result = updatePlanStep(plan.planId, 0, 'in_progress');

    expect(result.steps[0].status).toBe('in_progress');
    expect(result.steps[1].status).toBe('pending');
  });

  it('updates the updatedAt timestamp', () => {
    const plan = createPlan('Plan', ['Step']);
    const originalUpdatedAt = plan.updatedAt;

    // Small delay to ensure timestamp differs
    const result = updatePlanStep(plan.planId, 0, 'completed');
    expect(new Date(result.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(originalUpdatedAt).getTime()
    );
  });

  it('allows all valid status values', () => {
    const plan = createPlan('Plan', ['S1', 'S2', 'S3', 'S4']);

    updatePlanStep(plan.planId, 0, 'pending');
    updatePlanStep(plan.planId, 1, 'in_progress');
    updatePlanStep(plan.planId, 2, 'completed');
    updatePlanStep(plan.planId, 3, 'skipped');

    const updated = getPlan(plan.planId);
    expect(updated.steps[0].status).toBe('pending');
    expect(updated.steps[1].status).toBe('in_progress');
    expect(updated.steps[2].status).toBe('completed');
    expect(updated.steps[3].status).toBe('skipped');
  });

  it('returns error for non-existent planId', () => {
    const result = updatePlanStep('nonexistent', 0, 'completed');
    expect(result).toEqual({ error: 'Plan not found: nonexistent' });
  });

  it('returns error for out-of-bounds step index (too high)', () => {
    const plan = createPlan('Plan', ['Step 1']);
    const result = updatePlanStep(plan.planId, 5, 'completed');
    expect(result).toEqual({ error: 'Step index 5 out of bounds (plan has 1 steps)' });
  });

  it('returns error for negative step index', () => {
    const plan = createPlan('Plan', ['Step 1']);
    const result = updatePlanStep(plan.planId, -1, 'completed');
    expect(result).toEqual({ error: 'Step index -1 out of bounds (plan has 1 steps)' });
  });

  it('returns error for non-integer step index', () => {
    const plan = createPlan('Plan', ['Step 1']);
    const result = updatePlanStep(plan.planId, 0.5, 'completed');
    expect(result).toEqual({ error: 'Step index 0.5 out of bounds (plan has 1 steps)' });
  });

  it('returns error for invalid status', () => {
    const plan = createPlan('Plan', ['Step 1']);
    const result = updatePlanStep(plan.planId, 0, 'invalid');
    expect(result).toEqual({
      error: 'Invalid status: invalid. Must be one of: pending, in_progress, completed, skipped',
    });
  });
});

// ─── getPlan ─────────────────────────────────────────────────────────────────

describe('getPlan', () => {
  it('returns the plan for a valid planId', () => {
    const plan = createPlan('Plan', ['Step']);
    const result = getPlan(plan.planId);

    expect(result).not.toBeNull();
    expect(result.planId).toBe(plan.planId);
    expect(result.title).toBe('Plan');
  });

  it('returns null for a non-existent planId', () => {
    expect(getPlan('nonexistent')).toBeNull();
  });
});

// ─── getAllPlans ──────────────────────────────────────────────────────────────

describe('getAllPlans', () => {
  it('returns an empty array when no plans exist', () => {
    expect(getAllPlans()).toEqual([]);
  });

  it('returns all created plans', () => {
    createPlan('Plan 1', ['Step']);
    createPlan('Plan 2', ['Step']);
    createPlan('Plan 3', ['Step']);

    expect(getAllPlans()).toHaveLength(3);
  });
});

// ─── clearPlans ──────────────────────────────────────────────────────────────

describe('clearPlans', () => {
  it('removes all plans', () => {
    createPlan('Plan 1', ['Step']);
    createPlan('Plan 2', ['Step']);

    clearPlans();
    expect(getAllPlans()).toEqual([]);
  });
});
