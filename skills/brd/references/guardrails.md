# Guardrail Framework — All 7 Categories

The agent MUST run the full Guardrail Check automatically after BRD generation (as part of Step 5 in `phase01-brd.md`) and again after Discovery completes. Every gap gets a unique ID, owner, and due date.

> **Integration with Evaluation Layer:** The full G1–G7 check is embedded in `phase01-brd.md` Step 5.4. This file is the authoritative specification. Step 5.4 references this file for detail. Both must be kept in sync.

---

## When to Run

- ✅ **After Phase 01**: immediately after BRD is generated (before Gate 1)
- ✅ **After Phase 02**: embedded as a live Guardrail Status panel in the Discovery Dashboard
- ✅ **On demand**: whenever the user says "re-check guardrails" or "run gaps report"
- ✅ **After any BRD update** (new version vX.X)

---

## Key Gaps Report — Output Format

```
═══════════════════════════════════════════════════════
📋 KEY GAPS REPORT — [Client Name] BRD v1.0
Generated: [Date]
═══════════════════════════════════════════════════════

SUMMARY
────────────────────────────────────────────────────────
  🔴 Critical Gaps:    [N]   ← Must resolve before Gate 1
  🟡 Risk Items:       [N]   ← Must resolve before Gate 2
  🟠 Warnings:         [N]   ← Should resolve; can proceed with owner assigned
  ✅ Guardrails Passed: [N]/6
────────────────────────────────────────────────────────

🔴 CRITICAL GAPS (must resolve before BRD sign-off)
──────────────────────────────────────────────────────
  [G1-001] Scope: Out-of-scope section is empty
           → Owner: [TBD]   Due: [Date]   Status: OPEN

🟡 RISK ITEMS (resolve before Discovery Gate 2)
──────────────────────────────────────────────────────
  [G2-001] Compliance: WhatsApp Meta approval timeline not in project plan
           → Owner: [TBD]   Due: [Date]   Status: OPEN

🟠 WARNINGS (assign owner; can proceed)
──────────────────────────────────────────────────────
  [G3-002] KPIs: Baseline values missing — recommend measuring at launch
           → Owner: [TBD]   Due: [Date]   Status: OPEN

✅ GUARDRAIL CATEGORIES PASSED
──────────────────────────────────────────────────────
  ✅ G1 — Scope Boundaries:             PASSED
  ...

ACTION REQUIRED
──────────────────────────────────────────────────────
  • Assign owners for all 🔴 Critical Gaps before requesting BRD sign-off
  • 🟡 Risk Items must be resolved before Discovery Gate 2
  • Add resolved items to the Clarification Register (BRD Section 18)
  • Re-run Guardrail Check after updates → target: 6/6 PASSED
═══════════════════════════════════════════════════════
```

**Guardrail ID convention:** `G[category number]-[sequence]` e.g. `G1-001`, `G3-002`

---

## G1 — Scope Boundaries

**Purpose:** Prevent scope creep.

**Checks:**
- [ ] In-scope modules explicitly listed
- [ ] Out-of-scope items explicitly stated with reason / phase tag
- [ ] Phase boundaries defined (Phase 1 vs Phase 2 vs Phase 3)
- [ ] No open-ended phrases ("TBD", "to be confirmed", "as agreed") in scope section
- [ ] Change control process defined
- [ ] Feature freeze date documented

**Gap flags:**
```
🔴 CRITICAL GAP — Scope: Out-of-scope section is empty or missing
🟡 RISK — Scope: [X] requirements have no phase tag — risk of scope creep
🟡 RISK — Scope: Change control process not defined
🟠 WARNING — Scope: [X] items marked TBD — must be resolved before Gate 2
```

---

## G2 — Compliance & Regulatory

**Purpose:** Non-negotiable legal and industry standards.

**Checks — run for EVERY BRD regardless of client:**

*Data Privacy:*
- [ ] GDPR (if EU customers or data processing) — documented Yes/No
- [ ] PDPA (Thailand, Singapore) — documented Yes/No
- [ ] DPDP (India 2023) — documented Yes/No
- [ ] Regional privacy law for client's markets identified
- [ ] Customer consent / opt-in flows defined for all channels
- [ ] Data retention periods documented
- [ ] Right to erasure / data deletion workflow defined
- [ ] PII fields tagged in data model
- [ ] PSI (Payment Sensitive Information) fields tagged

