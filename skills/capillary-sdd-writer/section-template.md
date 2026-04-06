# Full SDD Section Template

Generate the SDD as a complete Markdown document using this exact structure.
Do not skip sections; if not applicable write: "Not Applicable — [one-line reason]"

---

## DOCUMENT HEADER (before Section 1 — not a numbered section)

```markdown
# [Brand Name] Solution Design Document

## Revision History

| Version | Date | Author | Comments |
|---------|------|--------|----------|
| 0.1 | YYYY-MM-DD | Author Name <author@capillarytech.com> | Initial Draft |

**Document Version:** 0.1
**Version Update Date:** YYYY-MM-DD
**Authored By:** Author Name <author@capillarytech.com>
**Brand Name:** [Brand Name]

| Approved By | Role | Date |
|-------------|------|------|
| | | |
```

---

## 1. Introduction

**1.1 [Brand Name] Overview**
2–4 sentences: who is the client, what is their business, why they are implementing this solution.

**1.2 Goals**
Bullet list of BUSINESS OUTCOMES (not technical tasks). Each goal is specific and observable.

---

## API & Component Taxonomy *(mandatory for Full SDD — insert after §1 Introduction, before §2 Constraints)*

> **Developer Navigation Aid** — Not a numbered section. Provides at-a-glance API classification for every developer and team working from this SDD.

| Category | Definition | Examples in This Document |
|----------|-----------|--------------------------|
| **Capillary Product API** | Standard Capillary platform endpoints — maintained by Capillary, versioned at `/v2/`, `/v1.1/`, or gateway paths. Developers call these with an OAuth2 token. | [FILL IN from §9 tables — e.g. `GET /v1.1/coupon/get`, `POST /v2/transactions/bulk`] |
| **Neo Custom API** | Custom endpoints built by the Neo team specifically for this integration. Paths start with `/x/neo/v2/`. These are NOT Capillary platform APIs — they are team-built orchestration layers. | [FILL IN from §9 tables — e.g. `POST /x/neo/v2/barcode/scan`] |
| **Custom Service (Tier 5)** | Custom code components deployed on CapCloud or AWS — Java services, Lambda functions, batch jobs. Omit this row if no Tier 5 components are in scope. | [FILL IN or write "Not applicable to this integration"] |

*Every API row in Section 9 spec tables carries an `API Category` column using exactly these labels. The §7 Workflow Index identifies which APIs belong to each category per flow.*

---

## 2. Constraints

Bullet list — only include categories with real constraints:
- **Platform Constraint:** The core loyalty engine, CRM, and campaign management will be Capillary Technologies' platform.
- **Integration Constraint:** [Client systems that must be integrated]
- **Geographic Constraint:** [Country/region scope, data residency]
- **Security Constraint:** [Applicable regulation — GDPR / PDPA / DPDPA / etc.]
- **Scope Constraint:** [OUT OF SCOPE: items not in BRD — each marked [OUT OF SCOPE]]

Flag assumptions: `[ASSUMPTION - TO BE CONFIRMED]`

---

## 3. Context and Scope

Opening: "This document provides the technical solution design for [Brand Name]'s [program/integration name], as detailed in [BRD link or JIRA epic]."

**3.1 System Context** — Paragraph describing all systems and how they connect.
**3.2 Business Context** — Key functional areas covered.
**3.3 Business Requirement** — Link to BRD + summary of requirement epics and program structure.
**3.4 Technical Requirement** — Link to JIRA user stories + integration/API/system-level requirements.

---

## 4. Systems Involved

| System Name | Ownership | Core Business Functions |
|-------------|-----------|------------------------|

Include EVERY system participating in any data flow:
- Client-owned systems (POS, ecommerce, CRM, mobile app)
- Third-party systems (SMS/email gateway, CMS, identity provider)
- Capillary products (Loyalty+, Engage+, Connect+, Neo API, Insights+, CDP)

