/**
 * planManager.js — Agent planning tools
 *
 * Manages structured plans that let the agent decompose complex requests
 * into trackable step-by-step plans. Plans are stored in a module-level
 * Map and can be persisted via the store interface's savePlanState().
 *
 * Works with either store backend (plans persisted via store interface's savePlanState).
 */

import crypto from 'crypto';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Valid step status values. */
const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'skipped'];

// ─── State ───────────────────────────────────────────────────────────────────

/** @type {Map<string, Plan>} */
const plans = new Map();

// ─── Types (JSDoc) ───────────────────────────────────────────────────────────

/**
 * @typedef {Object} PlanStep
 * @property {string} description
 * @property {'pending'|'in_progress'|'completed'|'skipped'} status
 */

/**
 * @typedef {Object} Plan
 * @property {string} planId
 * @property {string} title
 * @property {PlanStep[]} steps
 * @property {string} createdAt
 * @property {string} updatedAt
 */

// ─── createPlan ──────────────────────────────────────────────────────────────

/**
 * Creates a new plan with the given title and steps.
 *
 * Validates that `title` is a non-empty string (not just whitespace) and
 * `steps` is a non-empty array of strings. On validation failure, returns
 * an object with an `error` field. On success, returns the new plan object
 * with all steps initialised to `pending`.
 *
 * @param {string} title - Plan title describing the overall goal
 * @param {string[]} steps - Ordered list of step descriptions
 * @returns {Plan | {error: string}}
 */
export function createPlan(title, steps) {
  if (
    typeof title !== 'string' ||
    title.trim() === '' ||
    !Array.isArray(steps) ||
    steps.length === 0 ||
    !steps.every(s => typeof s === 'string')
  ) {
    return { error: 'Validation error: title and steps are required and must be non-empty' };
  }

  const planId = crypto.randomUUID();
  const now = new Date().toISOString();

  /** @type {Plan} */
  const plan = {
    planId,
    title,
    steps: steps.map(description => ({ description, status: 'pending' })),
    createdAt: now,
    updatedAt: now,
  };

  plans.set(planId, plan);
  console.log(`[planManager] Created plan "${title}" (${planId}) with ${steps.length} steps`);

  return plan;
}

// ─── updatePlanStep ──────────────────────────────────────────────────────────

/**
 * Updates the status of a specific step in a plan.
 *
 * Validates that the plan exists, the step index is in bounds, and the
 * status is one of the valid values. Returns an error object on validation
 * failure, or the updated plan on success.
 *
 * @param {string} planId - Plan ID returned by createPlan
 * @param {number} stepIndex - Zero-based index of the step to update
 * @param {string} status - New status value
 * @returns {Plan | {error: string}}
 */
export function updatePlanStep(planId, stepIndex, status) {
  const plan = plans.get(planId);

  if (!plan) {
    return { error: `Plan not found: ${planId}` };
  }

  if (
    typeof stepIndex !== 'number' ||
    !Number.isInteger(stepIndex) ||
    stepIndex < 0 ||
    stepIndex >= plan.steps.length
  ) {
    return { error: `Step index ${stepIndex} out of bounds (plan has ${plan.steps.length} steps)` };
  }

  if (!VALID_STATUSES.includes(status)) {
    return { error: `Invalid status: ${status}. Must be one of: ${VALID_STATUSES.join(', ')}` };
  }

  plan.steps[stepIndex].status = status;
  plan.updatedAt = new Date().toISOString();

  console.log(`[planManager] Updated plan ${planId} step ${stepIndex} → ${status}`);

  return plan;
}

// ─── getPlan ─────────────────────────────────────────────────────────────────

/**
 * Retrieves a plan by its ID.
 *
 * @param {string} planId - Plan ID to retrieve
 * @returns {Plan | null}
 */
export function getPlan(planId) {
  return plans.get(planId) ?? null;
}

// ─── getAllPlans ──────────────────────────────────────────────────────────────

/**
 * Returns an array of all plans.
 *
 * @returns {Plan[]}
 */
export function getAllPlans() {
  return Array.from(plans.values());
}

// ─── clearPlans ──────────────────────────────────────────────────────────────

/**
 * Clears all plans from the in-memory store.
 * Useful for testing and reset scenarios.
 */
export function clearPlans() {
  plans.clear();
  console.log('[planManager] All plans cleared');
}
