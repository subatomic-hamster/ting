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
npm run build        # tsc -b && vite build into dist/

# AWS (from infra/, with AWS_PROFILE=ting-aws AWS_REGION=us-west-2)
npm ci               # infra has its own package.json (CDK)
npm run deploy       # builds the web app, then cdk deploy; writes infra/outputs.json
node smoke.mjs       # prod smoke test (23 checks): every route, Bedrock, Textract, reasoning, Winnow, claims, reminders, inbox
node eval.mjs        # intake accuracy on evals/intake.json against the live API → docs/accuracy.md
node scripts/ar-policy.mjs   # one-time: build the Automated Reasoning policy + guardrail → infra/ar.json (committed)
node scripts/seed-acme.mjs   # demo Acme SSO users; passwords only in infra/acme-users.local.json (gitignored, never commit)
bash scripts/winnow-local.sh # live Winnow-12B on this Mac (M5, 24 GB) serving prod via SQS; Ctrl+C → backend falls back to simulation
node calibrate.mjs           # Winnow on evals/winnow.json (67 labelled examples) → public/calibration.json + docs/calibration.md
```

Deploy-time context: `-c reminderEmail=you@example.com` (SES-verified address for reminder/digest email; omitted = in-app only), `-c winnowUrl=http://host:port` (live Winnow server; omitted = simulated).

Locally, `VITE_USE_MOCKS=true` (the default) runs everything in the browser on demo data. The deployed site gets its settings from `config.js`: the stack writes `window.TING_CONFIG` (useMocks false, API and WebSocket URLs) at deploy time, and those settings win over the `VITE_*` values.

## Architecture

Stack: React 18, Vite, Tailwind 4, Zustand, React Query and zod.

- **`src/engine/` is the core.** It's pure TypeScript with no DOM or AWS imports (only zod), so Lambda can import the same code. Its entry points are `optimize`, `evaluateSchedule`, `compare` and `applyClaim`, and its types are in `types.ts`.
- **The store derives everything from the engine.** `src/store.ts` holds the member's engine `Profile`, and its hooks return engine outputs:
  - `useOptimized()` gives the Cheapest, Balanced and Fastest schedules.
  - `useActive()` gives the chosen or dragged schedule, re-priced with `evaluateSchedule`.
  - `useComparison()` gives the plan options, tipping points, FSA amount and Enrollment Card.
  - Dragging a visit only re-prices the schedule; the optimizer and comparison rerun when the profile changes.
- **`src/api/index.ts` is the seam between the UI and the backend.** It defines the `TingApi` interface, which returns engine types, and has two implementations: `mockApi.ts` runs in the browser and `httpApi.ts` calls AWS.
  - Both read the demo persona and "as of" date from `src/api/context.ts`; `httpApi` sends them as `?persona=&asOf=` (stand-in for a Cognito session).
  - Every API call is recorded in the audit trail shown in the audit drawer.
- **`backend/src/` is the AWS side.** Its Lambdas import the same `src/` code, and esbuild bundles them through CDK:
  - `api.ts` handles the HTTP API routes.
  - `ws.ts` handles the WebSocket `$connect`, `$disconnect` and `replay`.
  - `claims.ts` is the EventBridge target.
- **Bedrock in `backend/src/ai/` only translates or fills gaps.** Tested code still decides:
  - `describe.ts`: the model rewrites free text (including Spanish) into phrases `parseDescription` knows, and the parser assigns codes and probabilities.
  - `compile.ts`: the model may fill only fields the regex compiler left as questions, and only with a quote that is checked to appear in the document.
  - `explain.ts`: a rewritten sentence is used only if it keeps every template amount and passes `verifyNumbers`; otherwise the template is shown.
  - Every Bedrock failure falls back to the local code.
- **The claims feed:**
  - `POST /mock/claims` → EventBridge bus `ting-claims` → `claims.ts`, which stores the claim in DynamoDB and pushes it to the member's sockets.
  - On connect, the client sends `replay` and gets its stored claims back, so state survives a reload.
  - `POST /demo/reset` clears a member's claims.
