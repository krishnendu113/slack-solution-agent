# Requirements Document — Skill Execution Architecture

## Introduction

The Capillary Solution Agent currently loads skills (e.g. `capillary-sdd-writer`, `solution-gap-analyzer`, `excalidraw-diagram`) by concatenating all `.md` files in a skill folder into the system prompt and making a single Sonnet LLM call. The skill files were authored for Claude.ai's Projects environment, which supports sub-agent spawning, filesystem access, MCP tool prefixes like `mcp__atlassian__*`, and model dispatch per sub-agent. None of those capabilities exist in the web app. The result is degraded output: a single LLM call trying to follow multi-agent instructions it cannot execute.

This feature replaces that approach with a structured execution architecture that:
1. Declares each skill's execution requirements in a machine-readable manifest
2. Routes skills to either the existing single-LLM path or a new parallel multi-node path
3. Fans out research across tool categories in parallel for document-class skills
4. Writes long-form output (SDDs, gap analyses) section-by-section using parallel Haiku/Sonnet calls
5. Rewrites the existing skill `.md` files to use actual web app tool names and remove Claude.ai-specific instructions

---

## Glossary

- **Skill**: A specialist capability loaded at runtime into the agent, defined by files in `skills/{folder}/`. Examples: `capillary-sdd-writer`, `solution-gap-analyzer`, `excalidraw-diagram`.
- **Manifest**: A machine-readable `manifest.json` file in each skill folder that declares execution mode, research phases, synthesis phases, output type, and validation rules.
- **Skill_Router**: The new LangGraph node that reads loaded skill manifests and decides which execution path to follow.
- **Single_Mode**: Execution mode where the skill prompt is injected into the system prompt and a single Sonnet call handles everything. Equivalent to current behaviour.
- **Multi_Node_Mode**: Execution mode where research is fanned out across tool categories in parallel, and document sections are written by parallel sub-agent calls.
- **Research_Branch**: A parallel LangGraph sub-graph that targets one tool category (Jira, Confluence, Kapa docs, or web search) during the research fan-out phase.
- **Section_Writer**: A Haiku or Sonnet sub-agent call responsible for writing one section of a long-form output document, given the relevant research results and section-specific instructions.
- **Output_Type**: Either `"assessment"` (structured verdict with six sections, current behaviour) or `"document"` (long-form SDD or gap analysis).
- **Section_Marker**: A delimiter in a skill's `.md` files that identifies which content applies to which output section, enabling Section_Writers to receive only the relevant instructions.
- **Skill_Validator**: Logic declared in a skill's manifest that checks the assembled output for required structural elements before it is sent to the client.
- **LangGraph_Send_API**: The LangGraph mechanism for spawning parallel branches from a single node using `Send` objects.
- **Haiku**: `claude-haiku-4-5-20251001` — the cheap, fast model. Input ~$0.80/MTok, output ~$4/MTok. Used for all lightweight sub-tasks.
- **Sonnet**: `claude-sonnet-4-20250514` — the primary reasoning model. Input ~$3/MTok, output ~$15/MTok. Used for synthesis and architectural judgment only.
- **Model_Dispatch_Policy**: The system-wide rules that assign the correct model to each operation type, ensuring Sonnet is never used where Haiku suffices.
- **Reference_File**: A supporting `.md`/`.txt`/`.json` file in a skill folder (e.g. `golden-path.md`, `style-guide.md`) that provides domain knowledge used by specific sections but not all sections.
- **File_Mapping**: A manifest declaration that maps each synthesis section to the specific Reference_Files it needs, so that Section_Writers receive only the relevant reference material.

---

## Requirements

### Requirement 1: Skill Manifests

**User Story:** As a developer maintaining the Capillary Solution Agent, I want each skill to declare its execution requirements in a machine-readable manifest, so that the agent can route requests to the correct execution path without hardcoded skill-specific logic.

#### Acceptance Criteria

