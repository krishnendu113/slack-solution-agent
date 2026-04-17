import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const SKILLS_DIR = path.join(__dirname, '../skills');
const TEXT_EXTENSIONS = new Set(['.md', '.txt', '.json', '.jsonl']);

// Lazy-load registry so tests can mock it
let _registry = null;
function getRegistry() {
  if (!_registry) {
    _registry = require(path.join(SKILLS_DIR, 'registry.json'));
  }
  return _registry;
}

/**
 * Recursively collects all readable text files from a skill folder.
 * SKILL.md is always returned first regardless of alphabetical order.
 * Subfolders (e.g. references/) are included with relative path labels.
 *
 * @param {string} dirPath - Absolute path to the skill folder
 * @param {string} prefix  - Relative path prefix for nested files
 * @returns {Promise<Array<{label: string, fullPath: string}>>}
 */
async function collectSkillFiles(dirPath, prefix = '') {
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const fullPath = path.join(dirPath, entry.name);
    const label = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      const nested = await collectSkillFiles(fullPath, label);
      files.push(...nested);
    } else if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push({ label, fullPath });
    }
  }

  // SKILL.md always first
  return [
    ...files.filter(f => f.label === 'SKILL.md'),
    ...files.filter(f => f.label !== 'SKILL.md'),
  ];
}

/**
 * Loads all files from a skill folder and assembles them into
 * a single prompt-ready string block, with clear file separators.
 *
 * @param {string} skillId - ID matching skills/registry.json
 * @returns {Promise<string>} Assembled skill prompt block
 */
export async function loadSkill(skillId) {
  const registry = getRegistry();
  const skill = registry.skills.find(s => s.id === skillId);
  if (!skill) throw new Error(`Unknown skill: "${skillId}". Check skills/registry.json.`);

  const folderPath = path.join(SKILLS_DIR, skill.folder);
  const allFiles = await collectSkillFiles(folderPath);

  if (!allFiles.length) {
    throw new Error(`Skill folder empty or not found: ${folderPath}`);
  }

  const sections = await Promise.all(
    allFiles.map(async ({ label, fullPath }) => {
      const content = await fs.readFile(fullPath, 'utf-8');
      return `### [${label}]\n\n${content.trim()}`;
    })
  );

  return [
    `## ═══ ACTIVE SKILL: ${skill.id} ═══`,
    `> ${skill.description}`,
    '',
    sections.join('\n\n---\n\n'),
    `## ═══ END SKILL: ${skill.id} ═══`,
  ].join('\n');
}

/**
 * Detects which skills are relevant based on the problem text
 * using keyword matching against skills/registry.json triggers.
 *
 * @param {string} text - Problem statement or Jira ticket text
 * @returns {Array} Matched skill registry entries
 */
export function detectSkills(text) {
  const registry = getRegistry();
  const lower = text.toLowerCase();
  return registry.skills
    .filter(skill => skill.triggers.some(trigger => lower.includes(trigger)))
    .map(skill => ({
      ...skill,
      matchedTriggers: skill.triggers.filter(trigger => lower.includes(trigger)),
    }));
}

/**
 * Main entry: detects relevant skills from problem text,
 * loads all their files, and returns the assembled prompt string.
 *
 * Skills with alwaysLoad: true are loaded before keyword matching,
 * regardless of the problem text content.
 *
 * @param {string} problemText
 * @returns {Promise<{skillIds: string[], prompt: string, matched: object[]}>}
 */
export async function loadSkillsForProblem(problemText) {
  const registry = getRegistry();

  // Always-on skills load first, unconditionally — annotate so UI can show "always-on" tag
  const alwaysOn = registry.skills
    .filter(s => s.alwaysLoad)
    .map(s => ({ ...s, matchedTriggers: [], alwaysActive: true }));

  // Keyword-matched skills (exclude any already in alwaysOn to avoid duplicates)
  const alwaysOnIds = new Set(alwaysOn.map(s => s.id));
  const keywordMatched = detectSkills(problemText).filter(s => !alwaysOnIds.has(s.id));

  const matched = [...alwaysOn, ...keywordMatched];

  if (!matched.length) {
    return { skillIds: [], prompt: '', matched: [] };
  }

  const loaded = await Promise.all(matched.map(s => loadSkill(s.id)));

  return {
    skillIds: matched.map(s => s.id),
    prompt: '\n\n' + loaded.join('\n\n════════════════════════════════════════\n\n'),
    matched,
  };
}

/**
 * Returns all registered skills for informational purposes.
 */
export function listSkills() {
  return getRegistry().skills.map(s => ({
    id: s.id,
    description: s.description,
    triggers: s.triggers,
  }));
}
