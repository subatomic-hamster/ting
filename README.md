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
| `VITE_BRIDGE_URL` | `http://localhost:8787` | Local device bridge for SmileStreak brushes (see `hardware/`). |

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
| EventBridge Scheduler + SES reminders | `TingApi.scheduleReminder` / `cancelReminder` | in-memory schedule in `mockApi.ts`; the app shows due reminders itself (`ReminderToast`) | `Reminder` from `buildReminders` in `src/engine/reminders.ts`; same `id` replaces. The Lambda can rebuild the text with `buildReminders` at send time |
| DynamoDB | `getPlans` / `getLedger` | persona data in `src/data/` | `PlanRules[]` and `Ledger` from `src/engine/types.ts` |

The AWS backend is in `backend/` (Lambdas that import the same `src/` code) and `infra/` (one CDK stack). From `infra/`: `npm ci && npm run deploy`, then `node smoke.mjs` to test prod. The deployed site reads its API and WebSocket URLs from `config.js`, which the stack writes; locally, set `VITE_USE_MOCKS=false` and `VITE_API_URL` / `VITE_WS_URL`.

Engine entry points for Lambda: `optimize(profile, { nextPlan, horizon })`, `evaluateSchedule(profile, placements)`, `compare(profile, planOptions)`, `applyClaim(profile, event)`, `buildReminders(profile, schedule)`.

### Known limits

- The 2027 IRS FSA limit isn't published yet; `src/engine/fsa.ts` falls back to the 2026 figures and the UI says so.
- Fees are demo approximations for ZIP 27401 (`DEMO_FEES` in `src/engine/cdt.ts`), not FAIR Health data.
- Plan years are calendar years; one covered person per profile (family optimizer is roadmap).
- The optimizer is exhaustive: about 12 procedures × 3 years is the practical ceiling.

## AWS features (deployed)

The live site (`infra/outputs.json` → `WebUrl`) runs the same app against the AWS backend. `/try` shows a QR code for judges. On top of the mock-mode features it adds:

- **Bedrock** for intake translation (including Spanish), plan-compiler gap filling (verified quotes only), plain explanations (EN/ES), digests and EOB appeal drafts. Every amount is checked against the engine.
- **Automated Reasoning:** a "Proved" badge when the engine's plan-pays amount is proved against rules built from the benefits summary.
- **Winnow decision layer:**
  - **Where it runs:** Winnow-12B on the team's 24 GB Mac (`infra/scripts/winnow-local.sh`), reached through an SQS queue, so no tunnel or open port is needed. When it's off, a labelled Claude simulation takes over.
  - **What it decides:** intake probabilities, document triage, prompt-injection quarantine, and invoice-to-EOB matching.
  - **Calibration:** `/calibration` (67 labelled examples, 99% top-answer accuracy).
- **Maps:** OpenStreetMap. **Offline:** a service worker plus in-browser fallback. **Plan rules review:** `/analyst`. **Step-up sign-in** before sharing.
- **Employer sign-in:** "Sign in with Acme" (Cognito, OIDC), a consent screen, delete-my-data, and server-enforced admin aggregates.
- **Live claims feed** over WebSocket with replay, dentist share links backed by snapshots, year-end reminders and digests (content-free email by default).
- **Documents:** the Step Functions ingestion workflow with duplicate detection. A dentist's bill is reconciled with Lincoln's EOB and flagged if it asks for more than the EOB says.
- **A simulated forwarding address**, with sender approval.
- **Scorecard:** `docs/accuracy.md`.

Extra demo moments (demo panel):
- **Underpaid EOB:** an EOB $90 below the estimate. Use **Draft a message to Lincoln** on it.
- **Overbilling check:** after **Fire mock claim**, upload `public/samples/invoice.png` on /treatment.
- **Forwarding:** on the dashboard, click **Demo: the dentist emails a bill**.
- **Digest:** **Send a test digest now** on the dashboard.

## Demo script