1. THE Skill_Router SHALL read a `manifest.json` file from each skill's folder when that skill is loaded.
2. WHEN a `manifest.json` file is absent from a skill folder, THE Skill_Router SHALL treat the skill as `executionMode: "single"` and proceed without error.
3. THE Manifest SHALL declare an `executionMode` field with value `"single"` or `"multi-node"`.
4. THE Manifest SHALL declare a `researchPhase` field listing which tool categories to use: one or more of `"jira"`, `"confluence"`, `"kapa_docs"`, `"web_search"`.
5. THE Manifest SHALL declare a `synthesisPhase` field listing the output sections to write and the model (`"haiku"` or `"sonnet"`) to use per section.
6. THE Manifest SHALL declare an `outputType` field with value `"assessment"` or `"document"`.
7. THE Manifest SHALL declare a `downloadable` boolean field indicating whether the output should be offered as a file download.
8. THE Manifest SHALL declare a `validation` object containing skill-specific output validation rules.
9. IF a `manifest.json` file contains invalid JSON, THEN THE Skill_Router SHALL log a warning and treat the skill as `executionMode: "single"`.

---

### Requirement 2: Skill Router Node

**User Story:** As a developer, I want a dedicated LangGraph node that reads skill manifests and routes execution to the correct path, so that single-mode and multi-node-mode skills can coexist without branching logic scattered across the graph.

#### Acceptance Criteria

1. THE Skill_Router SHALL be a LangGraph node inserted after `loadSkills` and before the research phase.
2. WHEN all loaded skills have `executionMode: "single"`, THE Skill_Router SHALL route to the existing `research` loop unchanged.
3. WHEN any loaded skill has `executionMode: "multi-node"`, THE Skill_Router SHALL route to the parallel research fan-out path.
4. WHEN no skills are loaded, THE Skill_Router SHALL route to the existing `research` loop unchanged.
5. THE Skill_Router SHALL merge the `researchPhase` tool categories from all loaded multi-node skills into a deduplicated list of Research_Branches to spawn.
6. THE Skill_Router SHALL pass the merged manifest configuration forward in the LangGraph state so downstream nodes can access it.
7. THE Skill_Router SHALL emit an `onPhase` callback with value `"routing"` when it begins execution.

---

### Requirement 3: Parallel Research Fan-out

**User Story:** As a CS engineer using the SDD writer or gap analyzer, I want the agent to search all relevant sources simultaneously rather than sequentially, so that research completes faster and covers more ground.

#### Acceptance Criteria

1. WHEN the Skill_Router routes to the multi-node path, THE Research_Branch SHALL be spawned as one parallel branch per tool category declared in the merged `researchPhase` configuration.
2. THE Research_Branch instances SHALL execute concurrently using `Promise.all` or the LangGraph `Send` API.
3. EACH Research_Branch SHALL target only the tool category it is responsible for: a Jira branch calls only `search_jira` and `get_jira_ticket`; a Confluence branch calls only `search_confluence` and `get_confluence_page`; a Kapa branch calls only `search_kapa_docs`; a web search branch calls only `search_docs_site`.
4. EACH Research_Branch SHALL summarise its results using a Haiku sub-agent call before returning, passing the original problem text as context (consistent with the existing `summariseToolResult` pattern in `graph.js`).
5. WHEN a Research_Branch tool call fails, THE Research_Branch SHALL return a partial result with an error note rather than failing the entire fan-out.
6. THE Graph SHALL collect all Research_Branch results into a shared `researchResults` state field before proceeding to synthesis.
7. THE Graph SHALL emit `onToolStatus` events for each tool call within each Research_Branch, consistent with the existing tool status event format.
8. WHEN all Research_Branches complete, THE Graph SHALL emit an `onPhase` callback with value `"synthesise"`.

---

### Requirement 4: Section-Writing Nodes for Document Skills

**User Story:** As a CS engineer requesting an SDD or gap analysis, I want the agent to write each section of the document in parallel using focused sub-agent calls, so that the output is more thorough and faster than a single monolithic LLM call.

#### Acceptance Criteria

