# PM / Agent Journey Through the Pipeline

This file maps the PM's and agent's step-by-step journey across all phases — what happens, in what order, and what decisions are made at each step. Includes the evaluation-only mode branch introduced in v7.1.

---

## Entry Point — Mode Detection

```
User triggers the PM Pipeline skill
        │
        ▼
Agent reads SKILL.md → determines mode
        │
        ├─── "Evaluate / Score / Review / Benchmark [BRD]"
        │         └─── EVALUATION-ONLY MODE → jump to Step 5 in phase01-brd.md
        │
        └─── "Create BRD / Start project / Run questions"
                  └─── STANDARD PIPELINE → Phase 01 below
```

---

## Evaluation-Only Mode Journey

```
User uploads existing signed BRD (PDF or DOCX)
        │
        ▼
[1] Agent confirms: evaluation mode — no BRD generation, no discovery questions
        │
        ▼
[2] Agent reads phase01-brd.md Step 5 → loads 12-section rubric + 7 overall dimensions
    Agent reads references/guardrails.md → loads G1–G7 checks
        │
        ▼
[3] Agent detects BRD type (Step 5.1)
    → New Build / Phase Enhancement / Replica / Revamp / WebApp?
    → Adjusts evaluation scope accordingly
        │
        ▼
[4] Run Section Check (Step 5.2)
    → 12 sections: PRESENT / MISSING + 1–5 score + comments
        │
        ▼
[5] Run Overall Scores (Step 5.3)
    → 7 dimensions rated 1–5
    → State Gate 1 pass/fail explicitly
        │
        ▼
[6] Run Guardrail Check G1–G7 (Step 5.4)
    → Assign gap IDs, severity, owner TBD, due date TBD
    → Generate Key Gaps Report in standard format
        │
        ▼
[7] Output Top Improvements + Optional Rewrites (Step 5.5)
    → Prioritised, BRD-specific, actionable
        │
        ▼
[8] PM Decision Point
    → Critical Gaps present?
        ├─ YES → PM updates BRD, increments version (V1.1) → Re-run Step 5
        └─ NO → Request client BPO sign-off → proceed to Phase 02
```

---

## Phase 01 Journey — BRD Creation

```
PM / Agent starts here
        │
        ▼
[1] User triggers skill (standard pipeline)
    → Agent reads SKILL.md + phase01-brd.md Step 0
    → Checks: "Has user provided a document or said 'just start'?"
        │
        ├─ YES (doc provided) → Extract answers from doc → Ask only for missing items
        └─ NO → Run Question Set A first
        │
        ▼
[2] Question Sets A → B → C/D/E (module-conditional) → F (always)
    → Ask in grouped sets — never dump all at once
    → After each set: confirm extracted answers before proceeding
        │
        ▼
[3] Detect BRD Type (Step 2)
    → New Build / Phase Enhancement / Replica / Revamp / WebApp?
    → Adjust document structure accordingly
        │
        ▼
[4] Read references/product-knowledge.md for relevant modules
        │
        ▼
[5] Generate BRD — 21 sections in order (Step 3)
    → Populate from confirmed answers
    → Use RAID pre-fill patterns from references/raid-library.md
    → Flag any unmatched requirement as 🔲 UNCHARTED → ask before writing
        │
        ▼
[6] Save BRD as [ClientName]_BRD_V1.0.docx (Step 4)
    → Generate Member Journey Flow diagram
    → Present to user via present_files
        │
        ▼
[7] AUTO-RUN Step 5 — Evaluation Layer
    → Section Check: 12 sections scored
    → Overall Scores: 7 dimensions rated
    → Guardrail Check G1–G7 → Key Gaps Report generated
    → Top Improvements + Optional Rewrites output
    → Save Key Gaps Report as [ClientName]_Key_Gaps_Report_V1.txt
        │
        ▼
[8] PM Decision Point
    → Any 🔴 Critical Gaps?
        ├─ YES → PM resolves gaps → BRD updated to V1.1 → Re-run Step 5 → new Key Gaps Report
        └─ NO → Run Step 6 Quality Checklist
        │
        ▼
[9] Step 6 Quality Checklist
    → All 15 checklist items confirmed?
        ├─ NO → Address outstanding items
        └─ YES → Request client BPO sign-off
        │
        ▼
[10] Gate 1 Checklist
    → Zero Critical Gaps?
    → All 12 sections PRESENT, none below 3/5?
    → BRD signed by client BPO?
    → Key Gaps Report saved to Confluence?
        ├─ NO → Address outstanding items
        └─ YES → ✅ Gate 1 CLEARED → Proceed to Phase 02
```

