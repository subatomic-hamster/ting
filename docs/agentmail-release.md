# Wordmark, copy cleanup and AgentMail

October 4, 2026.

Removed the global sample-account banner and educational-estimate footer from member pages, shares, privacy controls, enrollment data and email templates. The header uses a burgundy `Ting.` wordmark in the app's Source Serif 4 font. Price-specific provenance and unknown-allowance warnings remain, because changing presentation does not verify the underlying default fees.

AgentMail is configured with **ting-dental@agentmail.to** and an enabled `message.received` webhook scoped to that inbox. The API key and webhook signing secret are stored in the existing AWS Secrets Manager secret in us-west-2; neither is in source code, frontend configuration or Docker artifacts. Credentials are cached by the backend for five minutes. The setup script can be rerun to restore inbox/webhook configuration after replacing the API key.

## Repeat setup and live verification

Use an active AWS profile with access to the deployed Ting stack. `infra/outputs.json` is the local deployment output, excluded from source control. Store the API key in the stack's existing secret, then run from the repository root:

```bash
AWS_PROFILE=<your-active-profile> AWS_REGION=us-west-2 node infra/scripts/agentmail-setup.mjs
AWS_PROFILE=<your-active-profile> AWS_REGION=us-west-2 node infra/scripts/agentmail-test.mjs
```

The live test creates an owned temporary AgentMail inbox, briefly links Jordan's demo contact to check the application's welcome delivery, restores that contact, then links the temporary sender to an isolated test member. It sends an appointment confirmation through AgentMail, waits for the provider's webhook and asynchronous reader, verifies the stored appointment and delivered reply, and confirms the original thread is preserved. It also requires an enabled inbox-scoped webhook and checks unsigned requests return 401. Cleanup deletes the owned temporary inbox and isolated member fixtures, including the test welcome in Jordan's outbox. No real member address receives a test email. Do not run concurrent tests that edit Jordan's contact.

## Verification

- Unit suite: **221 passed across 33 files**. AgentMail cases cover sending, threaded replies, delivery failures retained in the outbox, unconfigured secrets, tampering, wrong signing secrets, rotated signatures, unsupported versions, missing headers, malformed timestamps and the five-minute replay window.
- Lint and production TypeScript/build checks passed.
- Local browser suite: **55 passed**, with 5 intentional duplicate WebKit viewport-matrix skips. Runs desktop Chromium and iPhone WebKit, including the wordmark/absence of global notices, surveys, quotes, dates, persistence, PDF intake, insurance-card OCR and sharing.
- Docker browser suite: **12 passed**, including PDF-worker MIME, card OCR, client routes and zero attempted external requests. Offline artifacts refreshed; source and artifact hashes verified.
- Live AgentMail exchange: **9 checks passed**, including welcome receipt, inbound delivery, actual provider webhook processing, appointment recording, successful application delivery, reply receipt and original-thread preservation. Temporary inbox/member fixtures removed and original contact restored.

Webhook checking now rejects malformed timestamps and unsupported signature versions. Provider failure logs retain method/status rather than response bodies or mailbox identifiers.

These tests use synthetic appointment content. They do not certify external carrier data, all attachment formats, external email-provider deliverability or production member authentication. The Docker submission uses its local outbox; live AgentMail runs in the AWS backend.
