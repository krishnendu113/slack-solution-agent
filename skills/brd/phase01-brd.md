# Phase 01 — BRD Creation (Agent-Guided)

**Input:** Agent question protocol answers + Capillary product knowledge  
**Output:** `[ClientName]_BRD_V1.0.docx` + `[ClientName]_Key_Gaps_Report_V1.txt` → saved to Confluence › BRD Documents  
**Next:** Step 5 Evaluation auto-runs → Key Gaps Report → Step 6 Quality Checklist → Gate 1

> **Evaluation-only mode:** If the user asks to evaluate an existing BRD rather than create a new one, skip Steps 0–4 and jump directly to **Step 5**. Do NOT generate a new BRD.

---

## ⚡ Step 0 — Agent Rule Before Writing Anything

> Read `references/product-knowledge.md` for deep Capillary module specs before populating BRD sections.  
> Do NOT write any BRD content until Question Sets A–F are complete.  
> If the user provides a document, extract answers from it first — only ask for missing items.

---

## Step 1 — Agent Question Protocol

Present questions conversationally in grouped sets. Never dump all questions at once.

### Question Set A — Project Identity *(ask first, always)*

1. **Client / Brand name?**
2. **Project name or programme name?**
3. **Which Capillary modules are in scope?** *(show selection list below)*
4. **What is the core business problem this project solves?** (1–3 sentences)
5. **What are the top 3 business objectives?**
6. **Target go-live date or timeline?**

**Module selection list to show:**
```
[ ] Loyalty+          [ ] Campaign Manager    [ ] Rewards+
[ ] Engage+           [ ] CDP                 [ ] Mobile App
[ ] APIs / POS        [ ] LINE Integration    [ ] Insights+
[ ] Neo (custom)      [ ] Vulcan (custom UI)  [ ] Connect+ (batch data)
```

---

### Question Set B — Scope Clarification *(after Set A)*

7. **New programme build or enhancement/migration of existing one?**
8. **Which channels for customer communication?** *(SMS, Email, WhatsApp, Push, In-App, LINE, Viber, RCS, Zalo, Call Task)*
9. **POS integration?** If yes: which POS system/vendor?
10. **Mobile app?** If yes: iOS / Android / React Native / Flutter?
11. **How many tiers in the loyalty programme?**
12. **Any known third-party integrations?** (ERP, payment gateway, partner brands)
13. **Phased delivery?** If yes: what is in Phase 1 vs later phases?

---

### Question Set C — Engage+ *(ask only if Engage+ is in scope)*

14. **Which channel credentials are set up or need configuring?** (DLT/SMS, SendGrid/Email, WhatsApp BSP, Firebase/Push, LINE OA)
15. **Which customer lifecycle journeys are required?** *(Welcome, First Purchase, Birthday, Win-Back, Tier Upgrade, Points Expiry, Post-Purchase, Cart Abandonment, Churn Prevention)*
16. **Will Liquid personalisation be used?**
17. **Is Audience FTP Connector needed?** (recurring campaigns with external audience refresh)
18. **What campaign types are planned?** *(Broadcast, Recurring, Journey, Referral, DVS, Bounceback, Ads Audience)*
19. **Is SMS required? Is the client in India?**
    - If India: DLT entity registration started? Sender IDs confirmed? Content templates listed?
    - ⚠️ DLT registration takes 2–4 weeks — blocks ALL SMS sends until complete.
    - Confirm SMS type per use case: TRANS (transactional) or BULK (promotional)
20. **Is Push Notification required?**
    - If yes: Firebase credentials available? (FCM Server Key / APNs .p8 certificate)
    - Deep link URL scheme? Primary and secondary CTA buttons? Image uploads? Delay sending?
21. **Channel priority order?**
    - For each campaign type: define Mandatory Channels (always fire) and Priority Channel order (fallback sequence)

#### User Journey Flow — Capture for Each Flow in Scope