*Payment & Transaction Security:*
- [ ] PCI-DSS compliance required? (if handling card data) — documented Yes/No
- [ ] Tokenisation of card data confirmed

*Industry-Specific:*
- [ ] Sector-specific regulation applicable? (HIPAA, FCA, etc.) — documented
- [ ] **DLT (India SMS — if India market in scope):**
  - [ ] Entity registration on DLT platform initiated
  - [ ] All Sender IDs registered
  - [ ] All SMS content templates registered and pre-approved
  - [ ] DLT registration timeline (2–4 weeks) added to project plan as dependency
  - [ ] SMS type defined per use case: TRANS or BULK
- [ ] WhatsApp Meta template approval timeline in project plan
- [ ] **Push Notifications (if Push in scope):**
  - [ ] Firebase credentials (FCM / APNs) confirmed available
  - [ ] Mobile SDK integration listed as prerequisite
  - [ ] Deep link URL scheme documented
  - [ ] Primary and secondary CTA buttons confirmed
- [ ] Channel Priority Order documented (Mandatory vs Priority channels per campaign type)

**Gap flags:**
```
🔴 CRITICAL GAP — Compliance: GDPR/PDPA/DPDP applicability not assessed
🔴 CRITICAL GAP — Compliance: Customer consent/opt-in flows not defined
🔴 CRITICAL GAP — Compliance: PII/PSI field tagging not documented
🔴 CRITICAL GAP — Compliance: PCI-DSS scope not assessed
🔴 CRITICAL GAP — Compliance: DLT entity + Sender ID + templates not registered (India SMS — blocks all SMS sends)
🟡 RISK — Compliance: DLT registration timeline not in project plan as dependency
🟡 RISK — Compliance: WhatsApp Meta template approval timeline not in project plan
🟡 RISK — Compliance: Firebase credentials (FCM/APNs) not confirmed — blocks push channel
🟡 RISK — Compliance: Channel priority order not defined
🟠 WARNING — Compliance: Right to erasure workflow not defined
🟠 WARNING — Compliance: Deep link URL scheme not documented
```

---

## G3 — Success Metrics (SMART KPIs)

**Purpose:** All KPIs must be Specific, Measurable, Achievable, Relevant, Time-bound.

**Checks:**
- [ ] At least 5 KPIs defined
- [ ] Each KPI has a baseline value or "baseline to be measured at launch"
- [ ] Each KPI has a specific numerical target
- [ ] Each KPI has a time horizon (e.g. "within 6 months of go-live")
- [ ] KPIs cover all in-scope modules
- [ ] Measurement methodology defined per KPI
- [ ] KPI owner assigned

**Required KPI categories — flag if any missing:**

| Category | Example KPI |
|----------|-------------|
| Programme Enrolment | X% of total customers enrolled within 90 days |
| Active Member Rate | X% of enrolled members transacted in last 30 days |
| Points Liability | Points liability ≤ X% of total revenue |
| Engagement / Channels | Email open rate ≥ X%; Push delivery rate ≥ X% |
| Campaign ROI | Incremental sales lift ≥ X% vs control group |
| Redemption Rate | X% of earned points redeemed within 12 months |
| Tier Upgrade Rate | X% of Silver members upgrade to Gold within 6 months |
| Customer Retention | Repeat purchase rate ≥ X% among loyalty members |
| NPS / CSAT | Programme NPS ≥ X at 3-month post-launch survey |

**Gap flags:**
```
🔴 CRITICAL GAP — KPIs: Fewer than 5 KPIs defined
🔴 CRITICAL GAP — KPIs: [KPI name] has no measurable target — not SMART
🟡 RISK — KPIs: No KPIs defined for [module name] which is in scope
🟠 WARNING — KPIs: Baseline values missing — recommend measuring at launch
```

---

## G4 — Business Constraints

**Purpose:** Identify operational limitations and hard deadlines.

