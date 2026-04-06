# Feature Taxonomy Index (Compact Reference)

**Derived from:** SessionM-Feature-Taxonomy-v1.md + Capillary-Capability-Matrix-v1.md
**Last synced:** 2026-03-12
**Source version:** Framework v1.2

---

## Match Level Numerics

| Level | Label | Score |
|-------|-------|-------|
| N | Native | 95% |
| C | Configurable | 80% |
| P | Partial | 60% |
| X | Custom | 30% |
| G | Gap | 10% |

---

## D-01: Customer Profiles & Identity (Weight: 8%, Baseline: 87%)

| ID | Feature | Level | Primary Endpoint | Conf |
|----|---------|-------|-----------------|------|
| F-01-01 | Multi-identifier profile | N | `POST /v1.1/customer/add` | High ✓✓ |
| F-01-02 | Profile creation via API | N | `POST /v2/customers` | High ✓✓ |
| F-01-03 | Bulk profile ingestion | N | `POST /integrations/customer/upsert/bulk` | High ✓✓ |
| F-01-04 | Profile update via API | N | `PUT /v2/customers/lookup` | High ✓✓ |
| F-01-05 | Duplicate detection & merge | N | `POST /api_gateway/rewards/core/v1/user-merge` | High |
| F-01-06 | 100+ custom attributes | C | `GET /api_gateway/cortex/v1/dataFields` | Medium |
| F-01-07 | Delayed accrual flag | C | `parameter: delayed_accrual` | High |
| F-01-08 | Customer tagging | N | `POST /customers/bulk/manualTagAssign` | High ✓✓ |
| F-01-09 | Cross-program balance view | P | `mlp` parameter | Medium |
| F-01-10 | Pause marketing/loyalty | N | `PUT /customers/lookup/status` | High |
| F-01-11 | Customer status mgmt | N | `PUT /customers/lookup/status` | High ✓✓ |
| F-01-12 | Full profile export | C | `GET /customers/lookup/customerDetails` | Medium |
| F-01-13 | Right to erasure | C | `CONF_ENABLE_PII_DELETION` | High ✓✓ |
| F-01-14 | View enrolled promotions | N | `GET /v3/unifiedPromotions` | High ✓✓ |
| F-01-15 | Retro-transaction claims | N | `POST /api_gateway/v2/request-workflow/RETRO-TRANSACTION` | High |

## D-02: Multi-Org & Admin Permissions (Weight: 4%, Baseline: 78%)

| ID | Feature | Level | Primary Endpoint | Conf |
|----|---------|-------|-----------------|------|
| F-02-01 | Root + sub-org hierarchy | C | Multi-org config by PS | Medium |
| F-02-02 | Country code market ID | C | Org external ID convention | Medium |
| F-02-03 | RBAC with module perms | C | Admin role management | High ✓✓ |
| F-02-04 | Market-scoped admin | C | Org-level permissions | High |
| F-02-05 | Cross-market admin | C | Global admin role | Medium |
| F-02-06 | Market-scoped campaigns | C | Per-loyalty-program promotions | High |
| F-02-07 | Admin SSO / IdP | C | OAuth 2.0 / OIDC | High ✓✓ |

## D-03: Catalog & Stores (Weight: 4%, Baseline: 97%)

| ID | Feature | Level | Primary Endpoint | Conf |
|----|---------|-------|-----------------|------|
| F-03-01 | Store load with attributes | N | `POST /stores` | High ✓✓ |
| F-03-02 | Store tagging | N | `customFields` on store | High ✓✓ |
| F-03-03 | Market-specific store assign | N | Store linked to loyalty program | High ✓✓ |
| F-03-04 | Product/SKU catalog | N | `POST /catalog` | High ✓✓ |
| F-03-05 | SKU category hierarchy | C | `parentCategory` config | High |
| F-03-06 | Large store count (250+) | N | No documented limit | High |

## D-04: Tier Management (Weight: 10%, Baseline: 78%)