Mark out-of-scope: `[Out of Scope for Phase N]` in Core Business Functions.

---

## 5. Solution Strategy

Bullet list (not prose) of key technical decisions:
- Primary integration protocol (REST APIs, file-based, event-driven, hybrid)
- Authentication approach per channel
- Data flow direction (real-time / near-real-time / batch)
- Platform choices and rationale
- Offline/fallback strategy (if applicable)
- Phase sequencing (if applicable)

---

## 6. Deployment View (High Level Architecture)

**6.1 Architecture Diagram**
Mermaid.js flowchart using color classes (capillary/client/external/gateway). Every system from Section 4 must appear. Every arrow labeled. API Gateway explicit when UI clients involved. Subgraphs for logical groupings.

**6.2 Key System Interactions**
Numbered list (4–6 items minimum) explaining each major interaction in plain language. Reference diagram node names.

---

## 7. Building Block View (User/Process Flow)

**7.1 User Types** — Define user types: who they are, how they authenticate, what they can do.

**7.N [Feature Area Name]** — One subsection per major feature area (e.g., Customer Enrolment, Transaction Processing, Points Redemption). For each:
- Brief description of the business process
- Key business rules governing this flow
- Edge cases and exception handling

This section describes WHAT happens. Section 9 describes HOW it is implemented technically.

**7.N+1 Workflow Index** (mandatory for SDDs with ≥2 distinct flows)

Navigation table linking every flow to its implementation details:

| Workflow / Feature | BRD Ref | Tier | Section 9 Ref | Primary Capillary Product APIs | Primary Neo Custom APIs |
|--------------------|---------|------|---------------|-------------------------------|------------------------|
| Customer Link-or-Create | CAP-123 | Tier 3 | §9.1 | GET /v2/customers/lookup, POST /v2/customers | POST /neo/{brand}/customerLink |
| File-based Accrual | REQ-02 | Tier 4 | §9.2 | POST /v2/events | POST /neo/{brand}/ibcAccrual |
| Points Redemption | CAP-125 | Tier 2 | §9.3 | POST /v2/points/redeem | — |

Rules: every row must identify which APIs are Capillary Product (existing platform) vs Neo Custom (team-built). Leave Neo Custom column blank (—) only for pure Tier 2 flows with no custom orchestration.

---

## 8. Crosscutting Concepts

**8.1 Security**
- Authentication: exact mechanism per system integration
- Authorization: role/scope boundaries
- Data in Transit: minimum TLS 1.2 required
- OTP handling (if applicable): expiry 5 min, max 3 retries

**8.2 Error Handling**
- HTTP status code conventions
- Error response JSON structure
- Client retry expectations

**8.2.1 Failure Notification and Escalation** (mandatory — omit only if the integration has zero automated processing)

| Failure Scenario | Alert Type | Recipient(s) | Channel | Trigger Condition | Escalation |
|-----------------|------------|-------------|---------|-------------------|-----------|
| API 5xx (repeated) | Page | {{ONCALL_EMAIL}} | PagerDuty / Email | 3+ consecutive 5xx responses | After 15 min → Engineering Lead |
| CSV file not received | Warning | {{DATA_OPS_EMAIL}} | Email | File missing after expected delivery window | None |
| Filename mismatch | Error | {{DATA_OPS_EMAIL}} | Email | Any file fails filename validation | None |
| CMS key not found | Critical | {{CONFIG_EMAIL}} | Email + Slack | Neo CMS key missing at runtime | Immediate ops page |

Recipients are resolved in Integration and Configuration Data — Alert Contact Registry. Do not leave them as template variables in this table; fill in actual email addresses or `[CONFIRM WITH CLIENT]`.

**8.3 Data Formats and Protocols**
- All API payloads: JSON with UTF-8 encoding
- Date/time: ISO 8601 (YYYY-MM-DDTHH:MM:SS±HH:MM)
- Phone numbers: include country code (e.g., 919876543210 for India)

