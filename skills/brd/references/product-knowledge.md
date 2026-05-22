# Capillary Product Knowledge — Deep Module Specs

Use this file to populate BRD functional requirement sections and discovery questions. Do NOT ask the client for information already covered here.

---

## Engage+ — Omnichannel Marketing Automation

**What it is:** Capillary's marketing automation solution. Channels: Email, SMS, WhatsApp, LINE, Viber, RCS, Zalo, Push Notifications, In-App, Facebook Ads.

### Implementation Steps (use to populate FR tables)

| Step | Phase | Key Deliverable |
|------|-------|-----------------|
| 01 | Pre-requisites & Access | Org setup, user roles, channel credentials |
| 02 | Audience Management | Segments, filters, reachability validated |
| 03 | Channel Configuration | All channels live and tested |
| 04 | Personalisation & Content | Labels, Liquid templates ready |
| 05 | Incentive Management | Offers, coupons, points, vouchers configured |
| 06 | Campaign Creation | All campaign types created and approved |
| 07 | Journeys & Automation | Lifecycle journeys live |
| 08 | Testing, Approval & Go-Live | UAT sign-off, production live |
| 09 | Reporting & Optimisation | Dashboards, reports, ongoing cadence |

### Channel-Specific Requirements

**SMS:**
- Configure SMS gateway vendor in Engage+ channel settings
- **DLT Compliance (India — MANDATORY):** Entity registration + Sender IDs + content templates all pre-approved on DLT platform before any SMS can be sent. Takes 2–4 weeks.
- Variable content in DLT templates: must use `{#var#}` tags. Links must also be in `{#var#}`.
- Two SMS types: TRANS (transactional — OTPs, alerts) and BULK (promotional campaigns)
- Link Tracking requires a support ticket to enable

**Email:**
- Configure vendor (SendGrid or custom SMTP): API key, sender name, sender email
- Set up DKIM and SPF records
- Unsubscribe tag is MANDATORY for all email campaigns
- Build custom Unsubscribe landing page URL

**WhatsApp:**
- Configure WhatsApp BSP credentials
- Register message templates with Meta — allow time for Meta approval
- Customers must actively opt-in for WhatsApp marketing messages

**Push Notifications:**
- Prerequisites: Mobile SDK integration must be live before push can be configured
- Firebase setup: FCM (Android) — upload Server Key; APNs (iOS) — upload .p8 certificate
- Supports: deep links, primary + secondary CTA buttons, image uploads (max 5 MB), delay sending (min 2 mins)
- **PushMax:** Fallback to in-app message when push delivery fails

**In-App Messages:**
- Configured via Mobile SDK
- Display triggers: on app open, after action, after delay, on campaign send
- Templates: modal, banner, full-screen, card

**Channel Priority (Send Messages Action):**
- **Mandatory Channels:** Always sent regardless of other channel outcomes
- **Priority Channels:** Tried in order; falls back if delivery fails (e.g. WhatsApp → SMS → Email)
- Both channels in a priority pair cannot be the same channel
- Document Mandatory vs Priority order for each campaign type: promotional, transactional, lifecycle

### Audience Management Filters
- Loyalty-Based: tier, points balance, points expiry, card series, programme membership
- Transaction-Based: transaction count, value, last/first purchase date, store, product category
- User Profile-Based: registration date, mobile, email, city, custom fields
- Behavioural Event Filters: available once SDK/API integration is live

### Journey Building Blocks
- Engagement Block: send message on a specific channel
- A/B Testing Block: split customers into variants (replaces engagement block — do NOT add separate engagement block alongside)
- Channel Priority Block: attempt channels in priority order based on reachability
- Time-Based Wait / Event-Based Wait / Wait Since Event
- Condition Split / Audience Split / Join Block

**Journey editing:** Editing a live journey creates a new version (v1). Options for existing customers: Move to new version, Sunset v0, or Stop v0.

