# Persistence Guide: Feedback Log & SA Answers

> Both files below persist human input across SDD/LLD generation sessions. At **Step 0.5**, the skill reads both files (if they exist), builds registries from them, and skips re-asking any question or re-applying any feedback that is already recorded. This avoids the SA repeating themselves across regenerations.

---

## Part 1: Feedback Log

### Purpose

Captures improvement feedback from the Solutions Architect so that corrections made after reviewing a real output are automatically applied to all future sessions.

### File Location

`input-brd/feedback-log.md` — created automatically when the first feedback entry is captured. The SA can also edit it manually.

### Entry Format

```markdown
---
### Feedback Entry [N]
**Date:** YYYY-MM-DD
**SDD/LLD File:** output-sdd/{BrandName}-SDD-{YYYY-MM-DD}.md
**Session Input:** [Brief description of BRD/requirement that was provided]
**Feedback Given:** [Verbatim or close paraphrase of the SA's feedback]
**Category:** [see categories below]
**Applies To:** [SDD | LLD | BOTH]
**Priority:** [HIGH | MEDIUM | LOW]
**Resolved:** NO
---
```

**Categories:**

| Category | Description |
|---|---|
| `PROCESS_FLOW_DEPTH` | Process flow Layer 2 steps too shallow, missing branches, or missing field-level detail |
| `API_DOCUMENTATION` | API spec table incomplete, wrong field names, missing mandatory fields, wrong format |
| `DIAGRAM` | Sequence diagram missing elements, incorrect participants, wrong flow |
| `TIER_SELECTION` | Wrong tier assigned to a use case |
| `FIELD_MAPPING` | Data mapping table wrong, incomplete, or missing |
| `STYLE` | Tone, formatting, verbosity, or section depth not matching expected style |
| `OTHER` | Any feedback not fitting the above categories |

### How Feedback Is Used (Step 0.5)

1. Reads `input-brd/feedback-log.md` if it exists
2. Extracts all entries with `Resolved: NO` and `Applies To: SDD` or `BOTH`
3. Builds an Active Feedback Registry for the session
4. Applies each entry as an additional constraint during Step 5 (SDD writing) and in every subagent prompt (Step 5b)
5. Reports: `"Feedback Context: [N active entries loaded | No feedback file found]"`

The LLD skill uses the same pattern: reads entries with `Applies To: LLD` or `BOTH`.

### Capturing Entries During a Session

When the SA gives correction or improvement feedback at any point after a draft:

1. The skill classifies the feedback (Category, Applies To, Priority)
2. Appends a new entry to `input-brd/feedback-log.md` (creates file and `input-brd/` directory if needed)
3. Confirms: *"Recorded as Feedback Entry [N] in `input-brd/feedback-log.md`. Applied in all future sessions."*

### Marking as Resolved

When a feedback entry is permanently addressed by a skill file update, set `Resolved: YES` with date:

```markdown
**Resolved:** YES — incorporated into skill files on YYYY-MM-DD
```

Resolved entries are ignored by the session loader (Step 0.5 only loads `Resolved: NO`).

### Example

```markdown
# SDD/LLD Feedback Log

---
### Feedback Entry 1
**Date:** 2026-03-10
**SDD/LLD File:** output-sdd/RetailCo-SDD-2026-03-10.md
**Session Input:** New client RetailCo — mobile app loyalty, POS earn, web redemption
**Feedback Given:** The process flow for Customer Enrolment (§9.1) only described that POST /v2/customers is called, but did not show what fields are sent or what the response looks like. Developer could not understand the data flow from the flow alone.
**Category:** PROCESS_FLOW_DEPTH
**Applies To:** SDD
**Priority:** HIGH
**Resolved:** NO
```

---

## Part 2: SA Answers Template

### File Location

`input-brd/{BrandName}-sa-answers.md` — created during the first SA question. Persists across regenerations.

### File Header

```markdown
# {BrandName} SA Q&A Log

**SDD Session Started:** {YYYY-MM-DD}
**SA:** {name if known}
**Progress File:** `output-plan/{BrandName}-progress-{YYYY-MM-DD}.md`
```

### Question Sections

#### Infrastructure Questions (Step 1e)

| Q# | Question | Answer | Answered On | Source |
|----|----------|--------|-------------|--------|

#### Clarification Interview (Step 1c)

| Q# | Question | Answer | Answered On | Source |
|----|----------|--------|-------------|--------|

#### Batch Flow Questions (Step 1d)

| Q# | Question | Answer | Answered On | Source |
|----|----------|--------|-------------|--------|

#### Mandatory Field Questions (Step 5a)

| Q# | Use Case | API | Field | Question | Answer | Answered On |
|----|----------|-----|-------|----------|--------|-------------|

#### Design Gate Questions (Step 4c)

| Q# | Gate | Question | Answer | Answered On |
|----|------|----------|--------|-------------|

#### SA Review Checkpoint 1 (Post-Analysis)

| Q# | Topic | Question/Feedback | SA Response | Responded On |
|----|-------|-------------------|-------------|-------------|

#### SA Review Checkpoint 2 (Post-Draft)

| Q# | Topic | Question/Feedback | SA Response | Responded On |
|----|-------|-------------------|-------------|-------------|

#### Ad-Hoc Questions (During Session)

| Q# | Context | Question | Answer | Answered On | Step |
|----|---------|----------|--------|-------------|------|

### Usage Notes

- **Format:** Every answer must include the date it was given and the source (SA verbal, BRD §X, Confluence page, etc.)
- **Updates:** If an answer changes, append a new row with the updated answer — do not delete the original. Mark the original with `[SUPERSEDED by Q{new#}]`.
- **Pre-loading (Step 0.5):** The skill reads this file and:
  - Populates CRITICAL data registry from Infrastructure Questions
  - Marks answered questions as resolved in the progress tracker
  - Skips any question whose Q# already has an answer in this file
- **Cross-reference:** Citation entries of type `SA` reference this file as `sa-answers.md Q{N}`.
