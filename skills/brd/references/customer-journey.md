# End-Customer Loyalty Journey

This file maps the full loyalty programme experience from the customer's perspective.  
**Use for:** BRD Section 12 (Member Journey Flow diagram) · Engage+ journey configurations · Discovery Yes/No section · FR writing.

---

## Journey at a Glance

```
AWARENESS → ENROLMENT → FIRST EARN → ONGOING ENGAGEMENT
    → TIER PROGRESSION → REDEMPTION → RETENTION → EXIT
```

Each stage below includes: what the customer experiences, what Capillary does in the background, Engage+ triggers, API touchpoints, and failure/error states to document in BRD FRs.

---

## Project Context Header (populate from Set A answers)

```
Project Name:     [from Set A, Q2]
Client / Brand:   [from Set A, Q1]
Platform:         [e.g. Loyalty Platform / Mobile App / Website / POS System]
Modules in Scope: [from Set A, Q3 — e.g. Loyalty, Campaigns, Rewards, CDP, Messaging]
```

---

## Journey at a Glance

```
AWARENESS → ENROLMENT → FIRST EARN → ONGOING ENGAGEMENT
    → TIER PROGRESSION → REDEMPTION → RETENTION → EXIT
```

Each flow below uses the standard 7-point format:
**Flow Name · Actors · Trigger · Steps · System Actions · Decision Points · Final Outcome + Visual**

---

## Flow 1 — Customer Registration / Enrolment

**Flow Name:** Customer Registration / Enrolment  
**Actors Involved:** Customer · Mobile App / POS / Web · Loyalty Platform (Capillary) · SMS Gateway  
**Trigger Event:** Customer taps "Register" in app, visits web portal, or is enrolled at POS by staff

**Step-by-Step Flow:**
```
1. Customer opens registration channel (app / web / POS)
2. Enters: Mobile number (mandatory) + Name + Email + DOB (as configured)
3. Accepts Terms & Conditions and consent / opt-in
4. OTP sent to mobile via SMS
5. Customer enters OTP
6. [If PIN-based login] → Customer sets 6-digit PIN
7. Profile created in Capillary
8. Entry tier assigned (e.g. Silver / Bronze / Guest)
9. Welcome bonus points issued (if configured)
10. Welcome Journey fires in Engage+
11. Member sees points balance + tier badge on home screen
```

**System Actions:**
- Add Customer API called → member profile created in Capillary org
- OTP Generate API called → SMS sent via gateway
- OTP Validate API called → verified
- Welcome Journey triggered in Engage+ (SMS + Email + Push per channel config)
- Points ledger initialised; welcome bonus credited (if applicable)

**Decision Points:**
```
IF mobile number already registered
    → THEN show "Already a member — login instead"
IF OTP not entered within 10 minutes
    → THEN OTP expires; show Resend option
IF OTP retries > 3
    → THEN lock OTP for 30 minutes; show support contact
IF Connect+ bulk enrolment (not real-time)
    → THEN batch Add Customer API; welcome campaign triggered via Engage+ batch send
```

**Final Outcome:**
```
✅ Success: Member profile active in Capillary · Entry tier assigned ·
            Welcome points credited · Welcome Journey delivered
❌ Failure: Duplicate mobile blocked · OTP lockout triggered ·
            Error logged; PM alerted for Connect+ file failures
```

**Visual Flow:**
```
[Customer opens app/web/POS]
        │
        ▼
[Enter mobile + details + T&C consent]
        │
        ▼
[OTP sent via SMS]
        │
        ▼
[Customer enters OTP] ──── Invalid/Expired? ──── YES → [Resend / Lock after 3 retries]
        │ Valid
        ▼
[Profile created in Capillary] → [Entry tier assigned] → [Welcome points issued]
        │
        ▼
[Welcome Journey fires] → [SMS + Email + Push sent]
        │
        ▼
✅ [Member home screen: balance + tier displayed]
```

---

## Flow 2 — Customer Purchase & Loyalty Points Earning

**Flow Name:** Customer Purchase & Loyalty Points Earning  
**Actors Involved:** Customer · POS System / Mobile App / Ecommerce · Loyalty Platform (Capillary) · SMS/Push Gateway  
**Trigger Event:** Customer completes a purchase transaction at POS, app, or website

**Step-by-Step Flow:**
```
1. Customer presents identifier at POS (mobile number / QR code / loyalty card)
   OR completes checkout on app / website
2. POS / app calls Get Customer API → member info returned
3. POS displays: member name, tier, points balance, active offers
4. Transaction completed (sale finalised)
5. Add Transaction API called with: bill amount, bill number, store ID, till ID, items
6. Capillary applies earning rule → points calculated
7. Points credited to member account
8. Points balance updated in real time
9. Post-Purchase Journey fires in Engage+
10. POS receipt / app screen shows: points earned + new balance
```

**System Actions:**
- Get Customer API → validates member, returns profile + balance
- Add Transaction API → bill recorded, earning rule applied, points awarded
- Points ledger updated
- Post-Purchase Journey triggered in Engage+ (Push / SMS confirmation)
- [If first transaction ever] → First Purchase Journey fires instead

**Decision Points:**
```
IF member not found at POS
    → THEN show "Member not found" · staff offers enrolment
IF bill amount below minimum earn threshold
    → THEN no points issued · no notification sent
IF internet down at store (offline mode)
    → THEN record saved locally with tag "0" · synced nightly on API recovery
IF duplicate bill number detected
    → THEN Capillary rejects · points not double-awarded · error logged
IF transaction is a return / refund
    → THEN route to Flow 7 (Refund / Return Handling)
```

