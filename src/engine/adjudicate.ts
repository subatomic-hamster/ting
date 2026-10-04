import { CDT, isPosterior, outOfNetworkAllowance } from './cdt';
import { addMonths, dayOfYear, yearOf } from './dates';
import type {
  AdjudicatedLine,
  FrequencyLimit,
  ISODate,
  Placement,
  PlanRules,
  PlannedProcedure,
  Profile,
  ServiceClass,
  WaterfallStep,
} from './types';

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** The plan in force for one calendar plan year. */
export interface PlanYear {
  year: number;
  rules: PlanRules;
  /** Waiting periods run from here. A plan the member already has started long ago. */
  coverageStart: ISODate;
}

/** Current plan this year, `nextPlan` (default: keep the current one) for the following years. */
export function planYearsFor(profile: Profile, nextPlan: PlanRules = profile.currentPlan, horizon = 3): PlanYear[] {
  const y0 = yearOf(profile.asOf);
  const keep = nextPlan.id === profile.currentPlan.id;
  return Array.from({ length: horizon }, (_, i) =>
    i === 0
      ? { year: y0, rules: profile.currentPlan, coverageStart: profile.ledger.coverageStart }
      : { year: y0 + i, rules: nextPlan, coverageStart: keep ? profile.ledger.coverageStart : `${y0 + 1}-01-01` },
  );
}

export function serviceClassOf(cdt: string, rules: PlanRules): ServiceClass | 'excluded' {
  const info = CDT[cdt];
  return info ? rules.categoryClass[info.category] : 'excluded';
}

interface PriorService {
  date: ISODate;
  cdt: string;
  tooth?: number;
}

function inWindow(limit: FrequencyLimit, prior: ISODate, date: ISODate): boolean {
  if (prior > date) return false;
  if (limit.period.kind === 'calendarYear') return yearOf(prior) === yearOf(date);
  return prior > addMonths(date, -limit.period.months);
}

function limitsFor(cdt: string, tooth: number | undefined, rules: PlanRules, prior: PriorService[], date: ISODate) {
  return rules.frequencyLimits
    .filter((l) => l.codes.includes(cdt))
    .map((limit) => ({
      limit,
      used: prior.filter((p) => limit.codes.includes(p.cdt) && (!limit.perTooth || p.tooth === tooth) && inWindow(limit, p.date, date)),
    }));
}

/** Earliest date on/after `from` the frequency limits allow, ignoring later-year resets. */
export function frequencyEligibleFrom(proc: PlannedProcedure, rules: PlanRules, prior: PriorService[], from: ISODate): ISODate {
  let date = from;
  for (const { limit, used } of limitsFor(proc.cdt, proc.tooth, rules, prior, from)) {
    if (used.length < limit.count) continue;
    const dates = used.map((u) => u.date).sort();
    const blocking = dates[dates.length - limit.count];
    const free = limit.period.kind === 'calendarYear' ? `${yearOf(from) + 1}-01-01` : addMonths(blocking, limit.period.months);
    if (free > date) date = free;
  }
  return date;
}

export function waitingPeriodEnds(cls: ServiceClass | 'excluded', py: PlanYear): ISODate | undefined {
  if (cls === 'excluded' || py.rules.kind !== 'insurance') return undefined;
  const months = py.rules.waitingPeriodMonths[cls];
  return months > 0 ? addMonths(py.coverageStart, months) : undefined;
}

interface YearState {
  py: PlanYear;
  maxUsed: number;
  dedMet: number;
  orthoUsed: number;
  rollover: number;
  pendingDeposit: number;
  paid: number;
  claims: number;
  allInNetwork: boolean;
  q4Deductible: number;
  rolloverEarned: number;
}

export interface YearSummary {
  year: number;
  rules: PlanRules;
  maxUsed: number;
  /** Annual max left plus the rollover account, at year end. */
  maxRemaining: number;
  planPaid: number;
  rolloverEarned: number;
  deductibleMet: number;
}

