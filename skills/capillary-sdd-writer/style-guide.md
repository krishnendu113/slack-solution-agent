# SDD Style Guide

Apply these rules to every SDD. They encode the formatting and structural conventions established across Capillary SDD standards so that output is consistent and publication-ready.

---

## 1. Document Depth Calibration

Match depth to section purpose — not too thin, not over-engineered:

| Section | Expected Depth |
|---------|----------------|
| 1 — Introduction | 2–4 sentences on who the client is and what they are implementing. Not a business essay. |
| 2 — Constraints | Bullet list only. Every out-of-scope item tagged `[OUT OF SCOPE]`. Every assumption tagged `[ASSUMPTION - TO BE CONFIRMED]`. |
| 4 — Systems Involved | One row per system. Include EVERY system in any data flow — including SMS gateways, CDNs, identity providers. |
| 6 — Architecture Diagram | Every system from Section 4 must appear. Every arrow labeled. No unlabeled nodes. |
| 9 — Solution Detail (per use case) | All 4 mandatory elements: Tier + Rationale, Process Flow, Sequence Diagram, API Spec. No exceptions for API-driven use cases. |
| 9 — JSON samples | Minimum 5–8 realistic fields per request and response. Never skeleton stubs with 1–2 fields. |
| 10 — ADRs | Minimum 3 for a Full SDD. Each ADR must explain WHY, not just WHAT. "Alternatives Considered" must be populated. |
| 11 — NFRs | All 6 attributes required: Performance, Availability, Security, Scalability, Observability, Compatibility. |
| SDD Confidence Report | Required for every SDD (Full and Lite). Populated by Step 6b after the 25-item checklist. Score must be ≥70 before Step 7 executes. Appears between Section 11 and "Integration and Configuration Data". |

---

## 2. Tone and Register

**Declarative, system-named, active voice:**

- Every process flow step names the acting system first:
  - `1. The mobile app sends POST /enroll to the API Gateway with User Token.`
  - `2. The API Gateway exchanges the User Token for a B2B Token.`
  - `3. Neo API calls GET /v2/customers/lookup/customerDetails.`
- Never passive voice in process flows: "the request is forwarded" → "Neo API forwards the request"
- API error cases stated explicitly: "If the customer is not found (404), Neo API calls POST /v2/customers" — never "errors are handled appropriately"
- Constraint bullet points are blunt and specific: "POS offline sync is OUT OF SCOPE for Phase 1" — never vague

---

## 3. Formatting Rules

| Rule | Detail |
|------|--------|
| Revision history | ALWAYS precedes Section 1. Never a numbered section. Columns: Version \| Date \| Author \| Comments |
| Section numbering | Decimal and sequential: 1, 1.1, 1.2, 2, 3, 3.1, 3.1.1 — never skip numbers |
| JSON samples | Realistic data always. Real-looking names, IDs, dates — never `"string"`, `"value"`, `"example"`, or `null` placeholders |
| Required column | `Yes*` with footnote for conditionally required fields. Never just "Yes" or "Optional" for ambiguous cases |
| Final section | "Integration and Configuration Data" is ALWAYS the last section — no exceptions |
| Key Notes column | Always populated for every API endpoint row — at minimum state the validation status |
| Approval table | Present after Revision History. Columns: Approved By \| Role \| Date. May have empty rows. |

---

## 4. Table Column Headers (exact)

Use these exact headers — do not paraphrase:

**API Specification table (updated — includes category and cluster):**
`Method | End Point | API Category | Cluster / Base URL | Description | Headers | Request | Response | Key Notes`

API Category values: `Capillary Product` | `Neo Custom` | `Third Party`
Cluster / Base URL: use literal cluster alias + full URL, e.g., `apac2 / https://apac2.api.capillarytech.com`

**Data Mapping table:**
`Source Field | Data Type | Capillary Field | Required | Field Type | Remarks`

Field Types vocabulary: `Regular`, `Extended`, `Custom`, `Identifier`