**Final Outcome:**
```
✅ Success: Points credited · balance updated · confirmation sent to member
❌ Failure: Offline tag-0 record saved for nightly sync ·
            Duplicate bill rejected · error report to PM
```

**Visual Flow:**
```
[Customer at POS / App Checkout]
        │
        ▼
[Identify member: mobile / QR / card]
        │
        ▼
[Get Customer API] → Member found? ── NO → [Offer enrolment]
        │ YES
        ▼
[Transaction completed]
        │
        ▼
[Add Transaction API called]
        │
        ▼
[Earning rule applied] → Points calculated
        │
        ▼
[Points credited] → [Balance updated]
        │
        ▼
[Post-Purchase Journey fires] → [SMS / Push: "You earned X points"]
        │
        ▼
✅ [Receipt / app shows: earned X pts · new balance Y pts]
```

---

## Flow 3 — Points Redemption

**Flow Name:** Points Redemption  
**Actors Involved:** Customer · POS System / Mobile App · Loyalty Platform (Capillary) · SMS/Push Gateway  
**Trigger Event:** Customer chooses to redeem points at POS, in the Rewards Catalog, or via a campaign coupon

**Step-by-Step Flow:**

**Path A — POS Redemption:**
```
1. Customer at checkout — requests to redeem points
2. Staff identifies member (mobile / QR / card)
3. Get Customer API → returns points balance + tier + active offers
4. [If OTP-on-redemption configured] → OTP sent · customer reads to staff · OTP Validate API called
5. Staff enters points to redeem at POS
6. Redeem Points API called
7. Points deducted · discount applied at checkout
8. Transaction finalised
9. Receipt shows: points used + remaining balance
10. Redemption confirmation SMS / Push sent
```

**Path B — Rewards Catalog (App / Web):**
```
1. Customer opens app → navigates to Rewards tab
2. Browses catalog (filters: category / points range / tier eligibility)
3. Selects reward → taps "Redeem"
4. [If points+cash split tender] → Customer adjusts points/cash slider
5. Redeem API called → points deducted · reward issued
6. Voucher code / reward displayed in "My Rewards"
7. Confirmation: Push + SMS with voucher code
```

**Path C — Campaign Coupon:**
```
1. Customer receives campaign message with coupon / offer code
2. Visits store or website · presents code at POS / checkout
3. Issue Coupon / Redeem Coupon API called
4. Eligibility validated (expiry · usage limit · tier)
5. Discount applied · coupon marked redeemed
6. Confirmation: "Offer redeemed! You saved ₹X"
```

**System Actions:**
- Get Customer API → validate member + balance
- OTP Generate + Validate API (if OTP-on-redemption configured)
- Redeem Points API → deduct points · apply discount
- Issue Coupon / Redeem Coupon API (campaign coupon path)
- Redemption confirmation triggered via Engage+

**Decision Points:**
```
IF insufficient points
    → THEN show "You need X more points"
IF OTP verification fails 3 times
    → THEN block redemption for 30 minutes
IF reward out of stock
    → THEN show "Currently unavailable"
IF coupon already redeemed
    → THEN show "This offer has already been used"
IF coupon expired
    → THEN show "This offer expired on [date]"
IF order cancelled after redemption
    → THEN Redeem Reversal API called · points reinstated
```

**Final Outcome:**
```
✅ Success: Points deducted · discount applied · reward issued · confirmation sent
❌ Failure: Insufficient points / expired coupon shown · reversal triggered on cancellation
```

**Visual Flow:**
```
[Customer decides to redeem]
        │
        ├─ [POS] ─────────────────────────────────────────────┐
        ├─ [Rewards Catalog App]                               │
        └─ [Campaign Coupon]                                   │
                │                                              │
                ▼                                              ▼
        [Identify member]                            [OTP required?]
                │                                    YES → [OTP sent → Validate]
                ▼                                    NO  → continue
        [Check balance / eligibility]
                │
          Sufficient? ── NO → [Show "Need X more points"]
                │ YES
                ▼
        [Redeem API called] → [Points deducted] → [Reward / discount applied]
                │
                ▼
        [Confirmation: Push + SMS]
                │
                ▼
        ✅ [Receipt / app: points used + remaining balance shown]
```

---

## Flow 4 — Campaign or Offer Participation

**Flow Name:** Campaign or Offer Participation  
**Actors Involved:** Customer · Engage+ · Loyalty Platform (Capillary) · SMS / Push / Email / WhatsApp Gateway  
**Trigger Event:** Campaign send time reached OR customer performs a qualifying event (e.g. birthday, tier upgrade, inactivity threshold)

**Step-by-Step Flow:**
```
1. Engage+ evaluates audience segment (CDP filters applied)
2. Eligible members identified
3. Campaign message sent via configured channels (SMS / Push / Email / WhatsApp)
4. Customer receives message + offer / CTA
5. Customer clicks CTA → visits store / app / website
6. Offer / coupon validated at point of redemption
7. Incentive issued: discount / bonus points / voucher / free item
8. Campaign result logged: delivered · opened · clicked · redeemed
9. Incremental Sales report updated (Test vs. Control if A/B split)
```

