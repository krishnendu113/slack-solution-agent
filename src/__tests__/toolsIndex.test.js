/**
 * toolsIndex.test.js — Unit tests for src/tools/index.js
 *
 * Tests getToolsByIntent() filtering, plan tool definitions,
 * tool-to-category mapping, and plan tool handling in handle().
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getTools, getToolsByIntent } from '../tools/index.js';
import { clearPlans } from '../planManager.js';

beforeEach(() => {
  clearPlans();
  // Reset env vars to a clean state (no Jira/Confluence configured)
  delete process.env.JIRA_BASE_URL;
  delete process.env.JIRA_EMAIL;
  delete process.env.JIRA_API_TOKEN;
  delete process.env.CONFLUENCE_BASE_URL;
  delete process.env.CONFLUENCE_API_TOKEN;
});

// ─── getTools() backward compatibility ────────────────────────────────────────

describe('getTools()', () => {
  it('returns definitions and handle function', () => {
    const { definitions, handle } = getTools();
    expect(Array.isArray(definitions)).toBe(true);
    expect(typeof handle).toBe('function');
  });

  it('always includes skill tools', () => {
    const { definitions } = getTools();
    const names = definitions.map(d => d.name);
    expect(names).toContain('list_skills');
    expect(names).toContain('activate_skill');
  });

  it('does not include plan tools (backward compat)', () => {
    const { definitions } = getTools();
    const names = definitions.map(d => d.name);
    expect(names).not.toContain('create_plan');
    expect(names).not.toContain('update_plan_step');
    expect(names).not.toContain('get_plan');
  });
});

// ─── getToolsByIntent() ───────────────────────────────────────────────────────

describe('getToolsByIntent()', () => {
  it('returns definitions and handle function', () => {
    const { definitions, handle } = getToolsByIntent(['jira']);
    expect(Array.isArray(definitions)).toBe(true);
    expect(typeof handle).toBe('function');
  });

  describe('fallback behaviour (empty/null/undefined tags)', () => {
    it('returns all tools when toolTags is null', () => {
      const { definitions } = getToolsByIntent(null);
      const names = definitions.map(d => d.name);
      // Should include kapa, web search, skills, and plan tools
      expect(names).toContain('search_kapa_docs');
      expect(names).toContain('search_docs_site');
      expect(names).toContain('list_skills');
      expect(names).toContain('activate_skill');
      expect(names).toContain('create_plan');
      expect(names).toContain('update_plan_step');
      expect(names).toContain('get_plan');
    });

    it('returns all tools when toolTags is undefined', () => {
      const { definitions } = getToolsByIntent(undefined);
      const names = definitions.map(d => d.name);
      expect(names).toContain('search_kapa_docs');
      expect(names).toContain('create_plan');
    });

    it('returns all tools when toolTags is empty array', () => {
      const { definitions } = getToolsByIntent([]);
      const names = definitions.map(d => d.name);
      expect(names).toContain('search_kapa_docs');
      expect(names).toContain('search_docs_site');
      expect(names).toContain('create_plan');
    });
  });

  describe('filtering by category tags', () => {
    it('includes only kapa_docs tools plus always-included when tag is kapa_docs', () => {
      const { definitions } = getToolsByIntent(['kapa_docs']);
      const names = definitions.map(d => d.name);
      expect(names).toContain('search_kapa_docs');
      expect(names).toContain('list_skills');
      expect(names).toContain('activate_skill');
      expect(names).toContain('create_plan');
      expect(names).toContain('update_plan_step');
      expect(names).toContain('get_plan');
      // Should NOT include web search or jira/confluence (not configured and not tagged)
      expect(names).not.toContain('search_docs_site');
    });

    it('includes web_search tools when tag is web_search', () => {
      const { definitions } = getToolsByIntent(['web_search']);
      const names = definitions.map(d => d.name);
      expect(names).toContain('search_docs_site');
      expect(names).not.toContain('search_kapa_docs');
    });

    it('includes multiple categories when multiple tags provided', () => {
      const { definitions } = getToolsByIntent(['kapa_docs', 'web_search']);
      const names = definitions.map(d => d.name);
      expect(names).toContain('search_kapa_docs');
      expect(names).toContain('search_docs_site');
      expect(names).toContain('list_skills');
      expect(names).toContain('create_plan');
    });

    it('includes jira tools when jira tag provided and env configured', () => {
      process.env.JIRA_BASE_URL = 'https://test.atlassian.net';
      process.env.JIRA_EMAIL = 'test@test.com';
      process.env.JIRA_API_TOKEN = 'token';

      const { definitions } = getToolsByIntent(['jira']);
      const names = definitions.map(d => d.name);
      expect(names).toContain('get_jira_ticket');
      expect(names).toContain('search_jira');
      expect(names).toContain('add_jira_comment');
    });

    it('excludes jira tools when jira tag provided but env not configured', () => {
      const { definitions } = getToolsByIntent(['jira']);
      const names = definitions.map(d => d.name);
      // Jira tools won't be in allDefinitions since env is not set
      expect(names).not.toContain('get_jira_ticket');
      expect(names).not.toContain('search_jira');
    });

    it('includes confluence tools when confluence tag provided and env configured', () => {
      process.env.CONFLUENCE_BASE_URL = 'https://test.atlassian.net/wiki';
      process.env.JIRA_EMAIL = 'test@test.com';
      process.env.CONFLUENCE_API_TOKEN = 'token';

      const { definitions } = getToolsByIntent(['confluence']);
      const names = definitions.map(d => d.name);
      expect(names).toContain('search_confluence');
      expect(names).toContain('get_confluence_page');
      expect(names).toContain('create_confluence_page');
    });
  });

  describe('always-included tools', () => {
    it('always includes list_skills regardless of tags', () => {
      const { definitions } = getToolsByIntent(['jira']);
      const names = definitions.map(d => d.name);
      expect(names).toContain('list_skills');
    });

    it('always includes activate_skill regardless of tags', () => {
      const { definitions } = getToolsByIntent(['web_search']);
      const names = definitions.map(d => d.name);
      expect(names).toContain('activate_skill');
    });

    it('always includes all three plan tools regardless of tags', () => {
      const { definitions } = getToolsByIntent(['kapa_docs']);
      const names = definitions.map(d => d.name);
      expect(names).toContain('create_plan');
      expect(names).toContain('update_plan_step');
      expect(names).toContain('get_plan');
    });
  });
});

// ─── Plan tool handling in handle() ───────────────────────────────────────────

describe('plan tool handling via handle()', () => {
  it('create_plan returns a valid plan', async () => {
    const { handle } = getToolsByIntent(null);
    const result = JSON.parse(await handle('create_plan', {
      title: 'Test Plan',
      steps: ['Step 1', 'Step 2'],
    }));

    expect(result.planId).toBeDefined();
    expect(result.title).toBe('Test Plan');
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].status).toBe('pending');
  });

  it('create_plan returns validation error for invalid input', async () => {
    const { handle } = getToolsByIntent(null);
    const result = JSON.parse(await handle('create_plan', {
      title: '',
      steps: [],
    }));

    expect(result.error).toBeDefined();
  });

  it('get_plan returns the created plan', async () => {
    const { handle } = getToolsByIntent(null);
    const created = JSON.parse(await handle('create_plan', {
      title: 'My Plan',
      steps: ['Do something'],
    }));

    const retrieved = JSON.parse(await handle('get_plan', {
      planId: created.planId,
    }));

    expect(retrieved.planId).toBe(created.planId);
    expect(retrieved.title).toBe('My Plan');
  });

  it('get_plan returns error for non-existent plan', async () => {
    const { handle } = getToolsByIntent(null);
    const result = JSON.parse(await handle('get_plan', {
      planId: 'nonexistent-id',
    }));

    expect(result.error).toContain('Plan not found');
  });

  it('update_plan_step updates the step status', async () => {
    const { handle } = getToolsByIntent(null);
    const created = JSON.parse(await handle('create_plan', {
      title: 'Plan',
      steps: ['Step A', 'Step B'],
    }));

    const updated = JSON.parse(await handle('update_plan_step', {
      planId: created.planId,
      stepIndex: 0,
      status: 'completed',
    }));

    expect(updated.steps[0].status).toBe('completed');
    expect(updated.steps[1].status).toBe('pending');
  });

  it('update_plan_step returns error for invalid plan', async () => {
    const { handle } = getToolsByIntent(null);
    const result = JSON.parse(await handle('update_plan_step', {
      planId: 'bad-id',
      stepIndex: 0,
      status: 'completed',
    }));

    expect(result.error).toContain('Plan not found');
  });

  it('handle returns unknown tool message for unrecognised names', async () => {
    const { handle } = getToolsByIntent(null);
    const result = await handle('nonexistent_tool', {});
    expect(result).toBe('Unknown tool: nonexistent_tool');
  });

  it('plan tools work via getTools() handle as well', async () => {
    const { handle } = getTools();
    const result = JSON.parse(await handle('create_plan', {
      title: 'Via getTools',
      steps: ['Step 1'],
    }));

    expect(result.planId).toBeDefined();
    expect(result.title).toBe('Via getTools');
  });
});
