// F6 digest: what changed and what to do, computed by the engine. The private version (the default for email
// and push) says only that there's an update; amounts and procedures stay inside the app.
import { cdtLabel } from './cdt';
import { addDays } from './dates';
import { usd } from './format';
import { leftOnTable } from './helpers';
import type { Profile, ScheduleEvaluation } from './types';

export type Cadence = 'weekly' | 'monthly' | 'off';
export type Detail = 'private' | 'detailed';

export interface Digest {
  title: string;
  /** Full text, for inside the app or a member who chose detailed emails. */
  body: string;
  /** Every amount the body mentions, so a model rewording can be checked. */
  amounts: number[];
}

export const PRIVATE_DIGEST = { title: 'You have a dental benefits update', body: 'Sign in to Ting to see it. For your privacy, details stay inside the app.' };

export function buildDigest(profile: Profile, ev: ScheduleEvaluation, days = 30): Digest {
  const left = leftOnTable(profile, ev);
  const soon = addDays(profile.asOf, days);
  const next = ev.lines.filter((l) => l.date >= profile.asOf && l.date <= soon).sort((a, b) => (a.date < b.date ? -1 : 1));
  const lines: string[] = [];
  const amounts: number[] = [];
  for (const l of next.slice(0, 3)) {
    lines.push(`${cdtLabel(l.cdt, l.tooth)} on ${l.date}: you pay about ${usd(l.memberOwes)}.`);
    amounts.push(l.memberOwes);
  }
  if (left.maxRemaining > 0) {
    lines.push(`${usd(left.maxRemaining)} of this year's annual max is still unused.`);
    amounts.push(left.maxRemaining);
  }
  if (left.unusedCleanings > 0) lines.push(`${left.unusedCleanings} covered cleaning${left.unusedCleanings === 1 ? '' : 's'} left this year.`);
  if (left.fsaExpiring > 0) {
    lines.push(`${usd(left.fsaExpiring)} of FSA money expires on ${left.fsaDeadline}.`);
    amounts.push(left.fsaExpiring);
  }
  return {
    title: next.length ? `Coming up: ${next.length} visit${next.length === 1 ? '' : 's'} in the next ${days} days` : 'Your dental benefits this month',
    body: lines.length ? lines.join('\n') : 'Nothing needs your attention right now.',
    amounts,
  };
}

/** Weekly digests go out on Mondays; monthly ones on the first Monday. */
export function digestDue(cadence: Cadence, iso: string): boolean {
  if (cadence === 'off') return false;
  const d = new Date(`${iso}T12:00:00Z`);
  const monday = d.getUTCDay() === 1;
  return cadence === 'weekly' ? monday : monday && d.getUTCDate() <= 7;
}
