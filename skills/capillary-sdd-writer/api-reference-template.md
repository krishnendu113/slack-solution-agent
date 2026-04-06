# API Reference Section Template

This template defines the structure for the `## API Reference` section written by Step 5c of the SDD skill. The section consolidates all APIs from Section 9 element E tables into three sub-tables for developer quick-reference.

**Placement in SDD:** After Section 11 (Quality Requirements / NFRs), before Integration and Configuration Data.

**Written by:** Step 5c (consolidation step — no new APIs are introduced here).

---

## Rules for Step 5c

1. **Consolidation only.** Pull every API row from every Section 9 element E table. Do not introduce APIs not already documented in Section 9.
2. **Mandatory Body Fields column:** List only fields with `required: true` per the Capillary Docs MCP schema (from the API Schema Fetch Log). For SCHEMA BLOCKED endpoints, write `[SCHEMA BLOCKED]`.
3. **Source column for Capillary Product APIs:** Match the provenance tag from the corresponding Section 9 element E Key Notes column:
   - `✓ VERIFIED (Capillary Docs)` — confirmed via MCP
   - `✓ VALIDATED (live)` — confirmed live via validate_api.py
   - `⛔ SCHEMA BLOCKED` — fetch failed in Step 0.4
   - `⚠ UNVERIFIED` — not found in Capillary Docs
4. **External Base URL:** Must be a confirmed value from Step 1e CRITICAL data registry or verbatim from the BRD. Write `[CONFIRM WITH CLIENT]` if not confirmed — never invent.
5. **Neo Custom APIs** do not have a Source column — they are team-built and not verified via Capillary Docs.

---

## API Reference

> **Developer quick-reference.** All APIs used in this integration consolidated from Section 9 element E tables. For full request/response JSON schemas, see the corresponding Section 9 use case.

### Capillary Product APIs

| API Name | Method | Path | Version | Auth Header | Key Query Params | Mandatory Body Fields | Section 9 Ref | Source |
|---|---|---|---|---|---|---|---|---|
| Customer Lookup | GET | /v2/customers/lookup/customerDetails | v2 | Authorization: Basic | identifierName, identifierValue, source | — | §9.1 | ✓ VERIFIED (Capillary Docs) |
| Create Customer | POST | /v2/customers | v2 | Authorization: Basic; Content-Type: application/json | — | mobile, source, externalId | §9.1 | ✓ VERIFIED (Capillary Docs) |
| Bulk Transaction | POST | /v2/transactions/bulk | v2 | Authorization: Basic; Content-Type: application/json | — | billNumber, billAmount, type, source | §9.2 | ✓ VERIFIED (Capillary Docs) |

> **Column definitions:**
> - **API Name:** Short human-readable name for the operation
> - **Method:** HTTP verb (GET / POST / PUT / DELETE / PATCH)
> - **Path:** Endpoint path starting with `/` — matches the End Point column in Section 9 element E
> - **Version:** API version (v2 / v1.1 / v3 / gateway path)
> - **Auth Header:** Authentication header(s) required — e.g. `Authorization: Basic`, `Authorization: Bearer`, `X-CAP-API-OAUTH-TOKEN`
> - **Key Query Params:** Required or significant query parameters (for GET requests)
> - **Mandatory Body Fields:** Fields with `required: true` per Capillary Docs MCP schema; write `—` for GET requests; `[SCHEMA BLOCKED]` if fetch failed
> - **Section 9 Ref:** The section number where this API is fully documented (e.g. `§9.1`, `§9.3`)
> - **Source:** Provenance tag matching Section 9 element E Key Notes

---

### Neo Custom APIs (Team-Built)

| API Name | Method | Path | Auth Header | Request Content-Type | Section 9 Ref |
|---|---|---|---|---|---|
| Customer Link | POST | /x/neo/v2/{brand}/customerLink | Authorization: Basic | application/json | §9.1 |
| Transaction Process | POST | /x/neo/v2/{brand}/processTransaction | Authorization: Basic | application/json | §9.2 |

> **Note:** Neo Custom APIs are designed by the solution architect for this integration. They are not verified via Capillary Docs — their full request/response contracts are in Section 9 element E.

---

### External / Third-Party APIs

| API Name | Provider | Method | Base URL | Auth Mechanism | Section 9 Ref |
|---|---|---|---|---|---|
| [API name] | [Provider name] | [Method] | [confirmed base URL or [CONFIRM WITH CLIENT]] | [Auth type] | §9.X |

_Write "Not applicable — no third-party APIs in this integration." if none exist._

> **Base URL rule:** Must be a confirmed value from Step 1e CRITICAL data registry or verbatim from the BRD. Never construct or guess a base URL.
