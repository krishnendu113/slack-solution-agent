# Design Document — Skill Execution Architecture

## Overview

The Capillary Solution Agent currently loads skills by concatenating all `.md` files in a skill folder into the system prompt and making a single Sonnet streaming call. The skill files were authored for Claude.ai's Projects environment, which supports sub-agent spawning, filesystem access, MCP tool prefixes, and per-sub-agent model dispatch. None of those capabilities exist in the web app. The result is degraded output: a single LLM call trying to follow multi-agent instructions it cannot execute.

This design replaces that approach with a structured execution architecture that:

1. Reads a machine-readable `manifest.json` from each skill folder to declare execution requirements
2. Routes skills to either the existing single-LLM path (`single` mode) or a new parallel multi-node path (`multi-node` mode)
3. Fans out research across tool categories in parallel using `Promise.all`
4. Writes long-form output section-by-section using parallel Haiku/Sonnet sub-agent calls
5. Delivers assembled documents via a `document_ready` SSE event + download endpoint rather than streaming raw text into the chat
6. Rewrites existing skill `.md` files to use actual web app tool names and remove Claude.ai-specific instructions

The design is additive: single-mode skills (including `cr-evaluator`) continue to work without any changes. The new path activates only when a loaded skill declares `executionMode: "multi-node"` in its manifest.


## Architecture

### Current Graph Topology

```
classify → loadSkills → research (loop) → validate → END
```

- `classify`: Haiku semantic skill selection + client persona detection in parallel
- `loadSkills`: calls `loadSkillsForProblem()`, assembles system prompt with skill content injected as text
- `research`: single Sonnet streaming loop, executes tool_use blocks, summarises results with Haiku in parallel, loops until `stopReason !== 'tool_use'`
- `validate`: regex checks for Verdict and URL, appends notes if missing

### New Graph Topology

```
                                    ┌─────────────────────────────────────────────────────┐
                                    │  multi-node path                                    │
                                    │                                                     │
classify → loadSkills → skillRouter ┤  researchFanOut → sectionWriter → skillValidate    │
                                    │                                                     │
                                    └─────────────────────────────────────────────────────┘
                                    │
                                    │  single-mode path (unchanged)
                                    │
                                    └─ research (loop) → validate → END
```

The `skillRouter` node is inserted between `loadSkills` and the research phase. It reads the manifests of all loaded skills and decides which path to follow:

- If all loaded skills have `executionMode: "single"` (or no manifest), route to the existing `research` loop — **zero behaviour change**.
- If any loaded skill has `executionMode: "multi-node"`, route to `researchFanOut`.

### Full Graph Topology Diagram (ASCII)

```
__start__
    │
    ▼
classify
    │  (parallel: semantic skill selection + client persona)
    ▼
loadSkills
    │  (loads manifests alongside skill files)
    ▼
skillRouter ──────────────────────────────────────────────────────────────────┐
    │                                                                          │
    │ all skills single-mode or no skills                                      │ any skill multi-node
    ▼                                                                          ▼
research ◄──────────────────────────────────────────────────────── researchFanOut
    │  stopReason === 'tool_use'                                               │
    │  && turnCount < MAX_TURNS                                                │  Promise.all([
    │                                                                          │    jiraBranch(),
    │  stopReason !== 'tool_use'                                               │    confluenceBranch(),
    │  || turnCount >= MAX_TURNS                                               │    kapaBranch(),
    ▼                                                                          │    webSearchBranch()
validate                                                                       │  ])
    │                                                                          ▼
    ▼                                                                    sectionWriter
  __end__                                                                      │
                                                                               │  Promise.all([
                                                                               │    writeSection(s1),
                                                                               │    writeSection(s2),
                                                                               │    ...
                                                                               │  ])
                                                                               ▼
                                                                         skillValidate
                                                                               │
                                                                               ▼
                                                                           __end__
```


## Components and Interfaces

### 1. Manifest Schema (`manifest.json`)

Each skill folder MAY contain a `manifest.json` file. If absent, the skill is treated as `executionMode: "single"`.

**Full schema:**

```typescript
interface SkillManifest {
  executionMode: "single" | "multi-node";
  outputType: "assessment" | "document";
  downloadable: boolean;
  researchPhase: Array<"jira" | "confluence" | "kapa_docs" | "web_search">;
  synthesisPhase: SectionConfig[];
  fileMapping?: Record<string, string[]>;  // section name → reference file paths (relative to skill folder)
  validation: ValidationConfig;
}

interface SectionConfig {
  name: string;           // section identifier, e.g. "problem", "verdict", "api-flows"
  model: "haiku" | "sonnet";
  maxTokens?: number;     // optional override; defaults to 1024 for haiku, 4096 for sonnet
  researchSources?: Array<"jira" | "confluence" | "kapa_docs" | "web_search">;
                          // which research branches feed this section; omit = all
}

interface ValidationConfig {
  requiredHeadings?: string[];   // regex patterns that must match at least one heading
  requiredPatterns?: string[];   // regex patterns that must appear anywhere in the output
  requiredJsonFields?: string[]; // top-level JSON keys that must be present (for JSON output)
}
```

**`fileMapping` behaviour:**
- Maps section names to the reference files that section needs (paths relative to skill folder)
- `SKILL.md` is always included for every section regardless of `fileMapping` — it contains global context
- If a section has no entry in `fileMapping`, the full skill prompt is used as fallback
- If `fileMapping` is absent from the manifest, all files are loaded for all sections (current behaviour)
- Missing files referenced in `fileMapping` are logged as warnings and skipped

**Example: `skills/capillary-sdd-writer/manifest.json`**

```json
{
  "executionMode": "multi-node",
  "outputType": "document",
  "downloadable": true,
  "researchPhase": ["jira", "confluence", "kapa_docs", "web_search"],
  "synthesisPhase": [
    {
      "name": "problem",
      "model": "haiku",
      "maxTokens": 512,
      "researchSources": ["jira", "confluence"]
    },
    {
      "name": "constraints",
      "model": "haiku",
      "maxTokens": 512,
      "researchSources": ["jira", "confluence"]
    },
    {
      "name": "systems-involved",
      "model": "haiku",
      "maxTokens": 1024,
      "researchSources": ["jira", "confluence"]
    },
    {
      "name": "solution-strategy",
      "model": "sonnet",
      "maxTokens": 2048,
      "researchSources": ["jira", "confluence", "kapa_docs"]
    },
    {
      "name": "architecture",
      "model": "sonnet",
      "maxTokens": 4096,
      "researchSources": ["jira", "confluence", "kapa_docs", "web_search"]
    },
    {
      "name": "api-flows",
      "model": "sonnet",
      "maxTokens": 8192,
      "researchSources": ["jira", "confluence", "kapa_docs"]
    },
    {
      "name": "adrs",
      "model": "sonnet",
      "maxTokens": 2048,
      "researchSources": ["confluence", "kapa_docs"]
    },
    {
      "name": "nfrs",
      "model": "haiku",
      "maxTokens": 1024,
      "researchSources": []
    },
    {
      "name": "open-questions",
      "model": "haiku",
      "maxTokens": 512,
      "researchSources": ["jira", "confluence"]
    }
  ],
  "validation": {
    "requiredHeadings": ["## 9\\.", "Section 9", "API [Ff]low"],
    "requiredPatterns": ["https://capillarytech\\.atlassian\\.net/"]
  },
  "fileMapping": {
    "problem": ["section-template.md"],
    "constraints": ["section-template.md"],
    "systems-involved": ["section-template.md"],
    "solution-strategy": ["golden-path.md", "capillary-patterns.md"],
    "architecture": ["diagram-rules.md", "capillary-patterns.md"],
    "api-flows": ["golden-path.md", "style-guide.md", "api-reference-template.md", "section-template.md"],
    "adrs": ["section-template.md"],
    "nfrs": ["section-template.md"],
    "open-questions": ["section-template.md"]
  }
}
```