**8.N** [Additional crosscutting patterns relevant to this project]

---

## 9. Solution Detailing

One numbered subsection per use case or API group: 9.1, 9.2, 9.N.

### Per use case, include ALL applicable elements:

**A) USE CASE STATEMENT** (mandatory)
`"This use case covers [actor] performing [action] via [channel]."`

**BRD Ref:** `[JIRA-ID or REQ-NN or BRD §X.Y]` — [one-line requirement summary from source]
_(Sourced from Requirement Registry built in Step 2. Use `[INFERRED — no BRD/JIRA source]` if no ID exists.)_

**Solves:** [One sentence — what client business problem this use case eliminates, written from the client's perspective, not the technical implementation's. Example: "Eliminates manual member ID entry at POS by providing barcode-scan-based loyalty account resolution under 500ms."]

**B) SOLUTION TIER** (mandatory)
```
Solution Tier: [Tier N — Name]
Rationale: [One sentence]
```

**C) PROCESS FLOW** (mandatory — two layers required)

**Layer 1 — Business Narrative** (1–2 sentences): state the observable trigger and business outcome from the client's perspective. No system names, no API paths.
```
When a customer scans their app barcode at POS, the system resolves their loyalty account in real time
and confirms the transaction with an updated points balance — no manual ID entry required.
```

**Layer 2 — Technical Flow** (numbered steps): written in English at pseudo-code granularity. Each step names the acting system and Neo block type (Schema / ApiRequest / Script / CmsConfig / MongoRead / MongoWrite), the exact endpoint called, the key fields sent with their source, the key response fields extracted and what happens with them, and every conditional branch with its action. Developers must be able to use this as AI code generation input without additional context.

Each numbered step MUST include:

1. **Actor + action + endpoint** — name the acting system first, never passive voice
2. **Request fields** with explicit source — where each field value comes from:
   - `←Step N→field.path` for data from a prior step's response
   - `←BRD→section` for business rule values
   - `←SA-Q{N}→` for SA-confirmed values
   - `←config→KEY_NAME` for environment/configuration values
   - Each field annotated with `[CIT-xxx]` citation
3. **Response fields** extracted — what is read from the response and how it's used downstream
4. **Error branches** — for each possible error:
   - HTTP status code and error code
   - Error response body structure
   - Recovery action (retry, fallback, return error to caller, compensating action)
5. **Inline citation** — `[CIT-xxx]` after every factual claim

> **Field-name rule for Layer 2:** For Capillary Product API calls, field names in request/response lines MUST match the names from the Capillary Docs MCP schema fetched in Step 2. Do not invent field names for Product APIs. For Neo Custom API fields, the architect defines the names.

**Layer 2 Example:**

```
1. Mobile App sends POST /x/neo/v2/{brand}/barcodeScan to API Gateway [CIT-001]
   Request fields:
     - barcodes: array of scanned barcode strings ←user_input→scannedBarcodes [CIT-001]
     - memberId: customer loyalty ID ←app_state→memberId [CIT-003]
     - storeCode: POS location identifier ←app_state→currentStore [CIT-SA-Q5]
   (no response at this step — async acknowledgment)

2. API Gateway validates User Token; exchanges for B2B Token; forwards to Neo API [CIT-008]
   Error 401: invalid/expired User Token → return 401 to Mobile App with message "Session expired, please re-login"

3. Neo — Schema block validates request payload [CIT-012]
   Enforces:
     - barcodes: non-empty array, max 50 items [CIT-001]
     - memberId: non-null, 9-digit string [CIT-004]
     - storeCode: matches configured store list [CIT-SA-Q5]
   Error: validation failure → return HTTP 400, code=VALIDATION_FAILED, body: { errors: [{field, message}] }

4. Neo — ApiRequest block calls GET /v2/customers/lookup/customerDetails [CIT-014]
   Request fields:
     - identifierName: "externalId" [CIT-014]
     - identifierValue: ←Step 1→memberId [CIT-003]
     - source: "MOBILE_APP" ←config→SOURCE_CONFIG [CIT-SA-Q4]
   Response fields extracted:
     - id → stored as capillaryCustomerId for Step 6 [CIT-014]
     - loyalty.currentSlab → stored for tier validation [CIT-014]
   Error 404: customer not found → return HTTP 404, code=CUSTOMER_NOT_FOUND to caller
   Error 5xx: upstream failure → return HTTP 502, code=UPSTREAM_ERROR, retry with backoff (1s, 2s, 4s)
```

