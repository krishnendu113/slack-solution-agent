# SDD Output Checklist

Self-verify every item before delivering the SDD. Do not mark complete if any item fails.

---

## STRUCTURE

- [ ] Output file written to `output-sdd/` folder (not the repository root)
- [ ] Revision History table at document top (before Section 1) — columns: Version | Date | Author | Comments
- [ ] Approved By table present — columns: Approved By | Role | Date
- [ ] All 11 numbered sections present, or marked "Not Applicable — [reason]"
- [ ] Section numbers are decimal and sequential: 1, 1.1, 1.2, 2, 3, 3.1, 3.1.1
- [ ] "Integration and Configuration Data" section is the final content section

---

## CONTENT

- [ ] Every functional requirement from the BRD/JIRA is addressed in Section 9
- [ ] Every system in Section 4 appears in the Section 6 architecture diagram
- [ ] Every use case in Section 9 has: Tier selection + Rationale, Process Flow, Sequence Diagram, API Spec (where applicable)
- [ ] All data mapping tables include: Source Field | Data Type | Capillary Field | Required | Field Type | Remarks
- [ ] At least 3 ADRs in Section 10 (minimum for Full SDD)
- [ ] NFR table in Section 11 covers all 6 attributes: Performance, Availability, Security, Scalability, Observability, Compatibility
- [ ] All Out of Scope items listed in Section 2 with [OUT OF SCOPE] tag
- [ ] All assumptions tagged [ASSUMPTION - TO BE CONFIRMED] in Section 2

---

## DIAGRAMS

- [ ] Architecture diagram declares all 6 color classes: capillary, extension, customaws, client, external, gateway
- [ ] Architecture diagram uses the four mandatory network boundary subgraphs (Client Infrastructure / Capillary Products / Capillary Extension Framework / Capillary Custom AWS Infrastructure) — omit only if a zone has zero nodes
- [ ] Every sequence diagram uses `autonumber`
- [ ] Sequence diagrams show API Gateway as explicit participant for all UI-originated flows
- [ ] All diagrams are Mermaid.js code blocks (no image references, no prose-only descriptions)
- [ ] Every arrow in architecture diagram has a label
- [ ] Excalidraw diagrams (when available): Architecture overview (§6) and data flow diagrams use Excalidraw with PNG + .excalidraw files in `output-sdd/{BrandName}-diagrams/`. Mermaid fallback code block present below each Excalidraw image.
- [ ] Architecture diagram labels match systems from §4 (cited). Sequence diagram step count matches Layer 2 process flow step count.

---

## APIs

- [ ] Every custom Neo API has: endpoint table, request JSON, response JSON, curl example
- [ ] Every standard Capillary API uses the **latest available version** (checked via mcp__capillary_docs__*); /v2/ or /v1.1/ only used if a newer version is unavailable or incompatible — reason noted in Key Notes
- [ ] Every standard Capillary Product API was looked up via `mcp__capillary_docs__*` — API Schema Fetch Log confirms fetch success, or SCHEMA BLOCKED placeholder used — no hallucinated endpoints
- [ ] Every API Key Notes column has a provenance tag: `✓ VALIDATED`, `✓ VERIFIED (Capillary Docs)`, `⚠ UNVERIFIED`, or `⛔ SCHEMA BLOCKED`
- [ ] If credentials were not set, user was explicitly asked to provide them (not silently skipped)
- [ ] Authentication headers documented for every API endpoint
- [ ] JSON samples use realistic data values (real-looking names, IDs, dates — not "string" or "value")
- [ ] Required column uses "Yes*" with footnote for conditionally required fields
- [ ] Element E.1 (Mandatory Field Coverage Check) present for every Section 9 use case that calls a Capillary Product API
- [ ] No blank Source column in element E.1 — every mandatory field has a confirmed source or `[CLARIFY BEFORE IMPLEMENTATION — source unknown]`
- [ ] Every Capillary Product API field name in request/response JSON blocks was returned by `mcp__capillary_docs__*` during this session — zero field names sourced from built-in knowledge
- [ ] For every Capillary Product API JSON block, field names match the Schema Hash fingerprint in the API Schema Fetch Log — any drift flagged and corrected

