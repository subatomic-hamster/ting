// Engine-side views the UI renders as-is, so screens never do arithmetic on amounts.

import { round2 } from './adjudicate';
import { yearOf } from './dates';
import { evaluateSchedule, type ScheduleOptions } from './schedule';
import type { Placement, PlanRules, Profile, ScheduleEvaluation } from './types';

export interface MaxGauge {
  year: number;
  annualMax: number;
  /** Paid on claims already processed. */
  used: number;
  /** Paid on work in the schedule. */
  scheduled: number;
  /** Max plus rollover account left at year end. */
  remaining: number;
  /** MaxRewards account available that year. */
  rollover: number;
}

/** This year's and next year's annual max, split into claims, scheduled work and what's left. */
export function maxGauges(profile: Profile, ev: ScheduleEvaluation, nextPlan: PlanRules = profile.currentPlan): MaxGauge[] {
  return ev.years.slice(0, 2).map((y, i) => {
    const used = i === 0 ? profile.ledger.maxUsed : 0;
    return {
      year: y.year,
      annualMax: (i === 0 ? profile.currentPlan : nextPlan).annualMax,
      used,
      scheduled: round2(Math.max(0, y.maxUsed - used)),
      remaining: y.maxRemaining,
      rollover: i === 0 ? profile.ledger.rolloverBalance : ev.years[0].rolloverEarned,
    };
  });
}

export interface LeftOnTable {
  /** Annual max still unused at Dec 31 after the scheduled work. */
  maxRemaining: number;
  /** Covered cleanings not used or scheduled this year. */
  unusedCleanings: number;
  /** FSA balance the schedule doesn't spend and the plan won't carry over. */
  fsaExpiring: number;
  /** Last day this year's FSA money can be spent (end of the grace period, if any). */
  fsaDeadline: string;
}

export function leftOnTable(profile: Profile, ev: ScheduleEvaluation): LeftOnTable {
  const y0 = yearOf(profile.asOf);
  const [thisYear] = ev.years;
  const limit = profile.currentPlan.frequencyLimits.find((f) => f.codes.includes('D1110') && f.period.kind === 'calendarYear');
  const cleanings = (cdt: string, date: string) => limit?.codes.includes(cdt) && yearOf(date) === y0;
  const cdtOf = new Map(profile.procedures.map((p) => [p.id, p.cdt]));
  const used =
    profile.ledger.history.filter((h) => cleanings(h.cdt, h.date)).length +
    ev.placements.filter((p) => cleanings(cdtOf.get(p.id) ?? '', p.date)).length;
  const { money } = profile;
  const leftover = money.fsaOffered ? Math.max(0, money.fsaBalance - thisYear.fsaUsed) : 0;
  const fsaDeadline = money.fsaRule.kind === 'grace' ? `${y0 + 1}-${money.fsaRule.until}` : `${y0}-12-31`;
  // Grace period: leftover pays for certain work next year up to the deadline; the rest expires.
  const likelihood = new Map(profile.procedures.map((p) => [p.id, p.likelihood ?? 1]));
  const inGrace = round2(
    ev.lines.filter((l) => l.year > y0 && l.date <= fsaDeadline && (likelihood.get(l.id) ?? 1) >= 1).reduce((s, l) => s + l.memberOwes, 0),
  );
  const kept =
    money.fsaRule.kind === 'carryover' ? Math.min(leftover, money.fsaRule.max) : money.fsaRule.kind === 'grace' ? Math.min(leftover, inGrace) : 0;
  return {
    maxRemaining: thisYear.maxRemaining,
    unusedCleanings: Math.max(0, (limit?.count ?? 0) - used),
    fsaExpiring: round2(leftover - kept),
    fsaDeadline,
  };
}

export interface Dentist {
  id: string;
  inNetwork: boolean;
  /** This dentist's fees relative to the area's typical fees. */
  feeMultiplier: number;
}

export interface DentistQuote {
  dentistId: string;
  /** What you'd owe for the schedule if this dentist were in network. */
  inNetworkCost: number;
  /** What you'd owe out of network, including the balance bill. */
  outOfNetworkCost: number;
  outOfNetworkExtra: number;
  /** Cost given the dentist's actual network status. */
  yourCost: number;
  /** More than the cheapest dentist in the list (0 for the cheapest). */
  vsCheapest: number;
}

/** Prices the same schedule at each dentist: their fees, in and out of network. Out of network the plan allows the area's UCR fee. */
export function priceDentists(profile: Profile, placements: Placement[], dentists: Dentist[], opts: ScheduleOptions = {}): DentistQuote[] {
  const owes = (m: number, inNetwork: boolean) =>
    evaluateSchedule(
      {
        ...profile,
        procedures: profile.procedures.map((p) => ({
          ...p,
          fee: round2(p.fee * m),
          inNetwork,
          allowedFee: inNetwork ? round2((p.allowedFee ?? profile.fees[p.cdt]?.inNetwork ?? p.fee) * m) : undefined,
        })),
      },
      placements,
      opts,
    ).expectedOwes;
  const quotes = dentists.map((d) => {
    const inNetworkCost = owes(d.feeMultiplier, true);
    const outOfNetworkCost = owes(d.feeMultiplier, false);
    return {
      dentistId: d.id,
      inNetworkCost,
      outOfNetworkCost,
      outOfNetworkExtra: round2(outOfNetworkCost - inNetworkCost),
      yourCost: d.inNetwork ? inNetworkCost : outOfNetworkCost,
    };
  });
  const cheapest = Math.min(...quotes.map((q) => q.yourCost));
  return quotes.map((q) => ({ ...q, vsCheapest: round2(q.yourCost - cheapest) }));
}
