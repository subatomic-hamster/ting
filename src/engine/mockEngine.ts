// ============================================================================
// PLACEHOLDER — Lane A replaces this with the real engine. Keep the signature.
//
//   export function runEngine(input: EngineInput): EngineResult
//
// This is a deliberately simple model so the UI is interactive today:
//   fee → network discount → deductible → coinsurance → cap at the year's
//   remaining annual max → you pay.
// Items are priced in date order, one plan year at a time, so moving an item
// across Dec 31 really changes the numbers. It ignores waiting periods,
// frequency limits (except for the "unused cleanings" count), alternate
// benefits, family deductibles and non-calendar plan years.
// ============================================================================

import type {
  EngineInput,
  EngineResult,
  MaxGauge,
  Network,
  PlanComparisonRow,
  PlanRules,
  ProcedureItem,
  ScheduleOption,
  ScheduledItem,
  ServiceClass,
  TraceEvent,
  WaterfallStep,
} from '../contracts';
import { addDays, maxDate, yearOf } from '../lib/dates';
import { formatDate, formatMoney, formatPercent } from '../lib/format';

const IRS_FSA_LIMIT = 3400; // sample figure — confirm for the plan year
const FSA_CARRYOVER_LIMIT = 680; // sample figure — confirm for the plan year
const SPACING_DAYS = 7; // minimum gap between dependent visits
const NEXT_YEAR_DAY = '01-06'; // first appointment after the max resets
// "Bad year" adds one surprise crown at this placeholder fee.
const SURPRISE_CROWN: ProcedureItem = {
  id: '__surprise_crown',
  cdt: 'D2740',
  label: 'Unexpected crown',
  serviceClass: 'major',
  feeIn: 1250,
  feeOut: 1600,
  locked: false,
  source: 'seed',
  confidence: 1,
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const neg = (n: number) => (n === 0 ? 0 : -n);
const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Rough CDT → service class mapping for ledger entries (which carry no class). */
export function classOfCdt(cdt: string): ServiceClass {
  const n = Number(cdt.replace(/\D/g, ''));
  if (n < 2000) return 'preventive';
  if (n >= 8000 && n < 9000) return 'ortho';
  if ((n >= 2700 && n < 2800) || (n >= 2900 && n < 3000) || (n >= 6000 && n < 7000) || n === 9944) return 'major';
  return 'basic';
}

const isCertain = (p: ProcedureItem) => p.likelihood === undefined || p.likelihood >= 1;

function itemName(p: ProcedureItem): string {
  return p.tooth ? `${p.label} #${p.tooth}` : p.label;
}

// ---------------------------------------------------------------------------
// Plan-year state
// ---------------------------------------------------------------------------

interface YearState {
  year: number;
  rollover: number;
  remainingMax: number;
  dedRemaining: number;
  ledgerPaid: number;
  scheduledPaid: number;
  claims: number;
}

interface Ctx {
  input: EngineInput;
  plan: PlanRules;
  network: Network;
  asOf: string;
  year: number;
}

function ledgerYear(ctx: Ctx, year: number) {
  const entries = ctx.input.ledger.filter((e) => yearOf(e.serviceDate) === year);
  const nonOrtho = entries.filter((e) => classOfCdt(e.cdt) !== 'ortho');
  const dedEligible = entries.filter((e) => !ctx.plan.deductible.waivedFor.includes(classOfCdt(e.cdt)));
  return {
    claims: entries.length,
    planPaid: sum(nonOrtho.map((e) => e.planPaid)),
    dedPaid: Math.min(ctx.plan.deductible.individual, sum(dedEligible.map((e) => e.memberOwes))),
  };
}

function rolloverInto(ctx: Ctx, prev: { claims: number; planPaid: number } | undefined): number {
  const mr = ctx.plan.maxRewards;
  if (!mr || !prev || prev.claims === 0 || prev.planPaid > mr.claimsThreshold) return 0;
  return Math.min(mr.accountCap, ctx.network === 'in' ? mr.rolloverInNetwork : mr.rollover);
}

function freshYear(ctx: Ctx, year: number, prev?: YearState): YearState {
  const led = ledgerYear(ctx, year);
  const prevSummary = prev
    ? { claims: prev.claims, planPaid: round2(prev.ledgerPaid + prev.scheduledPaid) }
    : ledgerYear(ctx, year - 1);
  const rollover = rolloverInto(ctx, prevSummary);
  return {
    year,
    rollover,
    remainingMax: round2(ctx.plan.annualMax + rollover - led.planPaid),
    dedRemaining: round2(ctx.plan.deductible.individual - led.dedPaid),
    ledgerPaid: led.planPaid,
    scheduledPaid: 0,
    claims: led.claims,
  };
}

// ---------------------------------------------------------------------------
// One procedure → waterfall
// ---------------------------------------------------------------------------

function allowance(plan: PlanRules, item: ProcedureItem, network: Network) {
  const billed = item.feeOut; // the dentist's full (retail) fee
  if (network === 'in' || plan.outOfNetworkAllowance.method === 'MAC') {
    return { billed, allowed: Math.min(billed, item.feeIn) };
  }
  // UCR percentile: placeholder — a higher percentile allows more of the fee.
  const pct = plan.outOfNetworkAllowance.percentile ?? 80;
  return { billed, allowed: Math.min(billed, round2(item.feeIn * (1 + (pct - 50) / 200))) };
}

interface Priced {
  steps: WaterfallStep[];
  planPays: number;
  memberPays: number;
  dedApplied: number;
  capped: boolean;
}

function priceOne(
  ctx: Ctx,
  item: ProcedureItem,
  state: { remainingMax: number; dedRemaining: number },
  orthoRemaining: number,
): Priced {
  const { plan, network } = ctx;
  const cls = item.serviceClass;
  const cite = plan.citations ?? {};
  const { billed, allowed } = allowance(plan, item, network);
  const coins = plan.coinsurance[cls][network];
  const steps: WaterfallStep[] = [];

  let rt = billed;
  steps.push({ key: 'fee', label: "Dentist's full fee", amount: billed, runningTotal: rt });

  const discount = network === 'in' ? round2(billed - allowed) : 0;
  rt = round2(rt - discount);
  steps.push({
    key: 'networkDiscount',
    label: network === 'in' ? 'In-network discount' : 'No network discount (out of network)',
    amount: neg(discount),
    runningTotal: rt,
    citation: network === 'out' ? cite.outOfNetworkAllowance : undefined,
    verification: 'pending',
  });

  const waived = plan.deductible.waivedFor.includes(cls) || coins === 0;
  const dedApplied = waived ? 0 : Math.max(0, Math.min(state.dedRemaining, allowed));
  steps.push({
    key: 'deductible',
    label: waived
      ? 'Deductible — waived for this service'
      : dedApplied === 0
        ? 'Deductible — already met this year'
        : `Deductible — first ${formatMoney(dedApplied)} is yours`,
    amount: 0,
    runningTotal: rt,
    citation: cite.deductible,
    verification: 'pending',
  });

  const share = round2(coins * (allowed - dedApplied));
  rt = round2(rt - share);
  steps.push({
    key: 'coinsurance',
    label: coins === 0 ? 'Plan pays 0% — not covered' : `Plan pays ${formatPercent(coins)}`,
    amount: neg(share),
    runningTotal: rt,
    citation: cite[`coinsurance.${cls}`],
    verification: 'pending',
  });

  const cap = cls === 'ortho' ? orthoRemaining : state.remainingMax;
  const excess = share > cap ? round2(share - Math.max(0, cap)) : 0;
  rt = round2(rt + excess);
  steps.push({
    key: 'maxCap',
    label:
      excess > 0
        ? cls === 'ortho'
          ? 'Ortho lifetime max reached'
          : `Annual max reached — plan stops at ${formatMoney(Math.max(0, cap))}`
        : cls === 'ortho'
          ? 'Within ortho lifetime max'
          : `Within annual max (${formatMoney(Math.max(0, cap))} left)`,
    amount: excess,
    runningTotal: rt,
    citation: cls === 'ortho' ? cite.orthoLifetimeMax : cite.annualMax,
    verification: 'pending',
  });

  steps.push({ key: 'youPay', label: 'You pay', amount: rt, runningTotal: rt });

  return { steps, planPays: round2(share - excess), memberPays: rt, dedApplied, capped: excess > 0 };
}

/** Adds "likely $X–$Y" to the final step when the fee has a range. */
function withRange(
  ctx: Ctx,
  item: ProcedureItem,
  priced: Priced,
  state: { remainingMax: number; dedRemaining: number },
  orthoRemaining: number,
): WaterfallStep[] {
  if (!item.feeRange || item.feeIn <= 0) return priced.steps;
  const [lo, hi] = item.feeRange;
  const at = (fee: number) =>
    priceOne(ctx, { ...item, feeIn: fee, feeOut: round2((item.feeOut * fee) / item.feeIn) }, state, orthoRemaining)
      .memberPays;
  const a = at(lo);
  const b = at(hi);
  if (a === b) return priced.steps;
  return priced.steps.map((s) =>
    s.key === 'youPay' ? { ...s, label: `You pay · likely ${formatMoney(Math.min(a, b))}–${formatMoney(Math.max(a, b))}` } : s,
  );
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

function topoOrder(items: ProcedureItem[]): ProcedureItem[] {
  const ids = new Set(items.map((i) => i.id));
  const placed = new Set<string>();
  const out: ProcedureItem[] = [];
  let progress = true;
  while (out.length < items.length && progress) {
    progress = false;
    for (const it of items) {
      if (placed.has(it.id)) continue;
      const deps = (it.dependsOn ?? []).filter((d) => ids.has(d));
      if (deps.every((d) => placed.has(d))) {
        out.push(it);
        placed.add(it.id);
        progress = true;
      }
    }
  }
  for (const it of items) if (!placed.has(it.id)) out.push(it); // cycle fallback
  return out;
}

type Dates = Map<string, string>;

function lockedDate(ctx: Ctx, item: ProcedureItem): string {
  return maxDate(item.deadline ?? addDays(ctx.asOf, SPACING_DAYS), ctx.asOf);
}

function afterDeps(item: ProcedureItem, dates: Dates, floor: string): string {
  let d = floor;
  for (const dep of item.dependsOn ?? []) {
    const dd = dates.get(dep);
    if (dd) d = maxDate(d, addDays(dd, SPACING_DAYS));
  }
  return d;
}

/** "All now": every item as soon as possible, in dependency order. */
function asapDates(ctx: Ctx, order: ProcedureItem[]): Dates {
  const dates: Dates = new Map();
  let slot = addDays(ctx.asOf, SPACING_DAYS);
  for (const it of order) {
    if (it.locked) {
      dates.set(it.id, lockedDate(ctx, it));
      continue;
    }
    dates.set(it.id, afterDeps(it, dates, slot));
    slot = addDays(slot, SPACING_DAYS);
  }
  return dates;
}

/** "Everything movable in next year". */
function nextYearDates(ctx: Ctx, order: ProcedureItem[]): Dates {
  const dates: Dates = new Map();
  const base = `${ctx.year + 1}-${NEXT_YEAR_DAY}`;
  for (const it of order) {
    dates.set(it.id, it.locked ? lockedDate(ctx, it) : afterDeps(it, dates, base));
  }
  return dates;
}

/** Greedy: keep an item this year unless the annual max would cut the plan's share. */
function fitDates(ctx: Ctx, order: ProcedureItem[], tolerance: number): Dates {
  const dates: Dates = new Map();
  const base = `${ctx.year + 1}-${NEXT_YEAR_DAY}`;
  let slot = addDays(ctx.asOf, SPACING_DAYS);
  const placed: ProcedureItem[] = [];
  for (const it of order) {
    if (it.locked) {
      dates.set(it.id, lockedDate(ctx, it));
      placed.push(it);
      continue;
    }
    const candidate = afterDeps(it, dates, slot);
    dates.set(it.id, candidate);
    placed.push(it);
    if (yearOf(candidate) === ctx.year) {
      const trial = priceSchedule(ctx, placed, dates);
      const w = trial.waterfalls[it.id];
      const share = -(w.find((s) => s.key === 'coinsurance')?.amount ?? 0);
      const cut = w.find((s) => s.key === 'maxCap')?.amount ?? 0;
      if (cut > share * tolerance) dates.set(it.id, afterDeps(it, dates, base));
      else slot = addDays(slot, SPACING_DAYS);
    }
  }
  return dates;
}

interface PricedSchedule {
  items: ScheduledItem[];
  waterfalls: Record<string, WaterfallStep[]>;
  states: Map<number, YearState>;
}

function priceSchedule(ctx: Ctx, order: ProcedureItem[], dates: Dates): PricedSchedule {
  const index = new Map(order.map((it, i) => [it.id, i]));
  const sorted = [...order].sort((a, b) => {
    const da = dates.get(a.id) ?? ctx.asOf;
    const db = dates.get(b.id) ?? ctx.asOf;
    return da === db ? (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0) : da < db ? -1 : 1;
  });

  const states = new Map<number, YearState>();
  const stateFor = (year: number): YearState => {
    let s = states.get(year);
    if (!s) {
      s = freshYear(ctx, year, states.get(year - 1));
      states.set(year, s);
    }
    return s;
  };
  stateFor(ctx.year);

  const ortho = ctx.plan.orthoLifetimeMax ?? 0;
  let orthoRemaining = round2(
    ortho - sum(ctx.input.ledger.filter((e) => classOfCdt(e.cdt) === 'ortho').map((e) => e.planPaid)),
  );

  const items: ScheduledItem[] = [];
  const waterfalls: Record<string, WaterfallStep[]> = {};
  for (const it of sorted) {
    const date = dates.get(it.id) ?? ctx.asOf;
    const year = yearOf(date);
    for (let y = ctx.year; y < year; y++) stateFor(y); // finalise earlier years first
    const st = stateFor(year);
    const before = { remainingMax: st.remainingMax, dedRemaining: st.dedRemaining };
    const p = priceOne(ctx, it, before, orthoRemaining);
    waterfalls[it.id] = withRange(ctx, it, p, before, orthoRemaining);

    st.dedRemaining = round2(st.dedRemaining - p.dedApplied);
    st.claims += 1;
    if (it.serviceClass === 'ortho') orthoRemaining = round2(orthoRemaining - p.planPays);
    else {
      st.remainingMax = round2(st.remainingMax - p.planPays);
      st.scheduledPaid = round2(st.scheduledPaid + p.planPays);
    }

    let dentistQuestion: string | undefined;
    if (it.locked) dentistQuestion = `Is the ${formatDate(date)} deadline for ${itemName(it)} firm, or could it safely wait?`;
    else if (year > ctx.year)
      dentistQuestion = `Can ${it.tooth ? `#${it.tooth}` : it.label.toLowerCase()} safely wait until ${formatDate(date, { year: true })}?`;

    items.push({
      procedureId: it.id,
      date,
      planYear: year,
      planPays: p.planPays,
      memberPays: p.memberPays,
      fsaPays: 0,
      locked: it.locked,
      dentistQuestion,
    });
  }
  stateFor(ctx.year + 1);

  // FSA: this year's balance pays first (until it forfeits), then next year's election.
  const fsa = ctx.input.fsa;
  let balance = fsa.balance;
  let election = fsa.nextYearElection ?? 0;
  for (const s of items) {
    if (s.date <= fsa.forfeitDate && balance > 0) {
      s.fsaPays = Math.min(balance, s.memberPays);
      balance = round2(balance - s.fsaPays);
    } else if (s.planYear > ctx.year && election > 0) {
      s.fsaPays = Math.min(election, s.memberPays);
      election = round2(election - s.fsaPays);
    }
  }

  return { items, waterfalls, states };
}

function toOption(ctx: Ctx, kind: ScheduleOption['kind'], priced: PricedSchedule): ScheduleOption {
  const memberTotal = sum(priced.items.map((i) => i.memberPays));
  const fsaTotal = sum(priced.items.map((i) => i.fsaPays));
  return {
    kind,
    items: priced.items,
    memberTotal,
    afterTaxTotal: round2(memberTotal - fsaTotal * ctx.input.marginalTaxRate),
    finishDate: priced.items.reduce((d, i) => maxDate(d, i.date), ctx.asOf),
    savingsVsAllNow: 0,
  };
}

function sameDates(a: Dates, b: Dates): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Plan comparison (open enrollment)
// ---------------------------------------------------------------------------

function comparePlans(
  input: EngineInput,
  nextYearItems: ProcedureItem[],
  maybes: ProcedureItem[],
): PlanComparisonRow[] {
  const year = yearOf(input.asOf) + 1;
  const priced = input.plans.map((plan) => {
    const ctx: Ctx = { input: { ...input, ledger: [] }, plan, network: input.network, asOf: `${year}-01-01`, year };
    const state = { remainingMax: plan.annualMax, dedRemaining: plan.deductible.individual };
    let orthoRemaining = plan.orthoLifetimeMax ?? 0;
    const apply = (it: ProcedureItem, s: { remainingMax: number; dedRemaining: number }, o: number) => {
      const p = priceOne(ctx, it, s, o);
      return {
        p,
        s: {
          remainingMax: it.serviceClass === 'ortho' ? s.remainingMax : round2(s.remainingMax - p.planPays),
          dedRemaining: round2(s.dedRemaining - p.dedApplied),
        },
        o: it.serviceClass === 'ortho' ? round2(o - p.planPays) : o,
      };
    };
    let certain = 0;
    let s = state;
    for (const it of topoOrder(nextYearItems)) {
      const r = apply(it, s, orthoRemaining);
      certain = round2(certain + r.p.memberPays);
      s = r.s;
      orthoRemaining = r.o;
    }
    // Each "maybe" is priced on its own after the certain work, so expected cost is linear in likelihood.
    const maybeCost = new Map(maybes.map((m) => [m.id, priceOne(ctx, m, s, orthoRemaining).memberPays]));
    let bad = certain;
    let bs = s;
    let bo = orthoRemaining;
    for (const it of [...maybes, SURPRISE_CROWN]) {
      const r = apply(it, bs, bo);
      bad = round2(bad + r.p.memberPays);
      bs = r.s;
      bo = r.o;
    }
    const expectedOOP = round2(certain + sum(maybes.map((m) => (m.likelihood ?? 1) * (maybeCost.get(m.id) ?? 0))));
    const annualPremium = round2(plan.monthlyPremium * 12);
    return { plan, annualPremium, expectedOOP, bad, maybeCost, expectedTotal: round2(annualPremium + expectedOOP) };
  });

  const best = priced.reduce((a, b) => (b.expectedTotal < a.expectedTotal ? b : a), priced[0]);
  const cheapestPremium = priced.reduce((a, b) => (b.annualPremium < a.annualPremium ? b : a), priced[0]);
  const runnerUp = priced
    .filter((p) => p !== best)
    .reduce<(typeof priced)[number] | undefined>((a, b) => (!a || b.expectedTotal < a.expectedTotal ? b : a), undefined);

  return priced.map((r) => {
    let reason: string;
    if (r === best) {
      reason = runnerUp
        ? `Lowest expected total: ${formatMoney(round2(runnerUp.expectedTotal - r.expectedTotal))} less than ${runnerUp.plan.name}`
        : 'Only plan available';
    } else {
      reason = `${formatMoney(round2(r.expectedTotal - best.expectedTotal))} more than ${best.plan.name} in an expected year`;
      const badBest = round2(best.annualPremium + best.bad);
      const badThis = round2(r.annualPremium + r.bad);
      if (badThis < badBest) reason += `, but ${formatMoney(round2(badBest - badThis))} less in a bad year`;
    }

    // Tipping point: the likelihood at which this (richer) plan pays for itself.
    let tippingPoint: PlanComparisonRow['tippingPoint'];
    if (r !== cheapestPremium) {
      let bestGap = 0;
      for (const m of maybes) {
        const mr = r.maybeCost.get(m.id) ?? 0;
        const mb = cheapestPremium.maybeCost.get(m.id) ?? 0;
        const gap = round2(mb - mr);
        if (gap <= 0) continue;
        const p = m.likelihood ?? 1;
        const kr = round2(r.expectedTotal - p * mr);
        const kb = round2(cheapestPremium.expectedTotal - p * mb);
        const at = (kr - kb) / gap;
        if (at >= 0 && at <= 1 && gap > bestGap) {
          bestGap = gap;
          tippingPoint = { procedureId: m.id, likelihood: Math.round(at * 100) / 100 };
        }
      }
    }

    return {
      planId: r.plan.id,
      name: r.plan.name,
      annualPremium: r.annualPremium,
      expectedOutOfPocket: r.expectedOOP,
      badYearOutOfPocket: r.bad,
      expectedTotal: r.expectedTotal,
      recommended: r === best,
      reason,
      tippingPoint,
    };
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function runMockEngine(input: EngineInput): EngineResult {
  const t0 = now();
  const trace: TraceEvent[] = [];
  const mark = (tool: string, summary: string, since: number) =>
    trace.push({ ts: new Date().toISOString(), tool, summary, ms: Math.round((now() - since) * 100) / 100 });

  const plan = input.plans.find((p) => p.id === input.selectedPlanId) ?? input.plans[0];
  if (!plan) throw new Error('runEngine: no plans supplied');
  const ctx: Ctx = { input, plan, network: input.network, asOf: input.asOf, year: yearOf(input.asOf) };
  mark(
    'rules.load',
    `${plan.rulesVersion}: max ${formatMoney(plan.annualMax)}, deductible ${formatMoney(plan.deductible.individual)}, ${input.network}-network`,
    t0,
  );

  // --- schedules -----------------------------------------------------------
  let t = now();
  const certain = input.procedures.filter(isCertain);
  const maybes = input.procedures.filter((p) => !isCertain(p));
  const order = topoOrder(certain);

  const asap = asapDates(ctx, order);
  const later = nextYearDates(ctx, order);
  const fit = fitDates(ctx, order, 0);
  const half = fitDates(ctx, order, 0.5);

  const fastest = toOption(ctx, 'fastest', priceSchedule(ctx, order, asap));
  const laterOpt = toOption(ctx, 'cheapest', priceSchedule(ctx, order, later));
  const fitOpt = toOption(ctx, 'cheapest', priceSchedule(ctx, order, fit));
  const cheapestIsFit = fitOpt.memberTotal <= laterOpt.memberTotal;
  const cheapest = cheapestIsFit ? fitOpt : laterOpt;
  const cheapestDates = cheapestIsFit ? fit : later;
  const balanced = toOption(ctx, 'balanced', priceSchedule(ctx, order, half));
  const schedules = [cheapest, fastest, balanced].map((s) => ({
    ...s,
    savingsVsAllNow: round2(fastest.memberTotal - s.memberTotal),
  }));
  mark('schedule.options', `${order.length} items; cheapest saves ${formatMoney(schedules[0].savingsVsAllNow)} vs all now`, t);

  // --- active schedule (applies timeline overrides; locked items ignore them) ---
  t = now();
  const activeDates: Dates = new Map(asap);
  const overrides = new Map(input.overrides.map((o) => [o.procedureId, o.date]));
  for (const it of order) {
    const o = overrides.get(it.id);
    if (o && !it.locked) activeDates.set(it.id, maxDate(o, ctx.asOf));
  }
  const activePriced = priceSchedule(ctx, order, activeDates);
  const match = (
    [
      ['cheapest', cheapestDates],
      ['balanced', half],
      ['fastest', asap],
    ] as const
  ).find(([, d]) => sameDates(d, activeDates));
  const activeSchedule = {
    ...toOption(ctx, match ? match[0] : 'custom', activePriced),
  };
  activeSchedule.savingsVsAllNow = round2(fastest.memberTotal - activeSchedule.memberTotal);
  mark(
    'schedule.active',
    `${activeSchedule.kind}: you pay ${formatMoney(activeSchedule.memberTotal)} (${input.overrides.length} timeline moves)`,
    t,
  );

  // --- waterfalls (maybes are priced on their own against this year) ---------
  const waterfalls: Record<string, WaterfallStep[]> = { ...activePriced.waterfalls };
  const thisYear = activePriced.states.get(ctx.year) ?? freshYear(ctx, ctx.year);
  for (const m of maybes) {
    const st = { remainingMax: thisYear.remainingMax, dedRemaining: thisYear.dedRemaining };
    waterfalls[m.id] = withRange(ctx, m, priceOne(ctx, m, st, plan.orthoLifetimeMax ?? 0), st, plan.orthoLifetimeMax ?? 0);
  }

  // --- gauges & deductible ---------------------------------------------------
  const gauges: MaxGauge[] = [ctx.year, ctx.year + 1].map((y) => {
    const s = activePriced.states.get(y) ?? freshYear(ctx, y);
    return {
      planYear: y,
      annualMax: plan.annualMax,
      used: s.ledgerPaid,
      scheduled: s.scheduledPaid,
      remaining: Math.max(0, round2(plan.annualMax + s.rollover - s.ledgerPaid - s.scheduledPaid)),
      rolloverBalance: plan.maxRewards ? s.rollover : undefined,
    };
  });
  const deductible = { met: ledgerYear(ctx, ctx.year).dedPaid, total: plan.deductible.individual };

  // --- plan comparison --------------------------------------------------------
  t = now();
  const cheapestItems = new Map(schedules[0].items.map((i) => [i.procedureId, i]));
  const nextYearItems = order.filter((it) => (cheapestItems.get(it.id)?.planYear ?? ctx.year) > ctx.year);
  const comparison = comparePlans(input, nextYearItems, maybes);
  const rec = comparison.find((r) => r.recommended) ?? comparison[0];
  mark('plans.compare', `${comparison.length} plans; recommend ${rec.name}`, t);

  // --- FSA ---------------------------------------------------------------------
  const fsaSpentBeforeForfeit = sum(
    activeSchedule.items.filter((i) => i.date <= input.fsa.forfeitDate && i.planYear === ctx.year).map((i) => i.fsaPays),
  );
  const carry = input.fsa.rule === 'carryover' ? FSA_CARRYOVER_LIMIT : 0;
  const atRisk = Math.max(0, round2(input.fsa.balance - fsaSpentBeforeForfeit - carry));
  const recommendedElection = Math.min(IRS_FSA_LIMIT, Math.floor(rec.expectedOutOfPocket / 10) * 10);
  const fsa = {
    recommendedElection,
    irsLimit: IRS_FSA_LIMIT,
    carryoverLimit: FSA_CARRYOVER_LIMIT,
    forfeitDate: input.fsa.forfeitDate,
    atRisk,
  };

  // --- left on the table ---------------------------------------------------------
  const cleaningLimit =
    plan.frequencyLimits.find((f) => f.cdt === 'D1110' && f.per === 'calendarYear')?.count ?? 2;
  const cleaningsUsed =
    input.ledger.filter((e) => e.cdt === 'D1110' && yearOf(e.serviceDate) === ctx.year).length +
    activeSchedule.items.filter(
      (i) => i.planYear === ctx.year && input.procedures.find((p) => p.id === i.procedureId)?.cdt === 'D1110',
    ).length;
  const leftOnTable = {
    unusedCleanings: Math.max(0, cleaningLimit - cleaningsUsed),
    maxRemaining: gauges[0].remaining,
    fsaExpiring: atRisk,
  };

  // --- enrollment card ------------------------------------------------------------
  // Action labels use "Headline — reason"; the UI shows the reason when expanded.
  const byId = new Map(input.procedures.map((p) => [p.id, p]));
  const actions: EngineResult['enrollmentCard']['actions'] = [{ label: `Choose ${rec.name} — ${rec.reason}` }];
  if (recommendedElection > 0) {
    actions.push({
      label: `Elect ${formatMoney(recommendedElection)} FSA — covers your expected out-of-pocket next year with pre-tax money (IRS limit ${formatMoney(IRS_FSA_LIMIT)})`,
    });
  }
  const nowItems = schedules[0].items.filter((i) => i.planYear === ctx.year);
  if (nowItems.length) {
    const names = nowItems.map((i) => itemName(byId.get(i.procedureId)!)).join(' + ');
    actions.push({
      label: `${names} before Dec 31 — fits in this year's remaining annual max`,
      date: nowItems.reduce((d, i) => maxDate(d, i.date), ctx.asOf),
    });
  }
  const laterGroups = new Map<string, ScheduledItem[]>();
  for (const i of schedules[0].items.filter((x) => x.planYear > ctx.year)) {
    laterGroups.set(i.date, [...(laterGroups.get(i.date) ?? []), i]);
  }
  for (const [date, group] of laterGroups) {
    const names = group.map((i) => itemName(byId.get(i.procedureId)!)).join(' + ');
    actions.push({ label: `${names} ${formatDate(date)} — your annual max resets Jan 1`, date });
  }
  if (atRisk > 0) {
    actions.push({
      label: `Use ${formatMoney(atRisk)} of FSA by ${formatDate(input.fsa.forfeitDate)} — otherwise it is forfeited`,
      date: input.fsa.forfeitDate,
    });
  }
  if (leftOnTable.unusedCleanings > 0) {
    actions.push({
      label: `Book a cleaning before Dec 31 — covered at 100%; ${leftOnTable.unusedCleanings} left this year`,
      date: `${ctx.year}-12-31`,
    });
  }
  const current = comparison.find((r) => r.planId === plan.id);
  const planSavings = current ? Math.max(0, round2(current.expectedTotal - rec.expectedTotal)) : 0;
  const enrollmentCard = {
    planId: rec.planId,
    fsaElection: recommendedElection,
    actions,
    expectedSavings: round2(Math.max(0, schedules[0].savingsVsAllNow) + planSavings),
  };

  mark('engine.total', `Recomputed everything for ${input.procedures.length} procedures`, t0);

  return {
    rulesVersion: plan.rulesVersion,
    waterfalls,
    schedules,
    activeSchedule,
    gauges,
    deductible,
    comparison,
    fsa,
    leftOnTable,
    enrollmentCard,
    trace,
  };
}