### Campaign Types
- **Broadcast:** One-time send to defined bulk audience
- **Recurring:** Automated repeat; audience refreshed via FTP Connector + Connect+; dataflow runs ≥4h before send; campaign approved ≥2h before first trigger
- **Journey Campaign:** Multi-step, event-triggered
- **Referral:** Referral codes; set up in Old UI first, then link to Broadcast in New UI
- **DVS (Dynamic Voucher System):** Customer must perform action to receive voucher
- **Ads Audience (Facebook):** Push segment to Facebook Ad Manager

**Approval rule:** All campaign messages must be sent for Approval. Completions at least 2 hours before first trigger.

### Incentive Types
- Coupons/Offers: % discount, fixed-value, free item, BOGO
- Points: bonus points issued in bulk via campaign
- Cart Promotions: auto-apply discounts at POS/checkout based on cart conditions
- DVS: activity-based voucher
- Badges: gamification badges via campaigns or journeys

### Key Engage+ Metrics
- Contacted Customers, Delivery Rate, Hit Rate, Responder Sales, Incremental Sales
- Incremental Sales = (Test Hit Rate − Control Hit Rate) × Test Contacted × (Total Responder Sales ÷ Test Responders)

---

## Loyalty+ — Loyalty Engine

**What it is:** Points accrual, tier management, earning rules, redemption logic.

### Key Configuration Areas
- Earning rule definition (transaction type, category, brand filters, multipliers)
- Tier upgrade/downgrade thresholds and cooldown periods
- Points ledger and balance visibility
- Points burn rules (redemption rate, minimum redemption, partial redemption)
- Points expiry (fixed-date or rolling based on last activity)
- Workflow simulation for validating rule logic before go-live
- Advanced Capping: daily/weekly/monthly caps per customer or per promotion

### Loyalty Promotions
- Types: points multiplier, bonus points, tier accelerator, product-specific earn
- Qualifying conditions: customer segments, stores, products, transaction values, timeframes

### Programme Types
| Type | Description |
|------|-------------|
| Transactional Loyalty | Points on spend |
| Behavioural Loyalty | Points for non-purchase actions |
| Subscription Programme | Fee-based membership tiers |
| Coalition Programme | Shared points across partner brands |
| Multi-Loyalty | Separate programmes for different segments or brands |

---

## Rewards+ / Catalog Promotions

**What it is:** Points redemption marketplace. Catalog Promotions enable time-limited item-level discounts.

### Rewards Catalog Setup
- Reward Types: vouchers, physical merchandise, experiences, partner rewards, charity donations
- Configure: min/max points per transaction, reward ownership, grouping/ranking
- Alternative payment modes: points+cash (split tender)
- Rewards+ Agent Support Tool for customer service team

### Catalog Promotions (Marvel implementation pattern)
- Promotion types: % discount, fixed-value, BOGO, bundle offer
- Qualifying conditions: min basket value, specific SKUs, categories, combos
- Auto-applied at POS or e-commerce — no coupon code required
- Fraud prevention: Cart Locking to prevent duplicate or fraudulent redemptions

### Partner Rewards
- Hotel vouchers, airline miles transfer, dining credits, SPA entry
- Minimum 5 partner categories recommended at launch

---

## CDP — Customer Data Platform

**What it is:** Member segmentation, audience building, behavioural analytics.

### Key Configuration
- Segment creation: RFM (Recency, Frequency, Monetary)
- Behavioural segments (bought X brand, visited Y store, browsed Z category)
- Demographic segments (age, location, gender, tier)
- Lookalike audiences for campaign targeting
- Churn prediction segments
- Tourist member identification (device locale, nationality, transaction currency patterns)
- SQL Traits: advanced segment creation from raw SQL query

---

## Neo — Extension 2.0 (Default Extension Platform)

**What it is:** Capillary's low-code extension platform. Default and always-recommended. Drag-and-drop dataflows using building blocks.