**Example: `skills/solution-gap-analyzer/manifest.json`**

```json
{
  "executionMode": "multi-node",
  "outputType": "document",
  "downloadable": true,
  "researchPhase": ["confluence", "kapa_docs", "web_search"],
  "synthesisPhase": [
    {
      "name": "executive-summary",
      "model": "sonnet",
      "maxTokens": 2048,
      "researchSources": ["confluence", "kapa_docs"]
    },
    {
      "name": "domain-analysis",
      "model": "sonnet",
      "maxTokens": 8192,
      "researchSources": ["kapa_docs", "web_search"]
    },
    {
      "name": "gap-register",
      "model": "haiku",
      "maxTokens": 2048,
      "researchSources": ["kapa_docs"]
    },
    {
      "name": "scoring",
      "model": "haiku",
      "maxTokens": 1024,
      "researchSources": []
    },
    {
      "name": "open-questions",
      "model": "haiku",
      "maxTokens": 512,
      "researchSources": ["confluence"]
    }
  ],
  "validation": {
    "requiredPatterns": ["\\d+%"],
    "requiredHeadings": ["##\\s+D-\\d+", "##\\s+Domain"]
  }
}
```

**Example: `skills/excalidraw-diagram/manifest.json`**

```json
{
  "executionMode": "single",
  "outputType": "assessment",
  "downloadable": false,
  "researchPhase": [],
  "synthesisPhase": [],
  "validation": {
    "requiredJsonFields": ["elements"]
  }
}
```

**Example: `skills/cr-evaluator/manifest.json`** (not needed — shown for reference only; `cr-evaluator` works without a manifest)

```json
{
  "executionMode": "single",
  "outputType": "assessment",
  "downloadable": false,
  "researchPhase": [],
  "synthesisPhase": [],
  "validation": {}
}
```


### 2. `skillLoader.js` Changes

**New function: `loadManifest(skillFolder)`**

```javascript
/**
 * Loads and parses the manifest.json for a skill folder.
 * Returns a default single-mode manifest if the file is absent or invalid.
 *
 * @param {string} skillFolder - Absolute path to the skill folder
 * @returns {Promise<SkillManifest>}
 */
export async function loadManifest(skillFolder) {
  const manifestPath = path.join(skillFolder, 'manifest.json');
  const DEFAULT_MANIFEST = {
    executionMode: 'single',
    outputType: 'assessment',
    downloadable: false,
    researchPhase: [],
    synthesisPhase: [],
    validation: {},
  };
  try {
    const raw = await fs.readFile(manifestPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_MANIFEST, ...parsed };
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[skillLoader] manifest.json parse error for ${skillFolder}: ${err.message} — using single mode`);
    }
    return DEFAULT_MANIFEST;
  }
}
```

**Changes to `collectSkillFiles`:**

Add `manifest.json` to the exclusion list so it is never concatenated into the prompt:

```javascript
// In collectSkillFiles, skip manifest.json
if (entry.name === 'manifest.json') continue;
```

**Changes to `loadSkillsForProblem`:**

The function signature is **unchanged**. The return value gains a `manifests` field:

```javascript
// Return type extended (backward compatible — callers that destructure only
// { skillIds, prompt, matched } are unaffected)
return {
  skillIds: matched.map(s => s.id),
  prompt: '\n\n' + loaded.join('\n\n════════════════════════════════════════\n\n'),
  matched,
  manifests,  // NEW: Map<skillId, SkillManifest>
};
```

The `manifests` map is built by calling `loadManifest` for each matched skill in parallel alongside `loadSkill`:

```javascript
const [loaded, manifests] = await Promise.all([
  Promise.all(matched.map(s => loadSkill(s.id))),
  Promise.all(matched.map(async s => {
    const folderPath = path.join(SKILLS_DIR, s.folder);
    const manifest = await loadManifest(folderPath);
    return [s.id, manifest];
  })).then(entries => new Map(entries)),
]);
```

**Changes to `loadSkillsNode` in `graph.js`:**

```javascript
const { skillIds, prompt: skillPrompt, matched, manifests } = await loadSkillsForProblem(
  state.problemText, state.semanticMatches
);
// manifests is stored in graph state for skillRouter to read
return { skillIds, skillPrompt, systemPrompt, manifests: Object.fromEntries(manifests) };
```

**New function: `loadSkillFiles(skillId, fileNames)`**

Loads only the specified files from a skill folder. Used by Section_Writers in multi-node mode to load only the reference files declared in `fileMapping`. `SKILL.md` is always included.

```javascript
/**
 * Loads specific files from a skill folder and assembles them into a prompt block.
 * SKILL.md is always included first regardless of whether it's in fileNames.
 *
 * @param {string} skillId - Skill ID from registry
 * @param {string[]} fileNames - File names to load (relative to skill folder, e.g. ["golden-path.md", "style-guide.md"])
 * @returns {Promise<string>} Assembled prompt block
 */