**System Actions:**
- CDP segment evaluated → eligible audience list built
- Engage+ sends campaign via channel priority order
- Issue Coupon / Add Points API called on redemption
- Campaign analytics updated: delivery rate · hit rate · responder sales

**Decision Points:**
```
IF channel delivery fails (e.g. SMS undelivered)
    → THEN fallback to next Priority Channel (e.g. Push → Email)
IF customer is in Control group (A/B test)
    → THEN no message sent · used for Incremental Sales calculation
IF offer already redeemed by this member
    → THEN redemption blocked · show "Already used"
IF recurring campaign — audience refresh file not arrived ≥4h before send
    → THEN campaign send blocked · PM alerted
```

**Final Outcome:**
```
✅ Success: Message delivered · offer redeemed · points / discount applied ·
            campaign metrics updated
❌ Failure: Delivery failure logged · fallback channel attempted ·
            undelivered members flagged in campaign report
```

**Visual Flow:**
```
[Engage+ evaluates segment] → [Eligible audience identified]
        │
        ▼
[Campaign message sent: SMS / Push / Email / WhatsApp]
        │
        ▼
[Customer receives message] → Ignores? ── YES → [No action · logged as not responded]
        │ Opens / clicks
        ▼
[Customer visits store / app]
        │
        ▼
[Offer / coupon validated]
        │
        ▼
[Incentive issued: discount / points / voucher]
        │
        ▼
✅ [Campaign result logged: delivered · opened · clicked · redeemed]
```

---

## Flow 5 — Tier Upgrade / Tier Evaluation

**Flow Name:** Tier Upgrade / Tier Evaluation  
**Actors Involved:** Customer · Loyalty Platform (Capillary) · Engage+ · Admin (for document-based tiers)  
**Trigger Event:** Member's qualifying value (spend / transactions / subscription) crosses tier threshold OR annual review date reached

**Step-by-Step Flow — Upgrade:**
```
1. Member transacts → Add Transaction API called
2. Capillary loyalty workflow evaluates tier eligibility in real time
3. Member's cumulative qualifying value crosses upgrade threshold
4. Tier upgraded automatically in Capillary
5. New earn rate applied (from next transaction or immediately — confirm with client)
6. Tier-exclusive rewards unlocked in catalog
7. Tier Upgrade Journey fires in Engage+
8. Member sees new tier badge in app
```

**Step-by-Step Flow — Annual Evaluation (Downgrade Risk):**
```
1. Review date approaches (configurable N days before — e.g. 30 days)
2. Capillary evaluates member's qualifying value against tier threshold
3. IF below threshold → Downgrade Warning Journey fires
4. Member receives: "Spend ₹X more to keep [Gold] status"
5. ON review date: Capillary re-evaluates
6. IF still below → tier downgraded · member notified
7. IF above → tier maintained · no action
```

**System Actions:**
- Loyalty workflow evaluates qualifying value on every transaction
- Tier field updated in member profile
- Earn rate recalculated
- Catalog access rules updated (tier-exclusive rewards unlocked / locked)
- Tier Upgrade Journey OR Downgrade Warning Journey triggered in Engage+

**Decision Points:**
```
IF qualifying value reaches upgrade threshold
    → THEN tier upgraded automatically
IF document-based tier (e.g. BPJS card upload)
    → THEN tier NOT assigned automatically
    → THEN admin portal review required (Pending → Approve / Reject)
IF member below threshold at annual review
    → THEN downgrade warning sent N days before review date
IF member still below on review date
    → THEN tier downgraded · earn rate adjusted
IF member above threshold at review date
    → THEN tier maintained · no action
```

**Final Outcome:**
```
✅ Upgrade: New tier active · earn rate updated · member notified · catalog updated
✅ Maintained: Tier unchanged · member optionally notified
❌ Downgrade: Tier reduced · earn rate adjusted · member notified
```

**Visual Flow:**
```
[Transaction added / Review date reached]
        │
        ▼
[Loyalty workflow evaluates qualifying value]
        │
        ├─ Above upgrade threshold? ── YES → [Tier upgraded]
        │                                         │
        │                                         ▼
        │                              [Tier Upgrade Journey fires]
        │                              [New earn rate + benefits applied]
        │                                         │
        │                                         ▼
        │                              ✅ [Member notified + app updated]
        │
        └─ Below threshold (review date)?
                │
                ▼
        [Downgrade warning sent N days before]
                │
                ▼
        [Review date: re-evaluate]
                ├─ Above → ✅ Tier maintained
                └─ Below → ❌ Tier downgraded · member notified
```

---

## Flow 6 — Customer Profile Management

**Flow Name:** Customer Profile Management  
**Actors Involved:** Customer · Mobile App / Web Portal · Loyalty Platform (Capillary) · Admin  
**Trigger Event:** Customer updates personal details, communication preferences, or consent settings

**Step-by-Step Flow:**
```
1. Customer navigates to Profile / Account Settings in app or web portal
2. Selects field to update (name / email / DOB / address / password / PIN / consent)
3. [For sensitive changes — mobile number / email] → OTP verification required
4. Customer enters OTP → verified
5. Update Customer API called → profile updated in Capillary
6. [If communication preferences changed] → Engage+ subscription / opt-out updated
7. Confirmation message sent: "Your profile has been updated"
8. [If consent withdrawn for a channel] → that channel suppressed in Engage+
```

**System Actions:**
- Update Customer API → profile fields updated in Capillary org
- OTP Generate + Validate API (for sensitive field changes)
- Engage+ subscription list updated (opt-in / opt-out per channel)
- Audit trail logged (for GDPR/PDPA compliance)

