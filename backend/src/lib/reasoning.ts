// Automated Reasoning: the guardrail holds a policy built from the plan's benefits summary (infra/scripts/ar-policy.mjs).
// For each estimate line we state the engine's premises and its plan-pays amount, and the policy proves or refutes it.
import { ApplyGuardrailCommand, BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { usd } from '../../../src/engine/format';
import type { AdjudicatedLine } from '../../../src/engine/types';

const GUARDRAIL_ID = process.env.AR_GUARDRAIL_ID ?? '';
const GUARDRAIL_VERSION = process.env.AR_GUARDRAIL_VERSION ?? '';
/** The policy was built from this plan's document; other plans aren't checked. */
const RULES_PREFIX = process.env.AR_RULES_PREFIX ?? '';
const client = new BedrockRuntimeClient({});

export type Verdict = 'VALID' | 'INVALID' | 'SATISFIABLE' | 'IMPOSSIBLE' | 'TRANSLATION_AMBIGUOUS' | 'TOO_COMPLEX' | 'NO_TRANSLATIONS';

export interface Reasoning {
  verdict: Verdict;
  /** The statement that was checked, built only from engine numbers. */
  claim: string;
  premises: string;
}

const VERDICTS: Record<string, Verdict> = {
  valid: 'VALID',
  invalid: 'INVALID',
  satisfiable: 'SATISFIABLE',
  impossible: 'IMPOSSIBLE',
  translationAmbiguous: 'TRANSLATION_AMBIGUOUS',
  tooComplex: 'TOO_COMPLEX',
  noTranslations: 'NO_TRANSLATIONS',
};

/** The question and claim for one line, or undefined when the policy can't speak to it. */
export function statementFor(line: AdjudicatedLine): { premises: string; claim: string } | undefined {
  if (line.denied || !['preventive', 'basic', 'major'].includes(line.serviceClass)) return undefined;
  if (!RULES_PREFIX || !line.rulesVersion.startsWith(RULES_PREFIX)) return undefined;
  const network = line.balanceBill > 0 ? 'out-of-network' : 'in-network';
  const premises = `An ${network} ${line.serviceClass} service has an allowed fee of ${usd(line.benefitBase)} and ${usd(line.deductibleApplied)} of the deductible applies. How much does the plan pay?`;
  return { premises, claim: `The plan pays ${usd(line.planShare)}.` };
}

export async function checkLine(line: AdjudicatedLine): Promise<Reasoning | undefined> {
  const st = statementFor(line);
  if (!st || !GUARDRAIL_ID) return undefined;
  const res = await client.send(
    new ApplyGuardrailCommand({
      guardrailIdentifier: GUARDRAIL_ID,
      guardrailVersion: GUARDRAIL_VERSION,
      source: 'OUTPUT',
      content: [
        { text: { text: st.premises, qualifiers: ['query'] } },
        { text: { text: st.claim, qualifiers: ['guard_content'] } },
      ],
    }),
  );
  const finding = res.assessments?.[0]?.automatedReasoningPolicy?.findings?.[0];
  const key = finding ? Object.keys(finding).find((k) => k in VERDICTS && (finding as unknown as Record<string, unknown>)[k]) : undefined;
  return key ? { verdict: VERDICTS[key], ...st } : undefined;
}
