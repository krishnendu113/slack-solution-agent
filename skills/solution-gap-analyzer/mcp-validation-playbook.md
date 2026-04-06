# MCP Validation Playbook

**Purpose:** Pre-mapped search terms and verification protocol for validating Capillary capability claims via Capillary Docs MCP.
**Last synced:** 2026-03-12

---

## Verification Protocol by Match Level

### For N (Native) Claims
1. `mcp__capillary_docs__search-endpoints` with mapped search term
2. If found → `mcp__capillary_docs__get-endpoint` for full schema
3. Verify: endpoint exists, HTTP method matches, response includes claimed fields
4. Result: **VERIFIED** (confirm N) or **PARTIAL** (downgrade to C or P with note)
5. If NOT FOUND → **downgrade N to P** and note `[ENDPOINT NOT FOUND IN DOCS]`

### For C (Configurable) Claims
1. Search for the configuration API or admin endpoint
2. Verify: config parameter name exists in docs OR admin API documented
3. Result: **VERIFIED** (confirm C) or **DOWNGRADE** (to P or X)
4. If NOT FOUND → **downgrade C to X** and note `[CONFIG NOT FOUND IN DOCS]`

### For P (Partial) Claims
1. Search to confirm the base capability exists
2. Note what aspects are missing vs. what exists
3. Do NOT downgrade below G; just document what's confirmed
4. Result: **VERIFIED** (confirm P) or **PARTIAL** (note specific gaps)

### For X (Custom) and G (Gap)
1. Optional search to check if capability has been added since last framework sync
2. If found → flag as potential upgrade (but do NOT auto-upgrade; tag `[POTENTIAL UPGRADE — verify with Capillary PS]`)
3. These are acknowledged gaps; no downgrade possible

---

## CRITICAL RULE: Never Upgrade, Only Downgrade or Confirm

- MCP verification can **confirm** a match level or **downgrade** it
- MCP verification CANNOT upgrade a match level
- If MCP shows capability beyond what the framework claims → tag `[POTENTIAL UPGRADE]` for human review only

---

## Pre-Mapped Search Terms (Top 50+ Features)

### D-01: Customer Profiles
| Feature ID | Search Term | Expected Endpoint | Alt Search |
|-----------|-------------|-------------------|------------|
| F-01-01 | "customer add" | `POST /v1.1/customer/add` | "add customer" |
| F-01-02 | "customer add" | `POST /v2/customers` | "create customer" |
| F-01-03 | "customer upsert bulk" | `POST /integrations/customer/upsert/bulk` | "bulk import customer" |
| F-01-04 | "customer update" | `PUT /customer/update` | "update customer" |
| F-01-05 | "user merge" | `POST /api_gateway/rewards/core/v1/user-merge` | "merge customer" |
| F-01-06 | "data fields" | `GET /api_gateway/cortex/v1/dataFields` | "custom fields" |
| F-01-08 | "tag assign" | `POST /customers/bulk/manualTagAssign` | "customer tag" |
| F-01-11 | "customer status" | `PUT /customers/lookup/status` | "status update" |
| F-01-13 | "pii deletion" | PII deletion docs | "data deletion" |
| F-01-14 | "unified promotions" | `GET /v3/unifiedPromotions` | "enrolled promotions" |
| F-01-15 | "retro transaction" | `POST /api_gateway/v2/request-workflow/RETRO-TRANSACTION` | "request workflow" |

### D-04: Tier Management
| Feature ID | Search Term | Expected Endpoint | Alt Search |
|-----------|-------------|-------------------|------------|
| F-04-01 | "slab" | Slab config endpoints | "tier" |
| F-04-02 | "slab upgrade" | Slab upgrade criteria | "tier upgrade" |
| F-04-08 | "manual slab adjustment" | `POST /slab/manualSlabAdjustment` | "tier adjustment" |
| F-04-12 | "manual slab adjustment" | Same endpoint (type: seed) | "tier seeding" |
| F-04-13 | "gap to upgrade" | `GET /customer/get` | "customer get" |
| F-04-15 | "manual slab adjustment" | Same endpoint | "fast track" |

### D-05: Points Engine
| Feature ID | Search Term | Expected Endpoint | Alt Search |
|-----------|-------------|-------------------|------------|
| F-05-01 | "transaction add" | `POST /v2/transactions` | "add transaction" |
| F-05-06 | "points expiry schedule" | `GET /customers/{id}/pointsExpirySchedule` | "expiry schedule" |
| F-05-09 | "goodwill points" | `POST /api_gateway/v2/request-workflow/GOODWILL-POINTS` | "manual points" |
| F-05-10 | "negative points" | `POST /customers/{id}/negativePointsAdjustment` | "deduct points" |
| F-05-11 | "points transfer" | `POST /points/transfer` | "transfer points" |
| F-05-12 | "points reverse" | `POST /points/reverse` | "reverse points" |
| F-05-13 | "fraud" | Fraud detection docs | "fraud detection" |
| F-05-14 | "fraud detection" | Fraud rules documentation | "fraud rules" |

