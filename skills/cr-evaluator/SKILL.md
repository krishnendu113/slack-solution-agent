# CR Evaluator — Capillary Feasibility Rubric

This skill is always loaded. It provides the evaluation framework, Capillary module map,
and complexity scoring guide used for every CS feasibility assessment.

---

## Feasibility Verdict Definitions

Use exactly one of these four verdicts. No other words are acceptable.

### OOTB — Out of the Box

The capability exists in Capillary's product **today** with no configuration or engineering
work required. The feature is live and usable immediately after provisioning.

**Capillary OOTB examples:**
- Standard tier-based loyalty points earn/burn
- Pre-built email/SMS campaign templates in Engage+
- Default dashboard views in Insights+
- Standard webhook events (transaction, registration, coupon issue)
- Referral program with pre-built tracking
- Birthday/anniversary bonus campaigns

**Signal:** You find this exact feature mentioned in docs.capillarytech.com or a Confluence
page confirms it was delivered OOTB for another client.

---

### Config — Configuration Required

The capability exists but **must be configured** by the Capillary implementation team.
No custom code required, but non-trivial setup work is involved (rules, templates, workflows,
feature flags, tier structures, integration configs).

**Capillary Config examples:**
- Custom tier names, earn ratios, burn ratios, expiry rules
- Custom coupon templates with client branding
- Configured segment rules in Engage+
- Webhook payload mapping to a client's schema
- Custom report builder configurations in Insights+
- Loyalty programme with multiple earn streams (transactions + reviews + referrals)
- Scheduled campaign automation (weekly digest, cart abandonment)

**Signal:** The feature exists in product but requires implementation work. Confluence
solution docs for similar clients confirm it was Config-class.

---

### Custom — Custom Development Required

The capability requires engineering effort: a custom API, new backend workflow,
database schema change, or non-standard integration. Needs SA + engineering scoping,
sprint allocation, and change request process.

**Capillary Custom examples:**
- Net-new Connect+ integration with a system Capillary has never integrated with before
- Custom loyalty earning rule engine (e.g. complex weighted scoring not in standard rule builder)
- Real-time stock-based earn/burn (requires live inventory API sync)
- Bidirectional sync with a client's custom CRM schema
- Custom mobile SDK plugin for a non-standard payment provider
- Complex Neo workflow with external API calls mid-flow
- Multi-currency loyalty with dynamic exchange rates

**Signal:** No Confluence/Jira precedent found for this specific requirement. Requires API
that doesn't exist or significant deviation from standard product behaviour.

---

### Not Feasible — Cannot Be Done

The requirement cannot be met with Capillary's current product and roadmap.
OR it would require changes so fundamental that it is effectively a new product.

