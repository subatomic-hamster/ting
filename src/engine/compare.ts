import { round2 } from './adjudicate';
import { CDT, cdtLabel } from './cdt';
import { formatDate, yearOf } from './dates';
import { usd } from './format';
import { fsaLimits } from './fsa';
import { optimize, type PlannedSchedule } from './schedule';
import type { AdjudicatedLine, ISODate, PlanRules, Profile } from './types';

// F4: compare every option for next plan year on expected total cost (premiums + care, after tax).
// Year one is this plan year (current plan, fixed); year two is the year being enrolled for.
const HORIZON = 2;

export interface OptionResult {
  plan: PlanRules;
  /** Cheapest schedule under this option. */
  schedule: PlannedSchedule;
  premiumsAnnual: number;
  /** Premiums after the tax saving when they're deducted pre-tax. */
  premiumCost: number;
  careCost: number;
  total: number;
  /** Total if every "maybe" happens. */
  badYearTotal: number;
  switching: boolean;
  /** Procedures this option won't cover next year because of a waiting period. */
  waiting: AdjudicatedLine[];
}

export function priceOption(profile: Profile, plan: PlanRules): OptionResult {
  const schedule = optimize(profile, { nextPlan: plan, horizon: HORIZON }).cheapest;
  const premiumsAnnual = round2(plan.premiumMonthly * 12);
  const premiumCost = round2(premiumsAnnual * (plan.premiumPreTax ? 1 - profile.money.marginalTaxRate : 1));
  return {
    plan,
    schedule,
    premiumsAnnual,
    premiumCost,
    careCost: schedule.expectedCost,
    total: round2(schedule.expectedCost + premiumCost),
    badYearTotal: round2(schedule.badYearCost + premiumCost),
    switching: plan.id !== profile.currentPlan.id,
    waiting: schedule.lines.filter((l) => l.denied?.reason === 'waitingPeriod'),
  };
}

export const bestOf = (options: OptionResult[]) =>
  options.reduce((a, b) => (b.total < a.total - 0.005 || (Math.abs(b.total - a.total) <= 0.005 && !b.switching && a.switching) ? b : a));

const withLikelihood = (profile: Profile, id: string, p: number): Profile => ({
  ...profile,
  procedures: profile.procedures.map((q) => (q.id === id ? { ...q, likelihood: p } : q)),
});

export interface TippingPoint {
  procedureId: string;
  /** Above this likelihood `above` is the better choice; below it `below`. */
  likelihood: number;
  below: string;
  above: string;
  text: string;
}

/** The "maybe" slider's tipping point: the likelihood where the recommended option flips. */
export function tippingPoint(profile: Profile, plans: PlanRules[], procedureId: string): TippingPoint | undefined {
  const proc = profile.procedures.find((p) => p.id === procedureId);
  if (!proc) return undefined;
  const bestAt = (p: number) => bestOf(plans.map((plan) => priceOption(withLikelihood(profile, procedureId, p), plan))).plan;
  const lo = bestAt(0);
  const hi = bestAt(1);
  if (lo.id === hi.id) return undefined;
  let a = 0;
  let b = 1;
  for (let i = 0; i < 10; i++) {
    const mid = (a + b) / 2;
    if (bestAt(mid).id === lo.id) a = mid;
    else b = mid;
  }
  const likelihood = Math.round(b * 100) / 100;
  return {
    procedureId,
    likelihood,
    below: lo.id,
    above: hi.id,
    text: `Above a ${Math.round(b * 100)}% chance of the ${cdtLabel(proc.cdt, proc.tooth).replace(/ \(.*?\)/, '').toLowerCase()}, ${hi.name} pays for itself.`,
  };
}

export interface FsaRecommendation {
  year: number;
  election: number;
  /** Expected out-of-pocket care next year (certain + each "maybe" × its likelihood). */
  expectedCare: number;
  carryoverIn: number;
  limit: number;
  /** True until the IRS publishes next year's limit. */
  provisional: boolean;
  /** Current-year balance left after the scheduled care, and when it's forfeited. */
  leftoverThisYear: number;
  forfeitDate: ISODate;
}

