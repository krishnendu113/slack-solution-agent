# RAID Pre-Fill Library & Real BRD Pattern Library

> **Source BRDs:** ASICS Vietnam (v1.03), Dompet Aman WebApp (v1.0), Dominos IDN (v1.3), ABFRL Tasva (v1.3), Pantaloons Revamp (v1.2), Pidilite Phase 3.1, Mr. DIY (v2)
> These are production-signed BRDs. Patterns here override any generic assumptions.
> **Master Rule:** NEVER apply a pattern from an industry label. Only apply when the specific requirement is explicitly confirmed by the client in the question protocol. Flag unmatched requirements as 🔲 UNCHARTED.

---

## Standard RAID Pre-Fill

Pre-populate these in every BRD (client to review and confirm):

### Risks

| # | Risk | Applicable To |
|---|------|---------------|
| R1 | If internet is not working, voucher validation/redemption will not work at POS | Retail, F&B — POS integration |
| R2 | CRM application cannot work offline for voucher redemption | All with POS |
| R3 | API downtime: POS records saved locally with tag "0"; sync scheduled nightly on API recovery | Retail, F&B |
| R4 | Tier names are TBC and may change before programme launch | All |
| R5 | Third-party API availability (payment gateway, delivery apps) not guaranteed by Capillary | Fintech, F&B |
| R6 | Points redemption OTP delivery depends on SMS gateway uptime | All with OTP redemption |

### Assumptions

| # | Assumption |
|---|-----------|
| A1 | Internet environment should be available for voucher validation at POS |
| A2 | POS vendor will consume Capillary APIs; client to share POS journey document |
| A3 | Third-party APIs (payment, delivery apps) will be available and stable |
| A4 | Client will provide UI/UX assets (logos, icons, fonts, imagery) where applicable |
| A5 | Client will confirm tier names and thresholds before programme launch |
| A6 | Loyalty structure described herein will be finalized after analysis of existing programme data |

### Dependencies

| # | Dependency | Owner |
|---|-----------|-------|
| D1 | BRD sign-off by client BPO before implementation commences | Client BPO |
| D2 | POS integration readiness — client POS vendor must share API integration journey | Client / POS vendor |
| D3 | Infrastructure setup (org creation, store hierarchy, till credentials) | Capillary PM |
| D4 | Gateway credentials (SMS/Email) to be shared by client before UAT | Client IT |
| D5 | Historical data quality report signed off before data import begins | Client + Capillary Data team |
| D6 | SDD (Solution Design Document) to be prepared after BRD approval | Capillary BA |

---

## Requirement-Matched Pattern Lookup

### HOW TO USE
1. After completing Question Sets A–F, extract the confirmed requirements
2. For each confirmed requirement, find the matching pattern below
3. Apply **only** the patterns whose trigger condition is met
4. For any requirement with no match → flag 🔲 UNCHARTED, ask 2–3 clarifying questions

---

### REQUIREMENT: POS Integration in scope
**Trigger:** Client confirms POS integration required (Set B, Q9)
**Source BRDs:** ASICS Vietnam · ABFRL Tasva · Pantaloons · Mr. DIY

Patterns to apply:
- Client's POS vendor must share "POS journey document" to Capillary before development begins. Capillary shares API documentation after BRD sign-off.
- APIs in Interface Requirements: Add Customer, Add Transaction, Get Customer, Redeem Points, Issue Coupon, OTP Generate, OTP Validate, Auth Token Generate
- Offline fallback MANDATORY in Disaster Recovery AND Integration Requirements: POS saves unsynced records with tag "0"; forced sync nightly on API recovery.
- Prod vs Demo environment: API endpoints and payload identical — only AUTH token differs. Document explicitly.
- RAID Risk R1, R2, Dependency D2 (see above)

---

### REQUIREMENT: Mobile App is primary channel (no POS keyboard entry)
**Trigger:** Mobile app confirmed + no POS keyboard integration (Set B, Q8 + Q9)
**Source BRD:** Dominos IDN v1.3

