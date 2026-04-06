# Citation & Traceability Guide

> Every factual claim in the SDD must be traceable to its source. This guide defines the citation system used across all SDD sections.

---

## Citation Types

| Type Code | Source | Reference Format | Example |
|-----------|--------|-----------------|---------|
| BRD | BRD document | `BRD §{section}` or `BRD para {n}` or `BRD page {n}` | `[CIT-001] BRD §3.2` |
| JIRA | JIRA story/epic | `{JIRA-ID}` | `[CIT-002] CAP-4521` |
| CONF | Confluence page | `confluence:{page-id} "{page title}"` | `[CIT-003] confluence:12345 "Humsafar Neo Flows"` |
| CDOCS | Capillary Docs MCP | `capillary-docs:{method} {endpoint-path}` | `[CIT-004] capillary-docs:GET /v2/customers/lookup` |
| PDOCS | Public docs crawl | `docs.capillarytech.com/{path}` | `[CIT-005] docs.capillarytech.com/reference/customers` |
| SA | SA answer | `sa-answers.md Q{n}` | `[CIT-006] sa-answers.md Q3` |
| FEEDBACK | Feedback log | `feedback-log.md F-{nnn}` | `[CIT-007] feedback-log.md F-001` |
| INFERRED | Logical inference | `INFERRED from {citation-ids}` | `[CIT-008] INFERRED from CIT-001, CIT-004` |
| ADDL-DOC | Additional document | `{document-name} §{section}` | `[CIT-009] ReArchConceptDoc §2.1` |

---

## Citation ID Format

- Sequential within a session: `CIT-001`, `CIT-002`, ..., `CIT-NNN`
- Assigned at the moment a fact is first extracted from any source
- Once assigned, a CIT ID is immutable — never reused or reassigned
- Stored in the Citation Registry (progress tracker file)

---

## Where Citations Appear

### In Process Flow Steps (Layer 2)

Citations appear after specific factual claims within each step:

```
Step 3: Neo API calls POST /v2/customers to register a new customer [CIT-012]
  Request fields:
    - mobile: from Step 1 response → identifiers[0].value [CIT-004]
    - source: "MOBILE_APP" (confirmed by SA) [CIT-SA-Q4]
    - externalId: from BRD customer ID mapping [CIT-001]
  Response fields extracted:
    - id → stored as capillaryCustomerId for Step 4 [CIT-004]
  Error 409: duplicate customer — extract existing ID [CIT-004]
```

### In API Specification Tables (Element E)

The Key Notes column carries the provenance tag (existing) AND the citation:

```
| Key Notes |
|-----------|
| ✓ VERIFIED (Capillary Docs) [CIT-004] |
```

### In JSON Schema Blocks

Field-level citations as comments:

```json
{
  "mobile": "+919876543210",     // [CIT-004] required field per MCP schema
  "source": "MOBILE_APP",        // [CIT-SA-Q4] confirmed by SA
  "externalId": "MEMBER-001234"  // [CIT-001] mapped from BRD §3.2 member ID
}
```

### In Data Mapping Tables (Element F)

Add a Source column containing citation IDs:

| Source Field | Data Type | Capillary Field | Required | Source |
|-------------|-----------|-----------------|----------|--------|
| member_id | String | externalId | Yes | [CIT-001] |

### In Configuration Tables

Every value that is not a `[CONFIRM WITH]` placeholder must have a citation:

| Config Key | Value | Source |
|-----------|-------|--------|
| Org ID | 2311 | [CIT-SA-Q1] |
| Cluster | apac2 | [CIT-SA-Q2] |
| Program ID | [CONFIRM WITH CLIENT] | — |

### In Tier Rationale (Element B)

```
**Solution Tier:** Tier 3 — Neo (Low-Code)
**Rationale:** Customer lookup-or-create is a synchronous, stateless operation
  with no batch requirements [CIT-001]. Neo handles this pattern natively [CIT-PDOCS-005].
```

---

## Citation Index (SDD Appendix)

Placed as the final appendix after Integration and Configuration Data:

```markdown
## Citation Index

| CIT ID | Source Type | Reference | Fact Summary | Used In |
|--------|-----------|-----------|-------------|---------|
| CIT-001 | BRD | BRD §3.2 | Customer barcode scan triggers loyalty lookup | §9.1 (A), §9.1 (C) |
| CIT-002 | JIRA | CAP-4521 | Batch deactivation required for expired barcodes | §9.4 (A) |
| CIT-003 | CONF | confluence:12345 | Existing Neo flow: customerLink endpoint | §9.1 (B) |
| CIT-004 | CDOCS | GET /v2/customers/lookup schema | Fields: identifierName, identifierValue, source | §9.1 (E), §9.2 (E) |
| CIT-005 | PDOCS | docs.capillarytech.com/v2/customers | source param maps to loyalty program source | §9.1 (C) step 4 |
| CIT-006 | SA | sa-answers.md Q3 | Org ID: 100458 | §8, Config |
```

---

## Citation Coverage Rules

### Must Cite (mandatory — RED if missing)
- Every Capillary Product API endpoint path, field name, and constraint
- Every business rule that drives a process flow decision
- Every tier assignment rationale
- Every infrastructure value (Org ID, cluster, collection name, etc.)
- Every error code and its meaning

### Should Cite (recommended — AMBER if missing)
- Pattern choices (why lookup-or-create, why Neo wrapper)
- Non-obvious field mappings in data mapping tables
- ADR alternatives and rejection reasoning

### No Citation Needed
- Standard formatting and document structure
- Common technical knowledge (HTTP status code meanings, JSON syntax)
- Template patterns defined in skill reference files (section-template.md, diagram-rules.md)
- Illustrative sample values inside JSON example blocks (but field NAMES still need citations)

---

## Building the Citation Registry

### During Step 1 (Parse Input)
- Every fact extracted from BRD → assign CIT ID with type `BRD`
- Every fact from JIRA epic/stories → assign CIT ID with type `JIRA`

### During Step 2 (Research)
- Every API schema fetched from MCP → assign CIT ID with type `CDOCS`
- Every Confluence finding → assign CIT ID with type `CONF`

### During Step 2b (Public Docs Crawl)
- Every fact extracted from public docs pages → assign CIT ID with type `PDOCS`

### During Steps 1c/1d/1e/4c/5a (SA Questions)
- Every SA answer → assign CIT ID with type `SA`

### During Step 5 (Write SDD)
- Inferred facts (logical deductions from other citations) → assign CIT ID with type `INFERRED`, referencing the source citations

---

## Self-Verification (Step 6)

Citation coverage audit:
1. Scan every §9 process flow step — count steps with vs without citations
2. Scan every API spec table row — verify Key Notes has citation
3. Scan every data mapping table — verify Source column has citations
4. Scan every configuration value — verify citation or `[CONFIRM]` placeholder
5. Calculate coverage percentage: `cited_facts / total_facts * 100`
6. Target: ≥80% coverage for GREEN rating in D11 (Citation Traceability)