---

## CAPILLARY PATTERNS

- [ ] Customer resolution strategy chosen per use case (v1.1 auto-create or explicit lookup-or-create)
- [ ] API Gateway token exchange shown in all sequence diagrams with UI callers
- [ ] Neo blockers verified: no loops, no form-data in any Neo flow
- [ ] Connect+ used for all file imports and async event processing
- [ ] Points reversal mechanism specified for any flow involving redemption
- [ ] No hardcoded org IDs, program IDs, or cluster URLs — environment variables used
- [ ] No anti-patterns present (client chaining multiple Capillary APIs, UI receiving raw errors, etc.)

---

## DESIGN GATES (Step 4c)

- [ ] Every tier escalation to Tier 4 or Tier 5 was either confirmed by the SA via Gate T1 or tagged `[ASSUMPTION - TO BE CONFIRMED]` in Section 2
- [ ] Every ADR's "Alternatives Considered" column is populated from SA input (Gate T2) or clearly reasoned from BRD/Confluence context — never left blank or "N/A" for Tier 3+ decisions

---

## PROCESS FLOW DEPTH

- [ ] Every §9 element C follows Layer 1 + Layer 2 format (per `section-template.md` element C)
- [ ] Every Layer 2 step has: actor + endpoint, request fields with source, response fields, error branch, inline citation
- [ ] Every §9 element A has a "Solves:" line
- [ ] Plain English rule applied — no language-specific syntax in Layer 2
- [ ] MongoDB auto-fields rule applied — createdAt/updatedAt never in request payloads
- [ ] No process flow step contains vague phrases like "the system processes the data", "appropriate action is taken", "relevant fields are sent" — every step is specific and actionable
- [ ] Every API-driven §9 use case documents at least 3 error scenarios (success, client error, server error). Multi-step flows document compensating actions.

---

## AI REVIEW (Step 6b)

- [ ] SDD Confidence Report is NOT embedded in the SDD body — it is available on-demand via `/sdd-review {filename}`
- [ ] Step 6a checklist passed before Step 7 wrote the output file
- [ ] Progress file updated: `output-plan/{BrandName}-progress-{YYYY-MM-DD}.md` exists with all completed steps marked DONE and registries serialized
- [ ] SA answers file populated: `input-brd/{BrandName}-sa-answers.md` contains all questions asked during the session with answers and timestamps
- [ ] Incremental output: If WIP file was used, it has been assembled into the final SDD and deleted

---

## BATCH FLOWS (Tier 4 Connect+)

- [ ] Every Tier 4 file-import use case in Section 9 has element **J) Batch Job Specification** with explicit input, output, error, and archive paths — no template variable placeholders left unresolved
- [ ] Every Tier 4 file-import use case has element **K) CSV Column Specification** with all columns defined: name, type, mandatory flag, format/constraints, Capillary target, and example value
- [ ] Every Tier 4 file-processing use case has element **L) Filename Validation** with mismatch action referencing a named §8.2.1 alert recipient — not left as "[contact]"

---

## API DOCUMENTATION

- [ ] Every API row in Section 9 API Specification tables has **API Category** (`Capillary Product` | `Neo Custom` | `Third Party`) populated — no blank cells
- [ ] Every API row has **Cluster / Base URL** populated — relative paths alone are not acceptable
- [ ] Integration and Configuration Data includes **API Endpoint Registry** subsection when ≥2 distinct base URLs or clusters are used
- [ ] No API endpoint is documented without cluster information — absence is a checklist failure
- [ ] `## API Reference` section is present after Section 11 and before Integration and Configuration Data
- [ ] Every row in the API Reference tables has Method, Path, Auth Header, and Section 9 Ref populated — no blank cells in these columns
- [ ] External / Third-Party API Base URL in the API Reference is a confirmed value (Step 1e registry or verbatim BRD) — never invented