**Decision Points:**
```
IF mobile number change requested
    → THEN OTP sent to NEW number · verified before update applied
IF email unsubscribe triggered
    → THEN member removed from Email campaign audience in Engage+
IF consent fully withdrawn (all channels)
    → THEN member suppressed across all Engage+ sends
IF admin updates profile (Member Care portal)
    → THEN admin audit trail logged with reason + agent ID
IF member requests account deletion
    → THEN route to Programme Exit flow (Stage 9)
```

**Final Outcome:**
```
✅ Success: Profile updated · Engage+ preferences synced · confirmation sent
❌ Failure: OTP failure → change blocked · error shown to customer
```

**Visual Flow:**
```
[Customer opens Profile Settings]
        │
        ▼
[Selects field to update]
        │
        ▼
[Sensitive change?] ── YES → [OTP sent → Validate]
        │ NO / OTP valid              │ OTP failed → [Block change]
        ▼
[Update Customer API called]
        │
        ▼
[Profile updated in Capillary]
        │
        ▼
[Channel preference changed?]
        ├─ YES → [Engage+ opt-in / opt-out updated]
        └─ NO  → continue
        │
        ▼
✅ [Confirmation sent to customer]
```

---

## Flow 7 — Refund / Return Handling

**Flow Name:** Refund / Return Handling  
**Actors Involved:** Customer · POS System / Ecommerce · Loyalty Platform (Capillary)  
**Trigger Event:** Customer returns a purchased item or requests a refund at POS or online

**Step-by-Step Flow:**
```
1. Customer presents item for return (POS or online return request)
2. Staff / system identifies member (mobile / QR / card)
3. Get Customer API called → original transaction retrieved by bill number
4. Return transaction processed at POS / ecommerce
5. Add Transaction API called with negative bill amount (return)
6. Points reversal calculated:
   → Points earned on original transaction deducted proportionally
7. Points balance updated (reduced by reversed amount)
8. [If points were already redeemed from this transaction] → flag for manual review
9. Refund amount issued to customer (cash / card / store credit — per client policy)
10. Confirmation sent: "Return processed · X points have been adjusted"
```

**System Actions:**
- Get Customer API → retrieve member + original transaction reference
- Add Transaction API with negative amount → points reversal applied
- Points ledger updated (deduct reversed points)
- [If redemption reversal needed] → Redeem Reversal API called → points reinstated (for cancelled orders)
- Confirmation message triggered via Engage+

**Decision Points:**
```
IF full return of original transaction
    → THEN all points earned on that transaction reversed
IF partial return
    → THEN points reversed proportionally (based on returned item value)
IF points already redeemed before return processed
    → THEN flag for manual review by loyalty ops team
    → THEN PM to decide: adjust balance manually or waive reversal
IF return exceeds original bill amount (edge case)
    → THEN flag as anomaly · do not process automatically · escalate to PM
IF return is for an online order (cancelled before fulfilment)
    → THEN Redeem Reversal API called (if points were used) · points reinstated
```

**Final Outcome:**
```
✅ Success: Return processed · points reversed · balance updated · confirmation sent
⚠️ Partial: Points flagged for manual review (already-redeemed scenario)
❌ Failure: Anomaly detected · escalated to PM · no automatic processing
```

**Visual Flow:**
```
[Customer requests return at POS / online]
        │
        ▼
[Identify member] → [Retrieve original transaction by bill number]
        │
        ▼
[Return processed]
        │
        ▼
[Full return or partial?]
        ├─ Full  → [Reverse all points earned on transaction]
        └─ Partial → [Reverse points proportionally]
        │
        ▼
[Points already redeemed?]
        ├─ NO  → [Points deducted from balance] → ✅ [Confirmation sent]
        └─ YES → [Flag for manual review] → [PM / Loyalty Ops decides]
        │
        ▼
✅ [Balance updated · member notified: "X points adjusted"]
```

---

**Customer experience:**
- Discovers the programme via in-store signage, staff recommendation, app store listing, website banner, friend referral, or third-party delivery app

**Nothing happens in Capillary yet.** No API calls. No record created.

**BRD FR to include:**
- Programme discovery channels (list all that apply)
- Referral programme mechanics (if referral is a discovery channel — see Stage 7)

---

## Stage 2 — Enrolment (Deep Detail)

### Enrolment Channels & Flows

**Channel A — Mobile App Registration**
```
Customer opens app
    → Lands on Registration screen
    → Enters: Mobile number + (Name / Email / DOB — as configured)
    → Accepts Terms & Conditions
    → OTP sent via SMS (max retry: 3 · resend CTA after 30 seconds)
    → Customer enters OTP → verified
    → [If PIN-based login configured] → Set PIN screen (6-digit)
         → PIN reset requires OTP re-authentication
    → Profile created in Capillary (Add Customer API called)
    → Welcome bonus points issued (if configured)
    → Member assigned to entry tier (e.g. Silver / Bronze / Guest)
    → App home screen loads: shows points balance + tier badge
```

**Channel B — POS / In-Store Enrolment**
```
Staff enters customer details at POS terminal
    → Mobile number mandatory (primary identifier)
    → Name + Email + DOB (as required by programme rules)
    → Add Customer API called in real time
    → OTP sent to customer's mobile for consent confirmation (if required)
    → Loyalty card / QR code issued (physical or digital)
    → Customer shown: "You are now a [Tier] member"
```