const ceilTo10 = (n: number) => Math.ceil(n / 10) * 10;

export function recommendFsa(profile: Profile, option: OptionResult): FsaRecommendation {
  const { money } = profile;
  const [thisYear, nextYear] = option.schedule.years;
  const leftover = money.fsaOffered ? Math.max(0, money.fsaBalance - thisYear.owes) : 0;
  const carryoverIn = money.fsaRule.kind === 'carryover' ? Math.min(leftover, money.fsaRule.max) : money.fsaRule.kind === 'grace' ? leftover : 0;
  const limits = fsaLimits(nextYear.year);
  return {
    year: nextYear.year,
    election: money.fsaOffered ? Math.min(limits.electionLimit, ceilTo10(Math.max(0, nextYear.owes - carryoverIn))) : 0,
    expectedCare: nextYear.owes,
    carryoverIn: round2(carryoverIn),
    limit: limits.electionLimit,
    provisional: limits.provisional,
    leftoverThisYear: round2(leftover),
    forfeitDate: money.fsaRule.kind === 'grace' ? `${thisYear.year + 1}-${money.fsaRule.until}` : `${thisYear.year}-12-31`,
  };
}

export interface Insight {
  id: 'hitMax' | 'lowUse' | 'waitingPeriod' | 'maybe' | 'smallYear' | 'outOfNetwork';
  text: string;
}

/** Recommendation rules from the spec, every number from the engine. */
export function insights(profile: Profile, options: OptionResult[], tipping: TippingPoint[]): Insight[] {
  const out: Insight[] = [];
  const current = options.find((o) => !o.switching);
  const insurance = options.filter((o) => o.plan.kind === 'insurance');
  const bigger = insurance.filter((o) => o.plan.annualMax > profile.currentPlan.annualMax).sort((a, b) => b.plan.annualMax - a.plan.annualMax)[0];
  const ranOut = profile.ledger.pastYears.filter((y) => y.planPaid >= y.annualMax).map((y) => y.year);
  if (ranOut.length && bigger)
    out.push({
      id: 'hitMax',
      text: `You ran out of your max in ${ranOut.join(' and ')}. ${bigger.plan.name}'s ${usd(bigger.plan.annualMax)} max would have covered up to ${usd(bigger.plan.annualMax - profile.currentPlan.annualMax)} more.`,
    });
  const recent = profile.ledger.pastYears.slice(-2);
  const cheaper = insurance.filter((o) => o.premiumsAnnual < (current?.premiumsAnnual ?? 0)).sort((a, b) => a.premiumsAnnual - b.premiumsAnnual)[0];
  if (recent.length === 2 && recent.every((y) => y.planPaid < 0.2 * y.annualMax) && cheaper && current) {
    const avg = recent.reduce((s, y) => s + y.planPaid, 0) / 2;
    out.push({ id: 'lowUse', text: `You've used ${usd(Math.round(avg))} a year. ${cheaper.plan.name} saves ${usd(current.premiumsAnnual - cheaper.premiumsAnnual)} in premiums.` });
  }
  for (const o of options)
    for (const l of o.waiting) {
      const proc = profile.procedures.find((p) => p.id === l.id);
      if (!proc) continue;
      out.push({
        id: 'waitingPeriod',
        text: `${o.plan.name} has a waiting period, so it won't cover the ${cdtLabel(proc.cdt, proc.tooth).toLowerCase()} in ${l.year}: ${l.denied?.detail}`,
      });
    }
  for (const t of tipping) out.push({ id: 'maybe', text: t.text });
  const onlyPreventive = profile.procedures.every((p) => ['diagnostic', 'preventive'].includes(CDT[p.cdt]?.category ?? ''));
  const cheapest = [...insurance].sort((a, b) => a.premiumsAnnual - b.premiumsAnnual)[0];
  if (onlyPreventive && cheapest) out.push({ id: 'smallYear', text: `Only cleanings and checkups planned: ${cheapest.plan.name} covers them at 100%.` });
  const oon = profile.procedures.filter((p) => !p.inNetwork);
  if (oon.length && current) {
    const inNet = priceOption(
      { ...profile, procedures: profile.procedures.map((p) => (p.inNetwork ? p : { ...p, inNetwork: true, allowedFee: undefined })) },
      current.plan,
    );
    const extra = round2(current.careCost - inNet.careCost);
    if (extra > 0) out.push({ id: 'outOfNetwork', text: `Staying with your out-of-network dentist costs ${usd(extra)} more than an in-network dentist for this treatment plan.` });
  }
  return out;
}

