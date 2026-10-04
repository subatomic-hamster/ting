// What Ting's agent does with newly learned work (from an emailed dentist note or treatment plan): schedule it with
// the optimizer, suggest who should do it, spread the cost by month, and check the year's maximum.
import dentistsJson from '../fixtures/dentists.json';
import { nameOf } from './cdt';
import { yearOf } from './dates';
import { priceDentists } from './helpers';
import { optimize } from './schedule';
import type { Profile } from './types';

const HORIZON = 2;
/** Ting suggests leaving the member's own in-network dentist only for real savings. */
export const SWITCH_SAVES = 100;

export interface WorkPlan {
  items: {
    id: string;
    label: string;
    date: string;
    memberOwes: number;
    planPaid: number;
    locked: boolean;
    deadline?: string;
  }[];
  dentist?: {
    id: string;
    name: string;
    inNetwork: boolean;
    distanceMiles: number;
    yourCost: number;
    isCurrent: boolean;
  };
  /** A cheaper in-network practice, when switching would save at least SWITCH_SAVES. */
  alternative?: { name: string; distanceMiles: number; saves: number };
  monthly: { month: string; memberOwes: number }[];
  totalOwed: number;
  maxThisYear: {
    used: number;
    scheduled: number;
    annualMax: number;
    overBy: number;
  };
  questions: string[];
}

export function planNewWork(profile: Profile, newIds: string[], currentDentistId?: string): WorkPlan {
  const opt = optimize(profile, { horizon: HORIZON });
  const schedule = opt.cheapest;
  const items = schedule.lines
    .filter((l) => newIds.includes(l.id))
    .map((l) => {
      const p = profile.procedures.find((x) => x.id === l.id);
      return {
        id: l.id,
        label: nameOf(l),
        date: l.date,
        memberOwes: l.memberOwes,
        planPaid: l.planPaid,
        locked: !!p?.locked,
        deadline: p?.deadline,
      };
    });
  // Who: the member's own in-network dentist, or the cheapest in-network practice accepting new patients; a cheaper
  // practice is offered as an alternative only when it saves at least SWITCH_SAVES.
  const quotes = priceDentists(profile, schedule.placements, dentistsJson.dentists, { horizon: HORIZON });
  const eligible = dentistsJson.dentists.filter((d) => d.inNetwork && (d.acceptingNew || d.id === currentDentistId));
  const ranked = eligible
    .map((d) => ({ d, q: quotes.find((q) => q.dentistId === d.id) }))
    .filter((x) => x.q)
    .sort((a, b) => a.q!.yourCost - b.q!.yourCost || a.d.distanceMiles - b.d.distanceMiles);
  const mine = ranked.find((x) => x.d.id === currentDentistId);
  const cheapest = ranked[0];
  const best = mine ?? cheapest;
  const saves = mine && cheapest ? Math.round((mine.q!.yourCost - cheapest.q!.yourCost) * 100) / 100 : 0;
  const months = new Map<string, number>();
  for (const l of schedule.lines) months.set(l.date.slice(0, 7), (months.get(l.date.slice(0, 7)) ?? 0) + l.memberOwes);
  const year = yearOf(profile.asOf);
  const scheduled = schedule.lines.filter((l) => l.year === year).reduce((s, l) => s + l.planPaid, 0);
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    items,
    dentist: best && {
      id: best.d.id,
      name: best.d.name,
      inNetwork: best.d.inNetwork,
      distanceMiles: best.d.distanceMiles,
      yourCost: best.q!.yourCost,
      isCurrent: best.d.id === currentDentistId,
    },
    alternative:
      mine && cheapest && cheapest.d.id !== mine.d.id && saves >= SWITCH_SAVES
        ? {
            name: cheapest.d.name,
            distanceMiles: cheapest.d.distanceMiles,
            saves,
          }
        : undefined,
    monthly: [...months].sort(([a], [b]) => (a < b ? -1 : 1)).map(([month, owes]) => ({ month, memberOwes: round2(owes) })),
    totalOwed: schedule.expectedOwes,
    maxThisYear: {
      used: profile.ledger.maxUsed,
      scheduled: round2(scheduled),
      annualMax: profile.currentPlan.annualMax,
      overBy: round2(Math.max(0, profile.ledger.maxUsed + scheduled - profile.currentPlan.annualMax)),
    },
    questions: schedule.questions,
  };
}