**D) SEQUENCE DIAGRAM** (mandatory for every API-driven use case)

Write a Mermaid `sequenceDiagram` block following the template and rules in `diagram-rules.md`. Required: `autonumber`, API Gateway as explicit participant for UI-originated flows, `alt`/`opt` blocks for every conditional path, final response arrow returning to the originating caller.

**E) API SPECIFICATION** (mandatory for every custom Neo API or non-obvious standard API)

Use the exact column headers from `style-guide.md` Section 4. One row per API endpoint.

`API Category` values: `Capillary Product` | `Neo Custom` | `Third Party`
`Cluster / Base URL`: always write cluster alias followed by env var notation — e.g. `apac2 / \`${CAPILLARY_API_HOST}\``. **Never hardcode a literal URL** (e.g. `https://apac2.api.capillarytech.com`) in this column. `${CAPILLARY_API_HOST}` is resolved in Integration and Configuration Data — API Endpoint Registry. Curl examples in the SDD body may show the resolved literal URL. Neo custom APIs use path prefix `/x/neo/v2/`.

| Method | End Point | API Category | Cluster / Base URL | Description | Headers | Request | Response | Key Notes |
|--------|-----------|-------------|-------------------|-------------|---------|---------|----------|-----------|
| POST | `/x/neo/v2/users/profile` | Neo Custom | apac2 / `${CAPILLARY_API_HOST}` | Lookup-or-create customer profile | `Authorization: Basic <base64(key:secret)>`; `Content-Type: application/json` | See below | See below | Returns `"created": false` if customer exists. Uses externalId as primary identifier. |
| GET | `/v2/customers/lookup/customerDetails` | Capillary Product | apac2 / `${CAPILLARY_API_HOST}` | Lookup customer by identifier | `Authorization: Basic <base64(key:secret)>` | — | See below | Called internally by Neo API. ✓ VERIFIED (Capillary Docs) |

Request:
```json
{
  "externalId": "MEMBER-001234",
  "firstName": "Priya",
  "lastName": "Sharma",
  "mobile": "919876543210",
  "email": "priya.sharma@example.com"
}
```

Response:
```json
{
  "status": { "success": true, "code": 200 },
  "customer": {
    "id": 98765432,
    "externalId": "MEMBER-001234",
    "created": true
  }
}
```

```bash
curl --location 'https://apac2.api.capillarytech.com/x/neo/v2/users/profile' \
--header 'Authorization: Basic dXNlcjpwYXNz' \
--header 'Content-Type: application/json' \
--data '{"externalId":"MEMBER-001234","firstName":"Priya","mobile":"919876543210"}'
```

> **Response JSON block sourcing rule:**
> - For `Capillary Product` API rows: the response JSON block MUST mirror the field names and structure from the MCP schema fetched in Step 2 (`mcp__capillary_docs__get-response-schema`). You may use realistic sample values (IDs, codes, dates) but MUST NOT add, remove, or rename fields from the MCP schema. If no MCP schema was returned, write `[RESPONSE SCHEMA UNVERIFIED — copy from Capillary Docs before delivery]` in place of the JSON block — never invent a schema for a Product API.
> - For `Neo Custom` API rows: design the response contract freely — the architect defines the shape for team-built endpoints.

