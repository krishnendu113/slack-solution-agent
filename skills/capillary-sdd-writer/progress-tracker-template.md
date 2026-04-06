# {BrandName} SDD Generation Progress

**Started:** {YYYY-MM-DD HH:MM}
**Input:** {JIRA-ID or BRD summary}
**Document Type:** {Full SDD | Lite SDD | TBD}
**Status:** IN_PROGRESS | COMPLETE | BLOCKED

---

## Pipeline Progress

| Step | Description | Status | Completed At | Notes |
|------|-------------|--------|-------------|-------|
| Pre-flight A | MCP Tool Loading | PENDING | | |
| Pre-flight B | Resume Check | DONE | {timestamp} | Fresh start / Resumed from Step {N} |
| 0.1 | MCP Health Check | PENDING | | |
| 0.2 | MCP Probe | PENDING | | |
| 0.3 | MCP Status Report | PENDING | | |
| 0.4 | API Schema Pre-Fetch Gate | PENDING | | |
| 0.5 | Load Feedback + SA Answers | PENDING | | |
| 0.6 | Progress Tracker Init | DONE | {timestamp} | This file created |
| 0.7 | Excalidraw Availability | PENDING | | EXCALIDRAW_AVAILABLE: TBD |
| 1 | Parse Input | PENDING | | |
| 1c | Clarification Interview | PENDING | | Questions asked: 0, Answered: 0 |
| 1d | Batch Flow Gap-Fill | PENDING | | |
| 1e | Infrastructure Data Collection | PENDING | | |
| 2 | Research Existing Solutions | PENDING | | |
| 2b | Public Docs Crawl | PENDING | | Pages fetched: 0 |
| 2c | Agent-Based Use Case Analysis | PENDING | | Agents dispatched: 0 |
| CP1 | SA Review Checkpoint 1 | PENDING | | Post-analysis SA review |
| 3 | Decide Document Type | PENDING | | |
| 4 | Map Requirements to Tiers | PENDING | | |
| 4b | API Validation Gate | PENDING | | |
| 4c | Design Gate Evaluation | PENDING | | Gates fired: 0 |
| 4d | Solution Brief (dry-run) | PENDING | | Only if --dry-run |
| 5 | Write SDD | PENDING | | |
| 5a | Mandatory Field Gap Check | PENDING | | |
| 5b-A | Use Case Analysis Agents | PENDING | | |
| 5b-B | Use Case Writing Agents | PENDING | | |
| 5c | API Reference Consolidation | PENDING | | |
| CP2 | SA Review Checkpoint 2 | PENDING | | Post-draft SA review |
| 6 | Self-Verify (Checklist) | PENDING | | |
| 7 | Write Output File | PENDING | | |
| 7b | Auto-Review Prompt | PENDING | | |
| 8 | Confluence Publishing | PENDING | | |
| 9 | Summary | PENDING | | |

---

## Token Budget Tracking

| Checkpoint | Est. Tokens Used | % Budget | Action |
|------------|-----------------|----------|--------|
| After Step 2 | | | |
| After Step 2c | | | |
| After Step 5 | | | |
| After Step 6 | | | |

---

## Registries Snapshot

### Requirement Registry

| Req ID | Source | Requirement Summary | Tier | Section 9 Ref | Status |
|--------|--------|---------------------|------|---------------|--------|
<!-- Populated during Step 2 -->

### API Schema Fetch Log

| Endpoint | Method | Version | MCP Tool Used | Fetch Status | Schema Hash | Fetched At |
|----------|--------|---------|---------------|-------------|-------------|------------|
<!-- Populated during Steps 0.4 and 2 -->

### CRITICAL Data Registry

| Key | Value | Source | Confirmed By | Confirmed At |
|-----|-------|--------|-------------|-------------|
<!-- Populated during Step 1e -->

### Citation Registry

| CIT ID | Source Type | Source Reference | Extracted Fact | Used In |
|--------|-----------|------------------|----------------|---------|
<!-- Populated incrementally during Steps 1-5 -->

### Active Feedback Registry

| Entry | Category | Priority | Constraint Applied |
|-------|----------|----------|--------------------|
<!-- Loaded from feedback-log.md at Step 0.5 -->

---

## Public Docs Research

<!-- Populated during Step 2b -->
| URL Fetched | Key Facts Extracted | Citations Generated |
|-------------|--------------------|--------------------|

---

## Use Case Analysis Briefs

<!-- Populated during Step 2c agent analysis -->

### UC-{N}: {Use Case Name}
- **Tier Recommendation:**
- **APIs Found:**
- **Gaps Identified:**
- **SA Questions:**
- **Citations:**

---

## SA Questions Log

Reference: `input-brd/{BrandName}-sa-answers.md`

| Q# | Step | Question | Status |
|----|------|----------|--------|
<!-- Quick reference — full Q&A in sa-answers file -->

---

## Open Issues

| Issue | Severity | Identified At | Resolution |
|-------|----------|--------------|------------|

---

## Sections Written (Incremental Output)

| Section | Status | Written At | Word Count |
|---------|--------|-----------|------------|
| §1 Introduction | PENDING | | |
| §2 Constraints | PENDING | | |
| §3 Context/Scope | PENDING | | |
| §4 Systems Involved | PENDING | | |
| §5 Solution Strategy | PENDING | | |
| §6 Deployment View | PENDING | | |
| §7 Building Block View | PENDING | | |
| §8 Crosscutting Concepts | PENDING | | |
| §9.X Use Cases | PENDING | | Per use case tracking below |
| §10 ADRs | PENDING | | |
| §11 NFRs/QRs | PENDING | | |
| API Reference | PENDING | | |
| Integration & Config Data | PENDING | | |
| Citation Index | PENDING | | |

### Section 9 Use Case Progress

| UC | Name | Analysis Agent | Writing Agent | Written | Reviewed |
|----|------|---------------|---------------|---------|----------|
<!-- One row per use case -->

---

## Context Compaction Resume Instructions

If context compaction has occurred, this file is your ground truth. Resume protocol:

1. Read this file completely.
2. Read `input-brd/{BrandName}-sa-answers.md` for all previously answered SA questions.
3. Read `input-brd/feedback-log.md` for active feedback constraints.
4. Identify the first PENDING step in the Pipeline Progress table above.
5. Load all serialized registries from the Registries Snapshot section.
6. Resume from the first PENDING step — do NOT re-execute DONE steps.
7. Report to SA: "Resumed from Step {N}. Loaded {X} requirement entries, {Y} API schemas, {Z} citations."

**CRITICAL:** All DONE registries are authoritative. Do not re-fetch APIs already in the Schema Fetch Log. Do not re-ask questions already in the SA answers file.