After Set C is answered, the agent must capture user journey flows for **every scenario confirmed in scope**. Use the project context below as the header, then document each flow using the standard 7-point format.

**Project Context (collect from Set A answers):**
```
Project Name:     [from Set A, Q2]
Client / Brand:   [from Set A, Q1]
Platform:         [e.g. Loyalty Platform / Mobile App / Website / POS System]
Modules in Scope: [from Set A, Q3 — e.g. Loyalty, Campaigns, Rewards, CDP, Messaging]
```

**Flows to document (include all that are in scope):**

| # | Flow | Trigger to include |
|---|------|--------------------|
| 1 | Customer Registration / Enrolment | Always — all programmes |
| 2 | Customer Purchase & Loyalty Points Earning | If Loyalty+ in scope |
| 3 | Points Redemption | If Loyalty+ or Rewards+ in scope |
| 4 | Campaign or Offer Participation | If Engage+ / Campaign Manager in scope |
| 5 | Tier Upgrade / Tier Evaluation | If tiered programme confirmed |
| 6 | Customer Profile Management | Always — all programmes |
| 7 | Refund / Return Handling | If POS or ecommerce integration in scope |

**Standard format for each flow (use this structure every time):**

```
Flow Name:        [e.g. Customer Registration / Enrolment]
Actors Involved:  [Customer · POS System · Loyalty Platform · Mobile App · Admin · etc.]
Trigger Event:    [What initiates this flow — e.g. "Customer taps 'Register' in app"]

Step-by-Step Flow:
  1. [Action by actor]
  2. [System response]
  3. [Decision point if applicable]
  ...

System Actions:
  - [Capillary API called — e.g. Add Customer API]
  - [Engage+ trigger fired — e.g. Welcome Journey]
  - [Data written — e.g. member profile created in org]

Decision Points:
  IF [condition] → THEN [outcome A]
  IF [condition] → THEN [outcome B]

Final Outcome:
  ✅ Success: [what the customer and system state looks like]
  ❌ Failure: [error state and fallback behaviour]

Visual Flow:
  [Trigger] → [Step 1] → [Step 2] → [Decision?]
                                          ├─ YES → [Outcome A]
                                          └─ NO  → [Outcome B]
```

> **Agent Rule:** Generate all in-scope flows immediately after Set C is completed. Insert them into BRD Section 13 (Project Overview / Functional Scope). Each flow becomes a numbered sub-section (13.1, 13.2, etc.). Reference `references/customer-journey.md` for full step-by-step detail per flow.

---

### Question Set D — Rewards+ / Catalog Promotions *(ask only if Rewards+ is in scope)*

22. **What reward types in the catalogue?** (Vouchers, Merchandise, Experiences, Partner Rewards, Charity)
23. **Points+cash (split tender) redemption required?**
24. **Tier-exclusive rewards?**
25. **Cart Promotions required?** (auto-apply discount at POS/checkout based on basket conditions)
26. **Catalog Promotions required?** (item-level discounts, combo deals)
    - If yes: promotion types? (% discount, fixed value, BOGO, bundle)
    - Qualifying conditions: min basket value, specific SKUs, categories, combos
    - Fraud prevention: Cart Locking enabled? Duplicate redemption prevention rules?

---

### Question Set E — Marvel / Advanced Configurations *(ask if relevant)*

27. **Neo (custom dataflow) required?** Describe the custom business rule.
28. **Vulcan (custom UI) required?** Describe the custom UI component.
29. **Behavioural Events to track?** (app opens, cart adds, QR scans, game plays, form fills)
30. **Gamification in scope?** (Badges, Streaks, Milestones, CataBoom / CustomerGlu)
31. **Referral Programme required?**
32. **Partner/Coalition programme required?**
33. **Data export / BI integration needed?** (Power BI, Tableau, SFTP exports, Databricks)

---

### Question Set F — Gap Fill from Real BRDs *(always run)*