**Not Feasible examples:**
- Real-time financial transaction clearing (Capillary is not a payment processor)
- Offline-first mobile app with full sync (not in Capillary's architecture)
- White-label reselling of the Capillary platform to client's end-customers
- Requirement that conflicts with Capillary's multi-tenant data model
- SLA/uptime guarantees beyond Capillary's standard 99.9%

**Signal:** No product documentation exists. The requirement fundamentally contradicts
Capillary's architecture or business model.

---

## Capillary Module Map

Use this to determine which modules are in scope for a given requirement.

### Loyalty (Core)
The loyalty programme engine.
- **Earn rules** — points/cashback on transaction events, configurable ratios
- **Burn rules** — redemption rules, minimum balance, partial redemption
- **Tiers** — tier definition, upgrade/downgrade logic, tier benefits
- **Expiry** — rolling/fixed expiry, expiry notifications
- **Catalogue** — reward catalogue, voucher management, reward redemption
- **Milestones** — non-transactional earn events (surveys, referrals, check-ins)
- **Promotions** — bonus multipliers, flash sales, targeted earn boosts

### Engage+ (Campaigns & Communications)
Marketing automation and customer engagement.
- **Campaigns** — batch campaigns (email, SMS, push, WhatsApp)
- **Journeys** — event-triggered automation flows
- **Segments** — rule-based and ML-based customer segmentation
- **Templates** — email/SMS/push template builder
- **Personalisation** — dynamic content blocks, merge tags
- **Loyalty comms** — transaction confirmation, tier upgrade, expiry reminders

### Insights+ (Analytics & Reporting)
Customer data analytics and business intelligence.
- **Dashboards** — pre-built and custom KPI dashboards
- **Report builder** — ad-hoc report creation, scheduled reports
- **Customer profiles** — 360° view, transaction history, segment membership
- **Cohort analysis** — retention, churn, LTV analysis
- **Attribution** — campaign attribution, incremental lift

### Connect+ (Integrations & APIs)
Integration layer and API platform.
- **REST APIs** — inbound transaction, customer, catalogue, coupon APIs
- **Webhooks** — outbound event notifications to client systems
- **POS integrations** — in-store POS connectors (Oracle, Lightspeed, custom)
- **Ecommerce** — Shopify, Magento, WooCommerce plugins
- **CDPs** — Segment, mParticle, Tealium integration
- **Payment** — Adyen, Stripe, Razorpay, Paytm event capture

### Neo (Workflow Engine)
Low-code workflow automation platform.
- **Workflows** — visual drag-drop workflow builder
- **Triggers** — event-based, time-based, API-based
- **Actions** — loyalty events, campaign triggers, webhook calls, data writes
- **Conditions** — branching logic, wait steps, loop steps
- **External calls** — HTTP action blocks for third-party API calls

---

## Complexity Scoring Guide

Rate every response as **Low**, **Medium**, or **High**.

### Low Complexity
- Single module, no custom code
- Standard Capillary configuration
- Similar implementation found in Confluence for another client
- Client timeline > 4 weeks
- No data migration required

*Example: Adding a new tier level with custom earn ratios to an existing loyalty programme*

### Medium Complexity
- Two or more modules involved
- Some custom configuration + minor integration work
- Partial precedent found (similar but not identical)
- Client timeline 2–4 weeks
- Minor data migration (e.g. importing existing points balance)

*Example: Configuring an Engage+ journey triggered by a Neo workflow that reads a Connect+ webhook*

### High Complexity
- Three or more modules OR any custom engineering
- Net-new integration with no precedent
- Client timeline < 2 weeks
- Significant data migration (full CRM import, historical transactions)
- Real-time requirements (sub-second response needed)
- Multi-country or multi-currency scope
- Regulatory/compliance constraints (PCI, GDPR, local data residency)

*Example: Real-time cashback on petrol purchases via a new POS integration with custom Neo workflow*

---

## Escalation Checklist

Trigger SA escalation if ANY of the following are true:
- [ ] Verdict is **Not Feasible** or cannot be determined
- [ ] Complexity is **High** AND no clear precedent exists
- [ ] Requirement involves a net-new third-party integration not previously done
- [ ] Client timeline is shorter than a reasonable delivery estimate for the complexity class
- [ ] Requirement touches Capillary product roadmap (need PM input)
- [ ] Data migration > 1M records or involves PII handling
- [ ] Multi-country rollout with conflicting regulatory requirements
- [ ] Client is asking for contractual SLA guarantees

When escalating, always include:
1. What you assessed and why you're escalating
2. What information the SA needs to proceed
3. Your preliminary verdict (even if uncertain)

---

## Output Format Reminder

Every response MUST follow this section order exactly:

1. `## Problem` — 2–3 sentence restatement in CS terms
2. `## Verdict` — One of: OOTB / Config / Custom / Not Feasible
3. `## Approach` — Step-by-step implementation guidance with module/API specifics
4. `## Complexity` — Low / Medium / High + 1–2 sentence justification
5. `## References` — Clickable markdown links only: [Title](url). If none: say so explicitly.
6. `## Open Questions` — Facts that would change the verdict. If none: write "None."