**Checks:**
- [ ] Legacy system dependencies documented (existing CRM, POS vendor, ERP — name and version)
- [ ] Hard deadlines identified (regulatory, commercial, seasonal — e.g. "must go live before Ramadan")
- [ ] Known technical constraints documented
- [ ] Data migration constraints documented (if migrating from existing programme)
- [ ] Dependency on third-party approvals documented (WhatsApp Meta, DLT)
- [ ] Operational constraints documented (blackout periods, maintenance windows)
- [ ] Parallel run requirements defined (duration)

**Gap flags:**
```
🔴 CRITICAL GAP — Constraints: Legacy system dependencies not documented
🔴 CRITICAL GAP — Constraints: Hard deadline present but not documented
🟡 RISK — Constraints: Data migration scope not defined
🟡 RISK — Constraints: Third-party approval timelines not in project plan
🟠 WARNING — Constraints: Parallel run / cutover strategy not defined
🟠 WARNING — Constraints: Operational blackout periods not identified
```

---

## G5 — Resource & Roles

**Purpose:** Clear ownership, decision authority, and accountability.

**Checks:**
- [ ] Capillary team roles identified: PM, BA, Tech Lead, Implementation Consultant, QA
- [ ] Client team roles identified: Project Sponsor, BPO, Tech Lead, Marketing Owner, IT Contact
- [ ] RACI matrix defined or referenced
- [ ] Decision-making authority documented (scope changes, budget increases, go/no-go)
- [ ] Escalation path documented
- [ ] Sign-off authority identified for each deliverable (BRD, UAT, Go-Live)
- [ ] Communication cadence defined

**Gap flags:**
```
🔴 CRITICAL GAP — Roles: Client project sponsor not identified
🔴 CRITICAL GAP — Roles: No sign-off authority defined for BRD / UAT / Go-Live
🟡 RISK — Roles: RACI matrix missing
🟠 WARNING — Roles: Communication cadence not defined
```

---

## G6 — Fraud & Risk Management

**Purpose:** Baseline fraud controls must be in every BRD before go-live.

**Fraud control checks:**
- [ ] High transaction velocity detection rule defined
- [ ] Duplicate transaction prevention defined
- [ ] Suspicious redemption detection rules defined
- [ ] Merchant / store abuse detection defined
- [ ] Max earn cap per transaction configured
- [ ] OTP verification rules documented
- [ ] Cart Locking (if Catalog/Cart Promotions in scope)

**Risk monitoring checks:**
- [ ] Redemption spike alerts defined
- [ ] Campaign abuse monitoring (per-member reward cap) defined
- [ ] Member suspension logic documented: Suspended (read-only) vs Deleted (credentials released)
- [ ] Fraud alert notification channel and recipient defined
- [ ] Audit trail for flagged events defined

**Implementation notes:**
- Basic fraud controls (velocity, duplicate, max cap) = **MVP scope** via NEO or Loyalty+ earning rule caps
- Advanced controls (risk dashboard, merchant abuse scoring) = acceptable as **Phase 2** if documented with named owner and timeline
- Member suspension must distinguish: **Suspended** (app read-only, no transactions) vs **Deleted** (cannot login, credentials releasable)

**Gap flags:**
```
🔴 CRITICAL GAP — Fraud: No duplicate transaction detection rule defined
🔴 CRITICAL GAP — Fraud: No max earn cap per transaction — open to POS manipulation
🔴 CRITICAL GAP — Fraud: Member suspension logic not documented
🟡 RISK — Fraud: High transaction velocity detection deferred without named Phase 2 owner
🟡 RISK — Fraud: Redemption spike alerting not defined
🟠 WARNING — Fraud: Fraud alert notification routing not specified
🟠 WARNING — Fraud: Cart Locking not assessed (Catalog Promotions are in scope)
```

---

## Guardrail Re-Run Rule

The agent re-runs the guardrail check automatically whenever:
1. The BRD is updated (new version vX.X)
2. Discovery Dashboard reaches 100%
3. User requests "re-check guardrails" or "run gaps report"

All resolved gaps must be documented in the **Clarification Register (BRD Section 18)** with resolution text and approver name.