- **More backend features**, each with a pure engine rule plus a thin AWS adapter:
  - **Automated Reasoning** (`lib/reasoning.ts`): per estimate line, states the engine's premises and "The plan pays $X." against a policy built from the Acme Low benefits summary. A VALID verdict shows a "Proved" badge.
  - **Winnow** (`ai/winnow.ts`, chosen in `ai/winnowDecide.ts`): the spec's `/v1/systemone` typed questions.
    - **Where it runs:** live on the team Mac. Winnow-inference lives in `~/Developer/winnow`, with its API key in `~/Developer/winnow/api-key`.
    - **How prod reaches it:** the Lambdas put requests on the `WinnowRequests` SQS queue. `scripts/winnow-worker.mjs` long-polls the queue, asks the local server, and writes answers to DynamoDB (`WINNOW#<id>`). A heartbeat item (`WINNOW/HEARTBEAT`) tells the Lambdas whether the worker is up.
    - **Why a queue:** the venue network blocks Cloudflare tunnels (port 7844), so the Mac connects out to AWS instead. Nothing on the Mac is exposed.
    - **Fallback:** with no fresh heartbeat, or on any error, it uses the Claude simulation, labelled `simulated`. `-c winnowUrl/-c winnowKey` points at a directly reachable server instead.
    - **Uses:**
      - intake code and replacement probabilities, blended with the parser's prior (`blend`);
      - document triage, plus an injection check that quarantines text before Claude sees it;
      - invoice-to-EOB matching.
    - **Calibration:** `/calibration`.
  - **Sign-in:** Cognito federated over OIDC to a mock "Acme Corp" pool.
    - `pretoken.ts` maps the employee to a member and group via `lib/identity.ts`.
    - The API verifies the ID token when one is sent; otherwise it serves the public demo persona.
    - `/admin/insights` requires `employer_admin` and drops groups under 20 on the server.
  - **Share links** store a snapshot of the member's plan in DynamoDB (30-day expiry, 410 once expired); `/share/:token` renders it on any device.
  - **Reminders and digests:** a daily EventBridge rule (`reminders.ts`) sends them. Email is content-free unless the member opts into detail.
  - **EOB appeal draft** (`engine/eobAppeal.ts`), **invoice reconciliation and the overbilling check** (`engine/reconcile.ts`), and the **forwarding inbox** (`engine/inbox.ts`, simulated SES inbound).
  - **Spanish explanations** (EN/ES switch) go through the same amount checks.
  - **Maps:** Leaflet with OpenStreetMap tiles (`components/DentistMap.tsx`). Location Service is denied in event accounts.
  - **Offline:** `public/sw.js` caches the app shell. `withOfflineFallback` in `api/index.ts` answers compute calls with the in-browser `mockApi` when the network is gone.
  - **Plan rules review:**
    - Members send compiled rules from /plan to `POST /rules/submit`.
    - `lincoln_analyst` users approve them on `/analyst`, and the server hashes the version.
    - Approved versions are added to `GET /plans`.
  - **Step-up:** `POST /share` from a signed-in member needs `auth_time` within 10 minutes; the client re-signs in with `prompt=login`.
- **Documents:** the browser uploads to S3 with a presigned URL, then Textract runs `DetectDocumentText`. `backend/src/lib/layout.ts` rebuilds table rows from line positions. Multi-page PDFs fall back to the PDF's text layer in the browser. When deployed, `/documents` runs the Express Step Functions workflow `Ingest` (read → screen → record), and a repeat upload (same S3 ETag) is flagged `duplicate`.
- **`infra/lib/ting-stack.ts` is one CDK stack:**
  - DynamoDB single table (`pk`/`sk`/`ttl`).
  - S3 buckets for documents and the site.
  - The HTTP API and the WebSocket API.
  - The EventBridge bus.
  - CloudFront with a viewer function for single-page-app routing.
- **Other directories:**
  - `src/intake/`: parsers for typed descriptions, treatment plans and insurance cards, plus the value-of-information questions.
  - `src/compiler/`: benefits summary → `PlanRules`. The schema is in `schema.ts`, and `planRulesJsonSchema` is ready for Bedrock structured output.
  - `src/data/`: demo plans and the personas Dale, Jordan and Priya.
- **Samples** for the plan compiler and treatment-plan OCR are in `public/samples/`.
- **Tests sit next to the code** as `*.test.ts`. `src/engine/engine.test.ts` encodes the spec's worked example: $2,450 now versus $1,550 with the crowns moved to January.

## Invariants (don't break these)

- Every dollar figure on screen comes from the engine. The UI only formats it with `formatMoney()` in `src/lib/format.ts`, or shows the difference between two engine totals.
- Model text never changes an amount: `polish()` in `backend/src/ai/polish.ts` and `explainWithModel` reject any rewording whose dollar figures differ from the engine's, and the template is shown instead.
- A document Winnow flags as instructing an AI is quarantined: only the regex/parsers read it.
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
- **Deployed (stack `Ting`):** web https://d3tknbg8ry7x3q.cloudfront.net, API https://j3xj75kqwl.execute-api.us-west-2.amazonaws.com, WebSocket wss://yga09xsli5.execute-api.us-west-2.amazonaws.com/prod. `infra/outputs.json` has the current values.
- **What works (checked 2026-10-03):**
  - Claude models: Haiku 4.5 (`us.anthropic.claude-haiku-4-5-20251001-v1:0`, the fast model), Sonnet 5 (`us.anthropic.claude-sonnet-5`, the smart model), Sonnet 4.6, and Opus 4.6 and 4.8.
  - Sonnet 5 rejects `temperature`, so don't send it.
  - Other models: Mistral Large 3, Nova Lite, gpt-oss-120b.
  - Automated Reasoning and Guardrails.
  - Textract, Transcribe, Lambda (400 concurrent runs), API Gateway, EventBridge rules, Step Functions, DynamoDB, S3, Cognito, SES, CloudFormation, Route 53 and CloudFront.
- **Winnow on the Mac:** start it with `bash infra/scripts/winnow-local.sh`. The worker uses the `ting-aws` event credentials, so when they expire, the heartbeat stops and prod quietly returns to the simulation.
- **What's blocked:**
  - Claude Sonnet 5.5 and Opus 5.5 are denied by the event's private Marketplace. Sonnet 5.5 worked once and then started failing.
  - EventBridge Scheduler (`scheduler:*`) isn't in the event policy, so use EventBridge rules for notifications.
  - Location Service (`geo-places`) is denied. The F5 map uses OpenStreetMap instead.
  - Outbound port 7844 is blocked on the venue network, so Cloudflare tunnels don't work. That's why Winnow uses the SQS bridge.
  - The G/VT GPU quota is 0. Not needed: Winnow runs on the team Mac.
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