| ID | Feature | Level | Primary Endpoint | Conf |
|----|---------|-------|-----------------|------|
| F-04-01 | Multi-tier (2-5 tiers) | N | Slab config in Loyalty+ | High ✓✓ |
| F-04-02 | Point threshold auto-upgrade | N | `slab_upgrade_criteria` | High ✓✓ |
| F-04-03 | Calendar year period | N | Standard program period config | High |
| F-04-04 | Anniversary-based period | P | Per-member slab renewal | Medium |
| F-04-05 | Dual TQ + TM accounts | C | Multiple point accounts | High |
| F-04-06 | Maintenance window | C | Slab validity window config | High |
| F-04-07 | Soft landing / grace | P | `userEntityTrackers` + conditional rule | Medium |
| F-04-08 | Invitation-only tier | P | `POST /slab/manualSlabAdjustment` | Medium |
| F-04-09 | Consumer + corporate | C | `mlp` multi-loyalty program | High |
| F-04-10 | Consumer + employee | C | `mlp` separate program | High |
| F-04-11 | Auto-demotion on event | X | `manualSlabAdjustment` + Connect+ trigger | Medium |
| F-04-12 | Tier seeding from legacy | N | `POST /slab/manualSlabAdjustment` (seed) | High |
| F-04-13 | Gap-to-upgrade visible | N | `GET /customer/get` gap fields | High |
| F-04-14 | QP reset at period end | P | Period-end reset unconfirmed | Medium |
| F-04-15 | Fast-track manual promotion | N | `POST /slab/manualSlabAdjustment` | High |

## D-05: Points Engine (Weight: 10%, Baseline: 85%)

| ID | Feature | Level | Primary Endpoint | Conf |
|----|---------|-------|-----------------|------|
| F-05-01 | Transaction-based earn | N | `POST /v2/transactions` | High ✓✓ |
| F-05-02 | Multiple point accounts | N | Multiple accounts per program | High ✓✓ |
| F-05-03 | Point source inventory cap | N | `maxIssuance` on source | High ✓✓ |
| F-05-04 | Per-customer issuance cap | C | `rateLimitPoints` | High |
| F-05-05 | Point account ceiling | C | `maxBalance` | High |
| F-05-06 | Rolling expiry | N | `GET /customers/{id}/pointsExpirySchedule` | High ✓✓ |
| F-05-07 | Hard period reset | P | Mechanism unconfirmed | Medium |
| F-05-08 | Expiry schedule visible | N | `GET /customers/{id}/pointsExpirySchedule` | High ✓✓ |
| F-05-09 | Manual goodwill adjust | N | `POST /api_gateway/v2/request-workflow/GOODWILL-POINTS` | High ✓✓ |
| F-05-10 | Negative point adjust | N | `POST /customers/{id}/negativePointsAdjustment` | High |
| F-05-11 | Points transfer | N | `POST /points/transfer` | High |
| F-05-12 | Points reversal | N | `POST /points/reverse` | High ✓✓ |
| F-05-13 | Fraud flag | N | `fraud_details` on customer get | High |
| F-05-14 | Duplicate txn fraud | P | 12 native rules; transport-specific custom | Medium |
| F-05-15 | Non-purchase earn | C | Event schema `PUT /events` | High ✓✓ |
| F-05-16 | Decimal rounding rule | C | Point source rounding config | Medium |
| F-05-17 | Payment-mode earn | N | `paymentMode` filter | High |

## D-06: Benefits & Redemption (Weight: 7%, Baseline: 68%)

| ID | Feature | Level | Primary Endpoint | Conf |
|----|---------|-------|-----------------|------|
| F-06-01 | Per-period allotment | P | `userEntityTrackers` | Medium |
| F-06-02 | Allotment restore on cancel | X | Connect+ cancellation listener | Medium |
| F-06-03 | Physical/QR voucher | N | `GET /mobile/v2/api/marvel/r/vouchers/get` | High ✓✓ |
| F-06-04 | External booking fulfillment | X | No native connector | Medium |
| F-06-05 | Reward ticket gifting | P | Points transfer + manual re-issue | Medium |
| F-06-06 | Tier-restricted catalog | N | `tier` param on reward list | High ✓✓ |
| F-06-07 | Points-for-rewards | N | `POST /points/redeem` | High ✓✓ |
| F-06-08 | Vendor/external fulfillment | P | Vendor redemptions API | High ✓✓ |

