# Gap Analysis Output Template

**Derived from:** Italo + Jollibee gap analysis format
**Purpose:** Skeleton for the gap analysis output document

---

## Document Structure

```markdown
# [Client Name] → Capillary Gap Analysis

**Prepared:** [YYYY-MM-DD]
**Source Documents:** [List BRD references]
**Platform Under Evaluation:** Capillary Technologies (Loyalty+ / Rewards+ / Engage+ / Insights+)
**Skill Version:** solution-gap-analyzer v1.0
**MCP Verification Status:** [✅ Connected / ⚠ Partial / ❌ Unavailable]

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Overall RMS (Pessimistic) | **X%** |
| Overall RMS (Realistic) | **X%** |
| Overall RMS (Optimistic) | **X%** |
| Delivery Confidence | **High / Medium / Low** |
| Domains with High confidence | N of 15 |
| Critical gaps requiring decision | N |
| Risk flags (RED) | N (total deduction: −X%) |
| Risk flags (YELLOW) | N |
| Capillary API verifications attempted | N |
| Capillary API verifications passed | N |

**Summary:** [2-3 sentences on overall fit, key strengths, key risks]

**Recommended next step:** [Based on score band: SDD directly / SDD + gap sessions / Full gap analysis / Escalate]

---

## Scoring Methodology

**Requirement Matching Score (RMS):** Percentage of native, documented platform coverage.
- 80–100% — Out-of-box, well-documented (high confidence)
- 60–79% — Mostly native, minor configuration needed
- 40–59% — Partial; workaround or light customisation
- 20–39% — Significant custom development
- 0–19% — Not supported / major gap

**Delivery Confidence Score (DCS):**
- **High** — Proven, documented API capability (verified via MCP)
- **Medium** — Likely deliverable but complexity or documentation gaps
- **Low** — Unclear, undocumented, requires deep investigation

---

## Risk Flag Summary

| Flag | Severity | Triggered? | Deduction | Evidence |
|------|----------|-----------|-----------|----------|
| RF-01 GDPR Jurisdiction | RED | Yes / No | −X% | [reason] |
| RF-03 Integration Count | RED/BLOCKER | Yes / No | −X% | [count] |
| RF-05 Anniversary Period | RED | Yes / No | −X% | [reason] |
| RF-06 Invitation Tier | RED | Yes / No | −X% | [reason] |
| RF-07 Co-Brand Card | RED | Yes / No | −X% | [reason] |
| RF-08 Benefit Allotment | RED | Yes / No | −X% | [reason] |
| RF-09 Soft Landing | RED | Yes / No | −X% | [reason] |
| RF-10 Non-Native ESP | RED | Yes / No | −X% | [which ESP] |
| RF-11 Legacy Migration | RED | Yes / No | −X% | [source platform] |
| RF-12 Statutory Constraint | RED | Yes / No | −X% | [regulation] |
| **Total RED deduction** | | | **−X%** | (capped at −30%) |

**YELLOW flags (no deduction):** [List RF-02, RF-04, RF-13–RF-21 as applicable]

---

## Requirement Domain Analysis

[Repeat for each applicable domain D-01 through D-15]

### D-XX: [Domain Name] (Weight: X%)

**Requirements (from BRD):**
- [bulleted list extracted from source]

**Capillary Capability:**
- [API endpoints with verification status tags]
- `POST /v1.1/customer/add` [✅ VERIFIED via Capillary Docs MCP]
- `PUT /customer/update` [✅ VERIFIED]
- `GET /some/endpoint` [⚠ PARTIAL — field X not in schema]
- `POST /claimed/endpoint` [❌ NOT FOUND in docs]

**RMS: X% | DCS: High / Medium / Low**

**Verification Log:**
| Feature | Claimed | Verified | Endpoint | Status | Notes |
|---------|---------|----------|----------|--------|-------|
| F-XX-01 | N | N | POST /endpoint | ✅ VERIFIED | |
| F-XX-02 | C | P | GET /config | ⚠ PARTIAL | field limit unclear |
| F-XX-03 | N | C | POST /claimed | ❌ NOT FOUND | downgraded |

**Gaps & Resolution:**
- **GAP-NN — [Gap Title]** 🔴/🟡: [narrative of what is not natively covered]
  - **Resolution:** [native config / Connect+ workaround / custom build / needs investigation]
  - `[CONFIRM WITH CAPILLARY TEAM]` if applicable
  - **Effort estimate:** [Low / Medium / High]

**Open Questions:**
1. [specific question for Capillary PS]

---

[... repeat for each applicable domain ...]

---

## Summary Scorecard

| # | Domain | Weight | RMS | DCS | Primary Risk |
|---|--------|--------|-----|-----|-------------|
| D-01 | Customer Profiles | 8% | X% | High | ... |
| D-02 | Multi-Org | 4% | X% | Medium | ... |
| ... | ... | ... | ... | ... | ... |
| D-15 | Compliance | 9% | X% | Medium | ... |
| | **Weighted Total** | 100% | **X%** | | |

---

## Score Calculation

| Component | Value |
|-----------|-------|
| Weighted Raw Score | X% |
| RF-XX deduction | −X% |
| RF-XX deduction | −X% |
| ... | ... |
| Total deductions (capped −30%) | −X% |
| Floor adjustment (+12% if 4+ RED) | +X% |
| **Realistic** | **X%** |
| Spread penalties (Low/Medium DCS) | −X% |
| **Pessimistic** | **X%** |
| Spread bonuses (if CONFIRMs resolve) | +X% |
| **Optimistic** | **X%** |

---

## Critical Gaps & Recommendations

### GAP-01 — [Title] 🔴
[Impact narrative, recommendation, CONFIRM tags, effort estimate]

### GAP-02 — [Title] 🟡
[Impact narrative, recommendation, CONFIRM tags]

[... top 3-5 gaps ...]

---

## Open Questions for Capillary Team

[Aggregated from all domains, numbered]

1. [question] (Domain: D-XX, Feature: F-XX-XX)
2. [question]
...

---

## Verification Audit Trail

| Feature ID | Domain | Search Term | MCP Result | Claimed Level | Final Level | Notes |
|-----------|--------|-------------|------------|---------------|-------------|-------|
| F-01-01 | D-01 | "customer add" | ✅ Found | N | N | Schema matches |
| F-04-04 | D-04 | "slab renewal" | ❌ Not found | P | P | Unconfirmed |
| ... | ... | ... | ... | ... | ... | ... |

**Verification Statistics:**
- Total features evaluated: X
- MCP verifications attempted: X
- Verified (confirmed): X
- Partial (narrower than claimed): X
- Not found (downgraded): X
- Skipped (low priority): X
```

---

## Format Rules

1. **Never cite an endpoint without verification attempt** for N/C level features
2. **Always include the verification tag** inline: `[✅ VERIFIED]`, `[⚠ PARTIAL]`, `[❌ NOT FOUND]`, `[⏭ SKIPPED]`
3. **GAP numbering** is sequential across all domains (GAP-01, GAP-02, ...)
4. **Open questions** aggregated at the end AND listed per-domain
5. **Score calculation** must show full arithmetic, not just the result
6. **Verification audit trail** must be complete — every feature evaluated gets a row
7. **No Capillary capability claim without evidence** — either MCP-verified or tagged `[UNVERIFIED]`

---

## Companion Output

An interactive HTML confidence report is also generated alongside this document (Step 8b):
- **File:** `{client-slug}-capillary-confidence-report.html`
- **Contains:** visual executive summary cards, expandable domain cards with RMS bars, scorecard with bar charts, critical gaps with severity badges, wishlist matching (if provided), open questions
- **Intended audience:** stakeholder review and presentation
- **Template:** See `{SKILL_DIR}/confidence-report-template.md` for the HTML template and data contract
