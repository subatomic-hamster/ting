import { CDT, cdtLabel } from './cdt';
import { formatDate } from './dates';
import { pct, usd } from './format';
import type { AdjudicatedLine, PlanRules, WaterfallKey } from './types';

// One plain sentence per waterfall step, citing the plan section. Every number comes from the engine.
// The Bedrock explainer (AWS) must return the same shape and pass verifyNumbers before display.

export interface ExplainedStep {
  key: WaterfallKey;
  text: string;
  section?: string;
}

export interface Explainer {
  explain(line: AdjudicatedLine, rules: PlanRules): Promise<ExplainedStep[]>;
}

const CLASS_NAME = { preventive: 'Preventive', basic: 'Basic', major: 'Major', ortho: 'Orthodontic', excluded: 'Excluded' } as const;

export function explainLine(line: AdjudicatedLine): ExplainedStep[] {
  const name = cdtLabel(line.cdt, line.tooth).replace(/^./, (c) => c.toLowerCase());
  const category = CDT[line.cdt]?.category;
  return line.waterfall.map((step) => {
    const amount = usd(Math.abs(step.delta));
    const s = (text: string): ExplainedStep => ({ key: step.key, text, section: step.section });
    switch (step.key) {
      case 'fee':
        return s(`Your dentist's fee for the ${name} is ${usd(line.billed)}.`);
      case 'networkDiscount':
        return s(`Your dentist is in network, so Lincoln's contracted fee of ${usd(line.allowed)} replaces the ${usd(line.billed)} fee, taking ${amount} off.`);
      case 'membershipDiscount':
        return s(line.memberOwes === 0 ? `Your membership fee already covers this ${name}.` : `Your dentist's membership plan takes ${amount} off the fee.`);
      case 'coinsurance':
        return s(
          `${CLASS_NAME[line.serviceClass]} services like this ${category === 'endodontics' ? 'root canal' : name} are paid at ${pct(line.coinsuranceRate)} of the ${usd(line.allowed)} ${line.balanceBill > 0 ? "plan allowance" : 'allowed fee'}, which takes ${amount} off.`,
        );
      case 'alternateBenefit':
        return s(`On back teeth the plan pays tooth-colored fillings at the silver-filling fee (${usd(line.benefitBase)} instead of ${usd(line.allowed)}), adding ${amount} to your share.`);
      case 'deductible':
        return s(`The first ${usd(line.deductibleApplied)} of ${line.year} basic and major care is yours (the deductible), adding ${amount} to your share.`);
      case 'maxCap':
        return s(`Only ${usd(line.maxRemainingBefore)} of your ${line.year} annual max is left, so the plan pays ${usd(line.planPaid)} instead of ${usd(line.planShare)} and you pay the other ${amount}.`);
      case 'denied':
        return s(`The plan pays nothing here. ${line.denied?.detail ?? ''}`.trim());
      case 'youPay':
        return s(
          `You pay ${usd(line.memberOwes)}${line.balanceBill > 0 ? `, including ${usd(line.balanceBill)} your out-of-network dentist bills above the plan's allowance` : ''}${CDT[line.cdt]?.prepDated ? `. For crowns the plan year is set by the preparation appointment (${formatDate(line.date)})` : ''}.`,
        );
    }
  });
}

export const localExplainer: Explainer = {
  explain: async (line) => explainLine(line),
};

/** Dollar amounts in a sentence. */
export function dollarsIn(text: string): number[] {
  return [...text.matchAll(/\$\s?(\d{1,3}(?:,\d{3})*|\d+)(\.\d{1,2})?/g)].map((m) => Number(m[1].replace(/,/g, '') + (m[2] ?? '')));
}

/** Every dollar figure shown must trace back to an engine output, never to model text. */
export function verifyNumbers(text: string, line: AdjudicatedLine): { ok: boolean; unknown: number[] } {
  const known = new Set<number>(
    [
      line.billed,
      line.allowed,
      line.benefitBase,
      line.deductibleApplied,
      line.planShare,
      line.planPaid,
      line.capReduction,
      line.memberOwes,
      line.balanceBill,
      line.maxRemainingBefore,
      ...line.waterfall.flatMap((s) => [Math.abs(s.delta), s.running]),
    ].map((n) => Math.round(n * 100)),
  );
  const unknown = dollarsIn(text).filter((n) => !known.has(Math.round(n * 100)));
  return { ok: unknown.length === 0, unknown };
}