1. WHEN a loaded skill has `outputType: "document"`, THE Graph SHALL spawn one Section_Writer per section declared in the skill's `synthesisPhase` configuration after research fan-out completes.
2. EACH Section_Writer SHALL receive: the original problem text, the research results relevant to its section (filtered by section-to-tool-category mapping in the manifest), and the section-specific instructions extracted from the skill's `.md` files using Section_Markers.
3. EACH Section_Writer SHALL use the model specified for its section in the manifest (`"haiku"` maps to `claude-haiku-4-5-20251001`, `"sonnet"` maps to `claude-sonnet-4-20250514`).
4. THE Section_Writer instances SHALL execute concurrently using `Promise.all`.
5. WHEN all Section_Writers complete, THE Graph SHALL assemble the sections in the order declared in the manifest's `synthesisPhase` configuration.
6. THE assembled document SHALL be streamed token-by-token to the client via the existing `onToken` callback after assembly.
7. WHEN a Section_Writer call fails, THE Graph SHALL insert a placeholder noting the section could not be generated, and continue assembling the remaining sections.
8. THE Graph SHALL emit `onStatus` updates indicating which sections are being written, using the section names from the manifest.

---

### Requirement 5: Rewritten Skill Files for Web App Context

**User Story:** As a CS engineer using the SDD writer or gap analyzer, I want the skill instructions to match the tools actually available in the web app, so that the agent follows instructions it can execute rather than simulating multi-agent behaviour it cannot.

#### Acceptance Criteria

1. THE rewritten `capillary-sdd-writer/SKILL.md` SHALL NOT contain references to `Agent` tool spawning, `ToolSearch`, `Glob`, `Bash`, file writes to `output-sdd/`, progress tracker files, or `mcp__atlassian__*` tool prefixes.
2. THE rewritten `solution-gap-analyzer/SKILL.md` SHALL NOT contain references to `Agent` tool spawning, `ToolSearch`, `Glob`, `Bash`, or `mcp__capillary_docs__*` tool prefixes.
3. THE rewritten `excalidraw-diagram/SKILL.md` SHALL NOT contain references to filesystem tools, `Bash`, or MCP tool prefixes.
4. THE rewritten skill files SHALL reference only the actual web app tool names: `search_jira`, `get_jira_ticket`, `search_confluence`, `get_confluence_page`, `search_kapa_docs`, `search_docs_site`.
5. THE rewritten skill files SHALL preserve all domain knowledge: the Tier 1–5 framework, golden path decision logic, CRITICAL data rules, output format specifications, and scoring rubrics.
6. THE rewritten skill files SHALL contain Section_Markers in the format `<!-- SECTION: {section-name} -->` and `<!-- END SECTION: {section-name} -->` so Section_Writers can extract the relevant instructions for each output section.
7. WHEN a rewritten skill file is loaded by `skillLoader.js`, THE Skill_Loader SHALL produce a prompt block that is valid for a single Sonnet call (i.e., the `"single"` mode path must still work as a fallback).
8. THE rewritten `capillary-sdd-writer/SKILL.md` SHALL include explicit instructions for the Section 9 API flows section, referencing the Tier 1–5 framework from `golden-path.md`.

---

### Requirement 6: Skill-Specific Output Validation

**User Story:** As a CS engineer, I want the agent to verify that skill outputs contain the required structural elements before delivering them, so that incomplete SDDs or gap analyses are flagged rather than silently delivered.

#### Acceptance Criteria

1. THE Skill_Validator SHALL run after section assembly and before the output is streamed to the client.
2. WHEN the loaded skill is `capillary-sdd-writer`, THE Skill_Validator SHALL check that the assembled output contains a Section 9 (API flows) heading.
3. WHEN the loaded skill is `capillary-sdd-writer`, THE Skill_Validator SHALL check that the assembled output contains at least one verified Jira or Confluence URL (matching `https://capillarytech.atlassian.net/`).
4. WHEN the loaded skill is `solution-gap-analyzer`, THE Skill_Validator SHALL check that the assembled output contains a match percentage (a number followed by `%`).
5. WHEN the loaded skill is `solution-gap-analyzer`, THE Skill_Validator SHALL check that the assembled output contains a domain-by-domain breakdown (at least three domain headings).
6. WHEN the loaded skill is `excalidraw-diagram`, THE Skill_Validator SHALL check that the assembled output contains valid Excalidraw JSON (a JSON object with a `elements` array).
7. WHEN a Skill_Validator check fails, THE Skill_Validator SHALL append a warning note to the output identifying which check failed, consistent with the existing `validate` node pattern in `graph.js`.
8. IF all Skill_Validator checks pass, THEN THE Skill_Validator SHALL not append any notes to the output.
9. THE Skill_Validator rules SHALL be declared in the skill's `manifest.json` `validation` field so they can be extended without modifying `graph.js`.

