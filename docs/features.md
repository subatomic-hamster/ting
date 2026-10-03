# Ting: features (codeLinc 11, Path 1)

Oct 3, 2026 · @SD

This tab covers what Ting does. The tech stack and how a request flows are in 2 · System architecture, moving it onto AWS is in 3 · AWS migration, and the hour-by-hour schedule, demo and risks are in 4 · Build plan & demo.

## Summary and critique of the current plan

Ting is an employer-provided dental decision engine: it schedules procedures around the employee's real plan rules, picks the right plan and FSA amount at open enrollment, and keeps itself up to date from claims and receipts. Other teams will ship a chat window plus a cost estimate. We ship decisions, each one computed by tested code and verified against the plan document.

**Positioning in one line:** "The AI translates, tested code decides, and the employee gets decisions, not a chatbot."

The team's feature list is the right direction. Five parts need to change before they cost us the win:

1. **Don't read employees' inboxes.** Scanning a corporate or personal mailbox for dental invoices is the largest privacy liability in the plan, and Google requires a third-party security assessment for restricted Gmail scopes. Lincoln is the carrier, so it already holds every claim and Explanation of Benefits (EOB). Use a simulated Lincoln claims feed as the primary source and a per-user forwarding address for receipts as the backup (details in the next section).
2. **Employer sign-in, carrier-held data.** Single sign-on with company credentials is right. Under HIPAA, though, the employer must never see an individual's dental data. Identity comes from the employer; the data lives with Lincoln; the employer only sees de-identified aggregates.
3. **Don't recommend competitors' plans.** Naming another insurer's product in front of five Lincoln judges hurts us, and recommending specific insurance products can require a producer license. Compare honest alternative categories instead: waive and self-pay, a dentist's in-office membership plan, a spouse's plan.
4. **No long upfront quiz.** Long onboarding quizzes lose users, and lifestyle answers (smoking, teeth grinding) are health information. Ask three questions at onboarding and the rest only when an answer would change a recommendation, always saying why.
5. **Scope.** The full list is weeks of work. This spec marks every feature as real, simulated or roadmap. The demo shows the real core plus clearly labelled simulated integrations.

Keep the differentiators from earlier rounds: the FSA timing layer, the "maybe" procedure slider with its tipping point, the Enrollment Card, and Automated Reasoning verification badges.

## Replacing inbox access: how data gets in

Ting never connects to anyone's mailbox. Data arrives through three channels, ranked by how trustworthy and how effortless they are. First, Lincoln's own claims data, which covers most visits with no user effort. Second, a private forwarding address for the few emails Lincoln can't see. Third, upload or camera for everything else. All three feed one ingestion workflow and one ledger.

&#91;embedded content: data intake · 3 channels, 1 ledger\]

Low-confidence items never update the ledger silently; the user confirms them first.

**Why inbox reading is the wrong design**

|  | Read the inbox (OAuth) | Ting's three channels |
| --- | --- | --- |
| What it collects | Everything: medical bills, therapy receipts, family email | Only the claims and documents the user sends |
| HIPAA minimum necessary | Fails: collects unrelated health information | Meets it |
| Employer in the data path | Corporate mailboxes need the employer's IT admin consent, which breaks the employer firewall | Never |
| Approval to ship | Gmail's restricted scopes need Google verification plus a yearly third-party security assessment | None beyond Lincoln's own review |
| Reliability | Thousands of invoice formats, lots of noise | The EOB is structured; uploads are deliberate |
| Attack surface | Any stranger's email reaches the AI | Only approved senders reach it |
| User trust | "My employer's app reads my email" | "I send it what I choose" |

### Channel 1: Lincoln claims feed (primary, automatic)

An in-network dentist usually files the claim directly with Lincoln. Lincoln adjudicates it and produces the EOB data: date of service, procedure code, tooth, billed amount, allowed amount, plan paid, member owes, and max remaining. That data exists in Lincoln's systems days before any paper or email EOB reaches the employee. Lincoln's existing dental app already shows members what was covered and what they owe, so the data clearly exists in usable form.

- **Production:** Lincoln's claims platform publishes a "claim adjudicated" event. Ting subscribes on behalf of members who consented at first sign-in. The event lands on an EventBridge bus, a Lambda function writes it to the ledger, and the optimizer reruns. Lincoln's privacy team confirms the legal basis; this is the carrier using its own claims data to serve its own member.
- **Bonus, pre-treatment estimates:** the same feed carries predetermination results, so before a big procedure the plan's exact payment replaces our estimate. The waterfall changes its label from "estimate" to "Lincoln confirmed".
- **Demo:** a teammate calls `POST /mock/claims` with a seeded EOB. The dashboard updates over the WebSocket within about 2 seconds, on stage.

Example event, the same shape for mock and production:

```json
{
  "type": "claim.adjudicated",
  "member": "tok_7f3k2",
  "claimId": "C-2026-10-0412",
  "serviceDate": "2026-10-14",
  "provider": { "npi": "demo-0042", "inNetwork": true },
  "lines": [
    { "cdt": "D3330", "tooth": 19, "billed": 1180, "allowed": 1000, "planPaid": 800, "memberOwes": 200 }
  ],
  "annualMaxRemaining": 400,
  "rulesVersion": "PLAN-ACME-v3"
}
```

