# Golden Path: Solution Tier Decision Framework

For EVERY functional requirement, apply tiers in order. Select the LOWEST viable tier. Never use a higher tier when a lower one suffices.

---

## Tier 1 — Product Configuration

**Use when:** The requirement is fully met through native Capillary platform configuration.
Applies to: loyalty rules, tier logic, earn/burn rules, campaign setup, communication templates, standard coupon management, standard reporting.
**Owner:** Capillary Config Team. No code written.
**Document:** Configuration specification, not an API flow.
**Examples:** tier structure, points expiry, standard campaign, standard coupon series.

---

## Tier 2 — Standard Capillary APIs

**Use when:** A client system needs real-time interaction using existing product API endpoints.

**Auth — UI clients:** User Token → API Manager (Gateway) → B2B Token → downstream Capillary APIs.
**Auth — backend-to-backend:** OAuth 2.0 Bearer token via `/oauth/token/generate` using client key+secret bound to a Till or Store Center.

**Standard endpoints (use these before inventing new ones):**
- `GET  /v2/customers/lookup/customerDetails?identifierName=&identifierValue=&source=`
- `POST /v2/customers`
- `PUT  /v2/customers/:customerId`
- `POST /v2/customers/:customerId/changeIdentifier`
- `POST /v2/customers/:customerId/subscriptions`
- `POST /v2/transactions/bulk`
- `GET  /v2/transactions/:transactionId`
- `POST /v2/coupon/redeem` / `GET /v2/coupon/is_redeemable` / `POST /v2/coupon/reactivate`
- `GET  /v1.1/points/isredeemable` / `POST /v1.1/points/redeem`
- `POST /v2/partnerProgram/linkCustomer` / `POST /v2/partnerProgram/deLinkCustomer`
- `POST /v2/userGroup2` / `POST /v2/userGroup2/join` / `DELETE /v2/userGroup2/{id}/leave`
- `POST /v2/slab/manualSlabAdjustment`
- `GET  /v1.1/organization/entities`
- `POST /v2/requests` (PII deletion)

> **These are reference examples only.** Before documenting any endpoint in an SDD, verify its current path, version, and schema via `mcp__capillary_docs__*` tools (Step 2). Endpoints may have newer versions (`/v3/`) or changed schemas.

---

## Tier 3 — Neo API (Low-Code Orchestration)

**Use when:** Standard APIs alone are insufficient and you need custom synchronous, stateless logic.

**Neo is RIGHT for:**
- Customer lookup-then-create patterns (atomic lookup + conditional create)
- Wrapper APIs merging data from multiple Capillary APIs into one response
- Adding derived fields, filters, or computed values on top of product API responses
- Synchronous event handlers
- Abstracting POS/mobile clients from internal API complexity

**Neo BLOCKERS — DO NOT USE Neo when:**
- ❌ Logic requires **loops or iteration** over API call results
- ❌ Request involves **form-data** payloads (multipart/form-data)
- ❌ Processing is **asynchronous or long-running** → use Connect+
- ❌ Complex **state management** across multiple requests
- ❌ **Batch processing** of more than a few hundred records → use Connect+

**Naming convention:** `/x/neo/v2/{resource}` or `neo/x/v2/{resource}`

**ADR required:** Any non-obvious Neo decision must have an ADR.

---

## Tier 4 — Connect+ (Async / Event-Driven)

**Use when:** File imports/exports, event-driven processing, scheduled batch jobs, or any async workflow.

**Connect+ is RIGHT for:**
- CSV file imports via SFTP (partners, stores, offers, transactions, coupons)
- Event-driven flows consuming platform events: `issuedPointsReversed`, `issuedAlternateCurrenciesReversed`, `partnerProgramLinked`, etc.
- Kafka consumer → calls a Neo API per message for async processing
- Scheduled data synchronization jobs
- Batch tier adjustments (e.g., daily expired subscription tier downgrade)
- Any flow where the client does NOT need a synchronous response

**Connect+ LIMITATIONS:**
- ❌ **Cannot connect to Azure Blob Storage** — use SFTP or an intermediate CapCloud job
- ❌ **Kafka consumer mode:** can only call a **single Neo API per message** — does NOT execute multi-step processing logic itself
- ❌ **Cannot run arbitrary code** — all orchestration logic must live in the called Neo API

**Always specify:** trigger mechanism (file drop / event name / schedule), file format and schema, processing logic, error handling approach, output action.

---

## Tier 5 — Custom AWS Infrastructure

**Use when:** Cannot be met by Tiers 1–4 due to complexity, volume, latency requirements, or confirmed Neo/Connect+ blockers.

**Examples:** custom ESB consumers, high-throughput data pipelines, custom microservices.

**Always document:** deployment architecture, hosting details, technology stack, specific reason lower tiers were insufficient.
**ADR required:** Always. Every Tier 5 selection needs an ADR.

---

## Tier Selection Documentation (mandatory in Section 9)

For each use case, write:
```
Solution Tier: [Tier N — Name]
Rationale: [One sentence explanation]
```