---

### Requirement 7: Backward Compatibility and Graceful Degradation

**User Story:** As a developer, I want the new execution architecture to be fully backward compatible with existing single-mode skills and the existing agent behaviour, so that the `cr-evaluator` and any future simple skills continue to work without modification.

#### Acceptance Criteria

1. WHEN no skill manifests are present, THE Graph SHALL execute identically to the current `classify → loadSkills → research (loop) → validate` path.
2. THE existing `cr-evaluator` skill SHALL continue to function without a `manifest.json` file.
3. THE existing `onStatus`, `onToken`, `onToolStatus`, `onSkillActive`, and `onPhase` SSE callback contracts SHALL remain unchanged for single-mode execution paths.
4. THE existing `validate` node logic (checking for Verdict and reference URLs) SHALL continue to run for `outputType: "assessment"` skills.
5. WHEN the Skill_Router routes to the multi-node path but all Research_Branches fail, THE Graph SHALL fall back to the existing single `research` loop with the skill prompt injected.
6. THE `skillLoader.js` `loadSkillsForProblem` function signature SHALL remain unchanged so the `graph.js` `loadSkillsNode` requires no modification to its call site.
7. THE `manifest.json` file SHALL be excluded from the skill prompt assembled by `skillLoader.js` (i.e., it must not be concatenated into the system prompt as a text block).

---

### Requirement 8: Model Dispatch Policy

**User Story:** As a system operator, I want every operation in the agent to use the cheapest model that can do the job correctly, so that Sonnet tokens are spent only on tasks that genuinely require its reasoning capability.

#### Acceptance Criteria

1. THE Model_Dispatch_Policy SHALL assign models to operations according to the following table, which is the authoritative reference for all implementation decisions:

   | Operation | Model | Rationale |
   |-----------|-------|-----------|
   | Request classification (`classifyRequest`) | Haiku | Structured JSON output, no reasoning required |
   | Semantic skill selection (`classifyNode`) | Haiku | Short list matching, no reasoning required |
   | Off-topic gate (future) | Haiku | Binary classification, no reasoning required |
   | Tool result summarisation (`summariseToolResult`) | Haiku | Extraction and compression, no reasoning required |
   | Research_Branch tool execution | Haiku (summarisation only) | Tool calls are deterministic; only the summary uses a model |
   | Section writing — structural/factual sections | Haiku | Problem restatement, references list, open questions, complexity estimate |
   | Section writing — reasoning sections | Sonnet | Verdict with justification, approach steps, architectural decisions |
   | Final synthesis turn (single-mode, assessment output) | Sonnet | Multi-source reasoning across all tool results |
   | Final synthesis turn (single-mode, document output) | Sonnet | Long-form document requiring coherence across sections |
   | Escalation summary (`buildEscalationSummary`) | Haiku | Summarisation of existing content, no new reasoning |
   | Post-synthesis validation (`validateNode`) | No model call | Regex checks only — no LLM involved |
   | Skill-specific output validation (`Skill_Validator`) | No model call | Structural checks only — no LLM involved |

2. THE `research` node in `graph.js` SHALL continue to use Sonnet for the main agentic loop turn, because tool selection and multi-turn reasoning require Sonnet's capability. This is the only node where Sonnet is used for a streaming call.

3. THE `buildEscalationSummary` function in `orchestrator.js` SHALL be updated to use Haiku instead of Sonnet, since it summarises already-assembled content and does not require new reasoning.

4. WHEN a Section_Writer is spawned for a structural section (problem restatement, references, open questions, complexity), THE Section_Writer SHALL use Haiku.

5. WHEN a Section_Writer is spawned for a reasoning section (verdict, approach, architectural decisions), THE Section_Writer SHALL use Sonnet.

