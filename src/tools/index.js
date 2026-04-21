/**
 * tools/index.js
 *
 * Tool registry aggregator. Call getTools() to get all active tool
 * definitions and a unified handle() dispatcher, ready to pass to
 * the Anthropic SDK and the agentic loop.
 *
 * Tool availability is determined by env vars at call time:
 *   - Jira:       JIRA_BASE_URL + JIRA_EMAIL + JIRA_API_TOKEN
 *   - Confluence: CONFLUENCE_BASE_URL + JIRA_EMAIL + CONFLUENCE_API_TOKEN
 *   - Kapa docs:  CAPILLARY_DOCS_MCP_URL (optional; degrades gracefully if absent)
 *   - Web search: always enabled (reads WEB_SEARCH_SITEMAP_URL or default)
 *   - Skills:     always enabled (loaded from skills/)
 */

import { jiraDefinitions, handleJiraTool } from './jira.js';
import { confluenceDefinitions, handleConfluenceTool } from './confluence.js';
import { kapaDefinitions, handleKapaTool } from './kapa.js';
import { webSearchDefinitions, handleWebSearchTool } from './webSearch.js';
import { loadSkill, listSkills } from '../skillLoader.js';

// ─── Skill Tool Definitions ───────────────────────────────────────────────────

const SKILL_DEFINITIONS = [
  {
    name: 'list_skills',
    description: 'List all available specialist skills for structured deliverables (SDDs, gap analyses, diagrams).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'activate_skill',
    description: 'Activate a specialist skill to get detailed instructions for producing a structured deliverable. Use for SDDs, gap analyses, or architecture diagrams.',
    input_schema: {
      type: 'object',
      properties: {
        skill_id: { type: 'string', description: 'Skill ID, e.g. capillary-sdd-writer, solution-gap-analyzer, excalidraw-diagram' },
      },
      required: ['skill_id'],
    },
  },
];

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Returns the active tool set based on current env configuration.
 *
 * @returns {{ definitions: object[], handle: (name: string, input: object) => Promise<string> }}
 */
export function getTools() {
  const jiraOk = !!(process.env.JIRA_BASE_URL && process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN);
  const confOk = !!(process.env.CONFLUENCE_BASE_URL && process.env.JIRA_EMAIL && process.env.CONFLUENCE_API_TOKEN);

  const definitions = [
    ...(jiraOk ? jiraDefinitions : []),
    ...(confOk ? confluenceDefinitions : []),
    ...kapaDefinitions,
    ...webSearchDefinitions,
    ...SKILL_DEFINITIONS,
  ];

  /**
   * Unified tool dispatcher. Routes by tool name to the appropriate handler.
   * Always returns a string (JSON or plain text). Never throws.
   */
  async function handle(name, input) {
    // Jira
    if (name === 'get_jira_ticket' || name === 'search_jira' || name === 'add_jira_comment') {
      return handleJiraTool(name, input);
    }
    // Confluence
    if (name === 'search_confluence' || name === 'get_confluence_page' || name === 'create_confluence_page') {
      return handleConfluenceTool(name, input);
    }
    // Kapa docs
    if (name === 'search_kapa_docs') {
      return handleKapaTool(name, input);
    }
    // Web / sitemap search
    if (name === 'search_docs_site') {
      return handleWebSearchTool(name, input);
    }
    // Skills
    if (name === 'list_skills') {
      return JSON.stringify(listSkills(), null, 2);
    }
    if (name === 'activate_skill') {
      try {
        const prompt = await loadSkill(input.skill_id);
        return `Skill "${input.skill_id}" activated. Follow these instructions precisely:\n\n${prompt}`;
      } catch (err) {
        return `Failed to load skill: ${err.message}. Use list_skills to see available skills.`;
      }
    }

    return `Unknown tool: ${name}`;
  }

  return { definitions, handle };
}

/**
 * Logs which tools are active to the console.
 * Call once at startup after env is loaded.
 */
export function logToolStatus() {
  const jiraOk = !!(process.env.JIRA_BASE_URL && process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN);
  const confOk = !!(process.env.CONFLUENCE_BASE_URL && process.env.JIRA_EMAIL && process.env.CONFLUENCE_API_TOKEN);
  const kapaOk = !!process.env.CAPILLARY_DOCS_MCP_URL;
  const webOk = true; // always enabled

  console.log(`  ${jiraOk ? '✓' : '✗'} Jira     ${confOk ? '✓' : '✗'} Confluence  ${kapaOk ? '✓' : '✗'} Kapa Docs  ${webOk ? '✓' : '✗'} Web Search`);
}
