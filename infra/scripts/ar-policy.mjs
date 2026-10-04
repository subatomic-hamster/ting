// One-time setup: build a Bedrock Automated Reasoning policy from the plan's benefits summary, version it, and
// attach it to a guardrail the explain route checks every sentence against. Writes infra/ar.json for the stack.
// Usage (from infra/): AWS_PROFILE=ting-aws AWS_REGION=us-west-2 node scripts/ar-policy.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import {
  BedrockClient,
  CreateAutomatedReasoningPolicyCommand,
  CreateAutomatedReasoningPolicyVersionCommand,
  CreateGuardrailCommand,
  CreateGuardrailVersionCommand,
  GetAutomatedReasoningPolicyBuildWorkflowCommand,
  GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommand,
  GetAutomatedReasoningPolicyCommand,
  ListAutomatedReasoningPoliciesCommand,
  ListGuardrailsCommand,
  StartAutomatedReasoningPolicyBuildWorkflowCommand,
  UpdateAutomatedReasoningPolicyCommand,
} from '@aws-sdk/client-bedrock';

const NAME = 'ting-acme-low';
const bedrock = new BedrockClient({});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const doc = readFileSync(new URL('../../public/samples/acme-benefits-summary.txt', import.meta.url));

// 1. Policy (reuse by name).
let policyArn = (await bedrock.send(new ListAutomatedReasoningPoliciesCommand({}))).automatedReasoningPolicySummaries?.find((p) => p.name === NAME)?.policyArn;
if (!policyArn) {
  policyArn = (await bedrock.send(new CreateAutomatedReasoningPolicyCommand({ name: NAME, description: 'Acme Low dental plan rules (Ting demo)' }))).policyArn;
  log('created policy', policyArn);
} else log('reusing policy', policyArn);

// 2. Build the policy from the benefits summary.
const { buildWorkflowId } = await bedrock.send(
  new StartAutomatedReasoningPolicyBuildWorkflowCommand({
    policyArn,
    buildWorkflowType: 'INGEST_CONTENT',
    sourceContent: {
      workflowContent: {
        documents: [
          {
            document: doc,
            documentContentType: 'txt',
            documentName: 'Acme Low benefits summary',
            documentDescription:
              'A dental plan benefits summary. Model how much the plan pays and how much the member pays for one dental procedure: ' +
              'service class (preventive, basic, major), in-network vs out-of-network coinsurance percentages, the annual deductible ' +
              'and which classes it applies to, the annual maximum, and that in-network dentists accept the contracted fee. ' +
              'Questions will look like: "A basic in-network procedure has an allowed fee of $1,000 and $50 of deductible applies; how much does the plan pay?"',
          },
        ],
      },
    },
  }),
);
log('build started', buildWorkflowId);

let status;
for (;;) {
  status = (await bedrock.send(new GetAutomatedReasoningPolicyBuildWorkflowCommand({ policyArn, buildWorkflowId }))).status;
  if (!['SCHEDULED', 'CANCEL_REQUESTED', 'PREPROCESSING', 'BUILDING', 'TESTING'].includes(status)) break;
  log('build', status);
  await sleep(20_000);
}
log('build finished', status);
if (status !== 'COMPLETED') process.exit(1);

// 3. Apply the built definition and version it.
const assets = await bedrock.send(
  new GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommand({ policyArn, buildWorkflowId, assetType: 'POLICY_DEFINITION' }),
);
const definition = assets.buildWorkflowAssets?.policyDefinition;
log(`definition: ${definition?.variables?.length ?? 0} variables, ${definition?.rules?.length ?? 0} rules`);
await bedrock.send(new UpdateAutomatedReasoningPolicyCommand({ policyArn, name: NAME, policyDefinition: definition }));
const { definitionHash } = await bedrock.send(new GetAutomatedReasoningPolicyCommand({ policyArn }));
const version = await bedrock.send(new CreateAutomatedReasoningPolicyVersionCommand({ policyArn, lastUpdatedDefinitionHash: definitionHash }));
log('policy version', version.policyArn, version.version);

// 4. Guardrail with the policy attached (reuse by name).
const gName = `${NAME}-guardrail`;
let guardrail = (await bedrock.send(new ListGuardrailsCommand({}))).guardrails?.find((g) => g.name === gName);
let guardrailId = guardrail?.id;
if (!guardrailId) {
  const created = await bedrock.send(
    new CreateGuardrailCommand({
      name: gName,
      description: 'Checks Ting explanations against the Acme Low plan rules',
      blockedInputMessaging: 'Blocked',
      blockedOutputsMessaging: 'Blocked',
      automatedReasoningPolicyConfig: { policies: [version.policyArn], confidenceThreshold: 0.8 },
      crossRegionConfig: { guardrailProfileIdentifier: 'us.guardrail.v1:0' },
    }),
  );
  guardrailId = created.guardrailId;
  log('created guardrail', guardrailId);
}
const gv = await bedrock.send(new CreateGuardrailVersionCommand({ guardrailIdentifier: guardrailId, description: `policy ${version.version}` }));
log('guardrail version', gv.version);

writeFileSync(
  new URL('../ar.json', import.meta.url),
  JSON.stringify({ policyArn, policyVersionArn: version.policyArn, guardrailId, guardrailVersion: gv.version }, null, 2) + '\n',
);
log('wrote infra/ar.json');
