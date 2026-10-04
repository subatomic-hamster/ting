# Dental Benefits Optimizer rubric assessment

Reviewed **October 4, 2026**, after pulling `origin/main` through **`40fbd25`** (PRs #6 and #7). Rubric: Path 1, version 1, frozen September 30, 2026; content hash `256b4a76a41a201ae13c9402ae86689d27ba44d71f2c0313ec007efe16a2f18a`. This is an evidence-based self-assessment, **not an official judge score**.

## Where we stand: 73.225 / 100, conservative

The app has strong calculation tests, useful plan comparisons and a working offline submission. The biggest gaps are **privacy in production logs, verifying AI-extracted plan numbers, and actual insurer pricing data**. UI polish and working email improve the demo, but do not automatically satisfy these anchors.

| Dimension | Weight | Score / 4 | Weighted contribution |
| --- | ---: | ---: | ---: |
| Challenge fidelity | 30% | 2.68 | 20.100 / 30 |
| Engineering quality | 25% | 2.90 | 18.125 / 25 |
| Principles & standards | 20% | 2.00 | 10.000 / 20 |
| Runs | 15% | 4.00 provisional | 15.000 / 15 |
| Inventiveness | 10% | 4.00 | 10.000 / 10 |
| **Total** | **100%** | | **73.225 / 100** |

Formula: sum criterion scores × their within-dimension weights, divide by 4, multiply by the dimension weight. Precision reflects the formula, not confidence in predicting judges.

The previous estimate was **78.225**. This review lowers the computed-numbers criterion from 4 to 2 after reproducing an existing validation gap in the live plan compiler. **This corrects the assessment; it does not mean the latest remote changes introduced the defect.** If judges consider only the offline deterministic path and award that criterion 4, the total is **78.225**. Sequencing also falls between anchors: a level-3 award adds 1.5 points. Only the organizer's objective build probe determines Runs.

## What changed on remote

Merge `9132458` / PR #6 adds **Acme Dental Basic**, revises Low/High toward researched employer-plan patterns and updates sample benefits documents. Insurance choices now include a $750 Basic maximum, $1,500 Low maximum and $2,000 High maximum; High includes 50% orthodontic coverage with a $1,500 lifetime maximum. Premiums remain illustrative ([demo.ts:62](../src/data/demo.ts#L62), [demo.ts:89](../src/data/demo.ts#L89), [demo.ts:110](../src/data/demo.ts#L110), [demo.ts:146](../src/data/demo.ts#L146)). The comparison header now wraps on narrow screens ([ComparisonTable.tsx:29](../src/components/ComparisonTable.tsx#L29)).

Merge `40fbd25` / PR #7 arrived during this review and was also pulled. It adds employer-plan provenance beneath plan names ([demo.ts:155](../src/data/demo.ts#L155), [PlanCoverage.tsx:91](../src/components/PlanCoverage.tsx#L91)), updates **38 of 50 default fee entries** to Medicaid/ADA-ratio estimates, and adds a linked default-price caption ([AppShell.tsx:70](../src/components/AppShell.tsx#L70)). Twelve priced codes retain synthetic fees; the broader 137-code catalog also supports member-supplied quotes. This improves data traceability, but the in-network allowance is a scaled proxy, MAC is set to that proxy, and UCR percentiles are spreads around the estimated median, not observed insurer amounts ([cdt.ts:283](../src/engine/cdt.ts#L283), [demo-fees.json:2](../src/data/demo-fees.json#L2)). The lookup is exact against the table; that does not make its inputs observed rates.

These sample plans combine sources rather than reproduce an exact employer contract. High's rollover uses a nearby published maximum tier rather than a matched $2,000 table ([demo.ts:103](../src/data/demo.ts#L103)). The historical pricing audit/handoff predates PR #7; its statements that all defaults remain synthetic are now outdated. The research report explains the proposed methodology ([dental-pricing-and-plan-designs.md](dental-pricing-and-plan-designs.md)); this review verifies its implementation, not the accuracy of commercial prices derived from statewide ratios.

**Submission freshness issue:** `npm run docker:check` fails. These merges changed source/sample documents without refreshing `docker/site.tar` and its manifest. The committed JavaScript bundle does **not** contain “Acme Dental Basic.” The image still builds and runs, so this is not a demonstrated Runs failure, but judges executing it will see the earlier plans/PDF/prices. The manifest explicitly checks this condition ([prepare-container.mjs:30](../scripts/prepare-container.mjs#L30)). Refresh artifacts before submitting. This review did not regenerate them or deploy the pulled application changes.

## Challenge fidelity — 20.100 / 30

| Criterion | Internal weight | Score / 4 | Evidence and reason |
| --- | ---: | ---: | --- |
| Capture free text and all plan terms | 15% | **4** | Free text reaches intake ([IntakeBox.tsx:71](../src/components/IntakeBox.tsx#L71)). Maximum, deductible, both coinsurance maps, waiting periods and frequency rules are distinct fields ([schema.ts:71](../src/compiler/schema.ts#L71)); network status is distinct ([types.ts:135](../src/engine/types.ts#L135)). Reviewed rules become active ([PlanRules.tsx:116](../src/pages/PlanRules.tsx#L116)). Network/allowances and deductible/caps affect adjudication ([adjudicate.ts:344](../src/engine/adjudicate.ts#L344), [adjudicate.ts:513](../src/engine/adjudicate.ts#L513)); frequency/waiting terms affect placement ([schedule.ts:251](../src/engine/schedule.ts#L251)). All six categories feed logic. |
| Itemised costs tied to entered terms | 20% | **3** | Active rules produce paid/owed amounts ([adjudicate.ts:513](../src/engine/adjudicate.ts#L513)). The waterfall shows amounts, running totals, explanations, glossary terms and available rule references ([Waterfall.tsx:48](../src/components/Waterfall.tsx#L48)). However deductible wording always says “basic and major care,” even for uploaded plans with different applicability ([explain.ts:64](../src/engine/explain.ts#L64)). Optional section references do not ensure precise citations for every uploaded rule ([schema.ts:91](../src/compiler/schema.ts#L91)). |
| Multi-procedure sequencing with reasons | 20% | **2, conservative** | Search considers annual-year costs, deductible timing, frequency eligibility, waiting dates, dependencies and clinical deadlines ([schedule.ts:221](../src/engine/schedule.ts#L221), [schedule.ts:251](../src/engine/schedule.ts#L251), [engine.test.ts:99](../src/engine/engine.test.ts#L99)). The algorithm exceeds level 2, but level 3 requires a reason for **each** placement. Visible output mainly has global hints/dates ([ScheduleTabs.tsx:20](../src/components/ScheduleTabs.tsx#L20), [Timeline.tsx:87](../src/components/Timeline.tsx#L87)). Dentist questions establish clinical caution rather than individual deductible/maximum/frequency reasoning ([schedule.ts:356](../src/engine/schedule.ts#L356)). A judge could award 3; complete level 4 is not established. |
| Ground reference costs and label estimates | 15% | **2, partial** | Published clinic charges feed estimates with source/ZIP/date metadata ([ProcedureCatalog.tsx:92](../src/components/ProcedureCatalog.tsx#L92)); their limits are explicit ([ProcedureCatalog.tsx:157](../src/components/ProcedureCatalog.tsx#L157)). Results are labeled estimated ([Waterfall.tsx:37](../src/components/Waterfall.tsx#L37)). PR #7 wires 38 Medicaid-derived estimates with source labels, a real improvement ([cdt.ts:283](../src/engine/cdt.ts#L283), [demo-fees.json:2](../src/data/demo-fees.json#L2)). However 12 priced codes still use synthetic fees, broader catalog pricing requires quotes, and derived UCR/MAC values are not observed allowances. Clinic charges also cannot establish insurer rates. The general-set reference coverage required by level 3 is incomplete; this remains partial credit between anchors. |
| Knowns, estimates and limits | 12% | **2** | Missing-allowance warnings/full-fee budgets avoid invented insurer payment ([adjudicate.ts:375](../src/engine/adjudicate.ts#L375)). Provenance remains available ([PricingNote.tsx:8](../src/components/PricingNote.tsx#L8)). Generic footer/sample-account banners were removed at the user's request; no explicit statement that the estimate does not replace the plan document or dentist's treatment plan was found in member UI. Not every amount/coverage claim is individually labeled. |
| Annual maximum usage | 6% | **3** | Used, scheduled and remaining maximum recompute from the selected schedule ([helpers.ts:27](../src/engine/helpers.ts#L27), [Timeline.tsx:195](../src/components/Timeline.tsx#L195)). The visible balance is a yearly snapshot rather than a running balance after each visit/month. |
| In-network versus out-of-network comparison | 6% | **2** | Both scenarios and their difference are calculated/displayed ([helpers.ts:130](../src/engine/helpers.ts#L130), [NetworkCompare.tsx:11](../src/components/NetworkCompare.tsx#L11)). Provider multipliers remain simulated ([helpers.ts:146](../src/engine/helpers.ts#L146)); PR #7's allowed/MAC/UCR columns are derived proxies ([cdt.ts:283](../src/engine/cdt.ts#L283)), and participation is unverified ([Dentists.tsx:21](../src/pages/Dentists.tsx#L21)). At least one compared input is ad hoc rather than an observed reference allowance, matching level 2. |
| Unused year-end benefits | 6% | **4** | Unused maximum, remaining cleanings and expiring FSA are calculated after planned care, including carryover/grace effects ([helpers.ts:57](../src/engine/helpers.ts#L57)). Nov 1, Dec 1 and FSA-deadline reminders use these amounts ([reminders.ts:44](../src/engine/reminders.ts#L44)); tests exercise expiry rules ([reminders.test.ts:15](../src/engine/reminders.test.ts#L15)). Offline reminders are in-app; email requires AWS. |

## Engineering quality — 18.125 / 25

| Criterion | Internal weight | Score / 4 | Evidence and reason |
| --- | ---: | ---: | --- |
| Numbers computed, not generated | 40% | **2 across the repository; 4 defensible for the offline engine path** | Callable adjudication/scheduling units compute costs ([adjudicate.ts:513](../src/engine/adjudicate.ts#L513), [schedule.ts:169](../src/engine/schedule.ts#L169)). Explanations check deterministic dollar amounts and fall back to templates ([backend explain.ts:41](../backend/src/ai/explain.ts#L41), [Waterfall.tsx:28](../src/components/Waterfall.tsx#L28)); digest wording checks its amount set ([polish.ts:15](../backend/src/ai/polish.ts#L15)). **Gap:** plan-compiler validation checks quote presence/allowed choices, but not that a numeric answer equals the quoted number or belongs to that field ([compile.ts:54](../backend/src/ai/compile.ts#L54)). Fabricated in-range values can become coverage amounts shown for confirmation ([compile.ts:96](../backend/src/ai/compile.ts#L96), [PlanRules.tsx:98](../src/pages/PlanRules.tsx#L98)). Human review does not meet the code-verification anchor. |
| Failure preserves entered work | 30% | **3** | Failed intake retains typed text and reports errors ([IntakeBox.tsx:84](../src/components/IntakeBox.tsx#L84)); scoped drafts persist and storage failures surface ([drafts.ts:23](../src/lib/drafts.ts#L23)). HTTP calls have a 25-second bound ([httpApi.ts:25](../src/api/httpApi.ts#L25)). Claim refresh preserves remaining dates ([store.ts:507](../src/store.ts#L507)). But replacement-plan upload clears extraction/answers before success and retry requires file reselection ([PlanRules.tsx:38](../src/pages/PlanRules.tsx#L38)); OCR lacks an application-level initialization/recognition deadline ([ocr.ts:9](../src/services/ocr.ts#L9)). Uniform no-reentry retry/bounded timeouts are not established. |
| Calculation tested | 30% | **4** | Tests assert independently specified $2,450/$1,550 totals and $900 year-boundary savings ([engine.test.ts:85](../src/engine/engine.test.ts#L85)), plus deductible/max/frequency/waiting cases. Exact UCR/MAC, missing allowances and balance-billing cases are asserted ([pricing.test.ts:35](../src/engine/pricing.test.ts#L35)). Documented `npm test` passed **225 tests / 35 files**. These passing tests do not establish safe adversarial model extraction. |

### Reproduced AI extraction gap

A local probe called the actual `compileWithModel` with text **“The benefit cap is $1,500 per person.”** A stubbed model returned `field: annualMax`, `value: 9999`, and that exact quote. Result:

```json
{"acceptedAnnualMaximum":9999,"modelFilled":["annualMax"]}
```

No live model, user data or external service was involved. This proves an invalid candidate can pass the validator; it does **not** show Bedrock actually produced it. Schema validation can reject out-of-range answers while plausible wrong numbers survive. Explanation dollar checks also do not verify percentage text or the semantic role assigned to a valid amount ([explain.ts:99](../src/engine/explain.ts#L99)).

Reproduce without credentials, from the repository root:

```bash
npx tsx -e 'import { compileWithModel } from "./backend/src/ai/compile.ts"; const text = "The benefit cap is $1,500 per person."; compileWithModel(text, async () => ({answers: [{field: "annualMax", value: 9999, quote: text}]})).then(r => console.log({acceptedAnnualMaximum: r.draft.annualMax, modelFilled: r.modelFilled}));'
```

## Principles, Runs and Inventiveness

| Criterion | Score / 4 | Evidence and reason |
| --- | ---: | --- |
| Secrets and personal data | **2, conservative** | Public configuration is documented in `.env.example`; model credentials use the AWS chain ([bedrock.ts:4](../backend/src/lib/bedrock.ts#L4)). AgentMail credentials stay in Secrets Manager ([email.ts:28](../backend/src/lib/email.ts#L28)); provider errors now expose method/status rather than bodies ([email.ts:40](../backend/src/lib/email.ts#L40)). Retention includes 30-day claims/outbox, seven-day uploads and one-week Lambda logs ([db.ts:12](../backend/src/lib/db.ts#L12), [email.ts:114](../backend/src/lib/email.ts#L114), [ting-stack.ts:80](../infra/lib/ting-stack.ts#L80), [ting-stack.ts:121](../infra/lib/ting-stack.ts#L121)). However production logs retain member/claim IDs ([claims.ts:18](../backend/src/claims.ts#L18)), member IDs/raw exceptions ([digest.ts:64](../backend/src/lib/digest.ts#L64)), and attachment filenames/raw exceptions ([emailAgent.ts:98](../backend/src/emailAgent.ts#L98)). Filenames may contain personal data. One improved email path does not establish repository-wide privacy. |
| Builds, starts and stays up | **4 provisional** | Root [Dockerfile:3](../Dockerfile#L3) uses scratch and committed original-source artifacts without registry/npm downloads or credentials. A fresh AMD64 `--network=none --no-cache` build passed; it started with `--network none --read-only --cap-drop ALL --security-opt no-new-privileges`, passed repeated health checks and remained healthy ([server.go:70](../docker/server.go#L70)). The committed bundle passed 12 desktop/iPhone browser checks with external requests denied. **Source freshness failed**; execution checks certify the older bundle, not the new Basic tier. The organizer's probe determines the official score. |
| Team's own work | **4, code-based** | Application-specific adjudication, exhaustive scheduling, comparison, compiler and hand-computed tests substantially exceed scaffolding ([adjudicate.ts:513](../src/engine/adjudicate.ts#L513), [schedule.ts:221](../src/engine/schedule.ts#L221), [compare.ts:29](../src/engine/compare.ts#L29), [schema.ts:71](../src/compiler/schema.ts#L71)). Iterative history supports the code-based anchor, not independent certification of authorship, attribution or event-time eligibility. |

### Secret scan

Full-history Gitleaks scanned **65 commits / approximately 12.15 MB**, with redaction. One candidate: `generic-api-key`, `docker/README.md:21`, introduced by `a716d35`. Manual review confirmed ordinary prose listing the integrations excluded from Docker: a **false positive**, not a credential. No actual credential was identified. Pattern scanning does not prove absence of secrets/personal data. No ignore rule was added to hide the finding.

## Highest-value next work

| Priority | Change | Possible increase if anchors are met |
| --- | --- | ---: |
| Before submission | Refresh Docker artifacts after the merge; run hashes/offline tests and commit them. The current image omits the new plans/PDF. | Protects submission fidelity; no invented bonus |
| 1 | Redact backend logs: IDs, filenames, addresses/raw exceptions. Use bounded event/failure codes, document retention and test representative logging paths. Principles 2 → 4. | **+10.00** |
| 2 | Verify numeric plan answers against the exact quoted field/value; reject mismatches and ask the member. Add adversarial mismatch tests and validate explanation roles/percentages. Computed-numbers 2 → 4. | **+5.00** |
| 3 | Wire observed reference charges and plan/network-specific allowed/UCR/MAC data with code, geography, date and provenance. Replace synthetic defaults and scaled allowance/percentile proxies deliberately. Grounding/network 2 → 4. | **+3.15** |
| 4 | Explain each date's constraint, deductible timing, maximum before/after and difference versus earlier care. Sequencing 2 → 4. | **+3.00** |
| 5 | Put the plan-document/dentist limit statement beside estimates; distinguish supplied terms, quotes, reference prices and provisional budgets. Limits 2 → 4. | **+1.80** |
| 6 | Derive deductible wording from actual classes, preserve/retry files, bound OCR deadlines and show maximum after each visit. Remaining itemisation/failure/max headroom. | **+3.825** |

Hackathon data-use permission remains acknowledged. No usable event dataset/API entitlement is present in the repository; the remaining insurer-pricing blocker is usable data, not asking again for permission. PR #7 now wires multiplier-derived estimates; this should not be described as verified contracted fees or observed percentiles.

## Fresh verification and limits

- Pull/rebase passed; evaluated application commit **`40fbd25`**, including the merge that arrived during the review.
- Unit tests: **225 passed / 35 files**. Lint and production TypeScript/Vite build passed.
- Local browser suite: **55 passed**, five intentional duplicate WebKit viewport-matrix skips. Includes the newly pulled PDF, desktop/iPhone flows and narrow/200% text layouts.
- Fresh isolated AMD64 Docker build/start/health/stay-up passed. Docker browser suite: **12 passed** against the committed older bundle, with external requests denied.
- Docker source/artifact check **failed: stale source snapshot**. Basic plan absent from committed JavaScript archive.
- History scan: one confirmed README false positive; no actual secret identified.
- Stubbed-model mismatch probe: incorrect $9,999 candidate **accepted** from $1,500 text.

Earlier 22 live browser checks and 12 real AgentMail checks are recorded in [agentmail-release.md:20](agentmail-release.md#L20). They were **not rerun for this merge** and do not establish that the newest source is deployed. This review does not certify carrier pricing/participation, physical devices, all document layouts, arbitrary model output or the organizer's private build probe. No application fixes or new deployment are claimed by this assessment.