**E.1) MANDATORY FIELD COVERAGE CHECK** (mandatory for every use case that calls a Capillary Product API)

For each Capillary Product API called in this use case, list every field the Capillary Docs schema marks as required, its confirmed source in this integration, and its value/mapping. Every row must be populated — if the source for a mandatory field is unknown from the BRD or confirmed input, mark Value/Mapping as `[CLARIFY BEFORE IMPLEMENTATION — source unknown]`.

| API Endpoint | Mandatory Field (per Capillary Docs) | Source in This Integration | Value / Mapping |
|---|---|---|---|
| POST /v2/customers | mobile | user_input.mobile | E.164 format from app state |
| POST /v2/customers | source | CMS config key SOURCE_CONFIG | resolved at runtime from CmsConfig block |
| POST /v2/customers | externalId | memberId from BRD field | must be non-null 9-digit string |
| POST /v2/transactions/bulk | billNumber | POS transaction ID | [CLARIFY BEFORE IMPLEMENTATION — format unknown] |

> **Rule:** Mandatory fields are those with `required: true` in the Capillary Docs MCP response body schema. If a field does not appear in the MCP schema (endpoint was SCHEMA BLOCKED), write `[SCHEMA BLOCKED — mandatory fields unknown]` as a single row for that endpoint.

**F) DATA MAPPING TABLE** (mandatory when data is transformed between systems)

| Source Field | Data Type | Capillary Field | Required | Field Type | Remarks |
|-------------|-----------|-----------------|----------|------------|---------|
| memberId | String | externalId | Yes | Identifier | Maps to Capillary External ID |
| firstName | String | firstName | Yes | Regular | |
| mobile | String | mobile | Yes* | Identifier | Required if email not provided |

Field Types: Regular, Extended, Custom, Identifier
Use "Yes*" with footnote for conditionally required fields.

**G) DATA FLOW DIAGRAM** (for Connect+ imports or complex multi-system flows)

Write a Mermaid `flowchart LR` following the data flow diagram template in `diagram-rules.md`. Show data transformations as intermediate nodes, error paths as separate branches, and label all arrows with file formats and protocols.

**H) ER DIAGRAM** (when designing a new data model or Couchbase schema)