### D-06: Benefits & Redemption
| Feature ID | Search Term | Expected Endpoint | Alt Search |
|-----------|-------------|-------------------|------------|
| F-06-03 | "voucher" | `GET /mobile/v2/api/marvel/r/vouchers/get` | "marvel voucher" |
| F-06-06 | "reward" | Reward list with tier param | "reward catalog" |
| F-06-07 | "redeem" | `POST /points/redeem` | "points redeem" |
| F-06-08 | "vendor redemption" | `GET /api_gateway/rewards/core/v1/vendor/redemptions` | "vendor" |

### D-07: Campaign Management
| Feature ID | Search Term | Expected Endpoint | Alt Search |
|-----------|-------------|-------------------|------------|
| F-07-01 | "promotion" | `POST /api_gateway/loyalty/v1/programs/{id}/promotions` | "create promotion" |
| F-07-12 | "enrollment" | Promotion enrollment | "opt-in promotion" |
| F-07-24 | "referral" | `GET/POST /customer/referrals` | "referral program" |
| F-07-25 | "promotion code" | Promotion code config | "promo code" |

### D-08: Audiences
| Feature ID | Search Term | Expected Endpoint | Alt Search |
|-----------|-------------|-------------------|------------|
| F-08-09 | "segment users" | `GET /segments/{id}/users` | "segment export" |

### D-09: Messaging
| Feature ID | Search Term | Expected Endpoint | Alt Search |
|-----------|-------------|-------------------|------------|
| F-09-01 | "webhook" | `GET/POST /webHooks` | "webhooks" |
| F-09-02 | "subscription" | `GET/POST /customer/subscriptions` | "opt out" |

### D-10: Offers
| Feature ID | Search Term | Expected Endpoint | Alt Search |
|-----------|-------------|-------------------|------------|
| F-10-01 | "reward create" | `POST /api_gateway/rewards/core/v1/reward/create` | "create reward" |
| F-10-04 | "vendor redemption" | Same as F-06-08 | "vendor" |

### D-11: Gamification
| Feature ID | Search Term | Expected Endpoint | Alt Search |
|-----------|-------------|-------------------|------------|
| F-11-01 | "badge" | `GET/POST /api_gateway/v1/badges/badgeMeta` | "badge meta" |
| F-11-02 | "badge import" | `POST /api_gateway/v1/badges/import/customerBadges` | "badge migration" |
| F-11-03 | "tracker" | `GET /v2/customers/{id}/trackers` | "entity tracker" |
| F-11-04 | "milestone" | `POST /v3/milestones` | "target group" |
| F-11-05 | "leaderboard" | `GET /api_gateway/intouch-api-v3/v3.1/leaderboards` | "leaderboard" |

### D-14: Data Migration
| Feature ID | Search Term | Expected Endpoint | Alt Search |
|-----------|-------------|-------------------|------------|
| F-14-01 | "customer upsert bulk" | Same as F-01-03 | "bulk import" |
| F-14-02 | "currency allocate" | `POST /v2/customers/bulk/manualCurrencyAllocate` | "point seed" |
| F-14-04 | "transaction bulk" | `POST /transactions/bulk` | "bulk transaction" |

### D-15: Compliance
| Feature ID | Search Term | Expected Endpoint | Alt Search |
|-----------|-------------|-------------------|------------|
| F-15-01 | "pii deletion" | PII deletion configuration docs | "data deletion" |
| F-15-02 | "subscription" | `GET/POST /customer/subscriptions` | "consent" |
| F-15-03 | "consent" | `POST /customers/traiConsent` | "trai consent" |

---

## Verification Priority Order

When rate-limited or time-constrained, prioritize in this order:

### Priority 1 — High-weight domains with medium confidence (most impactful)
- D-04 Tier Management (10% weight, Medium confidence)
- D-05 Points Engine (10% weight, Medium confidence)
- D-13 External Integrations (10% weight, Medium confidence)
- D-15 Compliance (9% weight, Medium confidence)

### Priority 2 — High-weight domains with high confidence (confirm claims)
- D-07 Campaign Management (8% weight, High confidence)
- D-01 Customer Profiles (8% weight, High confidence)
- D-06 Benefits (7% weight, Medium confidence)
- D-12 Data Cloud (7% weight, Medium confidence)

### Priority 3 — Low-weight or consistently high-match (skip if needed)
- D-03 Catalog & Stores (4% weight, 97% baseline — very safe)
- D-08 Audiences (5% weight, 91% baseline — very safe)
- D-10 Offers (6% weight, 90% baseline)
- D-11 Gamification (4% weight, 87% baseline)
- D-09 Messaging (6% weight, 85% baseline)
- D-14 Data Migration (6% weight)
- D-02 Multi-Org (4% weight)

---

## Fallback: MCP Unavailable

If Capillary Docs MCP fails the health check or auth probe:
1. Ask user for bearer token
2. If still unavailable:
   - **Downgrade ALL N-level claims to C** (one-level pessimistic shift)
   - Tag every Capillary endpoint with `[UNVERIFIED — Capillary Docs MCP unavailable]`
   - Include prominent warning in output header
   - Still run the full scoring engine — just with downgraded levels
3. Log MCP unavailability in learnings journal