6. THE manifest `synthesisPhase` section entries SHALL declare `"model": "haiku"` or `"model": "sonnet"` per section, and this declaration SHALL be the sole source of truth for which model a Section_Writer uses — no hardcoding in `graph.js`.

7. THE `runSubAgent` function in `src/subAgent.js` SHALL enforce that only `claude-haiku-4-5-20251001` and `claude-sonnet-4-20250514` are valid model values; any other value SHALL cause a thrown error with a descriptive message rather than silently passing an invalid model to the Anthropic API.

8. THE agent SHALL log the model used for each sub-agent call at `[subAgent]` log level, including the operation name and token counts from the API response, so that cost per operation can be monitored.

9. WHEN `MAX_AGENT_TOKENS` is set in the environment, it SHALL apply only to the Sonnet streaming call in the `research` node. Haiku sub-agent calls SHALL use a fixed `max_tokens` of 1024 unless the operation is a Section_Writer for a document skill, in which case the manifest's `synthesisPhase` entry MAY declare a `maxTokens` override.

10. THE Model_Dispatch_Policy SHALL be documented in `CLAUDE.md` under a dedicated "Model Strategy" section so future developers do not inadvertently use Sonnet for lightweight operations.

---

### Requirement 9: Document Output Delivery

**User Story:** As a CS engineer, I want long-form documents (SDDs, gap analyses) delivered as downloadable files or written directly to Confluence/Jira rather than dumped as raw text in the chat window, so that the chat remains readable and documents are stored where the team can find them.

#### Acceptance Criteria

1. WHEN a skill with `outputType: "document"` completes assembly, THE Agent SHALL NOT stream the document body as `token` SSE events into the chat window.

2. INSTEAD, THE Agent SHALL stream a short chat summary (max 150 words) as `token` events covering: what was produced, key findings or verdict, and the available delivery options.

3. THE Agent SHALL always offer a file download as the default delivery option. THE server SHALL store the assembled document in memory for the duration of the SSE connection and emit a `document_ready` SSE event with fields: `{ filename, sizeBytes, downloadToken }`.

4. THE client SHALL render a download card in the chat message (not inline text) when it receives a `document_ready` event. The card SHALL show the filename, approximate size, and a download button that fetches `GET /api/documents/:downloadToken`.

5. THE `GET /api/documents/:downloadToken` endpoint SHALL return the document as a file download with `Content-Disposition: attachment` and appropriate `Content-Type` (`.md` → `text/markdown`, `.json` → `application/json`). The download token SHALL expire after 30 minutes.

6. WHEN the user explicitly requests Confluence delivery (e.g. "write this to Confluence", "save to Confluence"), THE Agent SHALL call `create_confluence_page` tool with the assembled document as the page body, under a parent page configurable via `CONFLUENCE_SDD_PARENT_PAGE_ID` env var. On success, THE Agent SHALL emit a chat message with a clickable link to the created page.

7. WHEN the user explicitly requests Jira delivery (e.g. "add to Jira", "comment on the ticket"), THE Agent SHALL call `add_jira_comment` tool with a condensed summary (max 500 words, produced by Haiku) rather than the full document. THE Agent SHALL emit a chat message confirming the comment was added with a link to the ticket.

8. THE `create_confluence_page` and `add_jira_comment` tool definitions SHALL be added to `src/tools/confluence.js` and `src/tools/jira.js` respectively, and included in `getTools()` only when the relevant env vars are configured.

9. WHEN neither Confluence nor Jira delivery is requested and the download token expires before the user clicks download, THE Agent SHALL emit a `status` SSE event informing the user they can regenerate the document.

10. THE short chat summary emitted in criterion 2 SHALL always include the delivery options available to the user, e.g.: *"📄 SDD ready — [Download as Markdown] or say 'write to Confluence' / 'comment on JIRA-123'."*

11. THIS requirement applies to `capillary-sdd-writer` and `solution-gap-analyzer` skills. THE `excalidraw-diagram` skill is exempt — its JSON output is already handled by the existing file download mechanism in `public/index.html`.

---

### Requirement 10: Conditional Reference File Loading

**User Story:** As a system operator, I want skill reference files loaded only when the section being written actually needs them, so that Section_Writers receive minimal context and token usage is reduced.

#### Acceptance Criteria