Patterns to apply:
- Redemption API flow is 4-step: GetCustomer (validate + show available points) → IsRedeem (check eligibility) → Redeem (process) → Redeem Reversal (if customer cancels). Auth API creates token first.

---

### REQUIREMENT: Historical Data Import
**Trigger:** Client has existing loyalty/customer data to migrate (Set F, Q34)
**Source BRD:** ASICS Vietnam v1.03

Standard 8-Step Process (include in BRD Section 18):
```
Step 1: Project Kick-Off — Brand folder created, go-live date aligned, Data Dictionary Template shared
Step 2: Data Validation & Org Settings Verification
Step 3: Data Understanding Report & Bill Amount Validation — client sign-off required
Step 4: Data Quality Report (DQR) — client sign-off required; consistency with Integration BRD verified
Step 5: Assumption Document — collated assumptions shared with PM before preparing import-ready files
Step 6: Import Ready Files & Checks — counts and totals shared before import; client sign-off required
Step 7: Pre-import Check — Maker/Checker pair cross-verification
Step 8: Post-Import Validation — compare counts from source and Capillary files; shared internally and with client
```
> Data import limits seen in real BRDs: 50,000 records / last 1 year (ASICS VN). Always confirm limit with client.

---

### REQUIREMENT: India SMS (DLT Compliance)
**Trigger:** India market confirmed (Set C, Q19)
**Source BRDs:** Multiple India implementations

Patterns to apply:
- DLT entity registration on DLT platform (Vodafone, Airtel, TRAI, etc.) MUST be initiated as D-Day-1
- Variable content in DLT templates MUST be enclosed in `{#var#}` tags
- Links in DLT-compliant SMS must be inside a `{#var#}` variable tag only — static links are rejected
- DLT registration takes 2–4 weeks — add as CRITICAL dependency in RAID
- Two SMS types: TRANS (transactional — OTPs, account alerts) and BULK (promotional campaigns). Specify per use case in Gateway Setup section.

---

### REQUIREMENT: Phase Enhancement BRD
**Trigger:** BRD type = Phase Enhancement (Set A, Q7)
**Source BRD:** Pidilite Phase 3.1 v1.1

Patterns to apply:
- Short document — target 5–10 pages. Do NOT write full 21-section BRD.
- Project Scope = numbered list of CRs only (4.1, 4.2, 4.3...)
- Each CR has its own Functional Scope sub-section (5.1, 5.2...)
- No loyalty construct section — programme already exists
- MoSCoW tagging still required on every FR
- Closing: standard Annexure language (verbatim — see phase01-brd.md)

---

### REQUIREMENT: Replica BRD (another country)
**Trigger:** "Same as [other country]", "replicate SG/MY/TH" (Set A, Q7)
**Source BRD:** ASICS Vietnam v1.03

Patterns to apply:
- Note in Project Overview: "Architecture and APIs same as [parent country]. Endpoint may change for Production."
- Scope statement: "Any additional scope not implemented in [parent country] would be considered as a Change Request."

---

### REQUIREMENT: Bi-directional Fraud Module
**Trigger:** Client confirms bi-directional fraud detection (Set F, Q40)
**Source BRD:** ABFRL Tasva v1.3

Patterns to apply:
- Capillary flags suspicious transactions and shares fraud list with client (one-way)
- Client also sends confirmed fraud customer data to Capillary (identifiers + boolean values)
- Capillary imports and updates respective member profiles

---

### REQUIREMENT: Communication via client's existing vendor
**Trigger:** Client using own comms vendor instead of Capillary gateway (Set F, Q42)
**Source BRD:** ABFRL Tasva v1.3 (ICS for SMS)

Pattern to apply:
- State in Communication section: "Communication will be sent by [CLIENT]'s existing vendor [VENDOR NAME]. [VENDOR] will be integrated with Capillary for [SMS/Email/WhatsApp]."

---

### REQUIREMENT: Family / group membership programme
**Trigger:** Client confirms family or group membership required (Set F, Q43)
**Source BRDs:** Mr. DIY v2 · Pantaloons v1.2