**Channel C — Web / Microsite Registration**
```
Customer visits loyalty portal / brand website
    → Clicks "Join Now"
    → Fills registration form (fields configured in Capillary org settings)
    → OTP verification (SMS or Email)
    → Account created → redirected to member dashboard
    → Points balance + tier displayed
```

**Channel D — Third-Party (Connect+ / Bulk Import)**
```
Client shares customer data file (CSV / XLSX) via SFTP or S3
    → Connect+ dataflow ingests + validates records
    → Add Customer API called in batch
    → Historical points balance imported (if data migration in scope)
    → Welcome communication triggered via Engage+ (batch send)
```

### Data Captured at Enrolment

| Field | Mandatory | Notes |
|-------|-----------|-------|
| Mobile Number | ✅ Yes | Primary identifier in Capillary |
| Name | ✅ Yes | First + Last or Full Name |
| Email | Conditional | Required if Email channel in scope |
| Date of Birth | Conditional | Required for Birthday Journey |
| Gender | Optional | Used for segmentation |
| City / Store | Optional | Used for geo-targeting |
| Custom Fields | Conditional | Per programme design (e.g. membership class, employee ID) |
| Consent / Opt-in | ✅ Yes | Per GDPR/PDPA/DPDP — document per channel |

### Post-Enrolment Engage+ Trigger: Welcome Journey

```
Trigger: Add Customer API succeeds
    │
    ▼
Welcome Journey fires (Engage+):
    ├─ Immediate: Welcome SMS — "Hi [Name], welcome to [Programme]! You have [X] points."
    ├─ +1 hour: Welcome Email — brand story, benefits overview, how to earn & redeem
    ├─ +24 hours: Push Notification — "Make your first purchase to earn [X] points"
    └─ [If WhatsApp in scope] → WhatsApp welcome message with interactive buttons
```

### Enrolment Error States (document in BRD FRs)

| Error | Behaviour |
|-------|-----------|
| Mobile number already registered | Show: "You're already a member — login instead" |
| OTP expired (after 10 minutes) | Show resend OTP option |
| OTP max retries exceeded (3) | Lock OTP for 30 minutes; show support contact |
| Duplicate transaction on enrolment | Capillary deduplication rule prevents double-profile creation |
| Connect+ file validation failure | File rejected; error report sent to PM via email |

---

## Stage 3 — First Earn (Deep Detail)

### Earn Flow — POS Transaction

```
Customer visits store
    │
    ▼
Staff identifies customer at POS:
    Option A: Mobile number entry (keyboard)
    Option B: QR code / barcode scan (if mobile app in scope)
    Option C: Loyalty card swipe / tap
    │
    ▼
Get Customer API called
    → Returns: member name, tier, points balance, active offers
    → POS displays member info + any applicable promotions
    │
    ▼
Transaction completed (sale finalised)
    │
    ▼
Add Transaction API called
    → Payload: member ID, bill amount, bill number, store ID, till ID, items (if SKU-level tracking)
    → Capillary applies earning rule:
         e.g. 1 point per ₹25 spend → bill ₹500 = 20 points awarded
    → Points credited to member account (real-time or batch — confirm with client)
    → Transaction logged with unique bill number
    │
    ▼
POS receipt printed / shown:
    → Points earned this transaction
    → Total points balance
    → Points needed for next tier (if tier display configured)
```

### Earn Flow — Mobile App / Ecommerce

```
Customer browses app / website → adds to cart → checks out
    │
    ▼
Order placed → Order ID generated
    │
    ▼
Add Transaction API called (by client ecommerce system)
    → Points calculated and credited
    → Confirmation screen shows: "You earned X points on this order"
    │
    ▼
[If behavioural events in scope]:
    → App events tracked: product view, cart add, wishlist add
    → Behavioural points issued per event (if earning rules configured)
```

### Earn Rules — BRD FR Checklist

Document each of the following in BRD Section 14 (Loyalty Program Construct):

- [ ] Base earn rate (e.g. 1 pt per ₹25 spend)
- [ ] Earn rate by tier (e.g. Gold members earn 1.5x)
- [ ] Earn rate by product category or SKU (exclusions list)
- [ ] Bonus earn for first transaction
- [ ] Promotional earn multipliers (2x / 3x on specific days)
- [ ] Points cap per transaction (max earn ceiling — fraud control)
- [ ] Points cap per day / week / month per member
- [ ] Non-earning transaction types (returns, exchanges, gift cards)
- [ ] Rounding rule (round up / round down / truncate)
- [ ] Points validity start: immediate vs. next day vs. after cooling period

### Post-Earn Engage+ Trigger: Post-Purchase Journey

```
Trigger: Add Transaction API succeeds (points awarded)
    │
    ▼
Post-Purchase Journey fires:
    ├─ Immediate: SMS / Push — "You earned X points! Balance: Y points."
    ├─ +2 hours: Push — "X more points to [next reward / next tier]"
    └─ [If first transaction ever] → First Purchase Journey fires instead:
         → Celebratory message + higher-value CTA
         → Optional: bonus points issued as first-purchase reward
```

### Earn Error States (document in BRD FRs)

| Error | Behaviour |
|-------|-----------|
| Member not found at POS | POS shows "Member not found" — staff offers to enrol |
| Add Transaction API timeout | POS saves record locally with tag "0"; syncs nightly on API recovery |
| Duplicate bill number | Capillary deduplication rejects; points not double-awarded |
| Transaction below minimum earn threshold | No points issued; no notification sent |
| Internet outage at store | Offline fallback: tag-0 record saved; forced sync on recovery |