1. THE Manifest SHALL declare a `fileMapping` object that maps each synthesis section name to an array of reference file paths (relative to the skill folder) that section needs. Example: `"api-flows": ["golden-path.md", "style-guide.md", "api-reference-template.md"]`.

2. WHEN a Section_Writer is spawned for a section that has a `fileMapping` entry, THE Section_Writer SHALL receive only the reference files listed in that entry — not the full skill prompt.

3. WHEN a Section_Writer is spawned for a section that has no `fileMapping` entry (or `fileMapping` is absent from the manifest), THE Section_Writer SHALL receive the full skill prompt as a fallback (current behaviour).

4. THE `SKILL.md` file SHALL always be included for every Section_Writer regardless of `fileMapping`, because it contains the global context and output format instructions.

5. THE `skillLoader.js` SHALL expose a new function `loadSkillFiles(skillId, fileNames)` that loads only the specified files from a skill folder and returns the assembled prompt block. This function SHALL be used by Section_Writers in multi-node mode.

6. IN single-mode execution, THE Skill_Loader SHALL continue to load all files unconditionally (current behaviour unchanged).

7. THE Agent SHALL log the files loaded per section at `[sectionWriter]` log level, including the section name and file count, so that operators can verify reference files are being filtered correctly.

8. WHEN a `fileMapping` entry references a file that does not exist in the skill folder, THE Skill_Loader SHALL log a warning and skip the missing file rather than failing the Section_Writer.

9. FOR the `capillary-sdd-writer` skill, the `fileMapping` SHALL map at minimum:
   - `"api-flows"` → `["golden-path.md", "style-guide.md", "api-reference-template.md", "section-template.md"]`
   - `"architecture"` → `["diagram-rules.md", "capillary-patterns.md"]`
   - `"solution-strategy"` → `["golden-path.md", "capillary-patterns.md"]`
   - `"problem"` → `["section-template.md"]`
   - `"open-questions"` → `["section-template.md"]`
   - `"nfrs"` → `["section-template.md"]`

10. FILES not referenced by any `fileMapping` entry (e.g. `progress-tracker-template.md`, `persistence-guide.md`, `validate_api.py`) SHALL NOT be loaded in multi-node mode, saving tokens.

---

### Requirement 11: Lazy Skill Loading (Name + Description Only)

**User Story:** As a system operator, I want skills loaded into the system prompt as lightweight summaries (name + description only) rather than full file content, so that the agent has visibility of all available skills in minimal context and can request full details only when needed.

#### Acceptance Criteria

1. WHEN skills are loaded into the system prompt, THE Skill_Loader SHALL inject only the skill ID and description for each matched skill — NOT the full `SKILL.md` content or reference files.

2. THE Agent SHALL have access to a `get_skill_details` tool that accepts a `skill_id` parameter and returns the full `SKILL.md` content for that skill.

3. THE Agent SHALL have access to a `get_skill_reference` tool that accepts `skill_id` and `filename` parameters and returns the content of a specific reference file from that skill's folder.

4. WHEN the Agent determines it needs a skill's full instructions (e.g. to write an SDD or perform a gap analysis), it SHALL call `get_skill_details` to load the full content into its context.

5. WHEN the Agent needs a specific reference file (e.g. `golden-path.md`, `scoring-engine.md`), it SHALL call `get_skill_reference` to load only that file.

6. THE existing `activate_skill` tool SHALL be updated to return only the skill name and description (lightweight activation), consistent with the new loading approach.

7. THE `list_skills` tool SHALL continue to return all registered skills with their IDs, descriptions, and triggers — unchanged.

8. IN multi-node execution mode, THE Section_Writers SHALL continue to use `loadSkillFiles` with `fileMapping` to load reference files directly (no tool call needed) — lazy loading applies only to the single-mode path where the LLM decides what to load.

9. THE lightweight skill summary injected into the system prompt SHALL follow this format per skill:
   ```
   Available skill: {id} — {description}
   Use get_skill_details("{id}") to load full instructions when needed.
   ```

10. THIS change SHALL reduce the default system prompt size by removing the full skill content that was previously concatenated unconditionally for always-on skills like `cr-evaluator`.
