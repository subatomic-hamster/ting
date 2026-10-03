# Ting

Employer-provided dental decision engine (codeLinc 11, Path 1). The AI translates, tested code decides, and the employee gets decisions, not a chatbot.

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # engine, intake and compiler tests
npm run build      # typecheck + production build
```

Everything runs in the browser against seeded demo data (labelled "Demo data" on screen). "Reset demo data" is at the bottom of *Your decisions*.

## What's built (core track)

| Feature | Where |
| --- | --- |
| F1 adjudicator: carrier-order claims, deductible, coinsurance, max cap, frequency limits, waiting periods, alternate benefit, MaxRewards rollover (day 65), preventive outside the max, Q4 deductible carryover, out-of-network U&C and balance bill | `src/engine/adjudicate.ts` |
| F1 optimizer: exhaustive search over plan years, deadlines, dependencies, locked items, Cheapest / Balanced / Fastest, dentist questions, "maybe" items at their likelihood, FSA and tax | `src/engine/schedule.ts` |
| F1 waterfall + explanations, every dollar checked against engine output | `src/engine/explain.ts`, `src/app/components/Waterfall.tsx` |
| F4 plan comparison (Lincoln options, waive, dentist membership), "maybe" tipping point, FSA amount, Enrollment Card | `src/engine/compare.ts` |
| F2 typed, spoken (browser speech) and photographed / PDF treatment plans, value-of-information questions | `src/intake/`, `src/services/` |
| F2 plan document compiler: strict schema, questions for anything missing, hashed approved versions | `src/compiler/` |
| F3 three-question onboarding | `src/app/screens/Onboarding.tsx` |
| F6 (dependency) Lincoln claim event to ledger, EOB vs estimate check | `src/engine/ledger.ts` |

## Integration seams for the AWS side

The engine (`src/engine/`) is pure TypeScript with no DOM or AWS imports, so Lambda can import it directly. Each AWS service plugs in behind an interface that already has a local implementation:

| AWS service | Interface | Local implementation | Contract |
| --- | --- | --- | --- |
| Bedrock explanations | `Explainer` in `src/engine/explain.ts` | `localExplainer` (templates) | Return one sentence per waterfall step; each must pass `verifyNumbers(text, line)` before display |
| Bedrock plan compiler | `PlanCompiler` in `src/compiler/compile.ts` | `localCompiler` (regex) | Output must parse with `planRulesSchema`; `planRulesJsonSchema` is ready for structured output. Missing fields become questions, never defaults |
| Textract | `OcrProvider` in `src/services/ocr.ts` | `localOcr` (tesseract.js) | `{ text, confidence 0..1 }` |
| EventBridge claims feed | `applyClaim(profile, event)` in `src/engine/ledger.ts` | "Simulate a Lincoln claim" button | Event validated by `claimEventSchema` (shape from the spec); idempotent per `claimId` |
| DynamoDB | `useAppState` in `src/app/state.ts` | `localStorage` | Stores the `Profile` (`src/engine/types.ts`) |

Engine entry points for Lambda: `optimize(profile, { nextPlan })`, `evaluateSchedule(profile, placements)`, `compare(profile, planOptions)`, `applyClaim(profile, event)`.

## Known limits

- The 2027 IRS FSA limit isn't published yet; `src/engine/fsa.ts` falls back to the 2026 figures and the UI says so. Add the 2027 row when the IRS publishes it.
- Fees are demo approximations for ZIP 27401 (`DEMO_FEES` in `src/engine/cdt.ts`), not FAIR Health data.
- Plan years are calendar years; one covered person (family optimizer is roadmap).
- The optimizer is exhaustive: about 12 procedures × 3 years is the practical ceiling.