**I) JSON SCHEMA** (for behavioral events, Couchbase document schemas)
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "CTA_CLICKED",
  "type": "object",
  "properties": {
    "customerId": { "type": "string" },
    "eventType": { "type": "string", "enum": ["CTA_CLICKED"] },
    "offerId": { "type": "string" },
    "clickedAt": { "type": "string", "format": "date-time" }
  },
  "required": ["customerId", "eventType", "offerId", "clickedAt"]
}
```

**J) BATCH JOB SPECIFICATION** (mandatory for every Connect+ Tier 4 file-import flow)

| Element | Value |
|---------|-------|
| File Type | CSV |
| Input Path | `{{INPUT_ROOT}}/{partner_code}_earn_YYYY_MM_DD_HH_MM_SS.csv` |
| Success Output Path | `{{INPUT_ROOT}}/result/{partner_code}_earn_YYYY_MM_DD_HH_MM_SS.csv` |
| Error Output Path | `{{INPUT_ROOT}}/error/{partner_code}_earn_YYYY_MM_DD_HH_MM_SS.csv` |
| Archive Path | `{{INPUT_ROOT}}/archive/{partner_code}_earn_YYYY_MM_DD_HH_MM_SS.csv` |
| Trigger | Scheduled — {cron expression or "on file arrival"} |
| SLA | File must be processed within {N} hours of arrival |

`{{INPUT_ROOT}}` is resolved in Integration and Configuration Data → File Path Configuration. Use realistic path values; do not leave as template.

**K) CSV COLUMN SPECIFICATION** (mandatory for every Tier 4 flow that ingests a CSV file)

| Col # | Field Name | Type | Mandatory | Format / Constraints | Capillary Target | Example |
|-------|------------|------|-----------|----------------------|-----------------|---------|
| 1 | FFN | String(9) | Yes | 9-digit numeric; no future dates | customer.externalId | 000638211 |
| 2 | APPLICATION_DATE | Date | Yes | DD/MM/YYYY | transaction.date | 15/01/2025 |
| 3 | TRANSACTION_AMT | Decimal | Yes | > 0; 2 decimal places | transaction.amount | 250.50 |
| 4 | PARTNER_CODE | String(10) | Yes | Registered partner code from CMS | event.partnerCode | IBC_KOTAK |

Include all columns, even pass-through columns. Columns not mapped to Capillary fields must still be listed with "N/A — audit only" in Capillary Target.

**L) FILENAME VALIDATION** (mandatory for every Tier 4 file-processing flow)

| Rule | Pattern / Constraint | Case Sensitive | Action on Mismatch |
|------|---------------------|----------------|-------------------|
| Filename format | `{partner_code}_earn_YYYY_MM_DD_HH_MM_SS.csv` | Yes | Skip entire file; write to error path; alert [contact per §8.2.1] |
| Date validity | Date portion must be a valid calendar date | — | Reject entire file; alert |
| Partner code prefix | Must start with a registered partner code | Yes | Skip entire file; alert |
| Extension | Must end with `.csv` (lowercase) | Yes | Skip file; alert |

Link alert contact explicitly to §8.2.1 recipient row — do not leave it unspecified.

---

## 10. Architectural Decision Records

| ADR-ID | Title | Description | Rationale | Alternatives Considered | Implications |
|--------|-------|-------------|-----------|------------------------|--------------|
| ADR-01 | | | | | |

Rules:
- IDs sequential: ADR-01, ADR-02, ADR-03, ...
- Minimum 3 ADRs for a Full SDD
- Every Tier 3/4/5 selection that is not immediately obvious → ADR
- Every deliberate decision NOT to use a standard capability → ADR
- If Design Gate T2 fired during Step 4c, the SA's confirmed alternatives MUST appear in the Alternatives Considered column. Do not use "N/A" for any Tier 3+ ADR that went through a Design Gate.

---

## 11. Quality Requirements / Non-Functional Requirements

| Quality Attribute | Requirement |
|-------------------|-------------|
| Performance | Neo API and product API responses must complete within 500ms at p95 under normal load |
| Availability | Neo API layer and Capillary platform must maintain >99.5% uptime |
| Security | All transmission encrypted using TLS 1.2 or higher. OAuth 2.0 Bearer tokens. PII handled per applicable regulations (GDPR / PDPA / DPDPA) |
| Scalability | Horizontal scaling through Capillary's cloud-native infrastructure. Stateless API design. |
| Observability | Logging and monitoring by Capillary with correlation IDs. All API failures logged with payload for audit. |
| Compatibility | All APIs versioned (/v2/, /v1.1/, /x/neo/) for backward compatibility. Standard JSON/REST clients sufficient. |

Subsections for project-specific NFRs:
- **11.1 Formats and Protocols** — REST, JSON, ISO 8601, CSV for file imports
- **11.2 Scalability** — project-specific notes
- **11.3 Security and Audit** — project-specific compliance requirements
- **11.4 Performance and Availability** — project-specific SLAs
- **11.5 Compatibility and Configurability** — version/format constraints

---

## API Reference

> Written by Step 5c. See `api-reference-template.md` for the complete template, column definitions, and rules.
> Placement: After Section 11, before Integration and Configuration Data.

---

## Integration and Configuration Data (Final Section)

Include as the last section. Cover what is applicable. The following subsections are **mandatory** when the conditions apply — do not omit them or leave values as template variables.

### API Endpoint Registry (mandatory when ≥2 distinct base URLs or clusters are used)

| API Category | Base URL | Cluster(s) | Auth Mechanism |
|---|---|---|---|
| Capillary Product APIs | `https://apac2.api.capillarytech.com` | apac2 | Basic Auth (key:secret) or OAuth2 |
| Neo Custom APIs | `https://apac2.api.capillarytech.com/x/neo/v2/` | apac2 | Basic Auth |
| Connect+ Internal | Internal (no direct external URL) | apac2 | N/A |