export async function loadSkillFiles(skillId, fileNames) {
  const registry = getRegistry();
  const skill = registry.skills.find(s => s.id === skillId);
  if (!skill) throw new Error(`Unknown skill: "${skillId}"`);

  const folderPath = path.join(SKILLS_DIR, skill.folder);

  // Always include SKILL.md first
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
```


### 3. `skillRouter` Node

**Location in graph:** After `loadSkills`, before `research` / `researchFanOut`.

**State fields read:**
- `state.manifests` — `Record<skillId, SkillManifest>` (set by `loadSkillsNode`)
- `state.skillIds` — `string[]`

**State fields written:**
- `state.mergedManifest` — merged configuration for the multi-node path (see below)
- `state.executionMode` — `"single"` | `"multi-node"`

**Routing logic (pseudocode):**

```javascript
const skillRouterNode = async (state) => {
  await onPhase?.('routing');

  const manifests = state.manifests || {};
  const skillIds = state.skillIds || [];

  // No skills loaded → single mode
  if (!skillIds.length) {
    return { executionMode: 'single', mergedManifest: null };
  }

  const allManifests = skillIds.map(id => manifests[id]).filter(Boolean);
  const hasMultiNode = allManifests.some(m => m.executionMode === 'multi-node');

  if (!hasMultiNode) {
    return { executionMode: 'single', mergedManifest: null };
  }

  // Merge researchPhase: union of all tool categories, deduplicated
  const researchPhaseSet = new Set();
  for (const m of allManifests) {
    if (m.executionMode === 'multi-node') {
      for (const tool of (m.researchPhase || [])) researchPhaseSet.add(tool);
    }
  }

  // Use the first multi-node skill's synthesisPhase and validation
  // (multi-node skills are mutually exclusive in practice — only one document skill fires at a time)
  const primaryManifest = allManifests.find(m => m.executionMode === 'multi-node');

  const mergedManifest = {
    ...primaryManifest,
    researchPhase: [...researchPhaseSet],
  };

  return { executionMode: 'multi-node', mergedManifest };
};
```

**Conditional edge from `skillRouter`:**

```javascript
graph.addConditionalEdges('skillRouter', (state) => {
  return state.executionMode === 'multi-node' ? 'researchFanOut' : 'research';
});
```

**New graph state channels:**

```javascript
manifests:       { value: (_, n) => n ?? {}, default: () => ({}) },
executionMode:   { value: (_, n) => n ?? 'single', default: () => 'single' },
mergedManifest:  { value: (_, n) => n ?? null, default: () => null },
researchResults: { value: (_, n) => n ?? {}, default: () => ({}) },
assembledDoc:    { value: (_, n) => n ?? '', default: () => '' },
downloadToken:   { value: (_, n) => n ?? null, default: () => null },
```


### 4. Parallel Research Fan-out (`researchFanOut` Node)

**Implementation approach:** `Promise.all` over branch functions. This is simpler than the LangGraph `Send` API and consistent with the existing `summariseToolResult` parallel pattern in `graph.js`.

**Branch functions:**

Each branch is a standalone async function that:
1. Calls its designated tools (using the existing `getTools().handle` dispatcher)
2. Summarises results with Haiku (reusing `summariseToolResult`)
3. Returns `{ source, results, error? }`

```javascript
/**
 * @param {string} source - "jira" | "confluence" | "kapa_docs" | "web_search"
 * @param {string} problemText
 * @param {Function} handle - from getTools()
 * @param {Function} onToolStatus - SSE callback
 * @returns {Promise<ResearchBranchResult>}
 */
async function runResearchBranch(source, problemText, handle, onToolStatus) {
  const BRANCH_TOOLS = {
    jira:        ['search_jira', 'get_jira_ticket'],
    confluence:  ['search_confluence', 'get_confluence_page'],
    kapa_docs:   ['search_kapa_docs'],
    web_search:  ['search_docs_site'],
  };

  const tools = BRANCH_TOOLS[source];
  if (!tools) return { source, results: [], error: `Unknown source: ${source}` };

  const results = [];
  for (const toolName of tools) {
    const toolId = `${toolName}-branch-${source}`;
    try {
      await onToolStatus?.({ id: toolId, name: toolName, inputSummary: `"${problemText.slice(0, 60)}"`, status: 'running' });
      const raw = await handle(toolName, { query: problemText, max_results: 5 });
      const summary = raw.length > 500
        ? await summariseToolResult(toolName, raw, problemText)
        : raw;
      await onToolStatus?.({ id: toolId, name: toolName, inputSummary: `"${problemText.slice(0, 60)}"`, status: 'done', text: 'Done' });
      results.push({ tool: toolName, content: summary });
    } catch (err) {
      await onToolStatus?.({ id: toolId, name: toolName, inputSummary: '', status: 'error', text: err.message });
      results.push({ tool: toolName, content: null, error: err.message });
    }
  }

  return { source, results };
}
```

**`researchFanOut` node:**

```javascript
const researchFanOutNode = async (state) => {
  const { definitions, handle } = getTools();
  const { mergedManifest, problemText } = state;
  const sources = mergedManifest?.researchPhase || [];

  await onStatus('🔍 Researching in parallel...');

  const branchResults = await Promise.all(
    sources.map(source => runResearchBranch(source, problemText, handle, onToolStatus))
  );

  // researchResults: Record<source, ResearchBranchResult>
  const researchResults = Object.fromEntries(
    branchResults.map(r => [r.source, r])
  );

  await onPhase?.('synthesise');

  return { researchResults };
};
```

**`researchResults` state shape:**

```typescript
interface ResearchResults {
  [source: string]: {
    source: string;
    results: Array<{
      tool: string;
      content: string | null;
      error?: string;
    }>;
    error?: string;
  };
}
```

**Fallback:** If all branches fail (all results have `error` set), `researchFanOut` returns `{ researchResults, executionMode: 'single' }` and the conditional edge falls back to the `research` loop with the skill prompt still injected in `systemPrompt`.


### 5. Section-Writing Nodes (`sectionWriter` Node)

**Section_Marker format in skill `.md` files:**

```markdown
<!-- SECTION: api-flows -->
## Section 9 — Solution Detailing

[All instructions for writing Section 9 go here]

<!-- END SECTION: api-flows -->
```

Section names must match the `name` field in the manifest's `synthesisPhase` array exactly.

**Extracting section instructions from skill files:**

```javascript
/**
 * Extracts the content between SECTION markers for a given section name.
 * Falls back to the full skill prompt if no marker is found.
 *
 * @param {string} skillPrompt - Full assembled skill prompt
 * @param {string} sectionName - Section name to extract
 * @returns {string}
 */
function extractSectionInstructions(skillPrompt, sectionName) {
  const startMarker = `<!-- SECTION: ${sectionName} -->`;
  const endMarker = `<!-- END SECTION: ${sectionName} -->`;
  const start = skillPrompt.indexOf(startMarker);
  const end = skillPrompt.indexOf(endMarker);
  if (start === -1 || end === -1) return skillPrompt; // fallback: full prompt
  return skillPrompt.slice(start + startMarker.length, end).trim();
}
```

**Section_Writer function:**

```javascript
/**
 * Writes one section of a document using the appropriate model.
 *
 * @param {object} opts
 * @param {SectionConfig} opts.section - Section config from manifest
 * @param {string} opts.problemText
 * @param {ResearchResults} opts.researchResults
 * @param {string} opts.sectionInstructions - Extracted from skill files via Section_Markers
 * @param {string} opts.skillId
 * @returns {Promise<{ name: string, content: string, error?: string }>}
 */
async function writeSectionContent({ section, problemText, researchResults, sectionInstructions, skillId }) {
  const MODEL_MAP = {
    haiku:  'claude-haiku-4-5-20251001',
    sonnet: 'claude-sonnet-4-20250514',
  };
  const model = MODEL_MAP[section.model] || MODEL_MAP.haiku;
  const maxTokens = section.maxTokens || (section.model === 'sonnet' ? 4096 : 1024);

  // Filter research results to only the sources this section cares about
  const relevantSources = section.researchSources || Object.keys(researchResults);
  const relevantResearch = relevantSources
    .filter(s => researchResults[s])
    .map(s => {
      const branch = researchResults[s];
      const content = branch.results
        .filter(r => r.content)
        .map(r => `[${r.tool}]\n${r.content}`)
        .join('\n\n');
      return content ? `### Research from ${s}:\n${content}` : null;
    })
    .filter(Boolean)
    .join('\n\n---\n\n');

  const systemPrompt = [
    `You are writing the "${section.name}" section of a ${skillId} document.`,
    `Follow these instructions precisely:`,
    '',
    sectionInstructions,
  ].join('\n');

  const userContent = [
    `## Problem / Request\n${problemText}`,
    relevantResearch ? `## Research Results\n${relevantResearch}` : '',
    `## Task\nWrite the "${section.name}" section now. Output only the section content — no preamble.`,
  ].filter(Boolean).join('\n\n');

  try {
    const content = await runSubAgent({ systemPrompt, userContent, model, maxTokens });
    return { name: section.name, content };
  } catch (err) {
    console.error(`[sectionWriter] Section "${section.name}" failed: ${err.message}`);
    return {
      name: section.name,
      content: `\n\n> ⚠️ **Section "${section.name}" could not be generated.** Error: ${err.message}\n\n`,
      error: err.message,
    };
  }
}
```

**`sectionWriter` node:**

```javascript
const sectionWriterNode = async (state) => {
  const { mergedManifest, researchResults, problemText, skillIds, skillPrompt } = state;
  const sections = mergedManifest?.synthesisPhase || [];

  await onStatus(`✍️ Writing ${sections.length} sections...`);

  // Emit status for each section being written
  for (const section of sections) {
    await onStatus(`✍️ Writing section: ${section.name} (${section.model})...`);
  }

  const fileMapping = mergedManifest?.fileMapping || {};
  const primarySkillId = skillIds[0] || 'unknown';

  const sectionResults = await Promise.all(
    sections.map(async (section) => {
      // Load only the reference files this section needs (via fileMapping)
      // Falls back to full skillPrompt if no fileMapping entry exists
      let instructions;
      if (fileMapping[section.name]) {
        const sectionPrompt = await loadSkillFiles(primarySkillId, fileMapping[section.name]);
        instructions = extractSectionInstructions(sectionPrompt, section.name);
        console.log(`[sectionWriter] Section "${section.name}": loaded ${fileMapping[section.name].length} reference files via fileMapping`);
      } else {
        instructions = extractSectionInstructions(skillPrompt, section.name);
        console.log(`[sectionWriter] Section "${section.name}": no fileMapping entry, using full skill prompt`);
      }

      return writeSectionContent({
        section,
        problemText,
        researchResults,
        sectionInstructions: instructions,
        skillId: primarySkillId,
      });
    })
  );

  // Assemble in manifest order
  const assembledDoc = sectionResults
    .map(r => r.content)
    .join('\n\n');

  return { assembledDoc, sectionResults };
};
```


### 6. Model Dispatch Implementation

#### `src/subAgent.js` Changes

The `runSubAgent` function gains:
1. Model validation (throws on invalid model)
2. `maxTokens` parameter support
3. Logging of model, operation, and token counts

```javascript
const VALID_MODELS = new Set([
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-20250514',
]);

/**
 * @param {object} opts
 * @param {string} opts.systemPrompt
 * @param {string} opts.userContent
 * @param {string} [opts.model]       - Default: claude-haiku-4-5-20251001
 * @param {number} [opts.maxTokens]   - Default: 1024
 * @param {string} [opts.operation]   - Optional label for logging (e.g. "summarise", "section:api-flows")
 * @returns {Promise<string>}
 */
export async function runSubAgent({
  systemPrompt,
  userContent,
  model = 'claude-haiku-4-5-20251001',
  maxTokens = 1024,
  operation = 'unknown',
}) {
  if (!VALID_MODELS.has(model)) {
    throw new Error(
      `[subAgent] Invalid model "${model}". Must be one of: ${[...VALID_MODELS].join(', ')}`
    );
  }

  const response = await getClient().messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  });

  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  console.log(`[subAgent] op=${operation} model=${model} in=${inputTokens} out=${outputTokens}`);

  return response.content[0].text;
}
```

#### `src/orchestrator.js` Changes

`buildEscalationSummary` is updated to use Haiku:

```javascript
// BEFORE:
model: 'claude-sonnet-4-20250514',