### Channel 2: private forwarding address (for what Lincoln can't see)

Lincoln never sees some things: an out-of-network dentist's invoice the member pays and files themselves, the dentist's actual bill, FSA receipts, a spouse's plan EOBs, or a treatment plan the dentist emails over.

1. Each member gets a random, unguessable address such as `u-7f3k2@in.ting.app`. It's shown in the app and can be rotated at any time.
2. The member forwards a single email, or sets a filter in their own mail client (for example, mail from their dentist's billing address goes to that address). This is their choice and revocable at any time, with no OAuth.
3. SES receives the mail for the domain and writes it, encrypted, to S3.
4. A Lambda function checks that SPF, DKIM and DMARC pass and that the sender is either the member's own email address or a dentist address the member has approved. Mail from an unknown sender is held, and the app asks: "We got an email from billing@smiledental.com. Add it to your account?"
5. Only PDF and image attachments plus the body text are kept. The raw email is deleted after extraction.
6. The Step Functions workflow classifies, extracts with Textract, and links the document to the ledger.

One practical detail: Gmail asks the receiving address to confirm before an automatic forwarding filter works. Ting catches that confirmation email and shows the code in the app, so setup is one tap.

**Demo cost:** a verified domain and an MX record in Route 53, roughly 30–60 minutes including DNS. That's why it's P2. Upload covers the same need if time runs out.

### Channel 3: upload or camera

Drag and drop on desktop, camera on a phone, both through a short-lived presigned S3 upload. On Android, the installed web app can also appear in the share menu, so a PDF opened in the mail app goes to Ting in one tap. iPhone's Safari doesn't support that, so it uses upload.

### Reconciliation: one visit, up to three records

The same visit can arrive as Lincoln's EOB, the dentist's forwarded invoice and an FSA receipt. Records are matched on member, provider, date of service (within 3 days) and amount. The EOB is the source of truth for what the plan paid. The invoice adds what the dentist actually billed. Duplicates are linked, never double-counted.

This matching produces a consumer-protection check no other team will have. An in-network dentist agrees to accept Lincoln's allowed fee, so an invoice that asks for more than the EOB's "member owes" gets flagged: "Your bill asks for $412, but Lincoln's EOB says you owe $288. In-network dentists agree to accept Lincoln's allowed fee. Ask the office for a corrected bill."

## Scope: real, simulated, roadmap

P0 features carry the demo and are never cut. Simulated means working code against seeded data, labelled "demo data" on screen. Judges forgive simulation; they don't forgive being misled.

| Feature | Priority | In the demo | Notes |
| --- | --- | --- | --- |
| F1 Scheduling engine + optimizer | P0 | Real | Deterministic TypeScript, unit-tested, runs in the browser and in Lambda |
| F1 Explanations + waterfall chart | P0 | Real | Bedrock writes the words; every number comes from the engine |
| F2 Text, voice and photo intake | P0 | Real | Typed text, browser speech-to-text, Textract on a treatment-plan photo |
| F2 Plan document compiler | P0 | Real | Bedrock reads a Lincoln benefits summary PDF and outputs rules JSON the user confirms |
| F4 Plan comparison + FSA + "maybe" tipping point | P0 | Real | Same engine, more variables |
| F4 Enrollment Card | P0 | Real | The single output that sums up every decision |
| F3 Employer sign-in | P1 | Real | Cognito federated to a mock "Acme Corp" identity provider |
| F6 Lincoln claims feed (auto-update after a procedure) | P1 | Simulated | Mock claims API emits a seeded EOB, and the dashboard updates live |
| F6 Notifications (weekly or monthly digest + deadline alerts) | P1 | Real | EventBridge Scheduler, then Lambda, then SES email; one fires on stage |
| Verification badges (Automated Reasoning) | P1 | Real | Start the policy build in hour one; drop it if the account blocks it |
| F8 Winnow decision layer | P1 | Real if a GPU instance or a 24 GB Mac is available | Self-hosted Winnow-12B; falls back to Claude with an always-ask policy |
| F5 Provider finder, in vs out of network | P1 | Simulated | Seeded Greensboro dentists, FAIR Health fees collected by hand |
| F2 Receipt forwarding address | P2 | Real if a domain is ready | SES inbound needs a verified domain and MX record; otherwise use "upload a receipt" |
| F7 EOB check + appeal draft | P2 | Real on seeded data | Compares each EOB to our estimate and flags mismatches |
| F7 Employer insights (aggregate only) | P2 | Simulated | De-identified counts, minimum group size 20 |
| Real Lincoln claims and provider directory APIs | Roadmap | No | Needs Lincoln integration and a Business Associate Agreement (BAA) |
| Gmail or Outlook inbox reading | Roadmap, discouraged | No | Privacy cost is higher than the claims feed's benefit |

## Users, roles and sign-in

Employees sign in with company credentials, but their dental data is held by Lincoln as the carrier and never reaches the employer. That split is the HIPAA story in one sentence. A group health plan may give the employer only summary or de-identified information, except for limited plan administration, and never for employment decisions.

| Role | Signs in with | Sees | Never sees |
| --- | --- | --- | --- |
| Employee (member) | Employer single sign-on, federated through Cognito | Own plan, usage, schedule, claims, recommendations | Anyone else's data |
| Dependent (roadmap) | Managed by the employee; adults 18+ get their own consent | Own record | The employee's record |
| Employer benefits admin | Employer single sign-on, admin group | De-identified totals, groups of 20 or more only | Any individual's procedures, claims or profile |
| Lincoln plan analyst | Lincoln workforce sign-on (demo: Cognito admin group) | Compiled plan rules awaiting approval, audit log | Member data unless a support case is opened and logged |
| Dentist's office | No account; a signed, expiring share link | The one treatment summary the employee chose to share | Everything else |

**How sign-in works**

- Cognito user pool with SAML 2.0 or OIDC federation to the employer's identity provider (Okta, Microsoft Entra ID). For the demo, a second Cognito pool plays "Acme Corp".
- The identity provider passes employer ID and employee ID. A mapping table turns them into a Lincoln group policy number, so the right plan loads with no typing.
- Cognito groups (`member`, `employer_admin`, `lincoln_analyst`) drive authorization in API Gateway and in every Lambda.
- Short-lived tokens (1 hour access, refresh revoked on sign-out). Step-up MFA before exporting records or sharing with a dentist.
- Consent screen at first sign-in: what Ting reads, what it never shares with the employer, and how to delete everything.

## F1 Core: plan-aware procedure scheduling

The engine finds the dates and payment sources that get the dentist's full treatment plan done for the least money, never past the dentist's deadline. Worked example: a root canal, buildup and two crowns quoted in October, with $300 of a $1,500 max already used. Doing all of it now costs $2,450; moving both crowns to early January costs $1,550, saving $900.

**Inputs**

- Plan rules from the plan compiler (F2): coinsurance by class (preventive / basic / major), deductible, annual max, waiting periods, frequency limits, the alternate-benefit rule for back-tooth fillings, and Lincoln features such as MaxRewards rollover, SmileRewards (preventive care doesn't count against the max) and Q4 deductible carryover.
- Usage ledger: paid to date this plan year, deductible met, last service date per procedure code and tooth.
- Procedures: procedure code (CDT), tooth number, fee in and out of network, dentist's deadline, and order dependencies (root canal before buildup before crown).
- Money: current FSA balance, the employer's carryover or grace-period rule, next year's planned FSA election, and the user's marginal tax rate.
- "Maybe" procedures with a likelihood the user sets (0–100%).

**Adjudicator.** It processes claims in date order, exactly as the carrier would. For each claim:

```latex
\text{plan pays} = \min\big((\text{allowed fee} - \text{deductible applied}) \times \text{coinsurance},\ \text{max remaining}\big)
```

Then it applies frequency limits and waiting periods (both deny the claim), the alternate-benefit downgrade, and the year-end MaxRewards check: if this year's paid claims stay under the threshold, the rollover is added to next year's max.

**Two Lincoln date rules the engine must get right** (from [Lincoln's dental product flier](https://www.lincolnfinancial.com/pbl-static/pdf/GP-IP---what-we-offer---callout5---flier-PDF.pdf); confirm against the sample plan):

- **Work-in-progress rule.** Lincoln becomes liable for a crown or bridge on the day the tooth is prepared, not the day it's seated. A crown prepared Dec 28 and seated Jan 9 counts in the old year, so "crown in January" means the preparation appointment must be on or after Jan 1.
- **Rollover timing.** MaxRewards rollover amounts are deposited on day 65 of the following year (early March). A January procedure can't use them. Anything that depends on the rollover is scheduled from day 65 on.

**Optimizer**

1. Each procedure can land in this plan year, next year or the year after, but never past its deadline. Dependencies fix the order inside a year.
2. Each placed procedure goes on its earliest valid date in that year, and is paid from that year's FSA first, then out of pocket.
3. Exhaustive search: 12 procedures × 3 years is about 531,000 combinations, a few milliseconds in the browser. No solver library.
4. Objective: lowest expected after-tax out-of-pocket cost, with "maybe" items weighted by their likelihood. Ties go to the earlier finish date.
5. Output three plans: Cheapest, Fastest, Balanced. They are the trade-off curve between money saved and weeks of delay.

**Explanations.** Every line on the waterfall chart (fee → network discount → deductible → coinsurance → max cap → you pay) gets one plain sentence citing the plan section, written by Bedrock from the engine's numbers. Before display, the sentence passes the Automated Reasoning check and gets a Verified badge.

**Safety rules (non-negotiable)**

- Only the dentist sets deadlines. An item marked urgent is locked and can't be moved.
- The app never suggests skipping care, only reordering it within the dentist's window.
- Every proposed delay produces a question for the dentist ("Can the crown on #19 safely wait until Jan 6?").

**Acceptance criteria**

- [ ] Engine matches hand-calculated results on 10 unit tests built from the sample plan PDF
- [ ] Dragging a procedure across Dec 31 updates the total in under 100 ms
- [ ] Locked items can't be dragged past their deadline
- [ ] Every dollar figure on screen traces back to an engine output, never to model text

## F2 Multimodal intake and document ingestion

Every input, whatever the channel, ends up as the same structured record (procedure code, tooth, date, fee, source, confidence), so the engine never knows or cares where data came from. Anything below 85% confidence becomes a one-tap confirmation card, never a silent guess.

| Channel | What it captures | How | On AWS (after migration) |
| --- | --- | --- | --- |
| Typed description | "Crown on a lower back molar and a deep cleaning" | Maps to procedure codes D2740 and D4341, tooth #19 or #30, then asks only questions that change the cost | Bedrock (Claude Haiku or Nova Lite) |
| Voice | The same, spoken | Browser speech-to-text; Transcribe streaming as fallback | Amazon Transcribe |
| Treatment plan photo | Dentist's printout: codes, teeth, fees | Table extraction, then the model cleans and validates codes | Textract AnalyzeDocument (Tables) + Bedrock |
| Insurance card photo | Group and member numbers | Pulls out the group number, then loads the right plan automatically | Textract Queries |
| Plan document PDF | Benefits summary or certificate | Plan compiler produces rules JSON; the user confirms; the same PDF builds the Automated Reasoning policy | Bedrock + Guardrails |
| Lincoln claims feed (simulated) | EOB per claim | Event arrives; ledger updates; dashboard refreshes live | API Gateway + EventBridge |
| Receipt forwarding (P2) | Dentist invoices, mainly out of network | Per-user address such as `u-7f3k@in.ting.app` | SES inbound to S3 |
| Receipt upload | Same, without email | Drag-and-drop or phone camera | S3 presigned upload |

**Plan compiler.** Bedrock Claude reads the PDF and returns JSON that must pass a strict schema: classes, percentages, deductible, max, waiting periods, frequency limits, rollover terms. A missing field becomes a question ("Is endodontics basic or major on your plan?"), never a default. The user, or in production a Lincoln analyst, approves the rules. Each approved version is stored with a hash, so every estimate can name the rules version it used.

**Ingestion pipeline (one Step Functions workflow for every document)**

1. File lands in the encrypted documents bucket.
2. Classify: EOB, invoice, treatment plan, plan document or unknown. Unknown files are quarantined and the user is asked about them.
3. Extract fields with Textract, then normalize them with Bedrock.
4. Match against the ledger: same provider, date and amount links an invoice to its EOB, so nothing is counted twice. A content hash stops duplicate uploads.
5. Update DynamoDB and push the change to the open dashboard over a WebSocket.
6. If confidence is below 85%, show a confirmation card instead: "Is this $1,284 invoice your crown on Jan 6?"

**Why forwarding, not inbox access.** The user decides exactly which emails Ting sees. Sender authentication (SPF and DKIM) is checked. Only PDF and image attachments are accepted. The raw email is deleted after extraction.

## F3 Onboarding and lifestyle profile

Onboarding takes under 60 seconds and three questions. After that, Ting asks a profile question only when the answer could change a recommendation. That rule is the feature: "we only ask if your answer can change your decision."

**First-run (three questions; the plan is already loaded from sign-in)**

1. Has your dentist recommended or mentioned any work? (Type, speak, or photograph the treatment plan.)
2. When was your last cleaning? (Drives frequency limits and the first reminder.)
3. Who's on your dental plan? (Per-person maximums and deductibles.)

**Value-of-information questions.** Before asking anything, the engine reruns the recommendation once with each possible answer. If no answer would flip the plan choice, the schedule or the FSA amount, the question isn't asked. This keeps the profile short, and the reason shown under each question ("this decides whether the High plan pays for itself") is always true.

| Signal | Example question | Changes | Sensitivity |
| --- | --- | --- | --- |
| Past years vs the max | "Did you hit your dental max in the last two years?" (pre-filled from claims when available) | Plan size recommendation | Medium |
| Dentist's "maybe" items | "Your dentist said 'watch' tooth #3. How likely is work this year?" | Expected cost, tipping point | Health information |
| Children and orthodontics | "Any braces likely in the next 3 years?" | Orthodontic lifetime max, plan choice | Health information |
| Teeth grinding | "Has a dentist suggested a night guard?" | Coverage of night guards, if the plan covers them | Health information |
| Tobacco use | "Do you use tobacco?" (optional) | Likelihood of gum treatment | Health information |
| Dentist loyalty | "Would you switch dentists to save $300+?" | In-network vs out-of-network recommendation | Low |
| Budget comfort | "What's comfortable per month for dental costs?" | Payment timing, FSA amount | Financial |
| Sedation preference | "Do you usually need sedation?" | Cost estimate for procedures with sedation | Health information |

**Rules for profile data**

- Every question can be skipped. Skipping only widens the estimate range.
- Health-related answers are stored as protected health information (PHI), with the same encryption and audit as claims.
- The user can see, edit or delete each answer, and the screen shows which recommendations each one affected.
- The profile is never shared with the employer, and never used for anything except this user's recommendations.
- No inferred health conditions. Ting uses what the user says, not guesses about them.

**Profile output.** A "dental year" label (Light, Routine or Heavy) with its expected cost range. Plan comparison (F4) and the notification digest (F6) both use it.

## F4 Plan comparison and recommendations

Ting recommends the option with the lowest expected total cost for this person's coming year, and shows the bad-year cost beside it. Total cost means premiums plus out-of-pocket costs, after tax. The result is the Enrollment Card: plan choice, FSA amount and procedure dates in one view.

**Options compared side by side**

- Every dental option the employer offers through Lincoln (for example Low, High, in-network only), loaded automatically from the group number.
- The employee's other coverage, if any (a spouse's plan, entered by uploading its summary). Dual coverage runs through coordination of benefits: primary plan first, secondary second, under either the standard or the non-duplication rule (P2).
- Waive coverage and pay out of pocket.
- A dentist's in-office membership plan, if the user's dentist offers one (the user enters the price).

Alternatives are categories with the user's own numbers. Ting never names or recommends another insurer's product: that keeps it on the right side of insurance-producer licensing and in Lincoln's interest.

**Recommendation rules**

| Signal | Rule | What the user sees |
| --- | --- | --- |
| Hit the max in a past year | Weigh options with a higher max | "You ran out in 2025. High's $2,000 max would have covered $640 more." |
| Used under 20% of the max two years running | Consider the lower option | "You've used $180 a year. Low saves $180 in premiums." |
| Large work planned next year | Score each option on that work, including any waiting period a new plan imposes on major services | "High pays more for the crown, but its 12-month waiting period means it won't cover it until 2028." |
| "Maybe" procedures | Expected cost weighted by the user's likelihood; show the tipping point | "Above an 18% chance of the root canal, High pays for itself." |
| Small, predictable year | Lowest premium that still covers preventive care at 100% | "Two cleanings and X-rays: Low is enough." |
| Out-of-network dentist | Price both the plan's payment and the dentist's balance bill | "Staying with Dr. Lee costs $310 more a year than an in-network dentist." |

The waiting-period rule is the one most likely to impress a Lincoln judge. Upgrading plans to cover a big procedure only works if the new plan covers it right away, and many don't.

**FSA amount.** The recommended election covers the certain costs plus each "maybe" cost times its likelihood, and is capped at the IRS limit. For 2026 that limit is $3,400, with at most $680 carrying over into 2027 ([Mercer, IRS Rev. Proc. 2025-32](https://www.mercer.com/en-us/insights/law-and-policy/2026-health-fsa-other-health-and-fringe-benefit-limits-now-set/)). The 2027 figures are set each October; load them before demo day. A plan may offer a carryover or a grace period, never both, so the employer's rule is a setting. A health FSA's full election is available on the first day of the plan year, which is why a January crown can be paid entirely pre-tax.

**The Enrollment Card** (the headline output)

> Your November decisions: choose **High** · elect **$650** FSA · cleaning + root canal **before Dec 31** (2026 FSA) · crown **Jan 6** (2027 FSA) · expected savings **$730**

Each item opens to its reason, its waterfall and its Verified badge. Buttons: add to calendar, share with my dentist, remind me on enrollment day.

**Wording rule.** Every result is labelled "educational estimate — not insurance or tax advice". Every dollar figure comes from the engine.

## F5 Provider finder: in network vs out of network

For each procedure, the finder shows the user's own cost at nearby in-network and out-of-network dentists. The out-of-network column includes the balance bill most people miss: the plan pays its share of a usual-and-customary (U&C) fee, and the dentist can bill the rest. Lincoln plans set out-of-network reimbursement at the 50th, 70th, 80th, 90th or 95th percentile of U&C, or at a maximum allowable charge (MAC), per [Lincoln's dental product flier](https://www.lincolnfinancial.com/pbl-static/pdf/GP-IP---what-we-offer---callout5---flier-PDF.pdf). The compiled plan rules say which.

**How the cost per dentist is computed**

- In network: the contracted fee, then the engine (deductible, coinsurance, max). The demo uses FAIR Health's in-network estimate for ZIP 27401 as a stand-in for the contracted fee.
- Out of network: the plan pays coinsurance × the U&C allowance (FAIR Health percentile); the user pays the dentist's full fee minus that.
- The result per dentist: you pay $X, the plan pays $Y, the balance bill is $Z, plus the distance.

**Screens**

- Map and list (Amazon Location Service). The sort order is "your cost for this treatment plan", not distance.
- "Keep my dentist" toggle: shows the yearly cost of staying with the user's current out-of-network dentist, with no pressure to switch.
- Per-procedure comparison: the waterfall chart for in network next to out of network.

**Data reality (say this on stage, don't hide it)**

| Data | Demo | Production |
| --- | --- | --- |
| Which dentists are in network | 12 seeded Greensboro practices, labelled "demo data" | Lincoln DentalConnect provider directory |
| Contracted fees | FAIR Health in-network estimates, collected by hand for about 15 codes | Lincoln's negotiated fee schedule |
| Out-of-network allowance | FAIR Health percentiles | Lincoln's U&C table for the plan's percentile |
| Dentist's billed fee | From the user's treatment plan | Same |

Lincoln already offers a dental mobile app for finding in-network providers, tracking claims and seeing what's owed, according to the same flier. Pitch Ting as the decision layer that plugs into that app, not as a competitor to it.

## F6 Live dashboard, automatic updates and notifications

When a claim or invoice arrives, Ting updates the ledger, reruns the optimizer, and tells the user only if something they should do has changed. The demo shows this live: a simulated Lincoln EOB arrives on stage and the max gauge and schedule move by themselves.

**Dashboard (one screen, per covered person)**

- Annual max gauge: used, scheduled, remaining, plus the rollover account balance if the plan has one.
- Deductible status and the Q4 carryover window.
- FSA balance with a countdown to the forfeit date (Dec 31, or the end of the grace period).
- Treatment timeline: done, scheduled, "maybe", with locked items marked.
- Activity feed: claims, invoices, plan changes, each linked to its source document.
- "Left on the table" banner: unused covered cleanings, remaining max, expiring FSA dollars.
- During open enrollment, the Enrollment Card sits at the top.

**What happens when a claim arrives**

1. The Lincoln claims feed (simulated) emits an EOB event to EventBridge.
2. A Lambda function matches it to the scheduled procedure and any invoice already on file.
3. The ledger updates: paid amount, max used, deductible.
4. The optimizer reruns. If the best schedule changed, the user gets the difference ("The plan paid $90 less than estimated, so the crown now fits in this year's max").
5. The open dashboard updates over a WebSocket. Otherwise the change waits for the next digest, unless it's urgent.
6. The EOB is compared with Ting's estimate. A mismatch over $25 triggers the EOB check (F7).

**Notifications**

| Type | Trigger | Default timing |
| --- | --- | --- |
| Digest | Schedule the user picks: weekly, monthly or off | Monthly, first Monday |
| FSA deadline | Balance over $0 and a forfeit date coming | 60, 30 and 10 days before |
| Use-it-or-lose-it | Covered cleaning unused, or max remaining after Nov 1 | Nov 1 and Dec 1 |
| Claim processed | EOB event | Immediately, in-app; email only if the user opts in |
| EOB mismatch | Paid amount differs from estimate by over $25 | Immediately |
| Open enrollment | Employer's enrollment window opens | First day of the window |
| Waiting period ends | A major-service waiting period is over | On the day |
| Rollover deposited | Day 65 of the plan year | On the day, if anything is scheduled against it |

**Privacy-safe by default.** Email and text messages say "You have a dental benefits update" and link to sign-in. Procedure names, amounts and teeth appear only inside the app. A user can switch on detailed emails, with a warning. Channels: SES email, browser push, and SMS through AWS End User Messaging (opt-in only). Not Amazon Pinpoint: AWS ends support for it on October 30, 2026.

**On AWS (after migration).** EventBridge Scheduler holds one recurring schedule per user for the digest, plus one-time schedules for each deadline. Each schedule triggers a Lambda function. The engine computes the numbers, Bedrock writes the summary, and SES sends it. Preferences (cadence, channels, quiet hours, detail level) live in DynamoDB.

## F7 Extra differentiators beyond the team's list

The three marked P1 add the most per hour: verified explanations with a visible agent trace, the dentist handoff, and the judges trying the app on their own phones. Everything else is P2, ordered by value.

| Feature | Why it beats the field | Effort | Priority |
| --- | --- | --- | --- |
| Verified explanations + "Show your work" panel | Each sentence carries an Automated Reasoning badge. A side panel streams the agent's tool calls (map → fee → adjudicate → optimize → verify) and doubles as the audit log | 3 h | P1 |
| Dentist handoff + pre-treatment estimate request | A signed, expiring link with codes, sequence and three questions ("Can #19 wait until Jan 6?", "Please submit a pre-treatment estimate", "Are you in network?"). The app takes the next step and the dentist stays in charge | 1.5 h | P1 |
| Judges try it live | QR code on the title slide opens the hosted app with a seeded account. Judges drag the crown across Dec 31 on their own phones | 0.5 h | P1 |
| Prep-date booking assistant | Applies the work-in-progress rule: "Book the crown *preparation* on or after Jan 2," with an .ics calendar invite | 1 h | P2 |
| EOB check + "something looks off" message | Flags a frequency denial on a plan that allows two cleanings per calendar year, a deductible applied twice, or a wrong service class. Drafts a message to Lincoln citing the plan section | 2 h | P2 |
| Plain-language and Spanish modes | Tone and language change, numbers never do. Lincoln's own DentalConnect health center site is also offered in Spanish ([flier](https://www.lincolnfinancial.com/pbl-static/pdf/GP-IP---what-we-offer---callout5---flier-PDF.pdf)). Verify the English sentence first, then translate | 1 h | P2 |
| Measured accuracy scorecard | Intake tested on 30 written descriptions, engine on 10 plan tests. Show the percentage on the architecture slide | 1.5 h | P2 |
| Works offline | The engine runs in the browser, so estimates and the optimizer still work with no network. Shown by switching Wi-Fi off on stage | 1 h | P2 |
| Family optimizer | Per-person maxes and the family deductible: whose procedure goes in which year | 3 h | P2, roadmap if behind |
| Employer insights (aggregate only) | "41% of employees have $1,000+ of max left" with a send-reminder-campaign button. Groups under 20 are hidden | 3 h | P2 |

**Don't build:** gamification (0 for 3 at codeLinc 10), a free-form chatbot as the main screen, or reading inboxes.

## F8 Winnow decision layer (Technical Innovation bet)

Ting runs Winnow-12B, a self-hosted decision model, for every moment where the app has to guess: which procedure, which document, which invoice matches which claim, whether an alert is worth sending. Winnow answers with a probability, and the engine prices each possible answer, so Ting asks the user only when a wrong guess would cost real money. Claude still writes every sentence; Winnow never produces text and never computes a dollar.

**What Winnow is.** [Winnow-12B](https://huggingface.co/EldanRing/Winnow-12B) is an Apache-2.0 fine-tune of Google's Gemma 4 12B, built for typed decisions. Its [llama.cpp-based server](https://github.com/EldanRing/winnow-inference) answers yes/no (`noul`), multiple-choice (`choice`) and graded-scale (`score`) questions against one shared input, and can read images with its vision projector. On the 231-item public JevBench subset, the Q8 build scored 85.7%, the same as the hosted Jev model it imitates. One request carries 1–256 questions and returns a probability for every answer ([API docs](https://github.com/EldanRing/winnow-inference/blob/main/docs/API.md)).

### Core use: ask only when a wrong guess costs money

The engine reruns the bill under every possible answer to a question. Winnow says how likely each answer is. Multiplying the two gives the expected cost of simply guessing:

```latex
\text{expected cost of guessing} = \sum_{a \neq \hat a} p(a)\,\big|\,\text{owe}(a) - \text{owe}(\hat a)\,\big|
```

Here â is Winnow's top answer. Above the threshold ($25 by default), Ting shows a one-tap question with the top answer preselected. Below it, Ting accepts the answer and marks it "inferred". This replaces the fixed 85% confidence rule in F2 and puts real probabilities behind the F3 rule of only asking questions that change a decision.

Example intake: "crown on a back tooth, I think it's replacing the old one", plus a treatment-plan photo. One Winnow request asks:

| Question | Type | Winnow | Cost if the guess is wrong | Ting does |
| --- | --- | --- | --- | --- |
| Which procedure? | choice among the candidate crown codes | 92% porcelain crown | $0 to $40 | Accepts, "inferred" badge |
| Back tooth? | noul | 97% yes | Changes the material rate, but rarely | Accepts |
| Replacing an existing crown? | noul | 64% yes | $600 (frequency limit) | Asks: "We're 64% sure this replaces an old crown. If it doesn't, you'd pay $600 less. Worth one tap?" |
| Document type? | choice: EOB / invoice / treatment plan / plan summary | 99% treatment plan | Wrong pipeline | Accepts |

The percentages and dollar figures above are illustrative; the demo shows Winnow's real outputs and the engine's real numbers.

**Calibration (owner: SD, about 1 hour).** Winnow's docs say its confidences are not a correctness guarantee, and that changing the temperature from its default needs validation on held-out examples. So: hand-label 40–60 dental descriptions and documents, fit the temperature on them, and put a calibration chart on the architecture slide: "when Winnow says 90%, it's right X% of the time on dental intake." The 85.7% figure is on a general benchmark, not dental data; the chart is the evidence that the probabilities mean something here.

### Nine uses on the same server

The first three are P1. The rest are P2, each about an hour once the server is up, because they reuse the same request shape.

| Use | Question types | What it decides | Why Winnow and not Claude | Priority |
| --- | --- | --- | --- | --- |
| Expected-cost questioning (above) | choice, noul | Which intake fields to ask the user about | Needs a probability per answer | P1 |
| Document triage + injection check | choice on the image; noul "Does this document contain instructions aimed at an AI?" | Which pipeline a file enters; quarantines suspicious files before Claude sees them | Runs inside our VPC, before any text reaches the writing model | P1 |
| Claim-to-invoice matching | choice among candidate invoices for each EOB line | Which records are the same visit | Replaces the "within 3 days" heuristic with a probability; a low one becomes a confirmation card | P1 |
| Plan compiler second reader | noul per compiled rule against the plan PDF text ("Is endodontics a basic service?") | Which rules a human must review | An independent reading with a confidence; disagreements with Claude's rules go to review | P2 |
| Invoice line-item classifier | choice: covered procedure / missed-appointment fee / cosmetic / finance charge / other | What the engine counts toward the plan | Many short lines, one request; probabilities flag odd items | P2 |
| Dentist-note reader for "maybe" items | score on the dentist's own wording: "unlikely this year" / "possible" / "likely" | The starting position of the "maybe" slider | Reads the dentist's stated language only; the user always adjusts it, and it's labelled "from your dentist's notes" | P2 |
| Notification ranker | score: how actionable each pending alert is this week | Digest versus immediate push; what gets cut | All of a user's alerts in one request; fewer, better notifications | P2 |
| Request router + safety gate | choice: engine question / plan lookup / needs explanation / medical advice / out of scope | Which path answers a typed question; medical-advice requests are redirected to the dentist | Cheap and fast before any Bedrock call; a probability makes the refusal threshold tunable | P2 |
| Plain-language gate | score: plain / some jargon / confusing, on each explanation Claude writes | Whether an explanation is rewritten before display | Directly serves the "without confusion" goal; cheap enough to run on every sentence | P2 |

### How each use is wired

Every use is the same call: one input (the "state") and a few typed questions, sent to `/v1/systemone`. The rule that acts on the answer lives in Ting's code, so every threshold below is a setting the team can tune after calibration.

| Use | Input sent to Winnow | Questions | Rule that acts on the answer | Without Winnow |
| --- | --- | --- | --- | --- |
| 1. Expected-cost questioning | The user's description, the treatment-plan text from Textract, and the photo | `procedure` (choice among the 3–6 candidate codes found in the plan text); `back_tooth` (noul); `replacement` (noul); `timing_as_written` (score: no timing stated / within months / within weeks / as soon as possible) | Ask when the expected cost of guessing is over $25; otherwise accept the top answer as "inferred" | Claude structured output; every uncertain field is asked |
| 2. Document triage + injection check | The uploaded image (or its first page) | `doc_type` (choice: EOB / invoice / treatment plan / plan summary / insurance card / other); `ai_instructions` (noul) | Top type at 0.8 or higher goes to that pipeline, otherwise ask "What is this?". `ai_instructions` at 0.5 or higher: quarantine, never sent to Claude | Claude classifies; injection defense is Guardrails only |
| 3. Claim-to-invoice matching | One EOB line plus up to 5 candidate invoices (date, provider, amount, codes) | `match` (choice: invoice A–E, or none of these) | 0.9 or higher: link. 0.5 to 0.9: confirmation card. Below 0.5: leave unlinked | The "within 3 days" rule |
| 4. Plan compiler second reader | The plan PDF text (it fits the 64K context) | One noul per compiled rule, e.g. "Does the plan state endodontics is a basic service?" | Any rule under 0.7 is flagged for human review before the rules version can be approved | A human reviews every rule |
| 5. Invoice line-item classifier | One invoice's line items | Per line, `category` (choice: covered dental procedure / missed-appointment fee / cosmetic / finance or late charge / other) | Only covered procedures go to the engine; low-confidence lines are shown to the user | Claude classifies; every line is shown |
| 6. Dentist-note reader | The dentist's note for one tooth | `likelihood_as_written` (score: unlikely this year / possible / likely) | The expected value sets where the "maybe" slider starts (about 15% / 50% / 80%), labelled "from your dentist's notes"; the user adjusts it | The slider starts at 50% |
| 7. Notification ranker | The user's dashboard state plus every pending alert | Per alert, `actionable` (score: informational / useful this month / act this week) | Push only "act this week" at 0.6 or higher, at most 2 pushes a week; everything else goes to the digest | The fixed schedule in F6 |
| 8. Router + safety gate | The user's typed question | `intent` (choice: engine question / plan lookup / explanation / medical advice / out of scope) | Engine questions and plan lookups are answered without Claude. Medical advice at 0.3 or higher is redirected to the dentist. Low confidence goes to Claude | Every question goes to Claude |
| 9. Plain-language gate | One sentence Claude wrote | `clarity` (score: plain / some jargon / confusing) | An expected score above 1.0 triggers one rewrite by Claude, using the glossary | No check |

The medical-advice threshold in use 8 is deliberately low: a false alarm costs one redirect, while a miss means the app answers a clinical question it shouldn't.

**Example request (use 1).** Replace the temperature with the value fitted during calibration.

```json
{
  "model": "Winnow-12B",
  "state": {
    "description": "crown on a back tooth, I think it's replacing the old one",
    "plan_text": "#19 D2740 Crown porcelain/ceramic $1,200"
  },
  "questions": {
    "procedure": {
      "type": "choice",
      "instructions": "Which procedure is planned?",
      "criteria": {
        "D2740": "porcelain or ceramic crown",
        "D2750": "porcelain fused to metal crown",
        "D2950": "core buildup"
      }
    },
    "back_tooth": { "type": "noul", "instructions": "Is the tooth a back tooth (molar or premolar)?" },
    "replacement": { "type": "noul", "instructions": "Does the crown replace an existing crown on the same tooth?" }
  },
  "winnow": { "images": ["data:image/jpeg;base64,..."], "temperature": 1.0 }
}
```

**Rules for the decision layer**

- Winnow decides fields, never money. Every dollar still comes from the engine.
- Every Winnow-decided field shows its probability on hover, and the user can override it.
- Fallback when Winnow is unavailable: Claude with structured output and an "always ask" policy. Ting gets slower to use but stays correct.
- Hosting, security and the GPU quota are covered in the AWS migration tab (step 11).

**Acceptance criteria**

- [ ] One Winnow request answers every intake question for a treatment plan
- [ ] The "why we're asking" card shows the probability and the dollar difference from the engine
- [ ] A calibration chart from at least 40 labelled dental examples
- [ ] With Winnow switched off, Ting still completes the demo path through the fallback
