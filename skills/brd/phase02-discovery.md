# Phase 02 — Discovery Dashboard

**Input:** BRD V1.0 (Gate 1 cleared · Key Gaps Report reviewed · all Critical Gaps resolved)  
**Output:** `[ClientName]_PreBRD_Discovery.html` + `[ClientName]_Guardrail_Scorecard.txt` + `[ClientName]_Clarification_Register.xlsx`  
**Output folder:** Confluence › Discovery Documents  
**Gate required first:** Gate 1 must be cleared before starting this phase.

> ⚠️ Do NOT start Phase 02 if any 🔴 Critical Gaps from the Step 5 Key Gaps Report remain open.

---

## Steps

1. Read the approved BRD (signed, all Critical Gaps resolved) to extract known answers
2. Extract context from all uploaded folder files (SOW, kick-off deck, Figma, meeting notes)
3. Build the Pre-BRD Discovery Dashboard HTML
4. **Prefill** all questions answerable from BRD and folder files:
   - Mark pre-answered items: `(From BRD: "...")`
   - Mark items from folder: `(From uploaded doc: "...")`
5. **Build the Yes/No Quick Confirm section** (spec below)
6. **Import open items from Key Gaps Report** into the Guardrail Status Panel — all 🟡 Risk Items and 🟠 Warnings carry forward with their IDs, owners, and due dates
7. Flag remaining Must-Have questions needing stakeholder input
8. Run discovery session until dashboard reaches **100% completion**
9. Resolve or formally waive all 🔴 Critical + 🟡 Risk guardrail items; log in Clarification Register
10. Export Guardrail Scorecard as `.txt` → save to Confluence › Discovery Documents
11. Export discovery summary `.txt` → save to Confluence › Discovery Documents
12. Export Clarification Register as `.xlsx` → save to Confluence › Discovery Documents

---

## Yes/No Quick Confirm Section — Specification

**What it is:** A dedicated tab or collapsible panel labelled **"✅ Quick Confirm — Yes / No"**.  
**Purpose:** Speed up discovery for questions already implicitly answered in the BRD. Gives stakeholders a fast binary review mechanism.

### How to build it
1. Parse the BRD for every configuration decision, integration assumption, and scope item
2. Convert each into a binary Yes/No question
3. **Pre-answer based on BRD content** — set the toggle with a source hint
4. Flag ambiguous items as "Needs Confirmation ❓"

### Question categories and examples

**Programme Structure**
- "Is this a points-based loyalty programme?" → [Yes / No] *(From BRD: "1 point per THB 25 spend")*
- "Does the programme have tiered membership?" → [Yes / No]
- "Are tier benefits different per tier?" → [Yes / No]
- "Is there a welcome bonus for new members?" → [Yes / No]
- "Does the programme support points expiry?" → [Yes / No]
- "Is points pooling (family/group) required?" → [Yes / No]

**Engage+ Channel Confirmation**
- "Is SMS required as a communication channel?" → [Yes / No]
- "Is Email required?" → [Yes / No]
- "Is WhatsApp required?" → [Yes / No]
- "Is Push Notification required?" → [Yes / No]
- "Is In-App Messaging required?" → [Yes / No]
- "Is LINE required?" → [Yes / No]
- "Is channel priority fallback configured?" → [Yes / No]
- "Is DLT registration required?" (India only) → [Yes / No]
- "Is Liquid personalisation required?" → [Yes / No]
- "Is Unsubscribe / consent management flow required?" → [Yes / No]

**Campaign & Journey Confirmation**
- "Is a Welcome Journey required?" → [Yes / No]
- "Is a Birthday/Anniversary Journey required?" → [Yes / No]
- "Is a Win-Back Journey required?" → [Yes / No]
- "Is a Points Expiry reminder journey required?" → [Yes / No]
- "Is a Tier Upgrade notification journey required?" → [Yes / No]
- "Is a Post-Purchase journey required?" → [Yes / No]
- "Are Recurring campaigns required?" → [Yes / No]
- "Is Test & Control split required on campaigns?" → [Yes / No]
- "Are Referral campaigns required?" → [Yes / No]

**Engage+ Incentives**
- "Are Coupons / Offer series required via Engage+?" → [Yes / No]
- "Is Bonus Points issuance via campaigns required?" → [Yes / No]
- "Are Gift Vouchers required?" → [Yes / No]
- "Are DVS (Dynamic Voucher System) campaigns required?" → [Yes / No]
- "Are Badges required in campaigns/journeys?" → [Yes / No]
- "Are Cart Promotions required?" → [Yes / No]

**Rewards+ / Catalog Promotions**
- "Is a Rewards Catalog required?" → [Yes / No]
- "Are tier-exclusive rewards required?" → [Yes / No]
- "Is points+cash split tender required?" → [Yes / No]
- "Are Partner Rewards required?" → [Yes / No]
- "Are Catalog Promotions required?" → [Yes / No]
  - If Yes → "Are percentage discount promotions required?" → [Yes / No]
  - If Yes → "Are BOGO promotions required?" → [Yes / No]
  - If Yes → "Are bundle/combo promotions required?" → [Yes / No]
  - If Yes → "Is Cart Locking (fraud prevention) required?" → [Yes / No]

