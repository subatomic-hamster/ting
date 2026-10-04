// Monthly overview: the month's activity, what's coming, whether the member is on track to use their plan, and what
// to do differently. Every amount comes from the engine; the email only formats it.
import { cdtLabel } from './cdt';
import { addDays, yearOf } from './dates';
import { usd } from './format';
import { leftOnTable } from './helpers';
import type { ScheduleEvaluation } from './types';
import type { Profile } from './types';

export interface MonthlyOverview {
  month: string; // YYYY-MM
  done: { label: string; date: string; planPaid: number }[];
  upcoming: {
    label: string;
    date: string;
    memberOwes: number;
    inNetwork: boolean;
  }[];
  maxUsed: number;
  maxScheduled: number;
  annualMax: number;
  /** Share of the annual max used or scheduled this plan year. */
  usedPct: number;
  /** Months left in the plan year, counting this one. */
  monthsLeft: number;
  onTrack: {
    status: 'on track' | 'room to use' | 'over the max';
    message: string;
  };
  unusedCleanings: number;
  fsaExpiring: number;
  fsaDeadline: string;
  owedThisYear: number;
  owedNextYear: number;
  suggestions: string[];
  /** Every amount the overview mentions, so a model rewording can be checked. */
  amounts: number[];
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthName = (yyyyMm: string) => `${MONTHS[Number(yyyyMm.slice(5, 7)) - 1]} ${yyyyMm.slice(0, 4)}`;
const short = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1].slice(0, 3)} ${Number(iso.slice(8, 10))}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function monthlyOverview(profile: Profile, ev: ScheduleEvaluation): MonthlyOverview {
  const month = profile.asOf.slice(0, 7);
  const year = yearOf(profile.asOf);
  const plan = profile.currentPlan;
  const left = leftOnTable(profile, ev);
  const done = profile.ledger.history
    .filter((h) => h.source !== 'user' && h.date.slice(0, 7) === month)
    .map((h) => ({
      label: cdtLabel(h.cdt, h.tooth),
      date: h.date,
      planPaid: h.planPaid,
    }));
  const soon = addDays(profile.asOf, 60);
  const upcoming = ev.lines
    .filter((l) => l.date >= profile.asOf && l.date <= soon)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((l) => ({
      label: cdtLabel(l.cdt, l.tooth),
      date: l.date,
      memberOwes: l.memberOwes,
      inNetwork: l.balanceBill === 0,
    }));
  const thisYear = ev.lines.filter((l) => l.year === year);
  const maxScheduled = round2(thisYear.reduce((s, l) => s + l.planPaid, 0));
  const maxUsed = profile.ledger.maxUsed;
  const usedPct = plan.annualMax > 0 ? Math.min(1, (maxUsed + maxScheduled) / plan.annualMax) : 0;
  const monthsLeft = 12 - Number(month.slice(5, 7)) + 1;
  const owedThisYear = round2(thisYear.reduce((s, l) => s + l.memberOwes, 0));
  const owedNextYear = round2(ev.lines.filter((l) => l.year > year).reduce((s, l) => s + l.memberOwes, 0));
  const remaining = Math.max(0, round2(plan.annualMax - maxUsed - maxScheduled));

  const onTrack: MonthlyOverview['onTrack'] =
    maxUsed + maxScheduled > plan.annualMax + 0.5
      ? {
          status: 'over the max',
          message: `Planned work this year needs more than your ${usd(plan.annualMax)} annual maximum, so part of it is on you.`,
        }
      : remaining > 0.25 * plan.annualMax && monthsLeft <= 3
        ? {
            status: 'room to use',
            message: `${usd(remaining)} of your annual maximum is still unplanned with ${monthsLeft} month${monthsLeft === 1 ? '' : 's'} left. It resets on Jan 1.`,
          }
        : {
            status: 'on track',
            message: `With what's done and scheduled, you'll use ${Math.round(usedPct * 100)}% of your annual maximum.`,
          };

  const suggestions: string[] = [];
  if (left.unusedCleanings > 0)
    suggestions.push(
      `Book your ${left.unusedCleanings === 1 ? 'remaining covered cleaning' : `${left.unusedCleanings} remaining covered cleanings`} before Dec 31; they're paid at 100% and don't come back.`,
    );
  if (left.fsaExpiring > 0)
    suggestions.push(`${usd(left.fsaExpiring)} of FSA money expires on ${short(left.fsaDeadline)}. Use it on scheduled care before then.`);
  if (onTrack.status === 'over the max' && owedNextYear === 0)
    suggestions.push('Ask your dentist whether any planned work can safely wait until January, when the maximum resets.');
  const outOfNetwork = upcoming.filter((u) => !u.inNetwork);
  if (outOfNetwork.length)
    suggestions.push(
      `${outOfNetwork.length} upcoming visit${outOfNetwork.length === 1 ? ' is' : 's are'} out of network. An in-network dentist could cost less; see Find a dentist.`,
    );
  if (!upcoming.length && !done.length)
    suggestions.push('Nothing scheduled in the next two months. If your dentist mentioned any work, email it to Ting and it will plan it.');

  const amounts = [
    ...done.map((d) => d.planPaid),
    ...upcoming.map((u) => u.memberOwes),
    maxUsed,
    maxScheduled,
    plan.annualMax,
    remaining,
    left.fsaExpiring,
    owedThisYear,
    owedNextYear,
  ];
  return {
    month,
    done,
    upcoming,
    maxUsed,
    maxScheduled,
    annualMax: plan.annualMax,
    usedPct,
    monthsLeft,
    onTrack,
    unusedCleanings: left.unusedCleanings,
    fsaExpiring: left.fsaExpiring,
    fsaDeadline: left.fsaDeadline,
    owedThisYear,
    owedNextYear,
    suggestions,
    amounts,
  };
}