// AFTER:
const summary = await runSubAgent({
  systemPrompt: 'Summarise this CS escalation for the SA team in under 400 words...',
  userContent: `Problem: ${problemText}\nAgent response: ${agentResponse}\nTurns: ${history.length}`,
  model: 'claude-haiku-4-5-20251001',
  maxTokens: 1024,
  operation: 'escalation-summary',
});
return summary;
```

#### `src/graph.js` Changes

All `runSubAgent` calls gain an `operation` label and explicit `maxTokens`:

| Call site | model | maxTokens | operation |
|-----------|-------|-----------|-----------|
| `summariseToolResult` | haiku | 1024 | `'summarise'` |
| `classifyNode` skill selection | haiku | 512 | `'skill-select'` |
| `writeSectionContent` (haiku sections) | haiku | per manifest | `'section:{name}'` |
| `writeSectionContent` (sonnet sections) | sonnet | per manifest | `'section:{name}'` |

The `research` node continues to use `claude-sonnet-4-20250514` for the streaming call — this is the only Sonnet streaming call in the system.

`MAX_AGENT_TOKENS` from the environment applies only to the Sonnet streaming call in `research`:

```javascript
// In researchNode:
const maxTokens = parseInt(process.env.MAX_AGENT_TOKENS || '8000', 10);
// This is NOT passed to runSubAgent calls — those use their own maxTokens
```


### 7. Skill-Specific Output Validation (`skillValidate` Node)

The `skillValidate` node runs after `sectionWriter` and before `__end__` on the multi-node path. It mirrors the existing `validate` node pattern but uses manifest-declared rules instead of hardcoded regex.

```javascript
const skillValidateNode = async (state) => {
  const { assembledDoc, mergedManifest, skillIds } = state;
  if (!assembledDoc || !mergedManifest) return {};

  const validation = mergedManifest.validation || {};
  const notes = [];

  // Check required headings
  for (const pattern of (validation.requiredHeadings || [])) {
    const re = new RegExp(pattern, 'm');
    if (!re.test(assembledDoc)) {
      notes.push(`> ⚠️ **Validation warning:** Required heading pattern \`${pattern}\` not found in output.`);
    }
  }

  // Check required patterns
  for (const pattern of (validation.requiredPatterns || [])) {
    const re = new RegExp(pattern);
    if (!re.test(assembledDoc)) {
      notes.push(`> ⚠️ **Validation warning:** Required pattern \`${pattern}\` not found in output.`);
    }
  }

  // Check required JSON fields (for JSON output skills like excalidraw)
  if (validation.requiredJsonFields?.length) {
    try {
      const parsed = JSON.parse(assembledDoc);
      for (const field of validation.requiredJsonFields) {
        if (!(field in parsed)) {
          notes.push(`> ⚠️ **Validation warning:** Required JSON field \`${field}\` not found in output.`);
        }
      }
    } catch {
      notes.push(`> ⚠️ **Validation warning:** Output is not valid JSON (required for ${skillIds[0]}).`);
    }
  }

  const finalDoc = notes.length
    ? assembledDoc + '\n\n' + notes.join('\n\n')
    : assembledDoc;

  return { assembledDoc: finalDoc };
};
```


### 8. Document Delivery

#### `document_ready` SSE Event

Emitted by the `sectionWriter` node (or a post-validate step) when `mergedManifest.downloadable === true`:

```typescript
interface DocumentReadyEvent {
  filename: string;       // e.g. "capillary-sdd-2025-01-15.md"
  sizeBytes: number;
  downloadToken: string;  // UUID v4, expires after 30 minutes
}
```

SSE wire format:
```
event: document_ready
data: {"filename":"capillary-sdd-2025-01-15.md","sizeBytes":42318,"downloadToken":"a1b2c3d4-..."}
```

#### In-Memory Document Store (`src/documentStore.js`)

New file. Stores assembled documents with 30-minute TTL.

```javascript
// src/documentStore.js

const store = new Map(); // token → { content, filename, contentType, expiresAt }

const TTL_MS = 30 * 60 * 1000; // 30 minutes

export function storeDocument({ content, filename }) {
  const token = crypto.randomUUID();
  const contentType = filename.endsWith('.json') ? 'application/json' : 'text/markdown';
  store.set(token, {
    content,
    filename,
    contentType,
    expiresAt: Date.now() + TTL_MS,
  });
  // Schedule cleanup
  setTimeout(() => store.delete(token), TTL_MS);
  return token;
}

export function getDocument(token) {
  const doc = store.get(token);
  if (!doc) return null;
  if (Date.now() > doc.expiresAt) {
    store.delete(token);
    return null;
  }
  return doc;
}
```

#### `GET /api/documents/:downloadToken` Endpoint (`src/server.js`)

```javascript
app.get('/api/documents/:downloadToken', (req, res) => {
  const doc = getDocument(req.params.downloadToken);
  if (!doc) {
    return res.status(410).json({ error: 'Download link expired or not found. Regenerate the document.' });
  }
  res.setHeader('Content-Disposition', `attachment; filename="${doc.filename}"`);
  res.setHeader('Content-Type', doc.contentType);
  res.send(doc.content);
});
```

#### Short Chat Summary (Requirement 9.2)

When `outputType === "document"`, the agent does NOT stream the document body as `token` events. Instead, after `skillValidate` completes:

1. A Haiku sub-agent call generates a ≤150-word summary of the assembled document
2. The summary is streamed as `token` events
3. The `document_ready` SSE event is emitted with the download token
4. The summary always ends with the delivery options line

```javascript
const SUMMARY_SYSTEM_PROMPT = `Summarise this document in under 150 words for a chat message.
Cover: what was produced, key findings or verdict, and available delivery options.
End with exactly this line: "📄 [filename] ready — [Download] or say 'write to Confluence' / 'comment on JIRA-123'."
Return plain text only.`;

