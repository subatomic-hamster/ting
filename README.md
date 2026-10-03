# Ting

CodeLinc 11 submission · Dental Benefits Optimizer track.

Ting tells an employee what planned dental work will cost, step by step, and when to do it so it costs less. For example, it can move crowns to January, after the annual maximum resets. It also compares plans at open enrollment, recommends an FSA amount, and tracks the annual max, the deductible and FSA deadlines.

**The AI translates, tested code decides.** The UI never does money math. Every dollar on screen comes from the engine (`src/engine`), and the only money code in the UI is `formatMoney()` in `src/lib/format.ts`.

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
| `VITE_USE_MOCKS` | `true`  | `true` runs on mock data in the browser. `false` uses `httpApi.ts`.      |
| `VITE_API_URL`  | –       | Base URL of the real backend (REST).                                    |
| `VITE_WS_URL`   | –       | WebSocket URL for live `claim.adjudicated` events.                      |

## Architecture: two seams

```
src/contracts.ts          shared types (teammates code against these)
src/engine/index.ts       ENGINE SEAM  runEngine(input: EngineInput): EngineResult   (pure, sync)
src/engine/mockEngine.ts    placeholder engine (Lane A replaces)
src/engine/helpers.ts       memberTotalDelta, priceDentists — built on runEngine, engine-agnostic
src/api/index.ts          API SEAM     TingApi interface + `api` (mock or http, every call traced)
src/api/mockApi.ts          fixtures + 300–800 ms latency, keyword intake, seeded EOB
src/api/httpApi.ts          fetch/WebSocket stubs against VITE_API_URL / VITE_WS_URL
src/store.ts              Zustand state; `useResult()` = runEngine(...) memoized on its inputs
src/fixtures/             plans.json, fees.json, dentists.json, glossary.json, personas.ts, admin.json
src/lib/                  format.ts (money formatting), dates.ts, geometry.ts (bar/gauge layout), ics.ts, speech.ts
src/components/, src/pages/
```

Components read engine output through `useResult()` and only format it. Bar widths and timeline positions come from `lib/geometry.ts`, which turns engine amounts into percentages for layout.

### How to plug in the real engine

1. Implement `runEngine(input: EngineInput): EngineResult` (see `src/contracts.ts`). It must be pure and synchronous, because the timeline calls it on every drag (budget: under 100 ms).
2. In `src/engine/index.ts`, replace

   ```ts
   export { runMockEngine as runEngine } from './mockEngine';
   ```

   with an export of your engine. `helpers.ts` imports through `index.ts`, so it follows automatically.
3. Run `npm test`. The tests in `src/engine/mockEngine.test.ts` cover the contract: `youPay` equals the sum of the steps, moving an item across Dec 31 changes `memberTotal`, and locked items ignore overrides. Point them at your engine and keep them green.

Conventions the UI relies on:
- Waterfall steps come in this order: `fee, networkDiscount, deductible, coinsurance, maxCap, youPay`. A fee range goes in the `youPay` label (`"You pay · likely $220–$280"`).
- `enrollmentCard.actions[].label` uses `"Headline — reason"`. The UI shows the headline and expands to the reason.
- `activeSchedule.kind` is `custom` unless the overrides match one of the `schedules`.

### How to plug in the real API

Set `VITE_USE_MOCKS=false`, set `VITE_API_URL` / `VITE_WS_URL`, and fill in `src/api/httpApi.ts`. The endpoint paths there are placeholders. Keep the `TingApi` interface in `src/api/index.ts`. Every call is timed and appears in the **Audit trail** drawer.

### How to replace the sample plan numbers

Edit `src/fixtures/plans.json`. It must match `PlanRules` in `contracts.ts`. The UI labels plans "Sample plan — confirm against the official plan document". Demo fees for ZIP 27401 are in `src/fixtures/fees.json`.

## Demo script

1. Open `/?demo=1` (or press **Ctrl+Shift+D**). Choose persona **Dale, 56**.
2. Go to **/treatment**. Dale's root canal, buildup and two crowns come from a photo of his treatment plan. Walk through the root canal waterfall: fee → in-network discount → deductible → plan pays 80% → annual max → you pay. Open a "Plan rule" citation.
3. In **When to do it**, drag **Porcelain crown #30** across the bold **Dec 31** line. The floating delta (about −$600) shows the recompute time in milliseconds. The root canal is locked: "Your dentist set this deadline". The keyboard works too: ← → moves a week, Shift + ← → moves a month.
4. Flip the **In-network / Out** toggle in the top bar. Every number changes.
5. In the demo panel, click **Simulate Dec 1** and go to the **Dashboard**. The "Left on the table" year-end reminder banner appears.
6. Click **Fire mock claim**. A root canal EOB arrives (D3330, #19, plan paid $800, you owe $200). The max gauge, deductible bar and activity feed update live.
7. Go to **/enroll** for the Enrollment Card: plan choice, FSA election, what to do before Dec 31 and what waits until January, and expected savings. Try **Add to calendar** (.ics) and **Share with my dentist** (opens the printable `/share/:token` page).

Other personas: **Jordan, 25**, a new hire whose wisdom teeth are still in, and **Priya, 38**, who has "maybe" braces for a kid. Use Priya on /enroll to show the tipping-point slider.

## Routes

| Route           | Screen                                                                 |
| --------------- | ---------------------------------------------------------------------- |
| `/`             | Dashboard: max gauge, deductible, FSA countdown, timeline, activity feed, year-end banner, Enrollment Card (Oct 15 – Nov 30) |
| `/treatment`    | Intake (text / voice / photo) → items → waterfall → schedule options → draggable timeline → dentist questions |
| `/enroll`       | Plan comparison, "maybe" sliders with tipping point, FSA recommendation, Enrollment Card |
| `/onboarding`   | Three questions, each with a "why we're asking" line                   |
| `/dentists`     | Provider list sorted by your cost, in vs out of network, "Keep my dentist" |
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
