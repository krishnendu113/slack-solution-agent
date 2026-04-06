# Scoring Engine Reference

**Derived from:** Scoring-Model-v1.md + Capillary-Capability-Matrix-v1.md + Framework-Validation-Report-v1.md
**Last synced:** 2026-03-12
**Source version:** Framework v1.2

---

## Match Level → Numeric Score

| Level | Label | Score |
|-------|-------|-------|
| N | Native | 95% |
| C | Configurable | 80% |
| P | Partial | 60% |
| X | Custom | 30% |
| G | Gap | 10% |

---

## Domain Weights & Baselines (Calibrated v1.2)

| D# | Domain | Weight | Baseline | Confidence | Primary Risk Driver |
|----|--------|--------|----------|------------|---------------------|
| D-01 | Customer Profiles & Identity | 8% | 87% | High | GDPR consent (F-15-03) pending |
| D-02 | Multi-Org & Admin Permissions | 4% | 78% | Medium | Hierarchy config; multi-market admin |
| D-03 | Catalog & Stores | 4% | 97% | High | No material gaps |
| D-04 | Tier Management | 10% | 78% | Medium | Anniversary, soft landing, auto-demotion |
| D-05 | Points Engine | 10% | 85% | Medium | Transport fraud still custom; hard reset unconfirmed |
| D-06 | Benefits & Redemption | 7% | 68% | Medium | Per-period allotment restore; external fulfillment |
| D-07 | Campaign Management | 8% | 87% | High | A/B testing gap; ESP bridge |
| D-08 | Audiences | 5% | 91% | High | SQL segmentation limits |
| D-09 | Messaging | 6% | 85% | High | Adobe/Braze WIP; others webhook |
| D-10 | Offers & Reward Store | 6% | 90% | High | Multi-account redemption TBD |
| D-11 | Gamification | 4% | 87% | High | Lucky draw partial |
| D-12 | Data Cloud / Analytics | 7% | 82% | Medium | SQL segmentation; cross-market rollup |
| D-13 | External Integrations | 10% | 64% | Medium | No native connectors; always custom |
| D-14 | Data Migration | 6% | 75% | Medium | ETL always custom; rate limits |
| D-15 | Compliance & Privacy | 9% | 74% | Medium | Erasure resolved; GDPR consent pending |

**Baseline Weighted Score (pre-flags): ~84%** (v1.2, March 2026)

---

## Baseline Contribution Breakdown

| Domain | Weight | Baseline | Contribution |
|--------|--------|----------|-------------|
| D-01 | 8% | 87% | 6.96 |
| D-02 | 4% | 78% | 3.12 |
| D-03 | 4% | 97% | 3.88 |
| D-04 | 10% | 78% | 7.80 |
| D-05 | 10% | 85% | 8.50 |
| D-06 | 7% | 68% | 4.76 |
| D-07 | 8% | 87% | 6.96 |
| D-08 | 5% | 91% | 4.55 |
| D-09 | 6% | 85% | 5.10 |
| D-10 | 6% | 90% | 5.40 |
| D-11 | 4% | 87% | 3.48 |
| D-12 | 7% | 82% | 5.74 |
| D-13 | 10% | 64% | 6.40 |
| D-14 | 6% | 75% | 4.50 |
| D-15 | 9% | 74% | 6.66 |
| **TOTAL** | **100%** | | **83.81%** |

---

## Baseline Assumptions

This ~84% baseline assumes:
- Calendar-year qualifying period (not anniversary)
- No GDPR / EU jurisdiction
- 2–3 external systems via central middleware (not 5+ independent)
- No co-brand card
- No per-period benefit allotment
- No transport-specific duplicate-trip fraud requirement
- General retail/loyalty fraud covered by Capillary's 12 native rules

---

## Scoring Formula

### Step 1 — Establish Applicable Domains
For domains marked N/A, exclude weight and redistribute proportionally:
`Adjusted_Weight_i = Original_Weight_i × (100% / Σ(applicable domain weights))`

### Step 2 — Compute Domain Base Score
`Domain_Score = Σ(feature_numeric × 1) / count(applicable_features_in_domain)`
Where feature_numeric = match level score from table above.

### Step 3 — Weighted Raw Score
`Weighted_Raw = Σ(Domain_Score_i × Adjusted_Weight_i)`

### Step 4 — Risk Flag Deductions
`Adjusted_Score = Weighted_Raw − Σ(RED_flag_deductions)`
- Deductions are additive
- Cap at −30% total
- Floor adjustment: +12% when 4+ RED flags simultaneously

### Step 5 — P/R/O Band

| Unconfirmed Item DCS | Spread per Item |
|---------------------|-----------------|
| Low (Gap/Custom, unresolved) | ±5% |
| Medium (Partial, unresolved) | ±2.5% |
| High (confirmed Native/Config) | ±0% |

- **Realistic** = Adjusted Score
- **Pessimistic** = Adjusted Score − Σ(spread penalties for Low/Medium DCS items)
- **Optimistic** = Adjusted Score + Σ(spread bonuses assuming CONFIRMs resolve positively)

---

## Score Interpretation Guide

| Range | Interpretation | Recommended Next Step |
|-------|---------------|----------------------|
| 85–100% | Strong fit; standard implementation | Proceed to SDD directly |
| 75–84% | Good fit; minor custom work | SDD with gap confirmation sessions |
| 65–74% | Moderate fit; multiple custom workstreams | Full gap analysis before SDD |
| 55–64% | Challenging fit; significant custom effort | Gap analysis + architecture session |
| Below 55% | High risk; feasibility review needed | Escalate; consider phased approach |

---

## Calibration Adjustments (v1.2, March 2026)

Applied from Framework-Validation-Report back-test:

1. RF-01 BLOCKER → RED −3% (erasure API confirmed; consent pending)
2. RF-11 tiered: SessionM −3% (structured) / Siebel −5% (legacy)
3. RF-03 central middleware counts as 1 system
4. +12% floor adjustment for 4+ RED flags (avoids sub-50%)
5. RF-21 added as YELLOW (SM Sync paradigm migration — retraining)
6. RF-10 exempt for Adobe Campaign and Braze (both native WIP)
7. RF-04 downgraded to YELLOW −2% (12 native fraud rules confirmed)
8. D-13 baseline uplifted to 72% when central middleware present (from 64%)

---

## Anomaly Detection

Flag any computed domain score deviating >10 points from baseline:
- **Above baseline by >10:** Client has simpler-than-typical needs in this domain — verify no requirements missed
- **Below baseline by >10:** Client has complex/unusual requirements — verify all features correctly mapped and look for NEW-REQ items

---

## Validation Benchmarks (3 Evidence Clients)

| Client | v1.2 Actual | v1.2 Predicted | Delta |
|--------|-------------|----------------|-------|
| Italo Più | ~79% | 72% | −7% |
| RWS NGLP | ~80% | 74% | −6% |
| Jollibee | ~83% | 81% | −2% |

Realistic scenario provides reliable floor. Pessimistic is consistently 5–8% below actual.