> Sourced from 7 signed client BRDs. These prevent the most common gaps.

34. **Existing loyalty/customer data to migrate?** Volume? Source system? Time range?
35. **Are Cost & ROI figures expected in the BRD?**
36. **Tier downgrade rule?** (annual review / rolling 12-month / no downgrade)
37. **Who owns the POS journey document?** (client must share to Capillary before dev begins)
38. **Third-party delivery app integrations?** (Grab / Gojek / Shopee / Zomato / Food Panda)
39. **Data export to a BI platform?** Which platform? Method: FTP / SFTP / S3 / direct API?
40. **Fraud detection module required?** One-way or bi-directional?
41. **Admin validation portal required?** (document upload approval — e.g. BPJS, Student ID)
42. **Capillary comms gateway or client's existing vendor?** If vendor: which one?
43. **Family / group membership programme required?**

---

## Step 2 — BRD Type Detection

Before writing, confirm the BRD type and adjust structure accordingly:

| Type | Signal | Key Differences |
|------|--------|-----------------|
| **New Build** | "New loyalty programme", "launching first time" | Full 21-section BRD required |
| **Phase Enhancement** | "Phase 2 / 3", "adding features to existing" | Short doc — scope list + FRs only; no loyalty construct rebuild |
| **Replica** | "Same as [other country]", "replicate SG/MY/TH" | Reference parent implementation; note endpoint differences |
| **Revamp** | "Rebuild", "overhaul existing program" | Includes data migration section; member migration strategy required |
| **WebApp/Custom Dev** | "Build a web app", "custom portal", "microsite" | Screen-by-screen functional scope; integrations in Annexure |

> **Pattern (Pidilite Phase 3.1):** Phase BRDs are 5–10 pages. CRs as numbered items in scope. No loyalty construct section needed.  
> **Pattern (ASICS VN):** Replica BRDs reference the parent and note: "Any additional scope not implemented in [parent country] = Change Request."

---

## Step 3 — BRD Document Structure

Generate sections in this exact order (sourced from all 7 signed BRDs):

```
1.  Cover Page             — Client logo (top-left) + Capillary logo, title, project name, version, date
2.  Proposal Details       — Submission Date, Version, Prepared by, Validated by, Reference Docs
3.  Confidentiality        — Standard boilerplate (see below)
4.  Disclaimer             — Standard boilerplate (see below)
5.  Table of Contents      — Auto-generated; all section headings
6.  Introduction           — "This BRD is prepared by Capillary Technologies capturing..."
7.  Revision History       — Table: Date, Version, Prepared by, Reviewed by, Comments
8.  Document Approval      — Authored by (PM + signature + date), Approved by (Client BPO + date)
9.  References             — SOW link, Kick-off deck, Figma, meeting notes
10. Purpose of this Document
11. Scope of this Document — In-scope modules + user types; out-of-scope statement
12. Organization Overview  — Capillary boilerplate (see below)
13. Project Overview / Functional Scope
14. Loyalty Program Construct — Tiers, points, expiry, redemption (skip if Phase Enhancement)
15. Integration Requirements — POS, ecommerce, mobile app, third-party
16. Communication & Campaign — Gateway setup template
17. Reporting              — Essential Insights standard 8 reports
18. Historical Data Import  — Standard 8-step process (if applicable)
19. RAID                   — Risks / Assumptions / Issues / Dependencies tables
20. Additional Notes / Annexure — Out-of-scope items → Change Request language
21. Final Sign-off         — "Requirements are frozen" language + client + PM signature
```

---

### Standard Boilerplate (verbatim — do not paraphrase)

**Confidentiality:**
> "The information contained in this document is confidential and proprietary to Capillary Technologies. Capillary submits this information with the understanding that [CLIENT] hold it in strict confidence. The proposal contents are not to be disclosed, duplicated or used, in whole or in part, for any purpose other than the evaluation of Capillary qualifications or participation in the RFP identified within this document."

