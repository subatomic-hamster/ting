# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Ting is a codeLinc 11 entry for Lincoln Financial: a dental benefits **decision engine**, not a chatbot. The README is the main reference. It covers the architecture tree, the AWS integration seams, the demo script, routes and Amplify deploy, so read it before larger changes. The product spec is in `docs/features.md`.

## Commands

```bash
npm ci
npm run dev          # Vite on http://localhost:5173; add ?demo=1 (or Ctrl+Shift+D) for the demo panel
npm test             # Vitest, runs src/**/*.test.ts in a node environment
npx vitest run src/engine/engine.test.ts                # one file
npx vitest run src/engine/engine.test.ts -t "optimizer" # tests whose name matches
npm run lint         # ESLint
npm run typecheck    # tsc -b
npm run build        # tsc -b && vite build into dist/ (Amplify Hosting runs this, see amplify.yml)
```

`VITE_USE_MOCKS=true`, the default, runs everything in the browser on demo data. Set it to `false`, along with `VITE_API_URL` and `VITE_WS_URL`, to use the AWS backend (see `.env.example`).

## Architecture

Stack: React 18, Vite, Tailwind 4, Zustand, React Query and zod.

- **`src/engine/` is the core.** It's pure TypeScript with no DOM or AWS imports (only zod), so Lambda can import the same code. Its entry points are `optimize`, `evaluateSchedule`, `compare` and `applyClaim`, and its types are in `types.ts`.
- **The store derives everything from the engine.** `src/store.ts` holds the member's engine `Profile`, and its hooks return engine outputs:
  - `useOptimized()` gives the Cheapest, Balanced and Fastest schedules.
  - `useActive()` gives the chosen or dragged schedule, re-priced with `evaluateSchedule`.
  - `useComparison()` gives the plan options, tipping points, FSA amount and Enrollment Card.
  - Dragging a visit only re-prices the schedule; the optimizer and comparison rerun when the profile changes.
- **`src/api/index.ts` is the seam between the UI and the backend.** It defines the `TingApi` interface, which returns engine types, and has two implementations: `mockApi.ts` runs in the browser and `httpApi.ts` calls AWS.
  - Each AWS service sits behind an interface with a local stand-in: `Explainer`, `PlanCompiler`, `OcrProvider` (tesseract.js and pdf.js), `parseDescription` and `applyClaim`.
  - AWS work means implementing those interfaces and keeping the UI unchanged. The `httpApi.ts` endpoint paths are placeholders.
  - Every API call is recorded in the audit trail shown in the audit drawer.
- **Other directories:**
  - `src/intake/`: parsers for typed descriptions, treatment plans and insurance cards, plus the value-of-information questions.
  - `src/compiler/`: benefits summary → `PlanRules`. The schema is in `schema.ts`, and `planRulesJsonSchema` is ready for Bedrock structured output.
  - `src/data/`: demo plans and the personas Dale, Jordan and Priya.
- **Samples** for the plan compiler and treatment-plan OCR are in `public/samples/`.
- **Tests sit next to the code** as `*.test.ts`. `src/engine/engine.test.ts` encodes the spec's worked example: $2,450 now versus $1,550 with the crowns moved to January.

## Invariants (don't break these)

- Every dollar figure on screen comes from the engine. The UI only formats it with `formatMoney()` in `src/lib/format.ts`, or shows the difference between two engine totals.
- Model-written explanation sentences are shown only if `verifyNumbers(text, line)` in `src/engine/explain.ts` passes.
- The plan compiler never fills in defaults: a missing field becomes a question.
- Claim events must pass `claimEventSchema` and are applied idempotently per `claimId`.
- Only the dentist sets deadlines. Urgent items are locked. Never suggest skipping care, only reordering it within the dentist's window.
- Lincoln date rules: a crown or bridge counts on its **preparation** date, not its seat date. MaxRewards rollover is deposited on **day 65** of the plan year, so nothing that depends on it is scheduled earlier.
- Privacy:
  - Ting never reads anyone's inbox.
  - The employer sees aggregates only, and groups under 20 are hidden.
  - Notifications contain no procedure or dollar details by default.