const summary = await runSubAgent({
  systemPrompt: SUMMARY_SYSTEM_PROMPT,
  userContent: `Filename: ${filename}\n\nDocument:\n${assembledDoc.slice(0, 8000)}`,
  model: 'claude-haiku-4-5-20251001',
  maxTokens: 512,
  operation: 'doc-summary',
});

await onToken(summary);
```

#### `create_confluence_page` Tool (`src/tools/confluence.js`)

Added to `confluenceDefinitions` and `handleConfluenceTool`:

```javascript
{
  name: 'create_confluence_page',
  description: 'Create a new Confluence page with the given title and markdown body content. Use when the user explicitly requests saving a document to Confluence.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Page title' },
      body: { type: 'string', description: 'Page body in markdown or plain text' },
      parent_page_id: {
        type: 'string',
        description: 'Parent page ID. Defaults to CONFLUENCE_SDD_PARENT_PAGE_ID env var if not provided.',
      },
    },
    required: ['title', 'body'],
  },
}
```

Handler:

```javascript
case 'create_confluence_page': {
  const creds = confluenceAuth();
  if (!creds) return 'Confluence credentials not configured.';
  const parentId = input.parent_page_id || process.env.CONFLUENCE_SDD_PARENT_PAGE_ID;
  if (!parentId) return 'No parent page ID provided and CONFLUENCE_SDD_PARENT_PAGE_ID is not set.';

  const body = {
    type: 'page',
    title: input.title,
    ancestors: [{ id: parentId }],
    body: {
      storage: {
        value: `<p>${input.body.replace(/\n/g, '</p><p>')}</p>`,
        representation: 'storage',
      },
    },
  };

  try {
    const res = await fetch(`${creds.baseUrl}/rest/api/content`, {
      method: 'POST',
      headers: { Authorization: creds.auth, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return JSON.stringify({ error: `Confluence create failed: ${res.status}`, partial: true });
    const page = await res.json();
    return JSON.stringify({
      id: page.id,
      title: page.title,
      url: `${creds.baseUrl}${page._links?.webui || `/pages/${page.id}`}`,
    });
  } catch (err) {
    return JSON.stringify({ error: `Confluence create error: ${err.message}`, partial: true });
  }
}
```

#### `add_jira_comment` Tool (`src/tools/jira.js`)

Added to `jiraDefinitions` and `handleJiraTool`:

```javascript
{
  name: 'add_jira_comment',
  description: 'Add a comment to a Jira ticket. Use when the user explicitly requests commenting on a Jira ticket with a document summary.',
  input_schema: {
    type: 'object',
    properties: {
      ticket_id: { type: 'string', description: 'Jira ticket ID, e.g. PSV-27923' },
      body: { type: 'string', description: 'Comment body text (max 500 words recommended)' },
    },
    required: ['ticket_id', 'body'],
  },
}
```

Handler:

```javascript
case 'add_jira_comment': {
  const creds = jiraAuth();
  if (!creds) return 'Jira credentials not configured.';
  try {
    const res = await fetch(
      `${creds.baseUrl}/rest/api/3/issue/${input.ticket_id}/comment`,
      {
        method: 'POST',
        headers: { Authorization: creds.auth, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          body: {
            type: 'doc',
            version: 1,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: input.body }] }],
          },
        }),
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) return JSON.stringify({ error: `Jira comment failed: ${res.status}`, partial: true });
    const data = await res.json();
    return JSON.stringify({
      id: data.id,
      url: `${creds.baseUrl}/browse/${input.ticket_id}?focusedCommentId=${data.id}`,
    });
  } catch (err) {
    return JSON.stringify({ error: `Jira comment error: ${err.message}`, partial: true });
  }
}
```

Both tools are included in `getTools()` only when the relevant env vars are configured (existing conditional pattern).

#### Download Card in `public/index.html`

When the client receives a `document_ready` SSE event, it renders a download card instead of inline text:

```javascript
// In the SSE event handler:
case 'document_ready': {
  const { filename, sizeBytes, downloadToken } = data;
  const sizeKb = Math.round(sizeBytes / 1024);
  const card = document.createElement('div');
  card.className = 'download-card';
  card.innerHTML = `
    <div class="download-card-icon">��</div>
    <div class="download-card-info">
      <div class="download-card-filename">${escapeHtml(filename)}</div>
      <div class="download-card-size">${sizeKb} KB</div>
    </div>
    <a class="download-card-btn" href="/api/documents/${encodeURIComponent(downloadToken)}" download="${escapeHtml(filename)}">
      Download
    </a>
  `;
  currentMessageEl.appendChild(card);
  break;
}
```

CSS (added to the existing `<style>` block):

```css
.download-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  margin-top: 8px;
  max-width: 360px;
}
.download-card-icon { font-size: 24px; }
.download-card-info { flex: 1; }
.download-card-filename { font-weight: 600; font-size: 14px; }
.download-card-size { font-size: 12px; color: var(--text-muted); }
.download-card-btn {
  padding: 6px 14px;
  background: var(--accent);
  color: white;
  border-radius: 6px;
  text-decoration: none;
  font-size: 13px;
  font-weight: 500;
}
.download-card-btn:hover { opacity: 0.85; }
```


### 9. Skill File Rewrite Approach

#### Section_Marker Format

All rewritten skill `.md` files use HTML comment markers to delimit sections:

```markdown
<!-- SECTION: {section-name} -->
[Instructions for this section]
<!-- END SECTION: {section-name} -->
```

Section names must exactly match the `name` fields in the skill's `manifest.json` `synthesisPhase` array.

Content outside any `SECTION` marker is global context available to all Section_Writers (and to the single-mode fallback path).

#### `capillary-sdd-writer/SKILL.md` Rewrite

The rewritten file:
- Removes all references to: `Agent` tool spawning, `ToolSearch`, `Glob`, `Bash`, `output-sdd/`, progress tracker files, `mcp__atlassian__*`, `mcp__capillary_docs__*`, `mcp__mermaid__*`
- Replaces MCP tool references with actual web app tool names: `search_jira`, `get_jira_ticket`, `search_confluence`, `get_confluence_page`, `search_kapa_docs`, `search_docs_site`
- Removes the multi-step "Step 0 — MCP Health Check" and "Step 0.6 — Progress Tracker" sections entirely
- Preserves all domain knowledge: Tier 1–5 framework, golden path decision logic, CRITICAL data rules, output format specifications
- Adds Section_Markers for each section in the manifest

Section mapping for `capillary-sdd-writer`:

| Section name | Model | Content from existing files |
|---|---|---|
| `problem` | haiku | Section 1 (Introduction) instructions from `section-template.md` |
| `constraints` | haiku | Section 2 instructions from `section-template.md` |
| `systems-involved` | haiku | Section 4 instructions from `section-template.md` |
| `solution-strategy` | sonnet | Section 5 + Tier 1–5 framework from `golden-path.md` |
| `architecture` | sonnet | Section 6 + diagram rules from `diagram-rules.md` |
| `api-flows` | sonnet | Section 9 instructions from `section-template.md` + `style-guide.md` |
| `adrs` | sonnet | Section 10 instructions from `section-template.md` |
| `nfrs` | haiku | Section 11 instructions from `section-template.md` |
| `open-questions` | haiku | Open Questions format from `section-template.md` |

The `api-flows` section explicitly includes the Tier 1–5 framework reference:

```markdown
<!-- SECTION: api-flows -->
## Section 9 — Solution Detailing

