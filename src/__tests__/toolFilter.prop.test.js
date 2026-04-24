/**
 * toolFilter.prop.test.js — Property-based tests for src/tools/index.js
 *
 * Uses fast-check to verify tool filtering respects tags and always includes meta-tools.
 */

// Feature: platform-persistence-and-efficiency, Property 9: Tool filtering respects tags and always includes meta-tools

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { getToolsByIntent } from '../tools/index.js';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Tool-to-category mapping matching src/tools/index.js TOOL_CATEGORY_MAP */
const TOOL_CATEGORY_MAP = {
  jira: ['get_jira_ticket', 'search_jira', 'add_jira_comment'],
  confluence: ['search_confluence', 'get_confluence_page', 'create_confluence_page'],
  kapa_docs: ['search_kapa_docs'],
  web_search: ['search_docs_site'],
};

/** Tools that must always be present regardless of tags */
const ALWAYS_INCLUDED = new Set([
  'list_skills',
  'activate_skill',
  'create_plan',
  'update_plan_step',
  'get_plan',
  'lookup_conversation_history',
  'search_user_conversations',
]);

// ─── Property 9 ──────────────────────────────────────────────────────────────

describe('Property 9: Tool filtering respects tags and always includes meta-tools', () => {
  // **Validates: Requirements 5.2, 5.3, 9.7, 10.7**

  beforeEach(() => {
    // Set env vars so jira and confluence tools are available in allDefinitions
    process.env.JIRA_BASE_URL = 'https://test.atlassian.net';
    process.env.JIRA_EMAIL = 'test@test.com';
    process.env.JIRA_API_TOKEN = 'test-token';
    process.env.CONFLUENCE_BASE_URL = 'https://test.atlassian.net/wiki';
    process.env.CONFLUENCE_API_TOKEN = 'test-token';
  });

  // Generate random non-empty subsets of valid tool tags
  const arbTagSubset = fc.subarray(
    ['jira', 'confluence', 'kapa_docs', 'web_search'],
    { minLength: 1 },
  );

  it('for any non-empty tag subset: non-meta tools belong to tagged categories, meta-tools always present', () => {
    fc.assert(
      fc.property(arbTagSubset, (tags) => {
        const { definitions } = getToolsByIntent(tags);
        const names = definitions.map(d => d.name);
        const nameSet = new Set(names);

        // Build the set of tool names allowed by the provided tags
        const allowedByTags = new Set();
        for (const tag of tags) {
          const toolNames = TOOL_CATEGORY_MAP[tag];
          if (toolNames) {
            for (const name of toolNames) allowedByTags.add(name);
          }
        }

        // (a) Every non-meta tool belongs to a tagged category
        for (const name of names) {
          if (!ALWAYS_INCLUDED.has(name)) {
            expect(allowedByTags.has(name)).toBe(true);
          }
        }

        // (b) list_skills and activate_skill always present
        expect(nameSet.has('list_skills')).toBe(true);
        expect(nameSet.has('activate_skill')).toBe(true);

        // (c) create_plan, update_plan_step, get_plan always present
        expect(nameSet.has('create_plan')).toBe(true);
        expect(nameSet.has('update_plan_step')).toBe(true);
        expect(nameSet.has('get_plan')).toBe(true);

        // (d) lookup_conversation_history and search_user_conversations always present
        expect(nameSet.has('lookup_conversation_history')).toBe(true);
        expect(nameSet.has('search_user_conversations')).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