## D-07: Campaign Management (Weight: 8%, Baseline: 87%)

| ID | Feature | Level | Primary Endpoint | Conf |
|----|---------|-------|-----------------|------|
| F-07-01 | Timeboxed promotions | N | `POST /api_gateway/loyalty/v1/programs/{id}/promotions` | High ✓✓ |
| F-07-02 | Spend threshold (single) | N | `TRANSACTION_AMOUNT` behavior | High ✓✓ |
| F-07-03 | Spend threshold (cumulative) | N | `CUMULATIVE_SPEND` behavior | High ✓✓ |
| F-07-04 | Purchase count | N | `TRANSACTION_COUNT` behavior | High ✓✓ |
| F-07-05 | Item/category purchase | N | `ITEM_PURCHASE` behavior | High ✓✓ |
| F-07-06 | Consecutive purchase | N | `CONSECUTIVE_TRANSACTIONS` | High |
| F-07-07 | Store location-based | N | `storeFilter` | High ✓✓ |
| F-07-08 | Time/day-of-week | N | `timeFilter`, `dayOfWeekFilter` | High ✓✓ |
| F-07-09 | Non-purchase event | C | Event-based trigger config | High ✓✓ |
| F-07-10 | Multi-step sequential | N | `stepsRequired` | High ✓✓ |
| F-07-11 | Trigger chaining | C | Trigger outcome type | Medium |
| F-07-12 | Opt-in promotions | N | `enrollmentRequired: true` | High |
| F-07-13 | Fixed point reward | N | `FIXED_POINTS` outcome | High ✓✓ |
| F-07-14 | Variable point reward | N | `VARIABLE_POINTS_RATIO` | High ✓✓ |
| F-07-15 | Offer issuance reward | N | `ISSUE_REWARD` outcome | High ✓✓ |
| F-07-16 | Customer tagging outcome | N | Tag assignment outcome | High ✓✓ |
| F-07-17 | Campaign cloning | N | Clone in admin | High ✓✓ |
| F-07-18 | Stop/pause campaign | N | Promotion status update | High |
| F-07-19 | Campaign metadata | C | `metadata` / `customFields` | High |
| F-07-20 | Change audit trail | N | Version history in admin | High |
| F-07-21 | Approval workflow | C | Workflow config | High |
| F-07-22 | Mutually exclusive | P | Priority + exclusion config | Medium |
| F-07-23 | A/B testing | G | Not in API docs | Low |
| F-07-24 | Referral program | N | `GET/POST /customer/referrals` | High |
| F-07-25 | Promo codes | N | `promotionCode` with prefix | High |

## D-08: Audiences (Weight: 5%, Baseline: 91%)

| ID | Feature | Level | Primary Endpoint | Conf |
|----|---------|-------|-----------------|------|
| F-08-01 | Dynamic segments | N | Rule-based in Engage+ | High ✓✓ |
| F-08-02 | Static segments | N | Manual/tag-based | High ✓✓ |
| F-08-03 | Profile attribute segment | N | Profile filter | High ✓✓ |
| F-08-04 | Activity/purchase segment | N | Transaction-based rule | High ✓✓ |
| F-08-05 | Offer wallet segment | N | Offer history filter | High |
| F-08-06 | SKU/category segment | C | Catalog-linked rule | High |
| F-08-07 | Data Cloud metrics segment | P | CDP rule-based; SQL limited | Medium ✓✓ |
| F-08-08 | Import external segments | C | Tag bulk via Connect+ | High ✓✓ |
| F-08-09 | Export segment lists | N | `GET /segments/{id}/users` | High ✓✓ |
| F-08-10 | Clone segments | N | Segment copy in Engage+ | High |

## D-09: Messaging & Communications (Weight: 6%, Baseline: 85%)