**Disclaimer:**
> "The obligation of the parties to perform the effort identified in this document is subject to the execution of a written agreement between the parties in accordance with the terms and conditions contained herein."


**Sign-off "requirements frozen" language:**
> "Upon receiving necessary sign-offs from the BPOs, the Capillary team will move forward with the understanding that the requirements are frozen and continue to work on the next steps of the project development and execution."

**Annexure closing (verbatim):**
> "SDD will be prepared once BRD is approved by [CLIENT]. Timeline will be shared once SDD is approved. Any changes to the BRD after the approval will be considered as a Change Request."

---

## Step 4 — Save the BRD

1. Read `/mnt/skills/public/docx/SKILL.md` to generate a properly formatted `.docx`
2. Generate Member Journey Flow PNG using Python + Pillow (see `references/customer-journey.md`)
3. Save as `[ClientName]_BRD_V1.0.docx`
4. Present to user via `present_files`
5. **Immediately auto-run Step 5 — Automated BRD Evaluation** (full spec below)
6. Save Key Gaps Report as `[ClientName]_Key_Gaps_Report_V1.txt` → Confluence › BRD Documents
7. Ask: *"BRD is ready and evaluation is complete. Key Gaps Report saved. Shall I now run the Discovery Dashboard and pre-fill it from this BRD?"*

---

## Step 5 — Automated BRD Evaluation (Agent Rubric)

When the user asks to **evaluate** an existing BRD (instead of creating a new one), use this rubric.

**Trigger phrases:** "evaluate this BRD", "score this BRD", "review the attached BRD", "run the evaluation on [filename]", "check this signed BRD", "benchmark this BRD".

**Agent rule:** Do NOT generate a new BRD. Do NOT ask discovery questions. Read the uploaded document, extract its content, then run the full evaluation below. Output all four parts in order.

---

### 5.1 — Mode Detection

Before evaluating, confirm the BRD type and apply the correct context:

| BRD Type | Signal | Evaluation Adjustment |
|----------|--------|-----------------------|
| **New Build** | Full 21-section doc, new programme | All 12 sections required. No skips. |
| **Phase Enhancement** | Short doc, "Phase 2/3", CRs listed | Skip Loyalty Construct and Org Overview. All other sections still required. |
| **Replica** | "Same as [country]", short scope | Same rubric applies. "Same as SG/MY/TH" does NOT substitute for KPIs, timeline, or out-of-scope. |
| **Revamp** | "Rebuild", data migration present | Include data migration section in evaluation. |
| **WebApp / Custom Dev** | Screen-level scope, microsite | Functional scope scored on screen coverage, not loyalty construct. |

---

### 5.2 — Part 1: Section Check (12 Sections)

For each section below: state **PRESENT** or **MISSING**, give a quality score **1–5**, and add 1–2 short comments.

Format for each row:
> **Section name:** PRESENT/MISSING | Score: X/5 | Comment: ...

