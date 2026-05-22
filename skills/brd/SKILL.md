---
name: pm-pipeline
description: >
  PM Pipeline · Full 3-phase delivery skill for Capillary PSV projects.
  Triggers: "create BRD", "run discovery", "generate Jira", "PM pipeline",
  "PSV project", "update confluence", "generate tickets from BRD",
  "evaluate BRD", "score BRD", "review signed BRD", "benchmark BRD",
  "Engage+", "Loyalty+", "Rewards+", "Campaign Manager", "CDP", "Neo".
  Phases: 01 BRD Creation (question sets A-F) → 02 Discovery Dashboard
  (prefilled, must reach 100%) → 03 Jira Tickets (gated). Guardrails enforced
  across all phases. BRD Evaluation Layer in phase01-brd.md Step 5. Version v7.1.

---

# PM Pipeline Skill — Project Management · PSV

**End-to-End Pipeline:** BRD → Discovery Dashboard → Jira Tickets  
**Confluence Space:** Project Management - PSV  
**Version:** v7.1

---

## Quick Start — Which File to Read

| User says… | Read this file | Notes |
|-----------|---------------|-------|
| "Create a BRD", "Start a project", "Run questions" | `phase01-brd.md` | Run Steps 0 → 4, then auto-run Step 5 evaluation |
| "Evaluate this BRD", "Score this BRD", "Review the attached BRD", "Benchmark this BRD" | `phase01-brd.md` → **Step 5** | Evaluation-only mode — do NOT generate a new BRD |
| "Run discovery", "Prefill dashboard", "Discovery questions" | `phase02-discovery.md` | Gate 1 must be cleared first |
| "Generate Jira tickets", "Create backlog", "Phase 03" | `phase03-jira.md` | Gate 2 must be cleared first |
| "What modules does Capillary have?", product specs | `references/product-knowledge.md` | Used during BRD generation and evaluation |
| "Run guardrail check", "Show key gaps", "Re-run guardrails" | `references/guardrails.md` | Full G1–G6 spec; also embedded in phase01-brd.md Step 5.4 |
| "What is the PM journey?", "Walk me through the phases" | `references/pm-journey.md` | Includes evaluation-only mode flow |
| "Stakeholder sign-off", "Approval flow", "Who approves what" | `references/stakeholder-journey.md` | Stakeholder map + CR process |
| "Member journey", "Enrolment to redemption", "Customer flow" | `references/customer-journey.md` | Used for BRD Section 13 flows |
| "RAID patterns", "Pre-fill risks", "BRD pattern library" | `references/raid-library.md` | Sourced from 7 signed client BRDs |

---

## Pipeline at a Glance

```
                    ┌─────────────────────────────────┐
                    │  User uploads existing BRD?      │
                    │  "Evaluate / Score / Review"     │
                    └──────────────┬──────────────────┘
                                   │ YES → Evaluation-Only Mode
                                   ▼
                         phase01-brd.md STEP 5
                         Section Check (12 sections)
                         Guardrail Check (G1–G6)
                         Key Gaps Report + Scores
                         Top Improvements + Rewrites
                                   │
                    ┌──────────────┘
                    │ NO → Standard Pipeline
                    ▼

[Phase 01] BRD Creation
     ← Step 0: Read product-knowledge.md first
     ← Steps 1–3: Question Sets A→F + BRD Type Detection
     ← Step 4: Generate 21-section BRD + Member Journey Flow
     ↓ [Step 5: AUTO-RUN Evaluation → Key Gaps Report produced]
     ↓ [Step 6: BRD Quality Checklist]
     ↓ [🔒 GATE 1: Zero Critical Gaps · All 12 sections ≥ 3/5 · BRD signed by client BPO]

[Phase 02] Discovery Dashboard
     ← Prefilled from signed BRD + uploaded folder files
     ← Yes/No Quick Confirm section (auto-answered from BRD)
     ← Live Guardrail Status Panel (re-runs on every update)
     ← Clarification Register tracks all resolved gaps
     ↓ [🔒 GATE 2: 100% complete · All 🔴/🟡 Guardrail items resolved or waived · Guardrail Scorecard exported]

[Phase 03] Jira Ticket Creation
     ← Signed BRD is sole source of truth
     ← Epics (one per module) → Stories (one per FR) → Acceptance Criteria
     ← All fields populated dynamically — no hardcoded values
     ↓ [Output: Live Jira Board · Confluence Docs Updated · PM sign-off]
```

---

## Capillary Modules — Quick Reference

Use this to confirm scope in Phase 01 Question Set A. Deep specs → `references/product-knowledge.md`