| ID | Feature | Level | Primary Endpoint | Conf |
|----|---------|-------|-----------------|------|
| F-09-01 | Real-time event triggers | N | `GET/POST /webHooks` | High ✓✓ |
| F-09-02 | Scheduled messages | C | Engage+ scheduled send | High ✓✓ |
| F-09-03 | Enrollment trigger | N | `CUSTOMER_ENROLLED` webhook | High ✓✓ |
| F-09-04 | Points earned trigger | N | `POINTS_EARNED` webhook | High ✓✓ |
| F-09-05 | Tier change trigger | N | `TIER_JOINED_*` webhook | High ✓✓ |
| F-09-06 | Offer issuance trigger | N | `REWARD_ISSUED` webhook | High ✓✓ |
| F-09-07 | Expiry warning trigger | C | Scheduled Connect+ job | High ✓✓ |
| F-09-08 | Campaign completion trigger | N | `PROMOTION_COMPLETED` webhook | High ✓✓ |
| F-09-09 | Manual adjust trigger | N | `POINTS_ADJUSTED` webhook | High |
| F-09-10 | Birthday/anniversary | P | Date trigger or Connect+ job | Medium ✓✓ |
| F-09-11 | Lapsed re-engagement | P | Inactivity segment + send | Medium |
| F-09-12 | External ESP delivery | C/X | Adobe/Braze=C (WIP); others=X | Medium ✓✓ |
| F-09-13 | Webhook outbound | N | Full webhook CRUD | High ✓✓ |
| F-09-14 | Point cap notification | C | Connect+ scheduled check | Medium |

## D-10: Offers & Reward Store (Weight: 6%, Baseline: 90%)

| ID | Feature | Level | Primary Endpoint | Conf |
|----|---------|-------|-----------------|------|
| F-10-01 | Offer creation | N | `POST /api_gateway/rewards/core/v1/reward/create` | High ✓✓ |
| F-10-02 | Offer restrictions | N | `maxPerUser`, `totalBudget`, `validityInDays` | High ✓✓ |
| F-10-03 | Custom metadata | N | `customFields` on reward | High ✓✓ |
| F-10-04 | 3rd party redemption | N | Vendor redemptions API | High ✓✓ |
| F-10-05 | Bulk offer issuance | N | Bulk issuance API | High |
| F-10-06 | Reward store exchange | N | Rewards+ catalog | High ✓✓ |
| F-10-07 | Tier/tag access control | N | `tier` param on list | High ✓✓ |
| F-10-08 | Multi-account combination | P | `combinedBalance` unconfirmed | Medium |
| F-10-09 | Add/remove from store | N | Reward status update | High ✓✓ |

## D-11: Gamification (Weight: 4%, Baseline: 87%)

| ID | Feature | Level | Primary Endpoint | Conf |
|----|---------|-------|-----------------|------|
| F-11-01 | Badge creation | N | `GET/POST /api_gateway/v1/badges/badgeMeta` | High |
| F-11-02 | Badge migration | N | `POST /api_gateway/v1/badges/import/customerBadges` | High |
| F-11-03 | Counters/trackers | N | `GET /v2/customers/{id}/trackers` | High ✓✓ |
| F-11-04 | Target groups | N | `POST /v3/milestones` | High |
| F-11-05 | Leaderboards | N | `GET /api_gateway/intouch-api-v3/v3.1/leaderboards/*` | High |
| F-11-06 | Lucky draws/scratch cards | P | Partial; custom UI needed | Medium |

## D-12: Data Cloud / Analytics (Weight: 7%, Baseline: 82%)

| ID | Feature | Level | Primary Endpoint | Conf |
|----|---------|-------|-----------------|------|
| F-12-01 | Enrollment dashboards | N | Insights+ standard | High ✓✓ |
| F-12-02 | Tier breakdown | N | Insights+ tier distribution | High ✓✓ |
| F-12-03 | Transaction metrics | N | Insights+ frequency/value/spend | High ✓✓ |
| F-12-04 | Points liability | N | Insights+ liability report | High ✓✓ |
| F-12-05 | Campaign performance | N | Insights+ campaign analytics | High ✓✓ |
| F-12-06 | Offer analytics | N | Insights+ offer analytics | High ✓✓ |
| F-12-07 | Store/channel breakdown | N | Insights+ store analytics | High ✓✓ |
| F-12-08 | Daily data export | N | Connect+ S3/SFTP | High ✓✓ |
| F-12-09 | SQL segmentation | P | CDP rule-based; open SQL limited | Medium ✓✓ |
| F-12-10 | Ad-hoc reporting | C | Custom report builder | High ✓✓ |
| F-12-11 | Payment analytics | N | Insights+ payment breakdown | High ✓✓ |
| F-12-12 | Cross-market analytics | P | Per-program; cross needs Connect+ | Medium |
| F-12-13 | Real-time dashboards | N | Insights+ live | High |
| F-12-14 | Custom BI export | C | Connect+ → BI tool | High |