- Never name or recommend another insurer's product.
- Label demo data as demo data. Label results "educational estimate — not insurance or tax advice".
- Don't use Lincoln Financial logos or brand marks; the event rules forbid it.
- Don't use Amazon Pinpoint: AWS ends support on Oct 30, 2026. Use End User Messaging instead.

## AWS environment

- **Account:** AWS Workshop Studio event account `648616106975`, Region **us-west-2**. The CLI profile is **`ting-aws`**, so pass `--profile ting-aws` or set `AWS_PROFILE=ting-aws`.
- **Credentials:** temporary. They come from the event's "Get AWS CLI credentials" page and expire, so get fresh ones and rewrite the `ting-aws` profile in `~/.aws/credentials` when they do. The account itself goes away when the event ends, so treat it as disposable and keep everything reproducible as infrastructure as code.
- **Role:** `WSParticipantRole`, with `ReadOnlyAccess`, `AmazonBedrockFullAccess` and an event policy (`ws-default-policy`). It can't request quota increases.
- **What works (checked 2026-10-03):**
  - Bedrock models: Claude Sonnet 5.5 (`us.anthropic.claude-sonnet-5-5`), Haiku 4.5 (`us.anthropic.claude-haiku-4-5-20251001-v1:0`), Mistral Large 3, Nova Lite and gpt-oss-120b.
  - Automated Reasoning and Guardrails.
  - Textract, Transcribe, Lambda (400 concurrent runs), API Gateway, EventBridge and Scheduler, Step Functions, DynamoDB, S3, Cognito, SES, CloudFormation, Route 53 and CloudFront.
- **What's blocked:**
  - Claude Opus 5.5 is denied by the event's private Marketplace.
  - Location Service (`geo-places`) is denied, so the F5 map needs another approach or AWS staff approval.
  - The G/VT GPU quota is 0, so the Winnow g5.2xlarge can't launch until AWS staff raise it.
  - SES is in the sandbox, so it can only send to verified addresses.
- The old account (`907813425258`, profiles `ting`, `ting-mgmt` and `ting-proj`) is no longer used. Its `ting-autostop-sunday` schedule still exists there.
- Winnow targets a **g5.2xlarge** (1× A10G 24 GB, 8 vCPU).

<!-- BEGIN AWS Agent Toolkit rules -->
# AWS Guidance

- Where these AWS rules conflict with the project's own instructions, the
  project's instructions take precedence.
- Prefer the AWS MCP Server for AWS interactions — it provides sandboxed
  execution, observability, and audit logging. If unavailable, use the
  AWS CLI directly.
- Before starting a task, check whether a relevant AWS skill is available.
  Load the skill with `retrieve_skill` and prefer its guidance over
  general knowledge.
- When uncertain about specific AWS details (API parameters, permissions,
  limits, error codes), verify against documentation rather than guessing.
  State uncertainty explicitly if you cannot confirm.
- When creating infrastructure, prefer infrastructure-as-code (AWS CDK or
  CloudFormation) over direct CLI commands.
- When working with infrastructure, follow AWS Well-Architected Framework
  principles.
- Do not use em dashes in AWS resource names or descriptions. Use
  hyphens instead.

## Secret Safety

- MUST load the `aws-secrets-manager` skill first for any secret,
  credential, API key, token, or password task. MUST NOT call
  `secretsmanager get-secret-value` or `batch-get-secret-value`, and MUST
  NOT hit the Secrets Manager Agent daemon directly. MUST use
  `{{resolve:secretsmanager:secret-id:SecretString:json-key}}` with
  `asm-exec` so the secret resolves at runtime without entering context.
<!-- END AWS Agent Toolkit rules -->