**Environment Variables:**
- `CAPILLARY_API_HOST` = `https://{cluster}.api.capillarytech.com` (e.g., `https://apac2.api.capillarytech.com`)
- `CAPILLARY_CLUSTER` = `apac2` | `in` | `eu` | `us` | `apac`

> **Cross-reference note:** Every API spec table row in Section 9 uses `${CAPILLARY_API_HOST}` in the Cluster / Base URL column. This registry is the single source of truth that resolves `${CAPILLARY_API_HOST}` to the literal cluster URL. Developers looking up `${CAPILLARY_API_HOST}` in an API spec table should refer here.

### File Path Configuration (mandatory for every Tier 4 batch flow)

| Variable | Environment | Value |
|----------|-------------|-------|
| `INPUT_ROOT` | Production | `sftp://sftp.capillarytech.com/{brand}/incoming` |
| `INPUT_ROOT` | UAT | `sftp://uat-sftp.capillarytech.com/{brand}/incoming` |
| `ERROR_ROOT` | Production | `sftp://sftp.capillarytech.com/{brand}/error` |
| `ARCHIVE_ROOT` | Production | `sftp://sftp.capillarytech.com/{brand}/archive` |

Confirm actual SFTP/S3 paths with the infrastructure team before finalising. Do not leave as template.

### Alert Contact Registry (mandatory when §8.2.1 failure notification table exists)

| Variable | Role | Value |
|----------|------|-------|
| `ONCALL_EMAIL` | Capillary Ops on-call | ops-oncall@capillarytech.com |
| `DATA_OPS_EMAIL` | Client data operations contact | [CONFIRM WITH CLIENT] |
| `CONFIG_EMAIL` | Capillary configuration team | config-alerts@capillarytech.com |

### Neo Service Configuration (mandatory for every Tier 3 Neo API)

| Neo Service Name | Endpoint | Responsible Team | Deployment | CMS Keys Required | Environment Variables |
|---|---|---|---|---|---|
| {workflowName} | POST /x/neo/v2/{brand}/{operation} | Capillary Neo Team | Capillary-hosted ({cluster}) | {list CMS keys} | CAPILLARY_API_HOST, CAPILLARY_CLUSTER |

### Other Configuration (as applicable)
- UI/UX design references (Figma links, design system references)
- Web/app development notes (SDK versions, App Core configurations)
- Capillary platform configuration checklist (org setup, program config, campaign config)
- Communication gateway configuration (Engage+ journey IDs, SMS/email gateway endpoints)

### Citation Index (Appendix — final page of SDD)

> See `citation-guide.md` for the full Citation Index format, column definitions, coverage rules, and example.
> Placement: Final appendix after Integration and Configuration Data. Not numbered — it is an appendix after all numbered sections.

---

## LITE SDD Format

Use when: existing Full SDD covers base + change is additive/corrective + ≤2-3 new flows + no new integrations.

Mandatory sections only:
1. **Revision History** (same format as Full SDD)
2. **Problem Statement** — exact gap or issue this CR addresses
3. **Architectural Context** — which tier(s) affected, how this fits existing architecture
4. **Impact Analysis** — existing APIs/flows/configs impacted; regression risk
5. **Solution Detail** — new/modified endpoints, config changes, data mapping deltas (same format as Section 9 elements above)
6. **ADR** (at least one if a non-obvious choice was made)
7. **Reference to parent Full SDD** — explicit link or document name

A Lite SDD does NOT need: full NFR section, full systems table, or architecture diagram (unless architecture changes).