---

## Phase 02 Journey — Discovery Dashboard

```
        │ (Gate 1 cleared)
        ▼
[1] Agent reads signed BRD V1.0 + all uploaded folder files
        │
        ▼
[2] Import open 🟡 Risk Items + 🟠 Warnings from Key Gaps Report
    → Load into Guardrail Status Panel with original IDs, owners, due dates
        │
        ▼
[3] Build Pre-BRD Discovery Dashboard HTML
    → Prefill all answerable questions from BRD (label: "From BRD: ...")
    → Prefill from uploaded docs (label: "From uploaded doc: ...")
    → Flag ambiguous items as "Needs Confirmation ❓"
        │
        ▼
[4] Build Yes/No Quick Confirm section
    → Auto-answer from BRD
    → Count toward completion score (50% until stakeholder confirms)
        │
        ▼
[5] PM / Stakeholder discovery session
    → Work through Must-Have questions
    → Confirm all Yes/No items
    → Assign owners to all open questions
    → Resolve or formally waive all 🔴/🟡 guardrail items
    → Log every resolution in the Clarification Register
        │
        ▼
[6] Track completion score (target: 100%)
    → Dashboard shows live % per section
    → Guardrail Status Panel updates in real time
        │
        ▼
[7] All 🔴 Critical + 🟡 Risk guardrail items resolved or waived?
        ├─ NO → PM resolves + documents in Clarification Register
        └─ YES → Export Guardrail Scorecard as .txt
        │
        ▼
[8] If new information found → update BRD to vX.X → re-run Step 5 evaluation
        │
        ▼
[9] Export all outputs → save to Confluence › Discovery Documents:
    → Discovery summary .txt
    → Guardrail Scorecard .txt
    → Clarification Register .xlsx
        │
        ▼
[10] Gate 2 Checklist
    → Discovery 100%? Yes/No section 100%? Guardrail Scorecard exported?
    → Clarification Register cleared?
        ├─ NO → Address outstanding items
        └─ YES → ✅ Gate 2 CLEARED → Proceed to Phase 03
```

---

## Phase 03 Journey — Jira Ticket Creation

```
        │ (Gate 2 cleared)
        ▼
[1] Agent reads approved BRD (sole source of truth)
        │
        ▼
[2] Discover Jira project config via API
    → getAccessibleAtlassianResources → cloudId
    → getVisibleJiraProjects → confirm PSV
    → getJiraIssueTypeMetaWithFields → fields, components, priorities
        │
        ▼
[3] Confirm with PM: Label, GeoRegion, Brand, Environment, Component
        │
        ▼
[4] Create Epics (one per in-scope module)
        │
        ▼
[5] Create Stories per Epic
    → Map each BRD FR to a Story (BRD Reference field mandatory)
    → Write user story format
    → Write ≥ 3 acceptance criteria (at least one covers failure path)
    → Assign Fibonacci story points
    → Flag any Story without a BRD FR as 🔲 UNCHARTED → confirm with PM
        │
        ▼
[6] PM reviews all tickets
    → Confirm or adjust before export
    → Handle any UNCHARTED stories (in-scope or Change Request?)
        │
        ▼
[7] Export CSV + XLSX → save to Confluence › Jira Backlog
        │
        ▼
[8] ✅ Pipeline Complete
    → Live Jira Board active
    → All Confluence folders populated
    → Stakeholders notified
```

---

## Agent Decision Rules (all phases)

| Situation | Agent Action |
|-----------|-------------|
| User provides a BRD or doc for creation | Extract answers; ask only for gaps |
| User provides a BRD or doc for evaluation | Read, score, report — do NOT generate a new BRD |
| User says "just start" without info | Begin Question Set A immediately |
| Requirement has no matching pattern in raid-library.md | Flag 🔲 UNCHARTED; ask 2–3 clarifying questions before writing |
| Gate not cleared | Refuse to advance; show outstanding checklist items |
| Guardrail gap found | Assign ID, owner, due date; log in Clarification Register |
| BRD updated after evaluation | Increment version (V1.1); re-run Step 5; generate new Key Gaps Report |
| Story has no BRD FR reference | Flag 🔲 UNCHARTED; confirm with PM before creating in Jira |
| User says "just score it quickly" | Run all checks — never skip Guardrail categories to save time |
| Critical Gap cannot be resolved by PM alone | Flag owner as TBD; note dependency; include in Clarification Register |
