# Ting mobile rebuild and pricing validation

October 4, 2026. Implementation is committed and deployed. Local and live release verification are complete.

## Implemented scope

Section 0 of `design.md` governs the application: the later marketing-page measurements are a reference, not extra pages to invent. The app now has self-hosted Roboto and Source Serif 4, white/burgundy surfaces, light serif titles, readable text, square controls, mobile spacing, 48px targets, and a compact Ting navigation menu. Member tasks lead with an amount/task and its period, followed by a concrete action. Supporting calculation/source details, intake, catalog and visual dragging are optional disclosures. Partner and developer workflows remain accessible.

Treatment has tap date editing, fee/allowance editing, 137 searchable procedures including braces, price-source tracking, persistent edits/removals and Undo. Quotes, provider reference charges and insurance allowances remain separate. Missing reimbursement or replacement history produces a full-fee budget with a visible warning. Current-plan allowances are scoped to plan/version/network; actual filling quotes cannot borrow a synthetic alternate-benefit rate. A plan comparison with unresolved inputs asks for confirmation before choosing/waiving coverage or electing FSA money.

Enrollment exports, dentist snapshots and reminders use the same recommendation dates. Shares use their immutable snapshot; invalid, expired and failed links display useful unavailable states. Mock shares survive reload in their originating browser. Calendar/link actions say what they actually do. Email settings default private and pending requests cannot overwrite dirty settings. Fetch, save, clipboard and approval failures are visible where addressed. Signed-in consent has initial focus, keyboard containment, return focus and failed-mutation feedback.

SmileStreak deletion survives reload; dates and tap details replace color-only history. Brushing recordings do not rewrite clinical treatment probabilities. Reward credits do not change premiums. Deletion/sharing explanations now correctly state that previously shared summaries and downloaded copies may remain with recipients.

## Verification

- `npm test`: **195 tests passed in 29 files**, including pricing isolation, missing allowance/MAC/UCR data, balance billing, unknown replacement history, alternate benefits, consent keyboard/error behavior, clearing cached claims after deletion, and restoring only a previously fetched, account-scoped server profile while offline.
- `npm run lint`: passed.
- `npm run build`: passed, including TypeScript. Vite reports a large main chunk (about 956KB before compression); route-level splitting remains a performance improvement opportunity.
- `npm run e2e:local`: **45 passed, 5 intentionally skipped**. Twenty functional journeys run in Chromium and iPhone WebKit. Five Chromium matrix tests cover 10 routes at 320/375/390/430/768px with normal and doubled text; the duplicate WebKit matrix is skipped, while its mobile functional journeys run.
- Journeys cover claims, navigation, repeated fillings, tap dates/reload, braces quotes, catalog filtering, published charges, confirmed allowances, filling alternate benefits, persistent removal/Undo, privacy/email settings, recommendation/calendar/share agreement, treatment-photo OCR, benefits-summary PDF/text extraction and invoice reconciliation.
- Explicit text stress snapshots each HTML element's computed font size and numeric line height, then doubles them at a fixed viewport. This is a simulation, not native phone accessibility settings. No global horizontal overflow or page exceptions in the final tested matrix, including expanded cost/quote details and opted-out brushing/device states.
- The independent reviewer ran 176 additional route/viewport/text combinations and focused recovery/privacy tests. Their [report](mobile-revamp-review.md) distinguishes the initial defects, fixes and verified scope.
- The county PDF extraction independently verifies its SHA256, all 115 extracted codes/charges, 101 retained rows and 14 quarantined rows. Published descriptions are retained; changed source bytes/rows require manual review. Source images are in `docs/pricing-evidence`.

Final visual evidence: [Home, 390px](revamp-evidence/home-390.png), [Treatment, 390px](revamp-evidence/treatment-390.png), [Enrollment, 390px](revamp-evidence/enroll-390.png), [braces quote](revamp-evidence/braces-quote-390.png), and [Treatment with doubled text, 320px](revamp-evidence/treatment-320-200text.png). Screenshots are local Vite mock UI; the E2E suite separately builds the production bundle in mock mode.

## Material limits

The 101 county charges are FY2026–27 provider prices for a Winston-Salem clinic, not Greensboro market percentiles or plan-specific negotiated rates. The FAIR calculator returned an access limit; no numeric FAIR prices were captured. The hackathon library supplies education. Default worked-example amounts remain synthetic. Production pricing needs the organizer's usable licensed fee feed or actual dentist/insurer pretreatment estimates. Braces require a full-course quote; insurer installment, age and treatment-in-progress rules remain unmodeled and explicitly qualified in the UI. See the [developer pricing/procedure brief](pricing-procedure-handoff.md).

Real member sign-in sessions, physical camera/microphone/Bluetooth/ESP32 behavior and native calendar import were not exercised. Local file photo OCR and PDF extraction were exercised in both browser engines. Browser drafts persist by sample persona or signed-in member; live-mode drafts are scoped to the tab, not a promise of server synchronization. Previously created shares are copies rather than revocable live views.

## Live release verification

- Application commit: `4a6620e`, pushed to `origin/aws-backend`.
- AWS CDK strict synthesis and change-set diff passed. No database, identity pool or other persistent resource replacement was proposed; updates publish application code and website assets.
- Stack `Ting` deployed successfully in `us-west-2`, account `648616106975`. Website: https://d3tknbg8ry7x3q.cloudfront.net.
- Live HTML serves the exact built asset `assets/index-DzEObpYI.js`; runtime configuration uses the live API.
- `node infra/smoke.mjs`: **29/29 passed**. Checks include Bedrock intake/rules/explanation, Automated Reasoning, Textract upload/deduplication, Winnow triage, share snapshots, authorization guards, Cognito federation redirect, EventBridge/WebSocket claims and replay, reminder schedule/due/cancel, invoice reconciliation, forwarding quarantine/approval, carrier records, and demo email-agent/digest routes. Reminder delivery used the in-app channel; the result reported email `false`. These are demo integrations, not proof of real member email delivery or full authenticated user journeys.
- `npx playwright test e2e/release.spec.ts --grep-invert 'live claim arrives' --retries=0`: **12 passed**.
- `npx playwright test e2e/release.spec.ts --grep 'live claim arrives' --retries=0`: **2 passed**. Claim resets were isolated from the API smoke run to avoid competing mutations of the same sample account.
- These **14 targeted live browser checks** cover Chromium and iPhone WebKit: member-route layout, full-course braces quotes and unknown allowances, published clinic source/price retention, tap date edits/reload, share round trips/invalid links, offline intake and server-snapshot restoration, and live claim replay. Chromium also verifies an offline page reload; Playwright WebKit's offline reload limitation remains.
- The legacy `e2e/app.spec.ts` suite was not rerun; its old visual labels/selectors need migration. The complete updated local suite and the targeted live release suite are the verified browser scope.

The main developer chat has not been identified in the pending user clarification, so no message was sent to an unrelated task. The implementation and developer brief are already available in this shared workspace.