export interface Adjudication {
  lines: AdjudicatedLine[];
  years: YearSummary[];
}

/**
 * Processes claims in date order, exactly as the carrier would.
 * `placements` must list dependencies before dependents when they share a date.
 */
export function adjudicate(profile: Profile, planYears: PlanYear[], placements: Placement[]): Adjudication {
  const { ledger, fees } = profile;
  const byId = new Map(profile.procedures.map((p) => [p.id, p]));
  const order = placements
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (a.p.date < b.p.date ? -1 : a.p.date > b.p.date ? 1 : a.i - b.i))
    .map((x) => x.p);

  const prior: PriorService[] = ledger.history.map((h) => ({ date: h.date, cdt: h.cdt, tooth: h.tooth }));
  const y0 = planYears[0].year;
  const y0History = ledger.history.filter((h) => yearOf(h.date) === y0);
  const states: YearState[] = [
    {
      py: planYears[0],
      maxUsed: ledger.maxUsed,
      dedMet: ledger.deductibleMet,
      orthoUsed: ledger.orthoUsed,
      rollover: ledger.rolloverBalance,
      pendingDeposit: 0,
      paid: ledger.maxUsed,
      claims: Math.max(y0History.length, ledger.maxUsed > 0 ? 1 : 0),
      allInNetwork: y0History.every((h) => h.inNetwork !== false),
      // ponytail: the ledger doesn't date deductible payments, so Q4 carryover starts at 0 for this year.
      q4Deductible: 0,
      rolloverEarned: 0,
    },
  ];

  const stateFor = (year: number): YearState => {
    while (states.length <= year - y0) {
      const prev = states[states.length - 1];
      const py = planYears[states.length] ?? { ...prev.py, year: prev.py.year + 1 };
      const same = py.rules.id === prev.py.rules.id;
      const mr = prev.py.rules.maxRewards;
      const earned =
        same && mr && prev.claims > 0 && prev.paid <= mr.threshold ? mr.rolloverAmount + (prev.allInNetwork ? mr.inNetworkBonus : 0) : 0;
      prev.rolloverEarned = earned;
      states.push({
        py,
        maxUsed: 0,
        dedMet: same && prev.py.rules.q4DeductibleCarryover ? Math.min(py.rules.deductible.amount, prev.q4Deductible) : 0,
        orthoUsed: same ? prev.orthoUsed : 0,
        rollover: same ? prev.rollover : 0,
        pendingDeposit: earned,
        paid: 0,
        claims: 0,
        allInNetwork: true,
        q4Deductible: 0,
        rolloverEarned: 0,
      });
    }
    return states[year - y0];
  };

  const lines = order.map((pl) => {
    const proc = byId.get(pl.id);
    if (!proc) throw new Error(`Unknown procedure ${pl.id}`);
    const line = adjudicateLine(proc, pl.date, stateFor(yearOf(pl.date)), prior, fees);
    if (!line.denied) prior.push({ date: pl.date, cdt: proc.cdt, tooth: proc.tooth });
    return line;
  });

  // Close every year up to the horizon so MaxRewards earned in the last year shows.
  stateFor(y0 + planYears.length);
  const years = states.slice(0, planYears.length).map((s) => ({
    year: s.py.year,
    rules: s.py.rules,
    maxUsed: s.maxUsed,
    maxRemaining: round2(Math.max(0, s.py.rules.annualMax - s.maxUsed) + s.rollover + s.pendingDeposit),
    planPaid: round2(s.paid),
    rolloverEarned: s.rolloverEarned,
    deductibleMet: s.dedMet,
  }));
  return { lines, years };
}