| Module | What it does |
|--------|-------------|
| **Loyalty+** | Points accrual, tier management, earning rules, redemption |
| **Engage+** | Omnichannel marketing automation (Email, SMS, WhatsApp, Push, In-App, LINE…) |
| **Rewards+** | Points redemption marketplace; catalog promotions; split tender |
| **Campaign Manager** | Campaign creation, scheduling, A/B testing, broadcast/recurring/journey |
| **CDP** | Customer segmentation, RFM, behavioural analytics, lookalike audiences |
| **Neo (Ext. 2.0)** | Default low-code extension; drag-and-drop dataflows; JSON APIs; SOC 2 |
| **Classic Extension** | Advanced custom code (Loopback/Node.js); for SAML/XML/SOAP requirements |
| **Vulcan** | Custom UI — member care views, branded microsites |
| **Insights+** | Reporting, dashboards, BI integration (Databricks, Power BI, Tableau) |
| **Connect+** | Batch data ingestion via SFTP / S3 / Kafka |
| **Mobile SDK** | Android, iOS, React Native, Flutter — push, in-app, event tracking |
| **APIs / POS** | REST API integration for POS, ecommerce, third-party systems |

---

## Confluence Folder Structure

```
📁 Project Management - PSV  (Root)
 ├── 📋 BRD Documents
 │    ├── [Client]_BRD_V1.0.docx              ← Phase 01 output
 │    ├── [Client]_BRD_V1.1.docx              ← Post-evaluation updates
 │    ├── [Client]_BRD_V[X.X]_Signed.pdf      ← Gate 1 sign-off
 │    ├── [Client]_Key_Gaps_Report_V1.txt      ← Step 5 evaluation output
 │    └── BRD_Sample_Template.md
 │
 ├── 🔍 Discovery Documents
 │    ├── [Client]_PreBRD_Discovery.html       ← Phase 02 output
 │    ├── [Client]_Guardrail_Scorecard.txt     ← Gate 2 export
 │    ├── [Client]_Clarification_Register.xlsx ← Gap resolution log
 │    ├── Discovery_Signoff_Record.docx
 │    └── Open_Questions_Register.xlsx
 │
 ├── 🎯 Jira Backlog
 │    ├── [Client]_Epics_Stories.xlsx          ← Phase 03 output
 │    ├── [Client]_Jira_Import.csv
 │    └── Sprint_Plan.xlsx
 │
 ├── 👥 Stakeholder Docs
 │    ├── Stakeholder_Matrix.docx
 │    ├── Sign_Off_Record.docx
 │    └── Meeting_Notes.docx
 │
 └── ⚙️ Integration & Config
      ├── Integration_Specs.docx
      ├── Config_Mapping.xlsx
      └── POS_Flow_Diagram.pdf
```

**Naming convention:**
- BRD: `[ClientName]_BRD_V1.0.docx` · Signed: `[ClientName]_BRD_V[X.X]_Signed.pdf`
- Key Gaps Report: `[ClientName]_Key_Gaps_Report_V[X.X].txt`
- Guardrail Scorecard: `[ClientName]_Guardrail_Scorecard.txt`
- Clarification Register: `[ClientName]_Clarification_Register.xlsx`
- Discovery: `[ClientName]_PreBRD_Discovery.html`
- Jira exports: `[ClientName]_Jira_Import.csv` / `.xlsx`
- Version control: increment minor (V1.1) for edits, major (V2.0) for full revisions

---

## Gate Summary

| Gate | From | To | Minimum Conditions | Gold-Standard Target |
|------|------|----|--------------------|---------------------|
| **Gate 1** | Phase 01 | Phase 02 | Zero 🔴 Critical Gaps · All 12 sections PRESENT · No section below 3/5 · Client BPO signed · Key Gaps Report saved to Confluence | All 6 Guardrail categories passing · All 12 sections ≥ 4/5 · All 7 overall dimensions ≥ 4/5 |
| **Gate 2** | Phase 02 | Phase 03 | Discovery 100% · Yes/No section 100% confirmed · All 🔴/🟡 items resolved or waived · Guardrail Scorecard exported · Clarification Register cleared | Zero open items in Clarification Register · Guardrail Scorecard 6/6 · BRD at latest version |

> ⚠️ A client signature on a BRD with unresolved Critical Gaps does NOT clear Gate 1. Zero Critical Gaps AND client BPO sign-off are both required.

---

## Agent Rules (apply in all phases)

1. **Never generalise.** Every BRD pattern must match a confirmed client requirement. Flag unknowns as 🔲 UNCHARTED and ask before writing.
2. **Never skip the question protocol.** Read `phase01-brd.md` Steps 0–1 before generating any BRD content.
3. **Never advance past a gate** until its full checklist is complete. Show outstanding items explicitly.
4. **Always run the Evaluation Layer (Step 5)** automatically after BRD generation and again after Discovery completes. Full spec in `phase01-brd.md` Step 5 + `references/guardrails.md`.
5. **If user says "just start" or provides a doc**, extract answers first and only ask for missing items.
6. **In evaluation-only mode**, do NOT generate a new BRD. Read, extract, score, and report only.
7. **Every gap found gets an ID, owner, and due date.** Never log a gap without all three fields.
8. **Increment BRD version** (V1.1, V1.2…) every time the document is updated after an evaluation run.