**Integration & Data**
- "Is POS integration required?" → [Yes / No]
- "Is a Mobile App integration required?" → [Yes / No]
- "Is Connect+ batch data ingestion required?" → [Yes / No]
- "Is an SFTP data feed required?" → [Yes / No]
- "Is historical data migration required?" → [Yes / No]
- "Is Behavioral Event tracking required?" → [Yes / No]
- "Is Neo (custom logic) required?" → [Yes / No]
- "Is Vulcan (custom UI) required?" → [Yes / No]
- "Is Insights+ / BI reporting required?" → [Yes / No]
- "Is Databricks / Power BI integration required?" → [Yes / No]

**UAT & Go-Live**
- "Is a UAT environment required before production go-live?" → [Yes / No]
- "Is staging environment available?" → [Yes / No]
- "Is phased go-live planned?" → [Yes / No]
- "Is a pilot / soft launch planned?" → [Yes / No]

### Yes/No UI Spec

```html
<!-- Pre-answered from BRD -->
<div class="yn-row">
  <span class="yn-question">Is SMS required as a communication channel?</span>
  <span class="yn-hint">(From BRD: "SMS listed as primary channel")</span>
  <button class="yn-btn yn-yes active">✅ Yes</button>
  <button class="yn-btn yn-no">❌ No</button>
  <span class="yn-status confirmed">Confirmed</span>
</div>

<!-- Ambiguous — needs stakeholder input -->
<div class="yn-row yn-needs-confirm">
  <span class="yn-question">Is LINE integration required?</span>
  <span class="yn-hint">❓ Not mentioned in BRD — needs stakeholder input</span>
  <button class="yn-btn yn-yes">✅ Yes</button>
  <button class="yn-btn yn-no">❌ No</button>
  <span class="yn-status pending">Needs Confirmation</span>
</div>
```

### Scoring Rules
- Pre-answered items (from BRD): count as **50% confirmed** until stakeholder clicks to confirm
- Stakeholder-confirmed items: count as **100% confirmed**
- Ambiguous items needing input: count as **0%** until answered
- Yes/No section contributes to the overall discovery completion score

---

## What "100% Complete" Means

- All `must` priority questions answered (status ≠ Pending)
- All Yes/No Quick Confirm items confirmed (no "Needs Confirmation ❓" remaining)
- At least 1 module selected in Solution tab
- BRD Section Coverage Map: all 19 sections ≥ partial
- Blocker strip cleared (no outstanding Must-Have items)
- Open Questions Register: all items have owner + due date
- All 🔴 Critical + 🟡 Risk guardrail items resolved or formally waived with named approver

---

## Clarification Register

The Clarification Register is a running log that tracks every gap from the Key Gaps Report through to resolution. It must be maintained throughout Phase 02 and exported before Gate 2 is cleared.

**Required columns:**

| Gap ID | Category | Description | Severity | Owner | Due Date | Resolution | Resolved By | Date Closed | Waived? |
|--------|----------|-------------|----------|-------|----------|------------|-------------|-------------|---------|
| G1-001 | Scope | Out-of-scope section empty | 🔴 Critical | PM Name | Date | Added out-of-scope table to BRD Section 11 | PM Name | Date | No |

**Rules:**
- Every gap from the Key Gaps Report must have a row in the Clarification Register
- A gap is "Resolved" only when the BRD has been updated and the update is verified
- A gap may be "Waived" only when a named approver (client BPO or Project Sponsor) formally accepts the risk in writing
- Waived Critical Gaps must have written approval attached; verbal agreement is not sufficient
- Export register as `[ClientName]_Clarification_Register.xlsx` → Confluence › Discovery Documents

---

## Guardrail Status Panel (in Discovery Dashboard)

The dashboard includes a **Guardrail Status** tab showing:
- Live status of all 6 guardrail categories (✅ Passed / ❌ Open gaps / 🔄 In Progress)
- Each gap as a card with: gap ID, description, owner field, due date picker, status dropdown
- Overall guardrail score: "X/7 categories cleared"
- A Guardrail Scorecard exportable as `.txt` for Confluence upload
- Gate 2 is **visually locked** until all 🔴 Critical Gaps are resolved and all 🟡 Risk Items are either Resolved or formally Waived with a named approver

**Carry-forward rule:** All 🟡 Risk Items and 🟠 Warnings from the Step 5 Key Gaps Report are automatically imported into this panel. Their IDs, owners, and due dates are preserved.

Full guardrail category specs → `references/guardrails.md`

---

## BRD Version Update Rule

If new information is discovered during Phase 02 that changes any BRD section:
1. Update the BRD to the next minor version (V1.1, V1.2, etc.)
2. Re-run the Step 5 Evaluation on the updated BRD
3. Update the Key Gaps Report if any gaps are resolved or new gaps found
4. Save updated BRD and Key Gaps Report to Confluence › BRD Documents

---

## 🔒 Gate 2 — Required Before Phase 03

**Minimum conditions (all must be met):**
- [ ] Discovery dashboard: 100% Must-Have completion
- [ ] Yes/No Quick Confirm section: 100% confirmed (no pending items)
- [ ] Guardrail Status: all 🔴 Critical Gaps resolved · all 🟡 Risk Items resolved or formally waived
- [ ] Guardrail Scorecard exported and saved to Confluence › Discovery Documents
- [ ] Clarification Register: all rows have Resolution or Waiver recorded; exported to Confluence
- [ ] BRD updated to reflect any new information discovered (latest vX.X)
- [ ] Discovery export `.txt` saved to Confluence
- [ ] Open Questions Register: all items have owner + due date; no blanks

**Gold-standard target:**
- [ ] Guardrail Scorecard shows 6/6 categories passing
- [ ] Clarification Register has zero open items (all Resolved, no Waived)
- [ ] BRD confirmed as the approved source of truth for Phase 03