| # | Section | Status if MISSING | Score of 5 Requires |
|---|---------|-------------------|---------------------|
| 1 | Executive Summary | 🔴 Critical Gap | Business problem + programme goals + expected outcomes in 3–5 sentences. Not the same as the Title section. |
| 2 | Project Overview / Background & Objectives | 🔴 Critical Gap | Why the programme exists, top 3 measurable objectives, named go-live date or window. |
| 3 | Project Scope — In-Scope + Out-of-Scope | 🔴 Critical Gap | Explicit IN-scope module list AND an Out-of-Scope table. No TBD entries. Change control process defined. |
| 4 | Key Stakeholders & Roles | 🟡 Risk | Named individuals for Capillary and client. PM, BA, Tech Lead, QA, Client BPO, Sponsor, IT contact. Escalation path documented. |
| 5 | Business Requirements | 🟡 Risk | Numbered business-level statements. Minimum 3. Explains what the business needs, not how the system works. |
| 6 | Functional Requirements | 🔴 Critical Gap | Structured FRs with IDs, actors, acceptance conditions. One subsection per in-scope module. Traceable to Jira stories. |
| 7 | Non-Functional Requirements | 🟡 Risk | API response SLA, system uptime, data retention, offline behaviour, security standards. Minimum 4 NFRs. |
| 8 | Assumptions & Constraints | 🟡 Risk | Min: A1 (internet/POS), A2 (POS journey doc), A5 (tier names). Feature freeze date, hard deadlines, legacy system deps. |
| 9 | Risks & Issues | 🟡 Risk | Min: R1 (offline), R2 (CRM offline) + project-specific risks. Each row has Probability, Impact, Mitigation. Issues table not blank. |
| 10 | Acceptance Criteria / Success Metrics | 🔴 Critical Gap | Min 5 SMART KPIs: enrolment rate, active member rate, redemption rate, channel metric, retention/revenue KPI. Number + baseline + time horizon on each. |
| 11 | Timeline & Major Milestones | 🔴 Critical Gap | Named milestones with dates: BRD sign-off, UAT start, data import window, go-live. Not a single go-live date alone. |
| 12 | Cost–Benefit / Business Case | 🟠 Warning | Budget range, commercial model, contingency %, qualitative ROI statement. Owner named. |

---

### 5.3 — Part 2: Overall Scores (1–5)

Score each dimension. Then add 3–5 bullet points explaining the scores.

| Dimension | Score | What a 5 Looks Like |
|-----------|-------|----------------------|
| Structural Completeness | /5 | All 12 sections PRESENT with meaningful content |
| Accuracy / Plausibility | /5 | Content is credible, consistent, free of contradictions |
| Relevance to Business Needs | /5 | Document explains why the project matters and what problem it solves |
| Clarity | /5 | A new team member can understand requirements without a verbal briefing |
| Requirements Completeness | /5 | All in-scope modules have functional detail |
| Actionability for Delivery Teams | /5 | Developers, QA, integrators can build and test without guessing |
| Style & Tone | /5 | Professional, consistent, written in Capillary standard format |

**Gate pass thresholds (state clearly whether the BRD passes or fails):**

- **Gate 1 minimum:** Zero 🔴 Critical Gaps across G1–G6. All 12 sections PRESENT. No section below 3/5.
- **Gold-standard target:** All 7 overall dimensions ≥ 4/5. All 6 Guardrail categories passing. Clarification Register has zero open items.

---

### 5.4 — Part 3: Guardrail Check (G1–G6)

Run all 7 categories. For each gap found, assign:
- Severity: 🔴 Critical / 🟡 Risk / 🟠 Warning
- Unique ID: `G[category]-[sequence]` e.g. `G1-001`
- Owner: [PM / Client IT / Client BPO / TBD]
- Status: OPEN

Output the Key Gaps Report in this format:

```
═══════════════════════════════════════════════════════
📋 KEY GAPS REPORT — [Client Name] BRD v[X.X]
Generated: [Date]
═══════════════════════════════════════════════════════

SUMMARY
  🔴 Critical Gaps:      N  ← Must resolve before Gate 1
  🟡 Risk Items:          N  ← Must resolve before Gate 2
  🟠 Warnings:            N  ← Assign owner; can proceed
  ✅ Guardrail Categories Passed: N/6

🔴 CRITICAL GAPS
  [G1-001]  Scope: Out-of-scope section is empty or missing
            Owner: [TBD]   Due: [Date]   Status: OPEN

🟡 RISK ITEMS
  [G5-001]  Constraints: Go-live date not documented
            Owner: [Client BPO]   Due: [Date]   Status: OPEN

🟠 WARNINGS
  [G6-002]  Roles: RACI matrix missing
            Owner: [PM]   Due: [Date]   Status: OPEN

✅ GUARDRAIL CATEGORIES PASSED
  
  ❌ G1 — Scope Boundaries:       2 gaps

ACTION REQUIRED
  • Assign owners for all 🔴 Critical Gaps before requesting sign-off
  • 🟡 Risk Items must be resolved before Discovery Gate 2
  • Add resolved items to the Clarification Register
  • Re-run Guardrail Check after updates — target: 6/6 PASSED
═══════════════════════════════════════════════════════
```