1. Open `/?demo=1` (or press **Ctrl+Shift+D**). Choose persona **Dale, 56**.
2. Go to **/treatment**. Upload the **sample treatment plan photo**: OCR reads it into items. Type "Crown on a lower back molar, replacing the old one": Ting asks only the question whose answer changes the bill, with the price of each answer. Walk through the root canal waterfall: fee → in-network discount → plan pays 80% → you pay, each sentence verified against the engine's numbers.
3. In **When to do it**, compare Cheapest / Balanced / Fastest, then drag **Crown (porcelain) on #30** across the bold **Dec 31** line. The floating delta shows the recompute time in milliseconds. The root canal is locked (urgent). The keyboard works too: ← → moves a week, Shift + ← → moves a month.
4. Flip the **In-network / Out** toggle in the top bar. Every number changes, including the balance bill.
5. In the demo panel, click **Fire mock claim**. Lincoln's EOB for the root canal arrives; it's checked against Ting's estimate, and the max gauge, schedule and activity feed update live.
6. On the **Dashboard**, under **Scheduled reminders**, click **Remind me**: Nov 1, Dec 1 and (with a grace-period FSA) 10 days before the FSA deadline, each with the engine's amounts. **Add to calendar** downloads them as .ics. Then click **Simulate Dec 1**: the Dec 1 reminder fires in the app (and as a browser notification if allowed), it shows as "Due now", and the "Left on the table" year-end banner appears.
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
| `/habits`       | SmileStreak: opt-in, live brushing, rewards, streak, habit-informed estimate, dentist preview, privacy controls |
| `/program`      | SmileStreak, Lincoln view: aggregate counts, program economics with an attribution slider |

## SmileStreak: opt-in brushing data for rewards

Like a safe-driving app for teeth, but **rewards only**: sharing data can lower what you pay, never raise it.

- **Earn** (sample terms in `src/habits/program.ts`): $25 per cleaning, verified from Lincoln's own claims (no device needed), plus $10 per month you brush twice a day on 80% of days. Capped at $120 a year and paid next year as an FSA/HSA deposit or rollover.
- **Reasonable alternative:** no smart brush? A dentist's home-care check earns the same brushing portion.
- **Devices:** a simulated brush, a real **Oral-B** over Bluetooth, or a **DIY ESP32 clip**, all through the local bridge in `hardware/` (see `hardware/README.md`).
- **Who benefits:**
  - *You:* credits, streaks, live coaching, and an optional habit-informed nudge to "maybe" filling odds (±10 points, preventive/basic only, applied only if you choose).
  - *Your dentist:* a 30-day home-care summary on the handoff page, if you share it: weakest quadrant, pressure warnings, consistency.
  - *Lincoln:* group counts only (20+), and honest economics with a break-even attribution share, because participants self-select.
- **Privacy:** opt-in, collects from consent onward, delete everything anytime. The employer sees only the credit amount. Never used for pricing, underwriting or claims.
- **Anti-gaming:** sessions that are too short, stuck in one spot, left running or missing live readings don't count (`verifySession`).
- **Code:**
  - `src/habits/` holds the pure rules, analytics, simulation, bridge client and store, with tests in `habits.test.ts`.
  - `src/components/habits/` holds the UI.
  - Reward credits are computed in `rewards.ts`; components only format them.

**Demo:**
1. Open `/habits` as Dale and click **Brush now**: you'll see the live quadrant map, then a verified session.
2. Switch to **Jordan** to show the opt-in moment: their cleaning already counts.
3. Switch to **Priya** and click **Use 27% instead** on her maybe root canal.
4. Open `/share/dale.cheapest.x` for the dentist's view and `/program` for Lincoln's view.

## Deploy (AWS Amplify Hosting)

`amplify.yml` runs `npm ci` and `npm run build`, and publishes `dist/`. Because this is a single-page app with client-side routes, add this rewrite in the Amplify console (Hosting → Rewrites and redirects):

| Source address | Target address | Type |
| --- | --- | --- |
| `</^[^.]+$\|\.(?!(css\|gif\|ico\|jpg\|js\|png\|txt\|svg\|woff\|woff2\|ttf\|map\|json\|webp)$)([^.]+$)/>` | `/index.html` | 200 (Rewrite) |

## Notes

- No Lincoln Financial logos or brand marks are used (event rules). The palette is our own.
- The site works down to 375 px wide. The timeline scrolls horizontally inside its own card.
- Accessibility: the timeline works from the keyboard, focus is always visible, and charts have ARIA labels.