For EVERY functional requirement, apply the Tier 1–5 framework from the golden path:

**Tier 1 — Product Configuration:** Use when the requirement is fully met through native Capillary platform configuration.
**Tier 2 — Standard Capillary APIs:** Use when a client system needs real-time interaction using existing product API endpoints.
**Tier 3 — Neo API:** Use when standard APIs alone are insufficient and you need custom synchronous, stateless logic.
**Tier 4 — Connect+:** Use when file imports/exports, event-driven processing, or scheduled batch jobs are needed.
**Tier 5 — Custom AWS Infrastructure:** Use only when Tiers 1–4 cannot meet the requirement.

[... rest of Section 9 instructions from section-template.md ...]

Use these tools to research API schemas and precedents:
- `search_jira` — search for related Jira tickets
- `get_jira_ticket` — fetch a specific ticket by ID
- `search_confluence` — search for existing SDDs and implementation notes
- `get_confluence_page` — fetch full content of a Confluence page
- `search_kapa_docs` — look up Capillary API documentation
<!-- END SECTION: api-flows -->
```

#### `solution-gap-analyzer/SKILL.md` Rewrite

The rewritten file:
- Removes all references to: `Agent` tool spawning, `ToolSearch`, `Glob`, `Bash`, `mcp__capillary_docs__*`, `mcp__atlassian__*`, `mcp__mermaid__*`, `output-plan/`, `learnings.jsonl` write operations
- Replaces MCP tool references with web app tool names
- Preserves: scoring engine logic, risk flag framework, domain taxonomy, P/R/O formula, verification protocol
- Adds Section_Markers for each section in the manifest

#### `excalidraw-diagram/SKILL.md` Rewrite

The rewritten file:
- Removes all references to: `Bash`, `uv run python render_excalidraw.py`, filesystem tools, MCP tool prefixes
- Removes the "Render & Validate" section (requires local Python/Playwright — not available in web app)
- Preserves: all design methodology, visual pattern library, JSON structure, color palette references
- Adds a note: "Output the complete Excalidraw JSON in a code block. The client will render it."
- Remains `executionMode: "single"` — no Section_Markers needed

#### Single-Mode Fallback Compatibility

All rewritten skill files remain valid for single-mode execution. The Section_Markers are HTML comments and are invisible to the LLM when the full prompt is injected into the system prompt. The single-mode path continues to work as before.

## Data Models

### LangGraph State Channels (complete updated set)

```javascript
// graph.js — channels object passed to new StateGraph({ channels: {...} })
{
  // Existing channels (unchanged)
  problemText:       { value: (_, n) => n ?? '', default: () => '' },
  messages:          { value: (_, n) => n ?? [], default: () => [] },
  classification:    { value: (_, n) => n ?? null, default: () => null },
  semanticMatches:   { value: (_, n) => n ?? null, default: () => null },
  clientContext:     { value: (_, n) => n ?? '', default: () => '' },
  clientSlug:        { value: (_, n) => n ?? null, default: () => null },
  skillIds:          { value: (_, n) => n ?? [], default: () => [] },
  skillPrompt:       { value: (_, n) => n ?? '', default: () => '' },
  systemPrompt:      { value: (_, n) => n ?? '', default: () => '' },
  turnCount:         { value: (_, n) => n ?? 0, default: () => 0 },
  fullText:          { value: (_, n) => n ?? '', default: () => '' },
  stopReason:        { value: (_, n) => n ?? null, default: () => null },
  hasUsedTools:      { value: (_, n) => n ?? false, default: () => false },
  researchEmitted:   { value: (_, n) => n ?? false, default: () => false },
  synthesiseEmitted: { value: (_, n) => n ?? false, default: () => false },

  // New channels
  manifests:         { value: (_, n) => n ?? {}, default: () => ({}) },
  executionMode:     { value: (_, n) => n ?? 'single', default: () => 'single' },
  mergedManifest:    { value: (_, n) => n ?? null, default: () => null },
  researchResults:   { value: (_, n) => n ?? {}, default: () => ({}) },
  sectionResults:    { value: (_, n) => n ?? [], default: () => [] },
  assembledDoc:      { value: (_, n) => n ?? '', default: () => '' },
  downloadToken:     { value: (_, n) => n ?? null, default: () => null },
}
```

### SSE Event Types (updated)

| Event | Payload | When emitted |
|-------|---------|-------------|
| `status` | `{ text: string }` | Status updates (unchanged) |
| `token` | `{ text: string }` | Streamed text deltas (unchanged) |
| `tool_status` | `{ id, name, inputSummary, status, text?, url?, links? }` | Tool activity (unchanged) |
| `skill_active` | `{ id, description, triggers, alwaysOn, reason? }` | Skill loaded (unchanged) |
| `phase` | `{ name: string }` | Phase transitions — adds `"routing"` to existing values |
| `message` | `{ role, content, skillsUsed, escalated }` | Final message (unchanged) |
| `error` | `{ text: string }` | Error (unchanged) |
| `document_ready` | `{ filename, sizeBytes, downloadToken }` | **NEW** — emitted when a downloadable document is ready |

### New Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `CONFLUENCE_SDD_PARENT_PAGE_ID` | No | — | Parent page ID for `create_confluence_page` tool |


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Manifest parsing never crashes

*For any* string passed as manifest file content (valid JSON, invalid JSON, empty string, binary garbage), the `loadManifest` function SHALL return a valid manifest object with `executionMode: "single"` rather than throwing an exception.

**Validates: Requirements 1.2, 1.9**

---

### Property 2: Skill router routing is deterministic from skill set

*For any* set of loaded skill manifests, the `skillRouter` output SHALL be `"multi-node"` if and only if at least one manifest has `executionMode: "multi-node"`, and `"single"` in all other cases (including empty skill set).

**Validates: Requirements 2.2, 2.3, 2.4**

---

### Property 3: Research phase merge is a deduplicated union

*For any* collection of multi-node skill manifests, the merged `researchPhase` array produced by `skillRouter` SHALL contain exactly the set-union of all individual `researchPhase` arrays, with no duplicate entries.

**Validates: Requirements 2.5**

---

### Property 4: Research branch tool isolation

*For any* research branch of type `T` (jira, confluence, kapa_docs, web_search), the branch SHALL only invoke tools from the designated set for `T`, and SHALL never invoke tools from a different branch's designated set.

**Validates: Requirements 3.3**

---

### Property 5: Research branch failure isolation

*For any* research branch where all tool calls throw exceptions, the branch SHALL return a result object with an `error` field rather than propagating the exception to `Promise.all`, so that other branches continue executing.

**Validates: Requirements 3.5, 4.7**

---

### Property 6: Section assembly preserves manifest order

*For any* `synthesisPhase` configuration with N sections, the assembled document SHALL contain the sections in the same order as declared in the manifest, regardless of which sections completed first (since `Promise.all` resolves in input order).

**Validates: Requirements 4.5**

---

### Property 7: Section_Writer model matches manifest declaration

*For any* section entry in `synthesisPhase` with `model: "haiku"`, the `runSubAgent` call for that section SHALL use `claude-haiku-4-5-20251001`; for `model: "sonnet"`, it SHALL use `claude-sonnet-4-20250514`. No other model values are valid.

**Validates: Requirements 4.3, 8.4, 8.5, 8.6**

---

### Property 8: `runSubAgent` model validation

*For any* call to `runSubAgent` with a model string that is not `"claude-haiku-4-5-20251001"` or `"claude-sonnet-4-20250514"`, the function SHALL throw an error with a descriptive message rather than passing the invalid model to the Anthropic API.

**Validates: Requirements 8.7**

---

### Property 9: Download token expiry

*For any* download token stored by `storeDocument`, a call to `getDocument` with that token SHALL return the document if called within 30 minutes of storage, and SHALL return `null` if called after 30 minutes have elapsed.

**Validates: Requirements 9.5**

---

### Property 10: Skill validator appends notes only on failure

*For any* assembled document and validation config, if all validation checks pass, the `skillValidate` node SHALL return the document unchanged (no notes appended). If any check fails, the returned document SHALL contain a warning note for each failed check.

**Validates: Requirements 6.7, 6.8**


## Error Handling

### Manifest Loading Errors

| Error | Handling |
|-------|---------|
| `manifest.json` absent (`ENOENT`) | Silent — return default single-mode manifest |
| `manifest.json` invalid JSON | Log warning at `[skillLoader]` level, return default single-mode manifest |
| `manifest.json` missing required fields | Use defaults for missing fields (spread over `DEFAULT_MANIFEST`) |

### Research Fan-out Errors

| Error | Handling |
|-------|---------|
| Individual tool call throws | Caught in `runResearchBranch`, stored as `{ tool, content: null, error: message }` |
| All tools in a branch fail | Branch returns `{ source, results: [...errors] }` — not a fatal error |
| All branches fail | `researchFanOut` detects all-error state, sets `executionMode: 'single'` in returned state, conditional edge falls back to `research` loop |
| `Promise.all` itself throws | Caught in `researchFanOutNode` try/catch, falls back to single-mode |

### Section Writer Errors

| Error | Handling |
|-------|---------|
| `runSubAgent` throws for a section | `writeSectionContent` catches, returns placeholder content with error message |
| All sections fail | `sectionWriter` assembles placeholders for all sections, proceeds to `skillValidate` |
| `runSubAgent` receives invalid model | Throws immediately with descriptive message — surfaces as agent error |

### Document Delivery Errors

| Error | Handling |
|-------|---------|
| `storeDocument` called with empty content | Stores empty document — download returns empty file |
| `GET /api/documents/:token` with expired token | Returns HTTP 410 with message to regenerate |
| `create_confluence_page` API error | Returns JSON error string — agent surfaces in chat |
| `add_jira_comment` API error | Returns JSON error string — agent surfaces in chat |

### Backward Compatibility

The existing `validate` node error handling (appending notes for missing Verdict/URL) is unchanged for the single-mode path. The `skillValidate` node is only reached on the multi-node path.


## Testing Strategy

### Unit Tests

Unit tests cover specific examples and edge cases:

- `loadManifest` with valid JSON, invalid JSON, absent file, missing fields
- `skillRouter` routing logic with various skill combinations
- `extractSectionInstructions` with present markers, absent markers, nested markers
- `storeDocument` / `getDocument` TTL behaviour (mock `Date.now`)
- `skillValidate` with passing and failing validation configs
- `runSubAgent` model validation (valid models pass, invalid models throw)
- `sanitiseQuery` (existing, unchanged)
- `adfToPlainText` (existing, unchanged)

### Property-Based Tests

Property-based tests use [fast-check](https://github.com/dubzzz/fast-check) (JavaScript PBT library). Each test runs a minimum of 100 iterations.

**Property 1: Manifest parsing never crashes**
```javascript
// Feature: skill-execution-architecture, Property 1: manifest parsing never crashes
fc.assert(fc.asyncProperty(fc.string(), async (rawContent) => {
  const result = await loadManifestFromString(rawContent);
  expect(result).toHaveProperty('executionMode');
  expect(['single', 'multi-node']).toContain(result.executionMode);
}), { numRuns: 100 });
```

**Property 2: Skill router routing is deterministic from skill set**
```javascript
// Feature: skill-execution-architecture, Property 2: router routing is deterministic
const manifestArb = fc.record({
  executionMode: fc.oneof(fc.constant('single'), fc.constant('multi-node')),
  researchPhase: fc.array(fc.constantFrom('jira', 'confluence', 'kapa_docs', 'web_search')),
});
fc.assert(fc.property(fc.array(manifestArb, { minLength: 0, maxLength: 10 }), (manifests) => {
  const hasMultiNode = manifests.some(m => m.executionMode === 'multi-node');
  const result = computeRoutingDecision(manifests);
  expect(result).toBe(hasMultiNode ? 'multi-node' : 'single');
}), { numRuns: 100 });
```

**Property 3: Research phase merge is a deduplicated union**
```javascript
// Feature: skill-execution-architecture, Property 3: research phase merge is deduplicated union
const toolArb = fc.constantFrom('jira', 'confluence', 'kapa_docs', 'web_search');
fc.assert(fc.property(
  fc.array(fc.array(toolArb, { maxLength: 4 }), { minLength: 1, maxLength: 5 }),
  (researchPhases) => {
    const manifests = researchPhases.map(rp => ({ executionMode: 'multi-node', researchPhase: rp }));
    const merged = mergeResearchPhases(manifests);
    // No duplicates
    expect(merged.length).toBe(new Set(merged).size);
    // Contains all tools from all manifests
    const expectedSet = new Set(researchPhases.flat());
    expect(new Set(merged)).toEqual(expectedSet);
  }
), { numRuns: 100 });
```

**Property 4: Research branch tool isolation**
```javascript
// Feature: skill-execution-architecture, Property 4: research branch tool isolation
const BRANCH_TOOLS = { jira: ['search_jira', 'get_jira_ticket'], ... };
fc.assert(fc.property(
  fc.constantFrom('jira', 'confluence', 'kapa_docs', 'web_search'),
  fc.string({ minLength: 1 }),
  async (branchType, problemText) => {
    const calledTools = [];
    const mockHandle = async (name) => { calledTools.push(name); return '[]'; };
    await runResearchBranch(branchType, problemText, mockHandle, null);
    const allowedTools = BRANCH_TOOLS[branchType];
    expect(calledTools.every(t => allowedTools.includes(t))).toBe(true);
  }
), { numRuns: 100 });
```

**Property 5: Research branch failure isolation**
```javascript
// Feature: skill-execution-architecture, Property 5: research branch failure isolation
fc.assert(fc.asyncProperty(
  fc.constantFrom('jira', 'confluence', 'kapa_docs', 'web_search'),
  fc.string(),
  async (branchType, errorMessage) => {
    const failingHandle = async () => { throw new Error(errorMessage); };
    const result = await runResearchBranch(branchType, 'test', failingHandle, null);
    expect(result).toHaveProperty('source', branchType);
    expect(result.results.every(r => r.error !== undefined)).toBe(true);
  }
), { numRuns: 100 });
```

**Property 6: Section assembly preserves manifest order**
```javascript
// Feature: skill-execution-architecture, Property 6: section assembly preserves manifest order
fc.assert(fc.property(
  fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 10 }),
  (sectionNames) => {
    const sections = sectionNames.map((name, i) => ({ name, content: `Content ${i}` }));
    const assembled = assembleSections(sections);
    // Each section name appears in order
    let lastIndex = -1;
    for (const section of sections) {
      const idx = assembled.indexOf(section.content);
      expect(idx).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
  }
), { numRuns: 100 });
```

**Property 7: Section_Writer model matches manifest declaration**
```javascript
// Feature: skill-execution-architecture, Property 7: section writer model matches manifest
fc.assert(fc.asyncProperty(
  fc.record({ name: fc.string(), model: fc.oneof(fc.constant('haiku'), fc.constant('sonnet')) }),
  async (sectionConfig) => {
    const calledModels = [];
    const mockRunSubAgent = async ({ model }) => { calledModels.push(model); return 'content'; };
    await writeSectionContent({ section: sectionConfig, ..., runSubAgent: mockRunSubAgent });
    const expectedModel = sectionConfig.model === 'haiku'
      ? 'claude-haiku-4-5-20251001'
      : 'claude-sonnet-4-20250514';
    expect(calledModels).toEqual([expectedModel]);
  }
), { numRuns: 100 });
```

**Property 8: `runSubAgent` model validation**
```javascript
// Feature: skill-execution-architecture, Property 8: runSubAgent model validation
const VALID_MODELS = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-20250514'];
fc.assert(fc.asyncProperty(
  fc.string().filter(s => !VALID_MODELS.includes(s)),
  async (invalidModel) => {
    await expect(runSubAgent({ systemPrompt: 'x', userContent: 'y', model: invalidModel }))
      .rejects.toThrow(/Invalid model/);
  }
), { numRuns: 100 });
```

**Property 9: Download token expiry**
```javascript
// Feature: skill-execution-architecture, Property 9: download token expiry
fc.assert(fc.property(
  fc.integer({ min: 0, max: 29 * 60 * 1000 }),  // within 30 min
  fc.integer({ min: 30 * 60 * 1000 + 1, max: 60 * 60 * 1000 }),  // after 30 min
  (withinTtl, afterTtl) => {
    const now = Date.now();
    const token = storeDocumentWithClock({ content: 'test', filename: 'test.md' }, now);
    expect(getDocumentWithClock(token, now + withinTtl)).not.toBeNull();
    expect(getDocumentWithClock(token, now + afterTtl)).toBeNull();
  }
), { numRuns: 100 });
```

**Property 10: Skill validator appends notes only on failure**
```javascript
// Feature: skill-execution-architecture, Property 10: validator appends notes only on failure
fc.assert(fc.property(
  fc.string(),
  fc.record({
    requiredPatterns: fc.array(fc.string({ minLength: 1 }), { maxLength: 3 }),
  }),
  (doc, validation) => {
    const result = runSkillValidation(doc, validation);
    const allPass = validation.requiredPatterns.every(p => {
      try { return new RegExp(p).test(doc); } catch { return false; }
    });
    if (allPass) {
      expect(result).toBe(doc);  // unchanged
    } else {
      expect(result.length).toBeGreaterThan(doc.length);  // notes appended
      expect(result).toContain('⚠️');
    }
  }
), { numRuns: 100 });
```

### Integration Tests

Integration tests verify end-to-end wiring with 1–3 representative examples:

- Full graph execution with a mock multi-node skill manifest (verifies `researchFanOut → sectionWriter → skillValidate` path)
- `GET /api/documents/:token` endpoint with valid and expired tokens
- `create_confluence_page` tool with mocked Confluence API
- `add_jira_comment` tool with mocked Jira API
- SSE stream includes `document_ready` event when `downloadable: true`

### Smoke Tests

- Graph compiles without error after adding new nodes
- `skillRouter` node is present between `loadSkills` and `research`/`researchFanOut` in the compiled graph
- Rewritten skill files load without error via `loadSkillsForProblem`
- `manifest.json` files parse without error for all four skills


## New/Changed Files Table

| File | Change Type | Summary |
|------|-------------|---------|
| `src/skillLoader.js` | Modified | Add `loadManifest()` and `loadSkillFiles()` functions; exclude `manifest.json` from `collectSkillFiles`; extend `loadSkillsForProblem` return value with `manifests` map |
| `src/graph.js` | Modified | Add `skillRouter`, `researchFanOut`, `sectionWriter`, `skillValidate` nodes; add new state channels; update `loadSkillsNode` to store manifests; update `runSubAgent` calls with `operation` labels; fix `buildEscalationSummary` model |
| `src/subAgent.js` | Modified | Add model validation (throw on invalid model); add `maxTokens` parameter; add `operation` parameter; add token count logging |
| `src/orchestrator.js` | Modified | Update `buildEscalationSummary` to use Haiku via `runSubAgent` instead of direct Anthropic call |
| `src/server.js` | Modified | Add `GET /api/documents/:downloadToken` endpoint; import `getDocument` from `documentStore.js`; add `CONFLUENCE_SDD_PARENT_PAGE_ID` env var handling |
| `src/documentStore.js` | **New** | In-memory document store with 30-minute TTL; exports `storeDocument(opts)` and `getDocument(token)` |
| `src/tools/jira.js` | Modified | Add `add_jira_comment` tool definition and handler |
| `src/tools/confluence.js` | Modified | Add `create_confluence_page` tool definition and handler |
| `src/tools/index.js` | Modified | Add `add_jira_comment` and `create_confluence_page` to `getTools()` dispatcher |
| `public/index.html` | Modified | Add `document_ready` SSE event handler; add download card HTML/CSS; add `escapeHtml` helper if not already present |
| `skills/capillary-sdd-writer/manifest.json` | **New** | Manifest declaring `executionMode: "multi-node"`, research phases, synthesis phases, validation rules |
| `skills/solution-gap-analyzer/manifest.json` | **New** | Manifest declaring `executionMode: "multi-node"`, research phases, synthesis phases, validation rules |
| `skills/excalidraw-diagram/manifest.json` | **New** | Manifest declaring `executionMode: "single"` (explicit, for documentation) |
| `skills/capillary-sdd-writer/SKILL.md` | Modified | Rewrite: remove Claude.ai-specific instructions, add Section_Markers, replace MCP tool refs with web app tool names |
| `skills/solution-gap-analyzer/SKILL.md` | Modified | Rewrite: remove Claude.ai-specific instructions, add Section_Markers, replace MCP tool refs with web app tool names |
| `skills/excalidraw-diagram/SKILL.md` | Modified | Rewrite: remove filesystem/Bash/render instructions, preserve design methodology |
| `CLAUDE.md` | Modified | Add "Model Strategy" section documenting the Model_Dispatch_Policy table |


## Model Strategy (CLAUDE.md Addition)

The following section must be added to `CLAUDE.md` under a new `## Model Strategy` heading:

