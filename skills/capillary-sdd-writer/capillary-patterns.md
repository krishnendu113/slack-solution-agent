# Capillary-Specific Patterns

Always apply these established patterns. Deviations require an ADR.

---

## 1. Customer Resolution Pattern

Two valid approaches exist for customer registration/identification flows. Choose based on use case requirements:

### Approach A — v1.1 Create API (Auto-resolve)

Use `POST /v1.1/customers` — this endpoint automatically creates the customer if not found, or returns the existing customer if already registered.

- Simpler integration: single API call handles both cases
- Fewer round-trips, lower latency
- Best when the client does not need to differentiate between new vs existing customers before proceeding

### Approach B — Explicit Lookup-or-Create

1. `GET /v2/customers/lookup/customerDetails?identifierName=&identifierValue=&source=`
2. If 404 → `POST /v2/customers` (create)
3. If found → `PUT /v2/customers/:customerId` (update if payload differs)

- Reduces redundant create calls when most customers already exist
- Enables different logic paths for new vs returning customers (e.g., welcome bonus only for new)
- Useful when the lookup result informs subsequent steps before any write

**When to pick:** If the flow needs to branch on new-vs-existing or avoid redundant creates at scale, use Approach B. Otherwise, Approach A is simpler and sufficient.

**Rule:** Whichever approach is chosen, wrap it in a Neo API when invoked from client systems. Never have the client manage customer resolution logic directly.

> **Note:** The endpoints above are reference examples. Always verify the current path and schema via `mcp__capillary_docs__*` before documenting in an SDD.

---

## 2. API Gateway Token Exchange

Mandatory for ALL UI-originated requests (mobile app, web):

- Client sends **User Token** to API Gateway
- Gateway converts User Token → **B2B Token**
- ALL downstream Capillary API calls use B2B Token
- NEVER show a UI client calling Capillary APIs directly with B2B tokens
- The Gateway is the boundary between the client world and Capillary

**Diagram rule:** API Gateway must be an explicit `participant` in every sequence diagram where the calling system is a mobile app or web UI.

---

## 3. Neo API Wrapper Pattern

Every custom Neo API must:
- Accept simplified request contract (client never sends raw Capillary payloads)
- Handle customer resolution internally (via v1.1 auto-create or explicit lookup-or-create, per use case)
- Return a clean, merged response — never expose raw Capillary error codes to the client
- Document every internal API call in the Process Flow steps
- Use **environment variables** for all configurable values: host URLs, org IDs, program IDs, ratios, cluster names
- Never hardcode Capillary org IDs, program IDs, or cluster URLs

---

## 4. Connect+ File Import Pattern

1. Source system drops file to SFTP
2. Connect+ flow triggered (scheduled or on file arrival)
3. Connect+ reads and validates each record
4. Valid records → call appropriate Capillary API (create/update)
5. Invalid records → write to error log file; optionally trigger alert

**Important Constraint:** Connect+ **CANNOT** connect to Azure Blob Storage directly. If the source system uses Azure Blob, an intermediate mechanism is required (e.g., existing CapCloud job, client-side SFTP sync, or a custom file mover).

**Document:** file format (CSV), column mapping, validation rules, error behavior, schedule/trigger.

---

## 4a. Connect+ Kafka Consumer Pattern

When Connect+ consumes from Kafka, it can **only call a single Neo API per message**. It does NOT execute arbitrary multi-step processing logic itself.

1. Connect+ subscribes to a Kafka topic
2. For each message, Connect+ calls a designated Neo API endpoint
3. The Neo API performs all processing logic (multiple CRM calls, conditional steps, error handling)
4. On failure, Connect+ publishes to DLQ topic

**Rule:** Never diagram Connect+ as directly calling CRM, Gamification, or other Product APIs after consuming Kafka. Always route through a Neo API. All orchestration logic lives in the Neo API, not in Connect+.

---

## 5. Engage+ Journey Pattern

For communication-triggered flows:
- Engage+ manages audience segmentation and journey triggers
- For external communication platforms or ESPs: Engage Journey uses REST API Input Block → external endpoint
- Document the data payload: which user profile fields, loyalty data, and behavioral signals are passed

---

## 6. Behavioral Events Pattern

- Each event: `customerId` (externalId), `eventType` (enum), event-specific payload fields
- Group events by trigger type: registration, engagement, session, commerce
- Document as both a **JSON schema block** and a **field table** (field name, data type, required/optional)

---

## Anti-Patterns — NEVER Do These

| Anti-Pattern | Correct Approach |
|-------------|-----------------|
| Client calls multiple Capillary APIs in sequence for one action | Wrap in a Neo API |
| Hardcoded org IDs, program IDs, cluster URLs in Neo | Use environment variables |
| Neo for batch processing of >hundreds of records | Use Connect+ |
| Skipping OTP for redemption/paid tier enrollment | Document explicit client approval in Constraints |
| UI client receives raw Capillary error response | Handle and translate in Neo/gateway layer |
| Client managing customer resolution logic directly (create/lookup calls from client side) | Handle in Neo/server layer using v1.1 auto-create or explicit lookup-or-create |
| Connect+ directly calling CRM/Product APIs after Kafka consume | Route through a Neo API — Connect+ only calls Neo per message |
| Treating coupon deactivation, activation, and redeem reversal as one flow | These are three separate CRM operations with different APIs, preconditions, and side effects. Document each as a distinct use case. |