**CSV Column Specification table:**
`Col # | Field Name | Type | Mandatory | Format / Constraints | Capillary Target | Example`

**Filename Validation table:**
`Rule | Pattern / Constraint | Case Sensitive | Action on Mismatch`

**Batch Job Specification table:**
`Element | Value`
Elements: File Type, Input Path, Success Output Path, Error Output Path, Archive Path, Trigger, SLA

**ADR table:**
`ADR-ID | Title | Description | Rationale | Alternatives Considered | Implications`

ADR IDs: sequential — ADR-01, ADR-02, ADR-03

**Systems Involved table:**
`System Name | Ownership | Core Business Functions`

Ownership values: `Client`, `Capillary`, `Third Party`

**Workflow Index table:**
`Workflow / Feature | BRD Ref | Tier | Section 9 Ref | Primary Capillary Product APIs | Primary Neo Custom APIs`

BRD Ref values: JIRA story IDs (`CAP-123`), BRD section refs (`BRD §3.1`), or local IDs (`REQ-01`). Multiple IDs comma-separated. Use `INFERRED` if no source ID exists.

**Failure Notification table:**
`Failure Scenario | Alert Type | Recipient(s) | Channel | Trigger Condition | Escalation`

---

## 5. Sequence Diagram Conventions

- `autonumber` on EVERY sequence diagram — no exceptions
- API Gateway as explicit `participant` in every flow where the caller is a mobile app or web UI
- `alt` / `opt` blocks for every conditional path — found/not-found, success/failure, online/offline
- Participant aliases: short and consistent — `App`, `GW`, `Neo`, `Cap`, `DB`, `SFTP`, `CDP`
- Response arrows use `-->>` (dashed); request arrows use `->>`
- Always show the final response returning to the originating caller

---

## 6. Realistic Sample Data Standards

Use regionally appropriate, realistic-looking values. Pick the region that matches the client's geography:

| Field Type | India example | Malaysia example | Europe example |
|------------|--------------|-----------------|----------------|
| Customer ID | `MEMBER-001234` | `MBR-KL-9087` | `USR-DE-4412` |
| Mobile | `919876543210` | `601134567890` | `4915223456789` |
| Email | `priya.sharma@example.com` | `ahmad.fadzil@example.my` | `k.weber@example.de` |
| Name | `Priya Sharma` | `Ahmad Fadzil bin Harun` | `Klaus Weber` |
| Date | `2026-02-25T14:30:00+05:30` | `2026-02-25T14:30:00+08:00` | `2026-02-25T14:30:00+01:00` |
| Amount | `250.00`, `currency: "INR"` | `45.90`, `currency: "MYR"` | `19.99`, `currency: "EUR"` |
| Points | `points: 500`, `earnedPoints: 125` | `points: 200` | `points: 750` |
| Store/Till | `tillCode: "TILL-MUM-001"` | `tillCode: "TILL-KL-03"` | `tillCode: "TILL-BER-07"` |

---

## 7. API Endpoint URL Conventions

**Capillary Product API base URL pattern:**
`https://{cluster}.api.capillarytech.com`

Examples:
- `https://apac2.api.capillarytech.com/v2/customers/lookup/customerDetails`
- `https://in.api.capillarytech.com/v2/points/redeem`

**Neo Custom API path prefix:** `/x/neo/v2/` — always on the same cluster host:
- `https://apac2.api.capillarytech.com/x/neo/v2/customers/link`

**Cluster aliases:** `apac2` (Southeast Asia / India), `in` (India dedicated), `eu` (Europe), `us` (North America), `apac` (APAC legacy)

**Environment variable pattern:** Use `{{CLUSTER}}` as the placeholder in templates; resolve to the actual alias in the final SDD. Example:
- Template: `https://{{CLUSTER}}.api.capillarytech.com/v2/events`
- Final SDD: `https://apac2.api.capillarytech.com/v2/events`

---

## 8. File Path and Timestamp Conventions (Tier 4 Connect+ flows)

**File path template syntax:** `{{VARIABLE_NAME}}` for environment-resolved root paths. `YYYY_MM_DD_HH_MM_SS` for timestamp tokens.