---

## Stage 4 — Ongoing Engagement

### Lifecycle Journeys (configure in Engage+)

| Journey | Trigger | Default Timing | Channels |
|---------|---------|---------------|----------|
| Birthday | DOB field matches today | Send on birthday morning | SMS + Email + WhatsApp |
| Anniversary | Registration anniversary | Send on anniversary date | SMS + Push |
| Tier Progress Nudge | Member within X% of next tier threshold | Configurable (e.g. within 500 pts) | Push + SMS |
| Points Expiry Reminder | N days before expiry | 30 days + 7 days + 1 day | SMS + Email |
| Inactivity Nudge | No transaction for X days (soft lapse) | 30 / 45 / 60 days (configurable) | Push + SMS |
| Post-Purchase (ongoing) | Every Add Transaction event | Immediate | Push or SMS |

### Promotional Campaigns (configure in Engage+)

- **Broadcast campaigns:** One-time sends to defined segments (e.g. all Gold tier members, all members in City X)
- **Recurring campaigns:** Auto-refresh audience via FTP Connector + Connect+ (audience file must arrive ≥4 hours before send)
- **Seasonal / Event campaigns:** Festival offers, double-points days, flash sales
- **Test & Control splits:** A/B variants with Incremental Sales measurement

---

## Stage 5 — Tier Progression (Deep Detail)

### Tier Upgrade Flow

```
Member crosses tier threshold (cumulative spend / transaction count / subscription payment)
    │
    ▼
Capillary evaluates tier eligibility:
    → Loyalty workflow runs: checks member's qualifying value vs tier threshold
    → Tier upgraded automatically in Capillary org
    │
    ▼
Member profile updated:
    → New tier assigned
    → New earn rate applied (effective immediately or from next transaction — confirm with client)
    → Tier-exclusive rewards unlocked in catalog (if Rewards+ in scope)
    │
    ▼
Engage+ Tier Upgrade Journey fires:
    ├─ Immediate: SMS + Push — "Congratulations! You've reached [Gold Tier]"
    ├─ +1 hour: Email — New tier benefits overview
    └─ Optional: celebratory bonus points or welcome-to-tier voucher issued
```

### Tier Downgrade Flow (document carefully — common gap)

```
Annual review date (or rolling 12-month window) reached
    │
    ▼
Capillary evaluates qualifying value:
    ├─ Above threshold → Tier maintained → No action
    └─ Below threshold → Downgrade warning triggered
         │
         ▼
    N days before review date (configurable — e.g. 30 days):
         → Warning message sent: "Spend ₹X more to keep your [Gold] status"
         │
         ▼
    On review date — still below threshold:
         → Tier downgraded
         → Member notified: "Your tier has been updated to [Silver]"
         → Earn rate adjusted from next transaction
         → Tier-exclusive rewards removed from catalog access
```

### Tier Configuration — BRD FR Checklist

- [ ] Number of tiers and names (e.g. Silver / Gold / Platinum)
- [ ] Entry tier for new members
- [ ] Upgrade criteria per tier (spend threshold / transaction count / subscription)
- [ ] Qualifying period: calendar year / rolling 12-month / lifetime (no downgrade)
- [ ] Downgrade rule: yes/no — if yes, cooldown period before downgrade
- [ ] Benefits per tier (earn rate, exclusive rewards, priority service, free shipping)
- [ ] Tier display in app and at POS
- [ ] Tier badge / card design (physical or digital)

---

## Stage 6 — Redemption (Deep Detail)

### Redemption Path A — POS Redemption

```
Customer at checkout — decides to redeem points
    │
    ▼
Staff identifies member at POS (mobile / QR / card)
    │
    ▼
Get Customer API → returns: points balance, tier, active offers
    │
    ▼
[If OTP-on-redemption configured]:
    → OTP sent to customer's registered mobile
    → Customer reads OTP to staff → staff enters at POS
    → OTP Validate API called → approved
    │
    ▼
Redeem Points API called:
    → Payload: member ID, bill amount, points to redeem, bill number
    → Points deducted from member account
    → Discount applied at POS checkout
    │
    ▼
Transaction finalised:
    → Receipt shows: points used + remaining balance
    → Redemption confirmation SMS / Push sent to customer
```

### Redemption Path B — Rewards Catalog (App / Web)

```
Customer opens app → navigates to Rewards tab
    │
    ▼
Browses catalog:
    → Filters by: category, points range, tier eligibility
    → Views reward detail: points cost, validity, T&Cs
    │
    ▼
Selects reward → taps "Redeem"
    │
    ▼
[If points+cash split tender configured]:
    → Customer sees slider: adjust points / cash split
    → Minimum points threshold enforced
    │
    ▼
Redeem API called:
    → Points deducted
    → Voucher code generated (or physical reward fulfilment triggered)
    → Reward displayed in app "My Rewards" section
    │
    ▼
Confirmation sent:
    → Push: "Your [reward name] is ready!"
    → SMS: voucher code (if SMS channel in scope)
    │
    ▼
[Reward fulfilment]:
    → Digital voucher: displayed in app immediately
    → Physical reward: dispatched by fulfilment partner (T+X days)
    → Partner reward: API call to partner system (e.g. hotel, airline)
```

### Redemption Path C — Campaign Coupon