**G1 — Scope Boundaries**
- [ ] In-scope modules explicitly listed → 🔴 if missing
- [ ] Out-of-scope items explicitly stated with reason or phase tag → 🔴 if missing
- [ ] Phase boundaries defined → 🟡 if missing
- [ ] No TBD entries in scope section → 🟡 if present
- [ ] Change control process defined → 🟡 if missing
- [ ] Feature freeze date documented → 🟠 if missing

**G2 — Compliance & Regulatory**
- [ ] GDPR / PDPA / DPDP applicability assessed (Yes or No) → 🔴 if not assessed
- [ ] Customer consent / opt-in flows defined for all channels → 🔴 if missing
- [ ] PII and PSI fields tagged in data model → 🔴 if missing
- [ ] PCI-DSS scope assessed (if handling payment data) → 🔴 if missing
- [ ] DLT entity + Sender IDs + SMS templates registered (India only) → 🔴 if missing; blocks all SMS
- [ ] WhatsApp Meta template approval timeline in project plan → 🟡 if missing
- [ ] Firebase credentials (FCM / APNs) confirmed (if Push in scope) → 🟡 if missing
- [ ] Data retention period documented → 🟠 if missing

**G3 — Success Metrics (SMART KPIs)**
- [ ] At least 5 KPIs defined → 🔴 if fewer than 5
- [ ] Each KPI has a specific numerical target → 🔴 if vague
- [ ] Each KPI has a time horizon → 🔴 if missing
- [ ] KPIs cover all in-scope modules → 🟡 if gaps
- [ ] Baseline value defined per KPI → 🟠 if missing

**G4 — Business Constraints**
- [ ] Legacy system dependencies documented (POS vendor, ERP, CRM) → 🔴 if missing
- [ ] Hard deadlines identified (regulatory, commercial, seasonal) → 🔴 if present but undocumented
- [ ] Data migration scope defined (volume, source, time range) → 🟡 if missing
- [ ] Third-party approval timelines in project plan → 🟡 if missing
- [ ] Parallel run / cutover strategy defined → 🟠 if missing

**G5 — Resource & Roles**
- [ ] Client project sponsor identified by name → 🔴 if missing
- [ ] Sign-off authority defined for BRD, UAT, and Go-Live → 🔴 if missing
- [ ] Capillary team roles named: PM, BA, Tech Lead, QA → 🟡 if missing
- [ ] Client team roles named: BPO, Tech Lead, Marketing Owner, IT → 🟡 if missing
- [ ] RACI matrix defined or referenced → 🟡 if missing
- [ ] Communication cadence defined → 🟠 if missing
- [ ] Escalation path documented → 🟠 if missing

**G6 — Fraud & Risk Management**
- [ ] Duplicate transaction detection rule defined → 🔴 if missing
- [ ] Max earn cap per transaction configured → 🔴 if missing
- [ ] Member suspension logic documented (Suspended vs Deleted) → 🔴 if missing
- [ ] OTP verification rules documented (if OTP redemption in scope) → 🟡 if missing
- [ ] High transaction velocity detection rule defined → 🟡 if missing
- [ ] Redemption spike alerting defined → 🟡 if missing
- [ ] Cart Locking assessed (if Catalog Promotions in scope) → 🟠 if missing
- [ ] Fraud alert notification routing specified → 🟠 if missing

---

### 5.5 — Part 4: Top Improvements + Optional Rewrites

**Top Improvements:** List 3–7 prioritised, concrete improvements that would most increase BRD quality. Be specific — name the section, state what is missing, and say exactly what to add.

