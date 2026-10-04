// F7 EOB check: when Lincoln's EOB differs from Ting's estimate, draft a short, factual message to Lincoln.
// Every amount comes from the engine's estimate or the EOB itself; a model may only reword it (and is checked).
import { cdtLabel } from './cdt';
import { usd } from './format';
import type { PlanRules } from './types';

export interface EobDiscrepancy {
  claimId: string;
  cdt: string;
  tooth?: number;
  serviceDate: string;
  /** What Ting estimated the member owes. */
  estimated: number;
  /** What the EOB says the member owes. */
  actual: number;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}`;

/** The amounts a draft may mention. */
export const appealAmounts = (d: EobDiscrepancy) => [d.estimated, d.actual, Math.round(Math.abs(d.actual - d.estimated) * 100) / 100];

export function appealDraft(d: EobDiscrepancy, plan: Pick<PlanRules, 'name' | 'sections'>): string {
  const what = cdtLabel(d.cdt, d.tooth).replace(/^./, (c) => c.toLowerCase());
  const diff = Math.abs(d.actual - d.estimated);
  const direction = d.actual > d.estimated ? 'more' : 'less';
  const cite = plan.sections.coinsurance ? ` (${plan.sections.coinsurance})` : '';
  return [
    `Hello Member Services,`,
    ``,
    `I'm writing about claim ${d.claimId} for a ${what} on ${longDate(d.serviceDate)}.`,
    `The Explanation of Benefits says I owe ${usd(d.actual)}. Based on my plan, ${plan.name}${cite}, I expected to owe ${usd(d.estimated)}, which is ${usd(diff)} ${direction}.`,
    `Could you check how this claim was processed, including the service class, coinsurance and deductible applied, and send a corrected EOB if needed?`,
    ``,
    `Thank you.`,
  ].join('\n');
}