### What Neo Enables
- Customise and enrich existing Capillary APIs
- Create new custom JSON-based APIs without infrastructure code
- Transform data (e.g. JSON API payload from CSV source)
- Build and deploy brand-specific applications
- Enrich event notification payloads with custom data fields

### Key Features
- Drag-and-drop building blocks for full dataflows
- Eliminates boilerplate code (connections, auth, error handling)
- No cold start issues
- SOC 2 Compliance
- Single-click CI/CD
- Single-tenant architecture (separate DB per org)
- Robust version control

### When to Use Neo
- Custom data validation or enrichment before/after API calls
- Third-party system integrations (ERP sync, airline loyalty name-matching)
- Async high-volume data processing
- Event notification payload enrichment
- Custom reward or points calculation logic
- Building wrapper APIs to bridge client systems with Capillary APIs

### Workflow
Design dataflow → Configure building blocks → Test in Dev Console → Submit for Review → Approve → Activate → Monitor via API Logs

---

## Classic Extension (Avengers) — When to Use Instead of Neo

| Use Case | Use Neo | Use Classic |
|---------|---------|-------------|
| JSON-based APIs, low-code | ✅ | |
| SAML / XML / SOAP APIs | | ✅ |
| Full custom code (Node.js) | | ✅ |
| Complex multi-step logic | | ✅ (if beyond Neo capability) |

---

## Vulcan — Custom UI

- Build custom Member Care views (loyalty wallet display, customer 360 panel)
- Build custom Microsites for branded loyalty portals
- Vulcan DEV access: upload builds, enable UAT mode, manage deployments
- Promote builds from UAT to Production only after client sign-off

---

## Organisation Setup (Marvel Pattern)

- Set up Org name, timezone, currency from day one
- Configure Organisation Units (OUs) for sub-brands or regional divisions
- Connected Organisations for entities sharing customer data across org boundaries
- RBAC: Role-Based Access Control for all team members

---

## API Integration Patterns

- REST APIs: Add Customer, Add Transaction, Get Customer, Redeem Points, Issue Coupon
- Authentication: OAuth2 client credentials or Basic Auth (Till ID + password)
- Till credentials must have correct access group permissions per operation
- Test all API calls end-to-end in staging using Postman or Capillary 'Try it' feature

---

## Connect+ — Batch Data Ingestion

- Templates: Add Customer, Add Transaction, Goodwill Points, or custom dataflow
- Source connectors: SFTP, S3, Kafka, API
- Add transformation, validation, encryption/decryption blocks
- Test in UAT before scheduling in production

---

## Mobile SDK

- Platforms: Android, iOS, React Native, Flutter
- Configure Firebase for push notification delivery
- Initialise SDK and implement event tracking for key user actions
- Configure Push Notifications, In-App Messaging, and Notification Centre

---

## UAT & Go-Live Protocol

- Test all API integrations end-to-end: registration, transaction, earn, tier upgrade, coupon issue and redemption
- Test all Connect+ dataflows with sample data files
- Validate Loyalty Workflow rules via Workflow Simulation tool
- Test all campaign message templates across every channel
- Validate Journeys using Journey Test feature
- Test Rewards Catalog: redemption flows, point deduction, reward fulfilment
- Test Event Notifications: verify webhook payloads arrive correctly
- Sign off UAT checklist with client stakeholders before production migration
- Monitor first 24–72 hours post go-live: API error rates, live transactions, points award validation

---

## Monthly Optimisation Cadence (include in BRD KPIs section)

- Review Delivery Rate by channel — investigate if below threshold
- Review Hit Rate and Responder Sales for all active campaigns
- Analyse Journey block-level drop-offs — adjust wait times or content
- Review A/B test results and update journey versions accordingly
- Audit active audience groups
- Review coupon and offer redemption rates
- Check Incremental Sales (Test vs. Control) for major campaigns
- Review Capillary Release Notes quarterly for new features