---

## ALERTS AND FAILURE HANDLING

- [ ] Section **8.2.1 Failure Notification and Escalation** table is present with: failure scenario, alert type, recipient(s), channel, trigger condition, and escalation — for every integration with automated file processing or API orchestration
- [ ] Integration and Configuration Data includes **Alert Contact Registry** with actual email addresses or `[CONFIRM WITH CLIENT]` — template variable placeholders (`{{DATA_OPS_EMAIL}}` etc.) must NOT remain unresolved in the final SDD body

---

## WORKFLOW NAVIGATION

- [ ] Section 7 ends with a **Workflow Index** table for every SDD with ≥2 distinct flows — mapping each flow to: Tier, Section 9 reference, primary Capillary Product APIs, primary Neo Custom APIs
- [ ] Every row in the Workflow Index clearly labels whether the sink is a Capillary Product API or a Neo Custom API — never ambiguous

---

## CRITICAL DATA INTEGRITY

- [ ] No storage account names, Azure Blob container names, S3 bucket names, or SFTP hosts appear in the SDD unless explicitly confirmed by user input (Step 1e registry) or found verbatim in BRD/Confluence source
- [ ] No Kafka topic names appear unless confirmed by user in Step 1e
- [ ] No MongoDB collection names appear unless confirmed by user in Step 1e
- [ ] No email addresses appear in §8.2.1 or Alert Contact Registry unless confirmed by user — all unconfirmed entries read `[CONFIRM WITH CLIENT]` or `[CONFIRM WITH CAPILLARY TEAM]`
- [ ] No Engage+ Journey IDs appear unless confirmed by user
- [ ] No PagerDuty service keys, Slack channel names, or webhook secrets appear unless confirmed
- [ ] No third-party API base URLs appear unless confirmed by user or found in Capillary Docs
- [ ] Integration and Configuration Data tables contain zero invented CRITICAL values — every unconfirmed cell reads `[CONFIRM WITH CLIENT]` or `[CONFIRM WITH CAPILLARY TEAM]`
- [ ] File Path Configuration table: all resolved paths trace to Step 1e registry or verbatim BRD source; `{{VARIABLE}}` template tokens resolve to `[CONFIRM WITH CLIENT]` if not provided — never to a constructed path
- [ ] All Org IDs and Program IDs trace to a confirmed source: Step 1e answer, BRD text, or verbatim Confluence page
- [ ] Realistic-looking invented values (names, amounts, dates) appear ONLY inside JSON example blocks — not in any configuration table, alert table, or file path table

---

## REQUIREMENT TRACEABILITY

- [ ] Requirement Registry was built in Step 2 — every functional requirement has an ID (JIRA story / BRD §X.Y / REQ-NN)
- [ ] Every Section 9 use case header contains a `BRD Ref:` line — no use case is missing this field
- [ ] No `BRD Ref` line is blank — minimum acceptable value is `[INFERRED — no BRD/JIRA source]`
- [ ] Workflow Index (§7) includes a `BRD Ref` column populated for every row
- [ ] Every requirement in the Requirement Registry maps to at least one Section 9 use case
- [ ] No Section 9 use case exists without a corresponding entry in the Requirement Registry

---

## CITATION & TRACEABILITY

- [ ] Citation Registry built and populated per `citation-guide.md` during Steps 1-5
- [ ] Every §9 Layer 2 step has ≥1 `[CIT-xxx]`; API fields trace to CDOCS/PDOCS citation
- [ ] Citation Index appendix present; every inline `[CIT-xxx]` resolves to a row; no orphans
- [ ] No uncited Capillary Product API claims: endpoint paths, field names, constraints cite CDOCS or PDOCS — never built-in knowledge alone