function adjudicateLine(
  proc: PlannedProcedure,
  date: ISODate,
  st: YearState,
  prior: PriorService[],
  fees: Profile['fees'],
): AdjudicatedLine {
  const rules = st.py.rules;
  const cls = serviceClassOf(proc.cdt, rules);
  const billed = proc.fee;
  const sec = (k: keyof PlanRules['sections']) => rules.sections[k];
  const base = {
    id: proc.id,
    cdt: proc.cdt,
    tooth: proc.tooth,
    ...(proc.toothGuessed && { toothGuessed: true }),
    ...(proc.label && { label: proc.label }),
    date,
    year: st.py.year,
    serviceClass: cls,
    billed,
    rulesVersion: rules.version,
  };

  if (rules.kind === 'waive' || rules.kind === 'membership') {
    const covered = rules.kind === 'membership' && (cls === 'preventive' || CDT[proc.cdt]?.category === 'diagnostic');
    const discount = rules.kind === 'membership' ? round2(covered ? billed : billed * (rules.membership?.discount ?? 0)) : 0;
    const owes = round2(billed - discount);
    const waterfall: WaterfallStep[] = [{ key: 'fee', label: "Dentist's fee", delta: billed, running: billed }];
    if (discount > 0)
      waterfall.push({
        key: 'membershipDiscount',
        label: covered ? 'Included in membership' : 'Membership discount',
        delta: -discount,
        running: owes,
      });
    waterfall.push({ key: 'youPay', label: 'You pay', delta: 0, running: owes });
    return {
      ...base,
      allowed: owes,
      benefitBase: 0,
      coinsuranceRate: 0,
      deductibleApplied: 0,
      planShare: 0,
      planPaid: 0,
      capReduction: 0,
      memberOwes: owes,
      balanceBill: 0,
      maxRemainingBefore: 0,
      waterfall,
    };
  }

  const net = proc.inNetwork ? 'inNetwork' : 'outOfNetwork';
  const lookup = proc.inNetwork ? fees[proc.cdt]?.inNetwork : outOfNetworkAllowance(proc.cdt, rules.outOfNetwork, fees);
  const allowed = Math.min(billed, proc.allowedFee ?? lookup ?? billed);
  const responsibleFor = proc.inNetwork ? allowed : billed; // in network, the dentist writes off the rest
  const balanceBill = proc.inNetwork ? 0 : round2(billed - allowed);

  let benefitBase = allowed;
  const alt = CDT[proc.cdt]?.amalgamEquivalent;
  if (rules.alternateBenefit && alt && isPosterior(proc.tooth)) {
    const altFee = proc.inNetwork ? fees[alt]?.inNetwork : outOfNetworkAllowance(alt, rules.outOfNetwork, fees);
    if (altFee !== undefined && altFee < allowed) benefitBase = altFee;
  }

  // Deposit the MaxRewards rollover once its day arrives.
  if (st.pendingDeposit > 0 && rules.maxRewards && dayOfYear(date) >= rules.maxRewards.depositDay) {
    st.rollover = Math.min(rules.maxRewards.accountLimit, st.rollover + st.pendingDeposit);
    st.pendingDeposit = 0;
  }

  const coins = cls === 'excluded' ? 0 : rules.coinsurance[net][cls];
  const isOrtho = cls === 'ortho';
  const countsToMax = !isOrtho && !(cls === 'preventive' && !rules.preventiveCountsTowardMax);
  const maxRemaining = isOrtho
    ? Math.max(0, rules.orthoLifetimeMax - st.orthoUsed)
    : Math.max(0, rules.annualMax - st.maxUsed) + st.rollover;

  const waterfall: WaterfallStep[] = [{ key: 'fee', label: "Dentist's fee", delta: billed, running: billed }];
  if (proc.inNetwork && billed > allowed)
    waterfall.push({ key: 'networkDiscount', label: 'In-network discount', delta: round2(allowed - billed), running: allowed });

  let denied: AdjudicatedLine['denied'];
  if (cls === 'excluded') denied = { reason: 'notCovered', detail: 'This plan does not cover this service.' };
  const waitEnd = waitingPeriodEnds(cls, st.py);
  if (!denied && waitEnd && date < waitEnd)
    denied = { reason: 'waitingPeriod', detail: `Waiting period for ${cls} services ends ${waitEnd}.` };
  if (!denied) {
    const hit = limitsFor(proc.cdt, proc.tooth, rules, prior, date).find(({ limit, used }) => used.length >= limit.count);
    if (hit) denied = { reason: 'frequency', detail: `Frequency limit: ${hit.limit.label}.` };
  }

  if (denied) {
    const owes = round2(responsibleFor);
    waterfall.push(
      {
        key: 'denied',
        label: 'Not covered',
        delta: 0,
        running: owes,
        section: sec(denied.reason === 'frequency' ? 'frequencyLimits' : denied.reason === 'waitingPeriod' ? 'waitingPeriods' : 'serviceClasses'),
      },
      { key: 'youPay', label: 'You pay', delta: 0, running: owes },
    );
    return {
      ...base,
      allowed,
      benefitBase,
      coinsuranceRate: coins,
      deductibleApplied: 0,
      planShare: 0,
      planPaid: 0,
      capReduction: 0,
      memberOwes: owes,
      balanceBill,
      maxRemainingBefore: maxRemaining,
      denied,
      waterfall,
    };
  }

  const deductibleApplied = rules.deductible.appliesTo.includes(cls as ServiceClass)
    ? round2(Math.min(Math.max(0, rules.deductible.amount - st.dedMet), benefitBase))
    : 0;
  const planShare = round2((benefitBase - deductibleApplied) * coins);
  const planPaid = countsToMax || isOrtho ? round2(Math.min(planShare, maxRemaining)) : planShare;
  const capReduction = round2(planShare - planPaid);

  // Pay from the annual max first, then the rollover account.
  if (countsToMax) {
    const fromAnnual = Math.min(planPaid, Math.max(0, rules.annualMax - st.maxUsed));
    st.maxUsed = round2(st.maxUsed + fromAnnual);
    st.rollover = round2(st.rollover - (planPaid - fromAnnual));
  }
  if (isOrtho) st.orthoUsed = round2(st.orthoUsed + planPaid);
  st.dedMet = round2(st.dedMet + deductibleApplied);
  if (Number(date.slice(5, 7)) >= 10) st.q4Deductible = round2(st.q4Deductible + deductibleApplied);
  st.paid = round2(st.paid + planPaid);
  st.claims++;
  if (!proc.inNetwork) st.allInNetwork = false;

  const memberOwes = round2(responsibleFor - planPaid);
  const altStep = round2((allowed - benefitBase) * coins);
  const dedStep = round2(deductibleApplied * coins);
  let running = proc.inNetwork ? allowed : billed;
  const push = (step: Omit<WaterfallStep, 'running'>) => {
    running = round2(running + step.delta);
    waterfall.push({ ...step, running });
  };
  push({ key: 'coinsurance', label: `Plan pays ${Math.round(coins * 100)}%`, delta: -round2(planShare + altStep + dedStep), section: sec('coinsurance') });
  if (altStep > 0) push({ key: 'alternateBenefit', label: 'Paid at silver-filling rate', delta: altStep, section: sec('alternateBenefit') });
  if (dedStep > 0) push({ key: 'deductible', label: 'Deductible', delta: dedStep, section: sec('deductible') });
  if (capReduction > 0) push({ key: 'maxCap', label: 'Annual max reached', delta: capReduction, section: sec('annualMax') });
  waterfall.push({ key: 'youPay', label: 'You pay', delta: 0, running: memberOwes });

  return {
    ...base,
    allowed,
    benefitBase,
    coinsuranceRate: coins,
    deductibleApplied,
    planShare,
    planPaid,
    capReduction,
    memberOwes,
    balanceBill,
    maxRemainingBefore: round2(maxRemaining),
    waterfall,
  };
}