```
Customer receives campaign message with offer / coupon code
    │
    ▼
Customer visits store or website:
    → Presents coupon code / QR at POS
    → Or enters promo code at online checkout
    │
    ▼
Issue Coupon / Redeem Coupon API called:
    → Eligibility validated (expiry date, usage limit, member tier)
    → Discount applied
    → Coupon marked as redeemed (single-use flag if configured)
    │
    ▼
Redemption confirmation:
    → SMS / Push: "Offer redeemed! You saved ₹X"
```

### Redemption — BRD FR Checklist

- [ ] Redemption methods in scope (POS / catalog / coupon / all)
- [ ] Minimum redemption threshold (e.g. minimum 100 points)
- [ ] Maximum redemption per transaction
- [ ] OTP verification required on redemption? (yes/no)
- [ ] Points+cash split tender? If yes: minimum points % required
- [ ] Partial redemption allowed? (redeem some points, keep rest)
- [ ] Redemption reversal flow (if customer cancels order after redeeming)
- [ ] Cart Locking (fraud prevention on catalog redemptions)
- [ ] Tier-exclusive rewards (only accessible to Gold / Platinum members)
- [ ] Redemption cap per day / week / month

### Redemption Error States

| Error | Behaviour |
|-------|-----------|
| Insufficient points | Show: "You need X more points to redeem this reward" |
| OTP verification failed (3 retries) | Block redemption for 30 minutes |
| Reward out of stock | Show: "This reward is currently unavailable" |
| Coupon already redeemed | Show: "This offer has already been used" |
| Coupon expired | Show: "This offer expired on [date]" |
| Redemption API timeout | Retry logic: 3 attempts with exponential backoff; alert PM if all fail |
| Order cancelled after redemption | Redeem Reversal API called → points reinstated |

---

## Stage 7 — Retention & Re-Engagement

### Win-Back Journey

```
Trigger: No transaction for X days (configurable — typically 30 / 60 / 90 days)
    │
    ▼
CDP segment: "Lapsing Members" (last transaction > X days ago)
    │
    ▼
Win-Back Journey fires (Engage+):
    Day 1:  Push / SMS — "We miss you! Here's [bonus points / offer] on your next visit"
    Day 7:  Email — Personalised product recommendations + offer reminder
    Day 14: WhatsApp (if in scope) — Final re-engagement nudge
    Day 21: [If no response] → Move to Churned segment; reduce communication frequency
```

### Churn Prevention Journey

```
Trigger: CDP churn prediction model flags member as high-risk
    │
    ▼
Exclusive retention offer issued:
    → High-value voucher or bonus points
    → Personalised message referencing member's purchase history (Liquid personalisation)
    │
    ▼
[If member transacts within X days] → Remove from churn segment → Resume normal journeys
[If no transaction after Y days] → Mark as Churned in CDP
```

### Referral Programme Flow

```
Existing member (Referrer) shares referral code / link
    │
    ▼
New customer (Referee) uses referral code during registration
    │
    ▼
Referee registers → first transaction completed
    │
    ▼
Referral reward triggered:
    → Referrer: bonus points / voucher credited
    → Referee: welcome bonus or first-purchase reward
    │
    ▼
Both notified:
    → Referrer: "Your friend joined! You've earned X bonus points"
    → Referee: "Welcome! You received X bonus points from [Referrer name]"
```

---

## Stage 8 — Tier Maintenance (Annual Review)

*(Already detailed in Stage 5 — Tier Downgrade Flow)*

Key BRD questions to resolve:
- What is the review period? (calendar year / rolling 12-month)
- How many days' warning before downgrade? (recommended: 30 days)
- Is there a grace period after review date?
- Is downgrade communication mandatory? (yes — document in FRs)

---

## Stage 9 — Programme Exit

```
Member requests account deletion or opts out
    │
    ▼
[GDPR / PDPA / DPDP right to erasure]:
    → Member submits deletion request (app / email / in-store)
    → PM / admin processes within legally required timeframe
    → Capillary account status updated:
         Suspended: app read-only access, no new transactions, points frozen
         Deleted: cannot login, credentials releasable, PII anonymised
    │
    ▼
Points balance forfeited (per programme T&Cs — communicate clearly at enrolment)
    │
    ▼
Confirmation sent to member:
    → "Your account has been successfully deleted"
    → No further marketing communications sent
```

**BRD FR to include:**
- Member deletion request channel (app self-serve / email to support / in-store)
- SLA for processing deletion request (e.g. within 30 days — per local law)
- Data retention policy (transaction records anonymised but retained for X years — per finance/audit requirements)
- Distinction between Suspended vs Deleted states and their API triggers

---