## D-13: External Integrations (Weight: 10%, Baseline: 64%)

| ID | Feature | Level | Primary Endpoint | Conf |
|----|---------|-------|-----------------|------|
| F-13-01 | Client middleware (REST) | C | Standard REST APIs | High ✓✓ |
| F-13-02 | eCommerce/booking engine | X | No native connector | Medium |
| F-13-03 | External ESP | C/X | Adobe/Braze=C (WIP); others=X | Medium ✓✓ |
| F-13-04 | Booking/fulfillment engine | X | No native connector | Medium |
| F-13-05 | Data lakehouse export | N | Connect+ S3/SFTP | High ✓✓ |
| F-13-06 | Legacy migration ETL | X | No native ETL | Medium ✓✓ |
| F-13-07 | Co-brand card lifecycle | X | No native card issuer connector | Medium |
| F-13-08 | HR/corporate system | X | Connect+/CRM webhook | Medium |
| F-13-09 | Admin SSO/IdP | C | OAuth 2.0/OIDC | High ✓✓ |
| F-13-10 | Analytics/BI platform | C | Connect+ export | High ✓✓ |
| F-13-11 | POS/ordering system | C | Transaction API via middleware | High ✓✓ |

## D-14: Data Migration (Weight: 6%, Baseline: 75%)

| ID | Feature | Level | Primary Endpoint | Conf |
|----|---------|-------|-----------------|------|
| F-14-01 | Bulk profile import | N | `POST /integrations/customer/upsert/bulk` | High |
| F-14-02 | Point balance seeding | N | `POST /v2/customers/bulk/manualCurrencyAllocate` | High |
| F-14-03 | Tier seeding | N | `POST /slab/manualSlabAdjustment` (seed) | High |
| F-14-04 | Historical txn import | N | `POST /transactions/bulk` | High |
| F-14-05 | Badge migration | N | `POST /api_gateway/v1/badges/import/customerBadges` | High |
| F-14-06 | ETL pipeline | X | No native ETL; always custom | Medium ✓✓ |
| F-14-07 | Rate limit mgmt | P | Bulk limits exist; exact TBD | Medium |
| F-14-08 | Data residency compliance | C | EU/APAC cluster routing | High |

## D-15: Compliance & Privacy (Weight: 9%, Baseline: 74%)

| ID | Feature | Level | Primary Endpoint | Conf |
|----|---------|-------|-----------------|------|
| F-15-01 | Right to erasure | C | `CONF_ENABLE_PII_DELETION` API | High ✓✓ |
| F-15-02 | Consent opt-in/out | N | `GET/POST /customer/subscriptions` | High ✓✓ |
| F-15-03 | GDPR lawful basis | P | `POST /customers/traiConsent` (not GDPR-native) | Low |
| F-15-04 | Data portability | C | `GET /customers/lookup/customerDetails` | Medium |
| F-15-05 | EU data residency | N | EU cluster `CAPILLARY_CLUSTER=eu` | High |
| F-15-06 | APAC data residency | N | APAC cluster | High ✓✓ |
| F-15-07 | Statutory program limit | X | No platform feature; procedural | High |
| F-15-08 | CCPA deletion | C | Same PII deletion API as F-15-01 | Medium |
| F-15-09 | Subscription mgmt | N | `GET/POST /customer/subscriptions` | High ✓✓ |
| F-15-10 | Data anonymisation | C | Configurable wait period in PII deletion | High |