export interface EnrollmentItem {
  id: string;
  label: string;
  date: ISODate;
  /** "before Dec 31" or the date. */
  when: string;
  fsaYear: number;
  /** Crown/bridge: what's booked is the preparation appointment. */
  prepDated: boolean;
  likelihood: number;
}

export interface EnrollmentCard {
  choice: OptionResult;
  fsa: FsaRecommendation;
  items: EnrollmentItem[];
  /** vs keeping the current plan and doing everything as soon as possible. */
  baselineTotal: number;
  expectedSavings: number;
  summary: string;
  disclaimer: string;
}

export interface Comparison {
  options: OptionResult[];
  best: OptionResult;
  tipping: TippingPoint[];
  insights: Insight[];
  card: EnrollmentCard;
}

export const DISCLAIMER = 'Educational estimate — not insurance or tax advice.';

export function compare(profile: Profile, plans: PlanRules[]): Comparison {
  const options = plans.map((p) => priceOption(profile, p));
  const best = bestOf(options);
  const tipping = profile.procedures
    .filter((p) => (p.likelihood ?? 1) < 1)
    .map((p) => tippingPoint(profile, plans, p.id))
    .filter((t): t is TippingPoint => t !== undefined);
  return { options, best, tipping, insights: insights(profile, options, tipping), card: enrollmentCard(profile, best) };
}

export function enrollmentCard(profile: Profile, choice: OptionResult): EnrollmentCard {
  const fsa = recommendFsa(profile, choice);
  const y0 = yearOf(profile.asOf);
  const baselineSchedule = optimize(profile, { horizon: HORIZON }).fastest;
  const current = profile.currentPlan;
  const baselineTotal = round2(
    baselineSchedule.expectedCost + current.premiumMonthly * 12 * (current.premiumPreTax ? 1 - profile.money.marginalTaxRate : 1),
  );
  const items = choice.schedule.placements.map((pl) => {
    const proc = profile.procedures.find((p) => p.id === pl.id);
    const prepDated = !!(proc && CDT[proc.cdt]?.prepDated);
    const year = yearOf(pl.date);
    return {
      id: pl.id,
      label: proc ? cdtLabel(proc.cdt, proc.tooth) : pl.id,
      date: pl.date,
      when: year === y0 ? 'before Dec 31' : formatDate(pl.date).replace(/, \d{4}$/, ''),
      fsaYear: year,
      prepDated,
      likelihood: proc?.likelihood ?? 1,
    };
  });
  const expectedSavings = round2(Math.max(0, baselineTotal - choice.total));
  const groups = new Map<string, EnrollmentItem[]>();
  for (const it of items.filter((i) => i.likelihood >= 1)) groups.set(`${it.when}|${it.fsaYear}`, [...(groups.get(`${it.when}|${it.fsaYear}`) ?? []), it]);
  const when = [...groups.values()].map(
    (g) => `${g.map((i) => i.label.replace(/ \(.*?\)/, '').toLowerCase()).join(' + ')} ${g[0].when === 'before Dec 31' ? 'before Dec 31' : g[0].when} (${g[0].fsaYear} FSA)`,
  );
  const parts = [
    `choose ${choice.plan.name}`,
    ...(fsa.election > 0 ? [`elect ${usd(fsa.election)} FSA`] : []),
    ...when,
    `expected savings ${usd(Math.round(expectedSavings))}`,
  ];
  return {
    choice,
    fsa,
    items,
    baselineTotal,
    expectedSavings,
    summary: `Your enrollment decisions: ${parts.join(' · ')}`,
    disclaimer: DISCLAIMER,
  };
}