```markdown
## Model Strategy

Every operation in the agent uses the cheapest model that can do the job correctly.
Sonnet tokens are spent only on tasks that genuinely require multi-source reasoning.

| Operation | Model | Rationale |
|-----------|-------|-----------|
| Request classification | Haiku | Structured JSON output, no reasoning required |
| Semantic skill selection | Haiku | Short list matching, no reasoning required |
| Tool result summarisation | Haiku | Extraction and compression, no reasoning required |
| Research_Branch summarisation | Haiku | Same as tool result summarisation |
| Section writing — structural/factual | Haiku | Problem restatement, references, open questions, complexity |
| Section writing — reasoning | Sonnet | Verdict, approach, architectural decisions |
| Final synthesis (single-mode) | Sonnet | Multi-source reasoning across all tool results |
| Escalation summary | Haiku | Summarisation of existing content, no new reasoning |
| Post-synthesis validation | No model | Regex checks only |
| Skill-specific validation | No model | Structural checks only |

**The `research` node streaming call is the only Sonnet streaming call in the system.**
All other model calls go through `runSubAgent()`.

`runSubAgent()` enforces that only `claude-haiku-4-5-20251001` and `claude-sonnet-4-20250514`
are valid model values — any other value throws immediately.

`MAX_AGENT_TOKENS` applies only to the Sonnet streaming call in `research`.
Haiku sub-agent calls use a fixed `max_tokens` of 1024 unless overridden by a manifest
`synthesisPhase` entry's `maxTokens` field.
```

