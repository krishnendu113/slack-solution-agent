# Risk Flag Register (Compact Reference)

**Derived from:** Risk-Flag-Register-v1.md
**Last synced:** 2026-03-12
**Source version:** Framework v1.2

---

## Severity Levels

| Severity | Label | Score Effect |
|----------|-------|-------------|
| BLOCKER | Blocks delivery | Score = Pessimistic until resolved |
| RED | Mandatory scoping | Deduct from Realistic score |
| YELLOW | Confirmation needed | No deduction; add to CONFIRM list |

---

## RED Flags (Score Deductions)

| ID | Flag | Trigger | Deduction | Intake Q | Affected Features |
|----|------|---------|-----------|----------|-------------------|
| RF-01 | GDPR Jurisdiction | Primary geography EU/EEA | −3% | D1="EU/EEA" AND/OR D2="GDPR" | F-15-03 |
| RF-03 | High Integration Count | >3 external systems (excl. central middleware) | −3% per system beyond 2, max −12%. BLOCKER at 5+ | C5="4+" | F-13-01 to F-13-11 |
| RF-05 | Anniversary Qualifying Period | Per-member rolling 12-month (not calendar year) | −3% | A4="Anniversary" | F-04-04, F-05-07 |
| RF-06 | Invitation-Only Tier | Manual/invitation tier assignment | −2% | A6="Yes" | F-04-08 |
| RF-07 | Co-Brand Card Lifecycle | Card issuer events (issuance, expiry, cancel) | −3% | A8="Yes" | F-13-07 |
| RF-08 | Per-Period Benefit Allotment | Fixed quota with cancellation restore | −4% | A7="Yes" | F-06-01, F-06-02 |
| RF-09 | Soft Landing / Grace Period | Grace before demotion | −3% | A5="Yes" | F-04-07 |
| RF-10 | Non-Adobe/Non-Braze ESP | Salesforce MC, Responsys, Klaviyo, etc. | −3% per ESP, max −6%. Adobe Campaign & Braze EXEMPT (native WIP) | C2="Non-Adobe/Braze" | F-09-12, F-13-03 |
| RF-11 | Legacy Platform Migration | Migrating from existing loyalty system | −3% (SessionM) / −5% (Siebel/legacy) | C6≠"Greenfield" | F-14-01 to F-14-07 |
| RF-12 | Statutory Program Constraint | Legal max duration, mandatory benefits | −2% | D3="Yes" | F-15-07 |

---

## YELLOW Flags (No Deduction — Confirmation Needed)

| ID | Flag | Trigger | Intake Q |
|----|------|---------|----------|
| RF-02 | Non-EU Erasure Law | CCPA, Philippines DPA (erasure API resolved) | D2="Non-GDPR" |
| RF-04 | Transport Fraud Detection | Rail-specific duplicate-trip beyond 12 native rules | B4="Transport/rail" |
| RF-13 | Hard Points Reset | All points wipe at period end | B3="Hard reset" |
| RF-14 | Householding / Family Pooling | Family point aggregation | A9="Yes" |
| RF-15 | A/B Testing on Campaigns | Campaign live testing needed | Campaign section |
| RF-16 | Custom Point Expiry | Org-level, not rolling per-record | B3="Custom model" |
| RF-17 | 4+ Point Currencies | Multiple distinct point accounts | B1="4+" |
| RF-18 | Multi-Account Redemption | Combine accounts for reward | F-10-08 present |
| RF-19 | SQL Complex Segmentation | Open SQL in platform | Confirmed partial 75% |
| RF-20 | Cross-Market Analytics | Multi-brand rollup reporting | A3="Yes" + F-12-12 |
| RF-21 | SM Sync Paradigm Migration | SessionM → Connect+ retraining | Always for SessionM clients |

---

## Interaction Rules

1. **Additive, not multiplicative:** Sum all applicable RED deductions
2. **Maximum total deduction:** −30% cap
3. **RF-03 middleware mitigation:** Central middleware hub (e.g., JBridge) routes all systems as 1 integration point. Adobe Campaign and Braze count as 0 points for RF-03
4. **RF-10 ESP exemption:** Adobe Campaign and Braze are native WIP — do NOT apply RF-10 for these
5. **RF-04 scoping:** Only triggers for transport/rail clients needing duplicate-trip detection. Retail/QSR → use native 12 rules, no flag
6. **RF-11 tiered:** SessionM = −3% (structured data); Siebel/custom legacy = −5%
7. **Floor adjustment:** When 4+ RED flags fire simultaneously → add +12% to avoid sub-50% predictions
8. **D-13 middleware uplift:** When central middleware present → D-13 baseline shifts from 64% → 72%

---

## Quick Trigger Checklist (for BRD scanning)

Scan the BRD for these keywords/patterns to detect flag triggers:

| Look for... | Triggers |
|-------------|----------|
| "EU", "GDPR", "Italy", "France", "Germany", "EEA" | RF-01 |
| "CCPA", "Philippines DPA", "PDPA", "data deletion" | RF-02 |
| 4+ named external systems | RF-03 |
| "fraud", "duplicate trip", "overlapping journey", "rail" | RF-04 |
| "anniversary", "registration date", "member join date" as period start | RF-05 |
| "invitation", "manual assignment", "VIP tier", "by request" | RF-06 |
| "co-brand card", "Amex", "Visa partner", "card lifecycle" | RF-07 |
| "N upgrades per year", "lounge passes", "benefit allotment", "quota" | RF-08 |
| "grace period", "soft landing", "buffer", "protection period" | RF-09 |
| "Salesforce Marketing Cloud", "Responsys", "Klaviyo", "Emarsys" | RF-10 |
| "migration", "existing platform", "SessionM", "Siebel", "legacy" | RF-11 |
| "regulatory", "5-year limit", "statutory", "consumer code" | RF-12 |
| "points wipe", "zero balance", "period reset" | RF-13 |
| "family", "household", "pooling", "share points" | RF-14 |
| "A/B test", "split test", "campaign testing" | RF-15 |
| "custom expiry", "org-level expiry" | RF-16 |
| "4 point types", "multiple currencies" | RF-17 |
| "combine points", "multi-account" | RF-18 |
| "SQL query", "complex segmentation", "open query" | RF-19 |
| "cross-market report", "aggregate analytics", "multi-brand" | RF-20 |
| "SessionM", "SM Sync", "Connect+" | RF-21 |

---

## Pessimistic Bias Rule

When scanning for risk flags:
- If a trigger is **clearly present** → mark as triggered
- If a trigger is **unclear or ambiguous** → mark as triggered + tag `[ASSUMED — confirm with client]`
- If a trigger is **clearly absent** → mark as not triggered
- Never assume a flag is NOT triggered when evidence is ambiguous