Patterns to apply:
- Document in FRs: member linking mechanism, points pooling vs individual, group redemption rules, family tier inheritance, admin add/remove capability
- Group Redemption: burns Group Points to generate Individual Coupon for the specific requester only (Mr. DIY v2)
- Confirm: Can group points be redeemed by any member or only the primary account holder?

---

### REQUIREMENT: Document upload for tier verification
**Trigger:** Client confirms document-based tier upgrade (BPJS card, Student ID, income proof)
**Source BRD:** Dompet Aman v1.0

Patterns to apply:
- Accepted formats: JPG, PNG only. Maximum size: 2MB. Upload from device local storage.
- On upload success → pass to Admin Portal for validation. Tier NOT assigned automatically.
- Admin portal statuses: Pending, Approve, Reject. Comment is mandatory on approve or reject.
- Admin portal features: search by name/email/phone, Excel export with date range, pagination for 100+ records.
- ⚠️ Admin portal development in Annexure as Change Request unless explicitly in SOW

---

### REQUIREMENT: Subscription payment for tier upgrade
**Trigger:** Client confirms tier upgrade via payment / subscription fee
**Source BRD:** Dompet Aman v1.0

Patterns to apply:
- Amount is fixed per tier. Handled in CMS — configurable without code change.
- Payment success/failed → add transaction in Capillary
- ⚠️ Payment gateway integration: Annexure as Change Request unless explicitly in SOW

---

### REQUIREMENT: PIN + OTP authentication
**Trigger:** Client confirms PIN-based login for WebApp or mobile app
**Source BRD:** Dompet Aman v1.0

Patterns to apply:
- Login flow: Mobile Number + OTP + PIN
- OTP: max retry = 3 attempts. Resend CTA after 30 seconds. Sent via SMS through Capillary gateway.
- PIN: 6-digit. Reset requires OTP authentication.
- Registration OTP page must appear after TnC acceptance.

---

### REQUIREMENT: WebApp screen-by-screen functional scope
**Trigger:** BRD type = WebApp or Custom Dev
**Source BRD:** Dompet Aman v1.0

Pattern to apply:
- Functional scope format = screen-by-screen, not module-by-module. Each screen = own numbered sub-section.
- Each screen documents: UI behaviours, field validations, flow logic, API touchpoints, business rules, CMS-managed values.
- Figma files are the reference — note in References section.
- Recommendation: "Any update in the Figma screens to be considered as a new page instead of editing the current version."

---

### REQUIREMENT: Multi-org API support
**Trigger:** Client confirms multiple orgs/brands needing cross-org API
**Source BRD:** Pidilite Phase 3.1 v1.1

Patterns to apply:
- Specify B2B API vs B2C API explicitly per endpoint
- Multi-org Get Redemption API: must support multiple orgs simultaneously in a single call
- Order Status API: takes single org ID per request — NOT multi-org
- If reversal exists: include reversal details at line item level + redemption details

---

### REQUIREMENT: Barcode-based point earning
**Trigger:** Client confirms barcode scanning as loyalty earning mechanism
**Source BRD:** Pidilite Phase 3.1 v1.1

Patterns to apply:
- Document barcode format (EAN-13, QR, custom) and validation rules in Integration Requirements
- Include barcode scan API endpoint and error handling in Interface Requirements

---

### REQUIREMENT: External system managing a special membership class
**Trigger:** Client confirms a special membership class managed by an external system
**Source BRD:** Dompet Aman v1.0 (HIPMI/EIC)

Patterns to apply:
- Identified via customer additional field (not tier)
- If user exists in external system but NOT in Capillary → external system calls Add Customer API with tier
- If user exists in both → external system calls Update Customer API with tier
- Benefits = general offers. Perks = exclusive offers for special membership class. Document both.

---

## Historical Data Import — Standard 8-Step Process

> Apply when client has existing loyalty data OR when this is a revamp/migration.
> Already listed above in the Historical Data Import requirement pattern.
> Data import limit seen in real BRDs: 50,000 records / last 1 year (ASICS VN). Always confirm.