**Standard pattern:**
```
{{INPUT_ROOT}}/{partner_code}_{operation}_YYYY_MM_DD_HH_MM_SS.csv
{{INPUT_ROOT}}/result/{partner_code}_{operation}_YYYY_MM_DD_HH_MM_SS.csv
{{INPUT_ROOT}}/error/{partner_code}_{operation}_YYYY_MM_DD_HH_MM_SS.csv
{{INPUT_ROOT}}/archive/{partner_code}_{operation}_YYYY_MM_DD_HH_MM_SS.csv
```

Resolve `{{INPUT_ROOT}}` in the Integration and Configuration Data table **only if the actual path was explicitly confirmed by the client or architect** (via Step 1d/1e answers or verbatim BRD source). If the path was not confirmed: write `[CONFIRM WITH CLIENT]` in the Value column — never invent a plausible-looking path.

Example (resolved — only when client has confirmed the storage details):
```
sftp://sftp.capillarytech.com/indigo/incoming/IBC_KOTAK_earn_2026_02_15_06_00_00.csv
sftp://sftp.capillarytech.com/indigo/result/IBC_KOTAK_earn_2026_02_15_06_00_00.csv
sftp://sftp.capillarytech.com/indigo/error/IBC_KOTAK_earn_2026_02_15_06_00_00.csv
```

Example (unconfirmed — correct placeholder usage):
```
| SFTP_INPUT_ROOT | Production | [CONFIRM WITH CLIENT] |
```

---

## 9. Integration and Configuration Data (Final Section)

Always the last section. Cover every applicable subsection:

- **API Endpoint Registry** — mandatory when ≥2 distinct base URLs or clusters are used (table: API Category | Base URL | Cluster(s) | Auth Mechanism)
- **File Path Configuration** — mandatory for every Tier 4 batch flow (table: Variable | Environment | Value)
- **Alert Contact Registry** — mandatory when §8.2.1 failure notification table exists (table: Variable | Role | Value)
- **Neo Service Configuration** — mandatory for every Tier 3 Neo custom API (table: Service Name | Endpoint | Responsible Team | Deployment | CMS Keys | Env Vars)
- **UI/UX design references** — Figma links, design system references, brand colour tokens
- **Web/app development notes** — SDK versions (React Native, Flutter), minimum OS targets, App Core config keys
- **Capillary platform configuration checklist** — org ID, program ID, source config, till mapping, event config
- **Custom service layer** — Neo API environment variables table (variable name, description, example value), Connect+ flow names and trigger schedules
- **Communication gateway** — Engage+ journey IDs, SMS/email gateway endpoint, sender ID, template IDs

---

## 10. Critical Data Rule

**Never invent infrastructure-specific values.** The "Realistic Sample Data Standards" in §6 apply ONLY to JSON request/response example blocks in Section 9. They do NOT apply to configuration tables, file path tables, alert tables, Neo Service Configuration, CapCloud/Connect+ job config, or any table in §8.

For all non-JSON-example tables, every cell must be one of:
1. A value **explicitly confirmed** by the user (Step 1e) or found **verbatim** in BRD/Confluence
2. `[CONFIRM WITH CLIENT]` or `[CONFIRM WITH CAPILLARY TEAM]`
3. `{{VARIABLE_NAME}}` — template token only; resolved Value must still be `[CONFIRM WITH CLIENT]` if not provided

**CRITICAL data categories (never invent):** Storage (blob/S3/SFTP names), Identity (Org IDs, Program IDs, Till codes, Source config), Auth (keys, secrets, tokens), Compute (Kafka topics, MongoDB collections), Contact (emails, Slack channels, PagerDuty keys), URLs (third-party endpoints, client APIs), Config (Journey IDs, CMS keys, env vars), Networking (VPC IDs, subnets, DNS).

A value that "sounds right" or is "derived from the brand name" is still invented — use `[CONFIRM WITH CLIENT]`. Sample data inside JSON example blocks is the only exception.
