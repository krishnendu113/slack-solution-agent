import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const SKILLS_DIR = path.join(__dirname, '../skills');
const TEXT_EXTENSIONS = new Set(['.md', '.txt', '.json', '.jsonl']);

const DEFAULT_MANIFEST = {
  executionMode: 'single',
  outputType: 'assessment',
  downloadable: false,
  researchPhase: [],
  synthesisPhase: [],
  fileMapping: {},
  validation: {},
};

// Lazy-load registry so tests can mock it
let _registry = null;
function getRegistry() {
  if (!_registry) {
    _registry = require(path.join(SKILLS_DIR, 'registry.json'));
  }
  return _registry;
}

/**
 * Loads and parses the manifest.json for a skill folder.
 * Returns a default single-mode manifest if the file is absent or invalid.
 *
 * @param {string} skillFolder - Absolute path to the skill folder
 * @returns {Promise<object>} Parsed manifest or DEFAULT_MANIFEST
 */
export async function loadManifest(skillFolder) {
  const manifestPath = path.join(skillFolder, 'manifest.json');
  try {
    const raw = await fs.readFile(manifestPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_MANIFEST, ...parsed };
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[skillLoader] manifest.json parse error for ${skillFolder}: ${err.message} — using single mode`);
    }
    return { ...DEFAULT_MANIFEST };
  }
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
    if (entry.name === 'manifest.json') continue; // manifests are loaded separately, not concatenated into prompt
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
export async function loadSkillsForProblem(problemText, semanticMatches = null) {
  const registry = getRegistry();

  // Always-on skills load first, unconditionally — annotate so UI can show "always-on" tag
  const alwaysOn = registry.skills
    .filter(s => s.alwaysLoad)
    .map(s => ({ ...s, matchedTriggers: [], alwaysActive: true }));

  const alwaysOnIds = new Set(alwaysOn.map(s => s.id));

  // semanticMatches === null means Haiku failed → fall back to keyword matching
  // semanticMatches === [] means Haiku succeeded but no skills needed → load none
  // semanticMatches === [{id,reason}] means Haiku found relevant skills
  let keywordOrSemantic;
  if (semanticMatches === null) {
    keywordOrSemantic = detectSkills(problemText).filter(s => !alwaysOnIds.has(s.id));
  } else {
    keywordOrSemantic = semanticMatches
      .map(({ id, reason }) => {
        const entry = registry.skills.find(s => s.id === id);
        if (!entry || alwaysOnIds.has(id)) return null;
        return { ...entry, matchedTriggers: [], matchReason: reason };
      })
      .filter(Boolean);
  }

  const matched = [...alwaysOn, ...keywordOrSemantic];

  if (!matched.length) {
    return { skillIds: [], prompt: '', matched: [], manifests: new Map() };
  }

  const [loaded, manifestEntries] = await Promise.all([
    Promise.all(matched.map(s => loadSkill(s.id))),
    Promise.all(matched.map(async s => {
      const folderPath = path.join(SKILLS_DIR, s.folder);
      const manifest = await loadManifest(folderPath);
      return [s.id, manifest];
    })),
  ]);
  const manifests = new Map(manifestEntries);

  return {
    skillIds: matched.map(s => s.id),
    prompt: '\n\n' + loaded.join('\n\n════════════════════════════════════════\n\n'),
    matched,
    manifests,
  };
}

/**
 * Loads specific files from a skill folder and assembles them into a prompt block.
 * SKILL.md is always included first regardless of whether it's in fileNames.
 * Used by Section_Writers in multi-node mode to load only the reference files
 * declared in the manifest's fileMapping.
 *
 * @param {string} skillId - Skill ID from registry
 * @param {string[]} fileNames - File names to load (relative to skill folder)
 * @returns {Promise<string>} Assembled prompt block
 */
export async function loadSkillFiles(skillId, fileNames) {
  const registry = getRegistry();
  const skill = registry.skills.find(s => s.id === skillId);
  if (!skill) throw new Error(`Unknown skill: "${skillId}"`);

  const folderPath = path.join(SKILLS_DIR, skill.folder);

  // Always include SKILL.md first, deduplicate
  const filesToLoad = ['SKILL.md', ...fileNames.filter(f => f !== 'SKILL.md')];
  const uniqueFiles = [...new Set(filesToLoad)];

  const sections = [];
  for (const fileName of uniqueFiles) {
    const fullPath = path.join(folderPath, fileName);
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      sections.push(`### [${fileName}]\n\n${content.trim()}`);
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.warn(`[skillLoader] fileMapping references missing file: ${skillId}/${fileName} — skipping`);
      } else {
        console.warn(`[skillLoader] Error reading ${skillId}/${fileName}: ${err.message} — skipping`);
      }
    }
  }

  console.log(`[skillLoader] loadSkillFiles(${skillId}): loaded ${sections.length}/${uniqueFiles.length} files`);

  return [
    `## ═══ ACTIVE SKILL: ${skill.id} (section context) ═══`,
    `> ${skill.description}`,
    '',
    sections.join('\n\n---\n\n'),
    `## ═══ END SKILL: ${skill.id} ═══`,
  ].join('\n');
}

/**
 * Returns all registered skills for informational purposes.
 */
export function listSkills() {
  return getRegistry().skills.map(s => ({
    id: s.id,
    description: s.description,
    triggers: s.triggers,
    alwaysLoad: s.alwaysLoad || false,
  }));
}
