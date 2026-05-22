# Phase 03 — Jira Ticket Creation

**Input:** Approved BRD (Gate 2 cleared · Guardrail Scorecard exported · Clarification Register cleared)  
**Output:** Live Jira Board + `[ClientName]_Epics_Stories.xlsx` + `[ClientName]_Jira_Import.csv`  
**Output folder:** Confluence › Jira Backlog  
**Project Key:** PSV

> ⚠️ This phase is **LOCKED** until Gate 2 is cleared. Do not proceed without confirming the Gate 2 checklist in `phase02-discovery.md`. The approved BRD is the sole source of truth — do not use discovery notes as a substitute.

---

## Steps

1. Read the approved BRD as the single source of truth
2. Confirm Gate 2 checklist is fully cleared before proceeding
3. Call Jira API to discover project configuration dynamically:
   - `getAccessibleAtlassianResources` → get cloudId
   - `getVisibleJiraProjects` → confirm PSV project exists
   - `getJiraIssueTypeMetaWithFields` → required fields, components, priorities
4. Confirm with PM: Label, GeoRegion, Brand, Environment, Component values
5. Create Epics first (one per in-scope module), then Stories linked to each Epic
6. Every Story must trace back to a Functional Requirement ID in the BRD
7. All fields populated dynamically — **no hardcoded values**
8. PM reviews all tickets before export
9. Export CSV + XLSX to Confluence › Jira Backlog

---

## Ticket Structure

```
Epic (one per functional module in scope)
 └── Story
      ├── [FR-ID] Summary                  — < 100 characters; references BRD FR ID
      ├── User Story                        — "As a [role] / I want [feature] / so that [benefit]"
      ├── Acceptance Criteria               — numbered list, testable, Given/When/Then format
      ├── BRD Reference                     — BRD section + FR number (e.g. "BRD §13.2 — FR-004")
      ├── Story Points                      — Fibonacci: 1 / 2 / 3 / 5 / 8 / 13
      ├── Priority                          — from project config, not assumed
      ├── Label, Component, GeoRegion       — from PROJECT_FIELD_MAP confirmed with PM
      └── Assignee, Sprint, Fix Version     — confirm with PM before export
```

---

## Epic → Module Mapping

Create one Epic per in-scope module. Use these as the Epic summary format:

| Module | Epic Summary |
|--------|-------------|
| Loyalty+ | `[ClientName] — Loyalty Programme Configuration` |
| Engage+ | `[ClientName] — Omnichannel Campaign & Journey Setup` |
| Rewards+ | `[ClientName] — Rewards Catalog & Catalog Promotions` |
| CDP | `[ClientName] — Customer Segmentation & CDP Configuration` |
| POS Integration | `[ClientName] — POS API Integration` |
| Mobile SDK | `[ClientName] — Mobile App SDK Integration` |
| Neo | `[ClientName] — Neo Dataflow / Extension Development` |
| Vulcan | `[ClientName] — Vulcan Custom UI Development` |
| Connect+ | `[ClientName] — Connect+ Batch Data Ingestion` |
| Insights+ | `[ClientName] — Reporting & BI Integration` |
| Historical Data | `[ClientName] — Historical Data Migration` |
| UAT & Go-Live | `[ClientName] — UAT, QA & Go-Live` |

---

## Story Writing Rules

**User story format (mandatory):**
```
As a [loyalty member / store associate / campaign manager / admin / system],
I want [specific feature or capability],
so that [business outcome or user benefit].
```

**Acceptance criteria rules:**
- Each criterion is independently testable
- Written as: "Given [context] / When [action] / Then [expected result]"
- Minimum 3 criteria per story; complex stories may have 5–8
- At least one criterion must cover the failure/error path

**BRD traceability rule:**
- Every Story must include a BRD Reference field pointing to the source Functional Requirement
- If no matching FR exists in the BRD, flag the Story as 🔲 UNCHARTED and confirm with PM before creating
- Stories without a BRD reference are not permitted in the final export

**Story Points — sizing guide:**

| Points | Complexity |
|--------|-----------|
| 1 | Config change — no logic |
| 2 | Simple config with one rule |
| 3 | Standard feature — single module |
| 5 | Feature spanning two modules or with integration touch |
| 8 | Complex feature with multiple rules and edge cases |
| 13 | Epic-level complexity — consider splitting |

---

## Change Request Rule

If a Story cannot be traced to any FR in the approved BRD:
1. Flag it as a potential Change Request
2. Note the gap in a CR log
3. Do not create the Jira ticket until PM confirms whether it is in scope or a CR
4. If confirmed as CR: append to BRD as new version (increment major: V2.0) before creating the ticket

---

## Output Checklist

- [ ] All in-scope modules have a corresponding Epic
- [ ] All FRs from BRD mapped to at least one Story
- [ ] Every Story has a valid user story format
- [ ] Every Story has a BRD Reference field populated
- [ ] Every Story has ≥ 3 acceptance criteria (at least one covers failure path)
- [ ] Story Points assigned (Fibonacci only)
- [ ] Priority set from project config (not assumed)
- [ ] No UNCHARTED stories in final export — all confirmed with PM
- [ ] CSV export generated and saved to Confluence › Jira Backlog
- [ ] XLSX export generated and saved to Confluence › Jira Backlog
- [ ] PM confirms all tickets before marking Phase 03 complete
- [ ] Stakeholders notified of live Jira board
