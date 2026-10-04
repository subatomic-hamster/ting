# Plan rules, survey and document-loading update

October 4, 2026. The user's latest design changes override the previous burgundy theme.

## Changes

- Plan rules lead with the monthly premium, deductible, annual maximum, cleanings, fillings, checkups and bitewing X-rays. Percentages use each procedure's actual category mapping. Other services, waiting periods, frequency limits, rollover, orthodontic lifetime limits, out-of-network allowance basis and references are under **Show more plan details**.
- The original red is restored: `#ad1f2d`, matching `public/favicon.svg`. Treatment restores the horizontal floating cost bars on phones and desktops; amounts and explanations still come from the engine.
- The four-question survey asks about planned work, last cleaning, people covered and moving cities frequently. Answers persist within the existing persona/member draft scope. Planned work is prefilled for review; vague cleaning history does not invent a service date or automatically add treatment. Family answers explain that the estimates still cover one person.
- A frequent-moving answer changes the tested plan selector to prioritize documented out-of-network benefits for relevant care, then comparable UCR percentiles, then modeled cost. An actual offered option receives **Good if moving cities frequently**. The lowest-cost alternative remains visible. No new insurance contract, geographic network reach, future dentist fee or allowance is invented. Setting the answer to No or Not sure restores cost-based selection. FSA, shares and recommendation calendars follow the selected option.
- The PDF upload error was reproduced at the deployed worker URL: CloudFront returned `200 text/html` for a `.mjs` module worker. The viewer routing function now passes through `.mjs` and `.wasm`. Website deployments retain old hashed chunks for existing tabs; the service-worker cache moves to v3 to discard previously cached incorrect worker responses.
- Upload errors have alert semantics; uploads cannot overlap. Starting a new benefits upload clears stale extracted rules/approval. A clearly labelled sample insurance card is provided and Lincoln carrier text is recognized.

## Before-release validation

- `npm test`: **207 passed in 32 files**. Added tests cover actual service categories, exclusions, moving preferences changing the choice without changing the cost calculation, unavailable out-of-network options, and the exact CloudFront routing code for workers and dotted share links.
- `npm run lint`, `npm run build` and `cdk synth --strict`: passed. Existing large main-bundle warning remains.
- `npm run e2e:local`: **55 passed, 5 intentional WebKit viewport-matrix skips**. Functional journeys run in Chromium and iPhone WebKit. This includes survey persistence and reversal, family scope, deferred treatment review, overview disclosures, favicon color, benefits PDF review/application, actual insurance-card image OCR/group mapping and unrecognized-card recovery, horizontal bars, and the prior pricing/date/share/privacy/intake journeys.
- The shared PDF browser test deliberately fails the live `/documents` OCR request to force PDF.js fallback and exercise the exact `.mjs` route. Local mock mode reads the PDF directly.
- Visual review: [plan overview](plan-update-evidence/plan-overview-390.png), [waterfall](plan-update-evidence/waterfall-390.png), [expanded plan with doubled text at 320px](plan-update-evidence/plan-expanded-320-double-text.png). The final expanded plan check has zero global horizontal overflow. Text doubling is a browser simulation, not a physical phone accessibility setting.
- CDK's change-set diff updates the CloudFront routing code, API/ingestion code assets and website deployment. No database or identity resource replacement is proposed.

## Live release verification

- Application commit `b51ae03` was pushed to `origin/main` and deployed to [the live app](https://d3tknbg8ry7x3q.cloudfront.net/). The AWS `Ting` stack finished with `UPDATE_COMPLETE`.
- The live page loads `assets/index-yOPpBKEk.js`. The PDF worker returns `200 text/javascript`, and the previous lazy-loaded PDF chunk remains available for existing tabs.
- `node infra/smoke.mjs`: **29 of 29 API checks passed**, covering intake, plan compilation, document processing, claims, sharing, reminders and authentication guards.
- `npx playwright test e2e/plan-updates.spec.ts e2e/release.spec.ts --retries=0`: **24 of 24 live browser checks passed**, with no retries or skips, in Chromium and iPhone WebKit. Both engines verified benefits PDF review/application with the OCR request deliberately rejected to exercise the PDF worker fallback, actual insurance-card image OCR, survey persistence and moving-aware recommendations, plan disclosures, the horizontal waterfall, and existing release journeys.
- This live run covers those two suites; it does not certify the legacy production suite, a physical camera or a complete signed-in member session.

## Scope

The moving preference is a transparent coverage priority in the existing deterministic decision engine. It does not infer actual network participation in another city. Future out-of-network charges and family totals require confirmed inputs. Photo upload and file OCR are verified; this does not certify a physical camera. Survey answers remain browser drafts rather than server-synchronized records.
