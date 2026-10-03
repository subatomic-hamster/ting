# Ting

CodeLinc 11 submission · Dental Benefits Optimizer track.

Ting tells an employee what planned dental work will cost, step by step, and when to do it so it costs less. For example, it can move crowns to January, after the annual maximum resets. It also compares plans at open enrollment, recommends an FSA amount, and tracks the annual max, the deductible and FSA deadlines.

**The AI translates, tested code decides.** Every dollar on screen comes from the engine (`src/engine`); the UI formats it (`formatMoney()` in `src/lib/format.ts`) and at most shows the difference between two engine totals.

> Educational estimate — not insurance or tax advice. The plans, fees, dentists and claims in this repo are sample or demo data.

## Run it

```bash
npm i
npm run dev        # http://localhost:5173  (add ?demo=1 for the demo panel)
npm test           # Vitest unit tests
npm run lint
npm run build      # strict TypeScript check + production build into dist/
```

### Environment variables

Copy `.env.example` to `.env.local`.

| Variable        | Default | Meaning                                                                |
| --------------- | ------- | ---------------------------------------------------------------------- |
| `VITE_USE_MOCKS` | `true`  | `true` runs everything in the browser on demo data. `false` uses `httpApi.ts`. |
| `VITE_API_URL`  | –       | Base URL of the real backend (REST).                                    |
| `VITE_WS_URL`   | –       | WebSocket URL for live `claim.adjudicated` events.                      |

## Architecture

```
src/engine/               THE ENGINE. Pure TypeScript, no DOM or AWS imports, so Lambda imports it as-is.
  types.ts                  Profile, PlanRules, PlannedProcedure, ScheduleEvaluation, AdjudicatedLine, ...
  adjudicate.ts             carrier-order claims processing (F1)
  schedule.ts               optimize() / evaluateSchedule() / validatePlacements() / dentistQuestions() (F1)
  compare.ts                compare(): plan options, tipping points, FSA election, Enrollment Card (F4)
  explain.ts                one sentence per waterfall step + verifyNumbers() (F1)
  ledger.ts                 claimEventSchema + applyClaim(): Lincoln EOB → ledger, EOB vs estimate (F6)
  helpers.ts                views the UI renders as-is: maxGauges, leftOnTable, priceDentists
src/intake/               description, treatment-plan and insurance-card parsers, value-of-information questions (F2)
src/compiler/             benefits summary → PlanRules: strict schema, questions, hashed approval (F2)
src/services/             OCR (tesseract.js) and PDF text (pdf.js), both lazy-loaded
src/data/                 demo plans (demo.ts) and personas (personas.ts): Dale, Jordan, Priya as engine Profiles
src/api/index.ts          API SEAM  TingApi + `api` (mock or http, every call traced in the audit drawer)
src/api/mockApi.ts          runs intake, OCR, compiler and explainer in the browser; seeded claims feed
src/api/httpApi.ts          fetch/WebSocket client for the AWS backend (VITE_API_URL / VITE_WS_URL)
src/store.ts              Zustand: the member's Profile, plan options, schedule choice; engine outputs memoized
src/lib/                  format.ts (money formatting), dates.ts, geometry.ts (bar/gauge layout), ics.ts, speech.ts
src/components/, src/pages/
```

The store holds the engine's own `Profile` and derives everything from the engine: `useOptimized()` (cheapest / balanced / fastest), `useActive()` (the chosen schedule, or the dragged one re-priced with `evaluateSchedule`), `useComparison()` (plan options, tipping points, FSA, Enrollment Card). Dragging a visit only re-prices the schedule; the optimizer and comparison rerun when the profile changes. Every engine run is timed into the audit trail.

### Integration seams for the AWS side

The API seam returns the engine's types, so the AWS backend runs the same `src/engine` code in Lambda and the UI doesn't change. Each AWS service has a local implementation behind an interface:

| AWS service | Interface | Local implementation | Contract |
| --- | --- | --- | --- |
| Bedrock explanations | `TingApi.explain` / `Explainer` in `src/engine/explain.ts` | `localExplainer` (templates) | One sentence per waterfall step; the UI shows a sentence only if `verifyNumbers(text, line)` passes |
| Bedrock plan compiler | `TingApi.compilePlan` / `PlanCompiler` in `src/compiler/compile.ts` | `localCompiler` (regex) | Output parses with `planRulesSchema` (`planRulesJsonSchema` is ready for structured output). Missing fields become questions, never defaults |
| Bedrock intake | `TingApi.parseDescription` | `parseDescription` in `src/intake/describe.ts` | `IntakeItem[]` with candidate codes, teeth and confidence |
| Textract | `TingApi.readDocument` / `OcrProvider` in `src/services/ocr.ts` | `localOcr` (tesseract.js), `pdfText` | Text plus parsed treatment-plan items |
| EventBridge claims feed | `TingApi.subscribeLedger` → `applyClaim` in `src/engine/ledger.ts` | `fireMockClaim` in the demo panel | Events validated by `claimEventSchema`; idempotent per `claimId` |
| DynamoDB | `getPlans` / `getLedger` | persona data in `src/data/` | `PlanRules[]` and `Ledger` from `src/engine/types.ts` |

