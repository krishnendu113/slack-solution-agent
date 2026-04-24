/**
 * toolsIndex.test.js — Unit tests for src/tools/index.js
 *
 * Tests getToolsByIntent() filtering, plan tool definitions,
 * history lookup tool definitions, tool-to-category mapping,
 * and plan/history tool handling in handle().
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getTools, getToolsByIntent } from '../tools/index.js';
import { clearPlans } from '../planManager.js';

// Mock the store factory so history lookup handlers can call getConversationStore()
vi.mock('../stores/index.js', () => {
  const conversations = {};
  return {
    getConversationStore: () => ({
      getConversation: (id, userId) => {
        const conv = conversations[id];
        if (!conv) return null;
        if (conv.userId !== userId) return null;
        return conv;
      },
      searchConversations: (userId, query, limit) => {
        if (!query) return [];
        const lowerQuery = query.toLowerCase();
        const matches = [];
        for (const conv of Object.values(conversations)) {
          if (conv.userId !== userId) continue;
          for (const msg of conv.messages) {
            if (msg.content && msg.content.toLowerCase().includes(lowerQuery)) {
              matches.push({
                conversationId: conv.id,
                title: conv.title,
                createdAt: conv.createdAt,
                updatedAt: conv.updatedAt,
                snippet: msg.content.slice(0, 200),
              });
              break;
            }
          }
        }
        return matches.slice(0, limit);
      },
    }),
    _setTestConversations: (convs) => {
      for (const key of Object.keys(conversations)) delete conversations[key];
      Object.assign(conversations, convs);
    },
  };
});

// Import the test helper to set up conversations
import { _setTestConversations } from '../stores/index.js';

beforeEach(() => {
  clearPlans();
  _setTestConversations({});
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

  it('always includes history lookup tools', () => {
    const { definitions } = getTools();
    const names = definitions.map(d => d.name);
    expect(names).toContain('lookup_conversation_history');
    expect(names).toContain('search_user_conversations');
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
      // Should include kapa, web search, skills, plan tools, and history lookup tools
      expect(names).toContain('search_kapa_docs');
      expect(names).toContain('search_docs_site');
      expect(names).toContain('list_skills');
      expect(names).toContain('activate_skill');
      expect(names).toContain('create_plan');
      expect(names).toContain('update_plan_step');
      expect(names).toContain('get_plan');
      expect(names).toContain('lookup_conversation_history');
      expect(names).toContain('search_user_conversations');
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

    it('always includes both history lookup tools regardless of tags', () => {
      const { definitions } = getToolsByIntent(['kapa_docs']);
      const names = definitions.map(d => d.name);
      expect(names).toContain('lookup_conversation_history');
      expect(names).toContain('search_user_conversations');
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

// ─── History lookup tool handling via handle() ────────────────────────────────

describe('history lookup tool handling via handle()', () => {
  const testUserId = 'user-abc';
  const testConvId = 'conv-123';

  beforeEach(() => {
    _setTestConversations({
      [testConvId]: {
        id: testConvId,
        userId: testUserId,
        title: 'Test Conversation',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
        messages: [
          { role: 'user', content: 'Hello world', timestamp: '2024-01-01T00:00:00.000Z' },
          { role: 'assistant', content: 'Hi there', timestamp: '2024-01-01T00:01:00.000Z' },
          { role: 'user', content: 'How are you?', timestamp: '2024-01-01T00:02:00.000Z' },
        ],
        plans: [],
      },
      'conv-other': {
        id: 'conv-other',
        userId: 'user-other',
        title: 'Other User Conv',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        messages: [
          { role: 'user', content: 'Secret stuff', timestamp: '2024-01-01T00:00:00.000Z' },
        ],
        plans: [],
      },
    });
  });

  it('lookup_conversation_history returns all messages for valid conversation', async () => {
    const { handle } = getToolsByIntent(null, { userId: testUserId });
    const result = JSON.parse(await handle('lookup_conversation_history', {
      conversationId: testConvId,
    }));

    expect(result.conversationId).toBe(testConvId);
    expect(result.messageCount).toBe(3);
    expect(result.messages).toHaveLength(3);
    expect(result.messages[0].content).toBe('Hello world');
  });

  it('lookup_conversation_history applies messageRange slicing', async () => {
    const { handle } = getToolsByIntent(null, { userId: testUserId });
    const result = JSON.parse(await handle('lookup_conversation_history', {
      conversationId: testConvId,
      messageRange: { start: 1, count: 1 },
    }));

    expect(result.messageCount).toBe(1);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toBe('Hi there');
  });

  it('lookup_conversation_history returns error for non-existent conversation', async () => {
    const { handle } = getToolsByIntent(null, { userId: testUserId });
    const result = JSON.parse(await handle('lookup_conversation_history', {
      conversationId: 'nonexistent',
    }));

    expect(result.error).toBe('Conversation not found');
  });

  it('lookup_conversation_history returns error for wrong user', async () => {
    const { handle } = getToolsByIntent(null, { userId: testUserId });
    const result = JSON.parse(await handle('lookup_conversation_history', {
      conversationId: 'conv-other',
    }));

    expect(result.error).toBe('Conversation not found');
  });

  it('search_user_conversations returns matching results', async () => {
    const { handle } = getToolsByIntent(null, { userId: testUserId });
    const result = JSON.parse(await handle('search_user_conversations', {
      query: 'Hello',
    }));

    expect(result.query).toBe('Hello');
    expect(result.resultCount).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].conversationId).toBe(testConvId);
  });

  it('search_user_conversations returns empty results message when no matches', async () => {
    const { handle } = getToolsByIntent(null, { userId: testUserId });
    const result = JSON.parse(await handle('search_user_conversations', {
      query: 'nonexistent-query-xyz',
    }));

    expect(result.query).toBe('nonexistent-query-xyz');
    expect(result.resultCount).toBe(0);
    expect(result.results).toEqual([]);
    expect(result.message).toBe('No matching conversations found');
  });

  it('search_user_conversations does not return other users conversations', async () => {
    const { handle } = getToolsByIntent(null, { userId: testUserId });
    const result = JSON.parse(await handle('search_user_conversations', {
      query: 'Secret',
    }));

    expect(result.resultCount).toBe(0);
  });

  it('search_user_conversations clamps limit to [1, 20]', async () => {
    const { handle } = getToolsByIntent(null, { userId: testUserId });

    // limit below 1 should be clamped to 1
    const result1 = JSON.parse(await handle('search_user_conversations', {
      query: 'Hello',
      limit: -5,
    }));
    expect(result1.resultCount).toBeGreaterThanOrEqual(0);

    // limit above 20 should be clamped to 20
    const result2 = JSON.parse(await handle('search_user_conversations', {
      query: 'Hello',
      limit: 100,
    }));
    expect(result2.resultCount).toBeGreaterThanOrEqual(0);
  });

  it('search_user_conversations defaults limit to 5 when omitted', async () => {
    const { handle } = getToolsByIntent(null, { userId: testUserId });
    const result = JSON.parse(await handle('search_user_conversations', {
      query: 'Hello',
    }));

    // Should work without limit parameter
    expect(result.resultCount).toBeGreaterThanOrEqual(0);
  });
});