Format:
> **1. 🔴 [Section name] — [Gap description]**
> [Specific action to take]

**Optional Rewrites:** For the weakest 1–3 sections (score ≤ 2/5), propose short example rewrites that are clearer and more measurable. Show the rewrite as a block quote or table.

---

### 5.6 — Evaluation-Only Mode: Data Flow

When the user uploads an existing signed BRD for evaluation, the agent follows this sequence — no BRD is generated:

```
User uploads signed BRD (PDF or DOCX)
        │
        ▼
Agent reads SKILL.md → Confirms: evaluation mode, no BRD generation
        │
        ▼
Agent reads phase01-brd.md Step 5 → Loads 12-section rubric + 7 dimensions
        │
        ▼
Agent reads references/guardrails.md → Loads G1–G6 checks
        │
        ▼
Agent extracts content from uploaded BRD
        │
        ├──────────────────────────────┐
        ▼                              ▼
  SECTION CHECK (5.2)          GUARDRAIL CHECK (5.4)
  12 sections: PRESENT/MISSING  G1 through G7
  1–5 quality score per section  Gap IDs assigned
        │                              │
        └──────────┬───────────────────┘
                   ▼
         KEY GAPS REPORT generated
         (Critical / Risk / Warning counts; 7-category pass/fail)
                   │
                   ▼
         OVERALL SCORES (5.3) — 7 dimensions rated 1–5
                   │
                   ▼
         TOP IMPROVEMENTS + OPTIONAL REWRITES (5.5)
                   │
                   ▼
         PM uses output to:
           (A) Update the BRD and resolve gaps before Gate 1, OR
           (B) Calibrate the evaluation template against delivery outcomes
```

**Agent decision rules in evaluation mode:**

| Situation | Agent Behaviour |
|-----------|-----------------|
| User provides a signed BRD | Read, extract, evaluate. Do NOT generate a new BRD. |
| Section is present but vague or generic | Score 2–3/5. Flag as quality gap. Include in Top Improvements. |
| BRD is a Replica type | Apply same rubric. "Same as SG/MY/TH" does not exempt from KPIs, timeline, or out-of-scope. |
| BRD is a Phase Enhancement | Skip Loyalty Construct and Org Overview. Evaluate only relevant sections for that phase type. |
| User says "just score it quickly" | Run all checks. Never skip Guardrail categories to save time. Summarise counts at the top. |
| Critical Gap cannot be resolved by PM alone | Flag with owner TBD, note the dependency, include in Clarification Register recommendation. |

---

## Step 6 — BRD Quality Checklist (run before Gate 1)

- [ ] Cover page has both client and Capillary logos
- [ ] Proposal Details table complete
- [ ] Revision History table present with at least 1 entry
- [ ] Document Approval table present — client signature field present
- [ ] References table populated
- [ ] Scope section clearly separates IN vs OUT of scope
- [ ] Each in-scope module has at least one functional sub-section
- [ ] Loyalty config table populated (if Loyalty+ in scope) — no blank rows
- [ ] Integration touchpoints called out per feature
- [ ] RAIDS section populated (minimum: R1, A1, A2, D1)
- [ ] KPIs are SMART (Specific, Measurable, Achievable, Relevant, Time-bound)
- [ ] Member Journey Flow diagram generated and inserted
- [ ] Annexure present — out-of-scope / CR items listed
- [ ] No "TBD" items in core functional sections
- [ ] Client BPO approval signature obtained

---

## 🔒 Gate 1 — Required Before Phase 02

- [ ] All 19+ BRD sections populated (no placeholders)
- [ ] Guardrail Key Gaps Report generated and shared with stakeholders
- [ ] All 🔴 Critical Gaps resolved (or formally waived with named approver)
- [ ] BRD reviewed and signed off by client BPO / project sponsor
- [ ] Sign-off record saved to Confluence › Stakeholder Docs
- [ ] BRD confirmed as V1.0 Approved