Set `VITE_USE_MOCKS=false` and `VITE_API_URL` / `VITE_WS_URL` to use the AWS backend. Endpoint paths in `httpApi.ts` are placeholders until the AWS side publishes them.

Engine entry points for Lambda: `optimize(profile, { nextPlan, horizon })`, `evaluateSchedule(profile, placements)`, `compare(profile, planOptions)`, `applyClaim(profile, event)`.

### Known limits

- The 2027 IRS FSA limit isn't published yet; `src/engine/fsa.ts` falls back to the 2026 figures and the UI says so.
- Fees are demo approximations for ZIP 27401 (`DEMO_FEES` in `src/engine/cdt.ts`), not FAIR Health data.
- Plan years are calendar years; one covered person per profile (family optimizer is roadmap).
- The optimizer is exhaustive: about 12 procedures × 3 years is the practical ceiling.

## Demo script

1. Open `/?demo=1` (or press **Ctrl+Shift+D**). Choose persona **Dale, 56**.
2. Go to **/treatment**. Upload the **sample treatment plan photo**: OCR reads it into items. Type "Crown on a lower back molar, replacing the old one": Ting asks only the question whose answer changes the bill, with the price of each answer. Walk through the root canal waterfall: fee → in-network discount → plan pays 80% → you pay, each sentence verified against the engine's numbers.
3. In **When to do it**, compare Cheapest / Balanced / Fastest, then drag **Crown (porcelain) on #30** across the bold **Dec 31** line. The floating delta shows the recompute time in milliseconds. The root canal is locked (urgent). The keyboard works too: ← → moves a week, Shift + ← → moves a month.
4. Flip the **In-network / Out** toggle in the top bar. Every number changes, including the balance bill.
5. In the demo panel, click **Fire mock claim**. Lincoln's EOB for the root canal arrives; it's checked against Ting's estimate, and the max gauge, schedule and activity feed update live.
6. Click **Simulate Dec 1** and go to the **Dashboard**. The "Left on the table" year-end banner appears.
7. Go to **/enroll** for the Enrollment Card: plan choice, FSA election, what to do before Dec 31 and what waits until January, and expected savings. Try **Add to calendar** (.ics) and **Share with my dentist** (opens the printable `/share/:token` page).

8. Go to **/plan** and upload the **sample benefits summary (PDF)**. The compiler reads it into rules, asks the one thing the document doesn't say, and stamps the approved version.

Other personas: **Jordan, 25**, a new hire whose wisdom teeth are still in, and **Priya, 38**, who has "maybe" braces for a kid. Use Dale or Priya on /enroll to show the tipping-point slider.

## Routes

| Route           | Screen                                                                 |
| --------------- | ---------------------------------------------------------------------- |
| `/`             | Dashboard: max gauge, deductible, FSA countdown, timeline, activity feed, year-end banner, Enrollment Card (Oct 15 – Nov 30) |
| `/treatment`    | Intake (text / voice / photo) → items → waterfall → schedule options → draggable timeline → dentist questions |
| `/enroll`       | Plan comparison, "maybe" sliders with tipping point, FSA recommendation, Enrollment Card |
| `/onboarding`   | Three questions, each with a "why we're asking" line                   |
| `/dentists`     | Provider list sorted by your cost, in vs out of network, "Keep my dentist" |
| `/plan`         | Your plan's rules; benefits summary compiler; insurance card scan      |
| `/share/:token` | Public, printable dentist handoff (no app chrome)                      |
| `/admin`        | Employer insights, aggregate only; groups under 20 are hidden          |

## Deploy (AWS Amplify Hosting)

`amplify.yml` runs `npm ci` and `npm run build`, and publishes `dist/`. Because this is a single-page app with client-side routes, add this rewrite in the Amplify console (Hosting → Rewrites and redirects):

| Source address | Target address | Type |
| --- | --- | --- |
| `</^[^.]+$\|\.(?!(css\|gif\|ico\|jpg\|js\|png\|txt\|svg\|woff\|woff2\|ttf\|map\|json\|webp)$)([^.]+$)/>` | `/index.html` | 200 (Rewrite) |

## Notes

- No Lincoln Financial logos or brand marks are used (event rules). The palette is our own.
- The site works down to 375 px wide. The timeline scrolls horizontally inside its own card.
- Accessibility: the timeline works from the keyboard, focus is always visible, and charts have ARIA labels.