```
[AWARENESS]
    │   Customer discovers the loyalty programme
    │   Channels: in-store signage, app, website, staff recommendation, referral
    ▼

[ENROLMENT]
    │   Customer registers (app / POS / web / in-store form)
    │   → Registration OTP (SMS / email) sent for verification
    │   → Profile created in Capillary: name, mobile, email, DOB, custom fields
    │   → Welcome bonus points issued (if configured)
    │   → Tier assigned: entry tier (e.g. Silver / Bronze / Guest)
    ▼
    [Engage+ Trigger]
    → Welcome Journey fires:
      - Welcome message sent (Email + SMS + Push depending on channels in scope)
      - Brand introduction + benefits overview
      - CTA: "Make your first purchase to earn points"
    ▼

[FIRST PURCHASE / FIRST EARN]
    │   Customer transacts (POS / app / ecommerce)
    │   → Transaction sent to Capillary via POS API or Connect+
    │   → Points calculated based on earning rule (e.g. 1 pt per ₹25 spend)
    │   → Points credited to member account
    │   → Points balance updated in real time
    ▼
    [Engage+ Trigger]
    → Post-Purchase Journey fires:
      - Points earned confirmation (SMS / Push / Email)
      - "You now have X points — Y more to your next reward"
      - Optional: product recommendations, next visit incentive
    ▼

[ONGOING ENGAGEMENT]
    │   Regular transactions → points accumulate
    │   Campaign messages received (promotional, lifecycle, seasonal)
    │
    ├─ [Birthday / Anniversary Journey]
    │    → Triggered on DOB or anniversary date
    │    → Birthday bonus points / exclusive offer issued
    │
    ├─ [Tier Progress Nudge]
    │    → Triggered when member is X points away from next tier
    │    → "Spend ₹500 more this month to reach Gold"
    │
    └─ [Points Expiry Reminder]
         → Triggered N days before points expire
         → "Your X points expire on [date] — redeem now"
    ▼

[TIER UPGRADE]
    │   Member crosses tier threshold (by spend, by transactions, or by subscription payment)
    │   → Tier upgraded automatically (or via admin portal for document-based tiers)
    │   → New tier benefits unlocked: higher earn rate, exclusive rewards, priority service
    ▼
    [Engage+ Trigger]
    → Tier Upgrade Journey fires:
      - Congratulations message: "You've reached [Gold Tier]!"
      - New benefits overview communicated
      - Optional: celebratory reward or bonus points issued
    ▼

[REDEMPTION]
    │   Member chooses to redeem points
    │
    ├─ [POS Redemption]
    │    → Member identifies at POS (mobile number / loyalty card / QR code)
    │    → OTP sent for verification (if OTP-on-redemption configured)
    │    → Points deducted; discount applied at checkout
    │    → Receipt confirms points used + remaining balance
    │
    ├─ [Rewards Catalog Redemption]
    │    → Member browses catalog in app / web
    │    → Selects reward (voucher / merchandise / partner reward)
    │    → Points+cash split tender (if configured)
    │    → Redemption confirmed; reward issued or dispatched
    │
    └─ [Campaign Coupon Redemption]
         → Member receives offer via campaign message
         → Coupon code or QR code used at POS / online checkout
         → Discount applied; redemption logged in Capillary
    ▼

[RETENTION & RE-ENGAGEMENT]
    │
    ├─ [Lapsing Member — Win-Back Journey]
    │    → Triggered: no transaction for X days (configurable)
    │    → "We miss you — here's 200 bonus points on your next visit"
    │
    ├─ [Churn Prevention Journey]
    │    → Triggered: predictive model flags high churn risk (CDP segment)
    │    → Exclusive retention offer sent
    │
    └─ [Referral Programme]
         → Member refers a friend
         → Referee registers and transacts → Referrer earns bonus points
         → Both parties notified via communication channels
    ▼

[TIER MAINTENANCE / DOWNGRADE RISK]
    │   At annual review (or rolling 12-month window):
    │   → Member's spend evaluated against tier threshold
    │   → If below threshold: downgrade warning sent N days before review date
    │   → If above threshold: tier maintained or upgraded
    ▼

[PROGRAMME EXIT]
    │   Member opts out / account deletion:
    │   → Consent withdrawal processed
    │   → Right to erasure triggered (GDPR/PDPA)
    │   → Member account: Suspended (read-only) or Deleted (credentials released)
    │   → Points balance forfeited (per programme T&Cs)
```

---

## Communication Touchpoints Summary

| Journey Stage | Trigger | Channels (typical) |
|--------------|---------|-------------------|
| Enrolment | Registration complete | SMS + Email |
| First Earn | First transaction | SMS + Push |
| Post-Purchase | Every transaction | Push + SMS |
| Birthday | DOB field in profile | Email + SMS + WhatsApp |
| Tier Upgrade | Threshold crossed | SMS + Push + Email |
| Points Expiry | N days before expiry | SMS + Email |
| Win-Back | X days since last transaction | Email + SMS |
| Redemption Confirmation | Redemption complete | SMS + Push |
| Tier Downgrade Warning | Approaching review date | Email + SMS |

---

## Member Journey Flow Diagram

**Required in every BRD (Section 12 — MANDATORY)**

Generate via Python + Pillow:
- Shows: Registration → Points Earn → Tier Upgrade → Redemption → Communication touchpoints
- Full-width image inserted into BRD document
- Nodes: Registration, Earn, Tier (Silver/Gold/Platinum), Redemption types, Communication channels
- Arrows show flow direction; labels show triggers and conditions

---

## Scope of Customers — Templates by Vertical

Always define customer types in BRD Scope section:

| Vertical | Customer Types |
|---------|---------------|
| **Retail** | Offline Customers (stores) + Online Customers (website) |
| **F&B** | Dine-In + Take Away + Delivery + Online (app) + 3P delivery (Grab / Gojek / Shopee) |
| **Fashion** | Offline Customers (stores) + Online Customers (web/app) + Associates (staff) |
| **Finance/Fintech** | Guest Users + Registered Users + Premium Members + Special class (EIC/HIPMI) |
| **B2B/Industrial** | Contractors + Dealers + Distributors (barcode-based enrolment) |
