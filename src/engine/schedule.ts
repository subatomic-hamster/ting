import { adjudicate, frequencyEligibleFrom, planYearsFor, round2, serviceClassOf, waitingPeriodEnds } from './adjudicate';
import type { Adjudication, PlanYear } from './adjudicate';
import { cdtLabel } from './cdt';
import { addDays, dateOfDay, dayOfYear, firstBusinessDay, formatDate, toDay, yearOf } from './dates';
import { fsaLimits } from './fsa';
import type { ISODate, Placement, PlannedProcedure, PlanRules, Profile, ScheduleEvaluation, YearCost } from './types';

/** Default days between a procedure and the ones it depends on (root canal → buildup → crown). */
export const DEFAULT_GAP_DAYS = 7;
const EPS = 0.005;

export interface ScheduleOptions {
  /** Plan for the years after this one. Default: keep the current plan. */
  nextPlan?: PlanRules;
  /** Plan years considered, starting with this one. The optimizer places work in any of them. */
  horizon?: number;
}

/** Dependencies first; input order otherwise. Throws on a cycle. */
export function topoOrder(procs: PlannedProcedure[]): PlannedProcedure[] {
  const ids = new Set(procs.map((p) => p.id));
  const done = new Set<string>();
  const out: PlannedProcedure[] = [];
  while (out.length < procs.length) {
    const next = procs.find((p) => !done.has(p.id) && (p.dependsOn ?? []).every((d) => done.has(d) || !ids.has(d)));
    if (!next) throw new Error('Procedure dependencies form a cycle');
    done.add(next.id);
    out.push(next);
  }
  return out;
}

const likelihoodOf = (p: PlannedProcedure) => p.likelihood ?? 1;

interface Scenario {
  prob: number;
  include: Set<string>;
  all: boolean;
}

// ponytail: enumerates all 2^m "maybe" outcomes; fine for the handful a treatment plan has.
function scenarios(ordered: PlannedProcedure[]): Scenario[] {
  const maybes = ordered.filter((p) => likelihoodOf(p) < 1);
  const out: Scenario[] = [];
  for (let mask = 0; mask < 1 << maybes.length; mask++) {
    let prob = 1;
    const chosen = new Set<string>();
    maybes.forEach((m, i) => {
      const yes = (mask >> i) & 1;
      prob *= yes ? likelihoodOf(m) : 1 - likelihoodOf(m);
      if (yes) chosen.add(m.id);
    });
    const include = new Set<string>();
    for (const p of ordered) {
      const happens = likelihoodOf(p) >= 1 || chosen.has(p.id);
      // A dependent only happens if what it depends on happens.
      if (happens && (p.dependsOn ?? []).every((d) => include.has(d) || !ordered.some((q) => q.id === d))) include.add(p.id);
    }
    out.push({ prob, include, all: mask === (1 << maybes.length) - 1 });
  }
  return out;
}

/** After-tax cost per plan year: current FSA balance first (already set aside), then next year's election, then pocket. */
function costYears(profile: Profile, planYears: PlanYear[], adj: Adjudication): YearCost[] {
  const { money } = profile;
  const t = money.fsaOffered ? money.marginalTaxRate : 0;
  let carry = 0;
  let graceUntil: ISODate | undefined;
  return planYears.map((py, i) => {
    const lines = adj.lines.filter((l) => l.year === py.year);
    const owes = round2(lines.reduce((s, l) => s + l.memberOwes, 0));
    const planPaid = round2(lines.reduce((s, l) => s + l.planPaid, 0));
    let fsaUsed: number;
    let pocket: number;
    let cost: number;
    let leftover: number;
    if (i === 0) {
      const balance = money.fsaOffered ? money.fsaBalance : 0;
      fsaUsed = Math.min(owes, balance);
      pocket = owes - fsaUsed;
      cost = pocket; // the balance is already set aside, so spending it costs nothing extra
      leftover = balance - fsaUsed;
    } else {
      const until = graceUntil;
      const carryEligible = until ? lines.filter((l) => l.date <= until).reduce((s, l) => s + l.memberOwes, 0) : owes;
      const carryUsed = Math.min(carry, carryEligible);
      const planned = i === 1 ? money.nextYearElection : undefined;
      const fixed = planned !== undefined;
      const limit = !money.fsaOffered ? 0 : (planned ?? fsaLimits(py.year).electionLimit);
      const electionUsed = Math.min(owes - carryUsed, limit);
      fsaUsed = carryUsed + electionUsed;
      pocket = owes - fsaUsed;
      cost = pocket + electionUsed * (1 - t);
      leftover = fixed ? limit - electionUsed : 0;
    }
    const rule = money.fsaRule;
    carry = rule.kind === 'carryover' ? Math.min(leftover, rule.max) : rule.kind === 'grace' ? leftover : 0;
    graceUntil = rule.kind === 'grace' ? `${py.year + 1}-${rule.until}` : undefined;
    const ys = adj.years[i];
    return {
      year: py.year,
      planVersion: py.rules.version,
      owes,
      planPaid,
      fsaUsed: round2(fsaUsed),
      pocket: round2(pocket),
      cost: round2(cost),
      maxUsed: ys.maxUsed,
      maxRemaining: ys.maxRemaining,
      rolloverEarned: ys.rolloverEarned,
    };
  });
}

function evaluateWith(profile: Profile, planYears: PlanYear[], placements: Placement[]): ScheduleEvaluation {
  const ordered = topoOrder(profile.procedures);
  const rank = new Map(ordered.map((p, i) => [p.id, i]));
  const sorted = [...placements].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  let expectedOwes = 0;
  let expectedCost = 0;
  let badYearCost = 0;
  let lines: ScheduleEvaluation['lines'] = [];
  const years: YearCost[] = planYears.map((py) => ({
    year: py.year,
    planVersion: py.rules.version,
    owes: 0,
    planPaid: 0,
    fsaUsed: 0,
    pocket: 0,
    cost: 0,
    maxUsed: 0,
    maxRemaining: 0,
    rolloverEarned: 0,
  }));
  for (const s of scenarios(ordered)) {
    if (s.prob === 0 && !s.all) continue;
    const adj = adjudicate(profile, planYears, sorted.filter((p) => s.include.has(p.id)));
    const yc = costYears(profile, planYears, adj);
    const owes = yc.reduce((a, y) => a + y.owes, 0);
    const cost = yc.reduce((a, y) => a + y.cost, 0);
    if (s.all) {
      lines = adj.lines;
      badYearCost = round2(cost);
    }
    expectedOwes += s.prob * owes;
    expectedCost += s.prob * cost;
    yc.forEach((y, i) => {
      for (const k of ['owes', 'planPaid', 'fsaUsed', 'pocket', 'cost', 'maxUsed', 'maxRemaining', 'rolloverEarned'] as const)
        years[i][k] += s.prob * y[k];
    });
  }
  for (const y of years)
    for (const k of ['owes', 'planPaid', 'fsaUsed', 'pocket', 'cost', 'maxUsed', 'maxRemaining', 'rolloverEarned'] as const)
      y[k] = round2(y[k]);
  const finish = placements.reduce((m, p) => (p.date > m ? p.date : m), profile.asOf);
  return {
    placements: sorted,
    lines,
    expectedOwes: round2(expectedOwes),
    expectedCost: round2(expectedCost),
    badYearCost,
    years,
    finish,
  };
}

/** Prices a given schedule (e.g. after the user drags a procedure). */
export function evaluateSchedule(profile: Profile, placements: Placement[], opts: ScheduleOptions = {}): ScheduleEvaluation {
  return evaluateWith(profile, planYearsFor(profile, opts.nextPlan, opts.horizon ?? 3), placements);
}

export interface Violation {
  id: string;
  message: string;
}

/** Safety rules: nothing past the dentist's deadline, nothing before what it depends on, locked items stay put. */
export function validatePlacements(profile: Profile, placements: Placement[]): Violation[] {
  const at = new Map(placements.map((p) => [p.id, p.date]));
  const out: Violation[] = [];
  for (const p of profile.procedures) {
    const date = at.get(p.id);
    if (!date) continue;
    const name = cdtLabel(p.cdt, p.tooth);
    if (date < profile.asOf) out.push({ id: p.id, message: `${name} can't be scheduled in the past.` });
    if (p.deadline && date > p.deadline)
      out.push({ id: p.id, message: `${name} is past your dentist's deadline of ${formatDate(p.deadline)}.` });
    for (const d of p.dependsOn ?? []) {
      const depDate = at.get(d);
      const dep = profile.procedures.find((q) => q.id === d);
      if (dep && depDate && date < depDate) out.push({ id: p.id, message: `${name} must come after ${cdtLabel(dep.cdt, dep.tooth)}.` });
    }
    const mate = p.visit ? profile.procedures.find((q) => q.id !== p.id && q.visit === p.visit && at.has(q.id) && at.get(q.id) !== date) : undefined;
    if (mate) out.push({ id: p.id, message: `${name} is done in the same visit as ${cdtLabel(mate.cdt, mate.tooth)}.` });
  }
  return out;
}

export interface PlannedSchedule extends ScheduleEvaluation {
  /** Questions for the dentist, one per procedure this plan delays. */
  questions: string[];
}

export interface OptimizeResult {
  cheapest: PlannedSchedule;
  fastest: PlannedSchedule;
  balanced: PlannedSchedule;
  /** Money saved vs weeks of delay: every schedule no other schedule beats on both. */
  frontier: ScheduleEvaluation[];
  evaluated: number;
}

/** Balanced = the fastest schedule that keeps at least this share of the cheapest schedule's savings. */
const BALANCED_SHARE = 0.75;

/**
 * Exhaustive search: every procedure in any plan year of the horizon, on its earliest valid date in that year.
 * 12 procedures × 3 years ≈ 531k combinations, no solver library.
 */
export function optimize(profile: Profile, opts: ScheduleOptions = {}): OptimizeResult {
  const planYears = planYearsFor(profile, opts.nextPlan, opts.horizon ?? 3);
  const y0 = planYears[0].year;
  const procs = topoOrder(profile.procedures);
  const n = procs.length;
  const index = new Map(procs.map((p, i) => [p.id, i]));
  const deps = procs.map((p) => (p.dependsOn ?? []).map((d) => index.get(d)).filter((d): d is number => d !== undefined));
  const firstDate = (y: number) => (y === y0 ? profile.asOf : firstBusinessDay(y));
  const choices = procs.map((p) =>
    p.locked ? [y0] : planYears.map((py) => py.year).filter((y) => !p.deadline || firstDate(y) <= p.deadline),
  );
  const history = profile.ledger.history;
  // One appointment: every procedure in a visit takes the year its first member takes.
  const leader = procs.map((p, i) => (p.visit ? procs.findIndex((q) => q.visit === p.visit) : i));
  const visits = [...new Set(procs.flatMap((p) => (p.visit ? [p.visit] : [])))].map((v) => procs.filter((p) => p.visit === v).map((p) => p.id));

  const placeEach = (years: number[], notBefore?: Map<string, ISODate>): Placement[] | null => {
    const dates: ISODate[] = [];
    for (let i = 0; i < n; i++) {
      const p = procs[i];
      const y = years[i];
      const py = planYears[y - y0];
      let start = firstDate(y);
      const nb = notBefore?.get(p.id);
      if (nb && nb > start) start = nb;
      for (const d of deps[i]) {
        const after = addDays(dates[d], p.gapDays ?? DEFAULT_GAP_DAYS);
        if (after > start) start = after;
      }
      if (yearOf(start) !== y) return null;
      // Prefer the first date the plan actually covers it, if that still fits the year and the deadline.
      let covered = start;
      const waitEnd = waitingPeriodEnds(serviceClassOf(p.cdt, py.rules), py);
      if (waitEnd && waitEnd > covered) covered = waitEnd;
      const freq = frequencyEligibleFrom(p, py.rules, history, covered);
      if (freq > covered) covered = freq;
      const date = yearOf(covered) === y && (!p.deadline || covered <= p.deadline) ? covered : start;
      if (p.deadline && date > p.deadline) return null;
      dates.push(date);
    }
    return procs.map((p, i) => ({ id: p.id, date: dates[i] }));
  };

  // A visit happens on the latest date any of its procedures can have; dates only move later, so this settles.
  const place = (years: number[], notBefore?: Map<string, ISODate>): Placement[] | null => {
    const nb = new Map(notBefore);
    for (let pass = 0; pass <= n; pass++) {
      const placed = placeEach(years, nb);
      if (!placed || !visits.length) return placed;
      const at = new Map(placed.map((p) => [p.id, p.date]));
      let moved = false;
      for (const ids of visits) {
        const last = ids.reduce((m, id) => ((at.get(id) ?? m) > m ? (at.get(id) ?? m) : m), '');
        for (const id of ids)
          if ((at.get(id) ?? last) < last) {
            nb.set(id, last);
            moved = true;
          }
      }
      if (!moved) return placed;
    }
    return null;
  };

  // Rollover timing: MaxRewards money lands on day 65, so capped work in a later year may be worth moving there.
  const evaluate = (years: number[], placements: Placement[]): ScheduleEvaluation => {
    const ev = evaluateWith(profile, planYears, placements);
    const notBefore = new Map<string, ISODate>();
    for (const l of ev.lines) {
      const mr = planYears[l.year - y0]?.rules.maxRewards;
      const earnedBefore = ev.years[l.year - y0 - 1]?.rolloverEarned ?? 0;
      if (mr && l.capReduction > 0 && earnedBefore > 0 && dayOfYear(l.date) < mr.depositDay)
        notBefore.set(l.id, dateOfDay(l.year, mr.depositDay));
    }
    if (!notBefore.size) return ev;
    const shifted = place(years, notBefore);
    if (!shifted) return ev;
    const alt = evaluateWith(profile, planYears, shifted);
    return alt.expectedCost < ev.expectedCost - EPS ? alt : ev;
  };

  let frontier: ScheduleEvaluation[] = [];
  let evaluated = 0;
  const consider = (ev: ScheduleEvaluation) => {
    const f = toDay(ev.finish);
    if (frontier.some((o) => o.expectedCost <= ev.expectedCost + EPS && toDay(o.finish) <= f)) return;
    frontier = frontier.filter((o) => !(ev.expectedCost <= o.expectedCost + EPS && f <= toDay(o.finish)));
    frontier.push(ev);
  };

  const years = new Array<number>(n);
  const search = (i: number) => {
    if (i === n) {
      const placements = place(years);
      if (!placements) return;
      evaluated++;
      consider(evaluate(years, placements));
      return;
    }
    const minYear = deps[i].reduce((m, d) => Math.max(m, years[d]), y0);
    if (leader[i] < i) {
      const y = years[leader[i]];
      if (y < minYear || !choices[i].includes(y)) return;
      years[i] = y;
      search(i + 1);
      return;
    }
    for (const y of choices[i]) {
      if (y < minYear) continue;
      years[i] = y;
      search(i + 1);
    }
  };
  search(0);
  if (!frontier.length) throw new Error('No schedule meets every deadline');

  frontier.sort((a, b) => (a.finish < b.finish ? -1 : a.finish > b.finish ? 1 : a.expectedCost - b.expectedCost));
  const fastest = frontier[0];
  const cheapest = frontier[frontier.length - 1];
  const savings = fastest.expectedCost - cheapest.expectedCost;
  const balanced = frontier.find((f) => fastest.expectedCost - f.expectedCost >= BALANCED_SHARE * savings - EPS) ?? cheapest;

  const withQuestions = (ev: ScheduleEvaluation): PlannedSchedule => ({
    ...ev,
    questions: dentistQuestions(profile, ev.placements, fastest.placements),
  });
  return {
    cheapest: withQuestions(cheapest),
    fastest: withQuestions(fastest),
    balanced: withQuestions(balanced),
    frontier,
    evaluated,
  };
}

/** Every proposed delay produces a question for the dentist, who stays in charge. */
export function dentistQuestions(profile: Profile, plan: Placement[], soonest: Placement[]): string[] {
  const asap = new Map(soonest.map((p) => [p.id, p.date]));
  const byId = new Map(profile.procedures.map((p) => [p.id, p]));
  const questions = plan.flatMap((p) => {
    const proc = byId.get(p.id);
    if (!proc || toDay(p.date) - toDay(asap.get(p.id) ?? p.date) <= DEFAULT_GAP_DAYS) return [];
    return [`Can the ${cdtLabel(proc.cdt, proc.tooth).replace(/^./, (c) => c.toLowerCase())} safely wait until ${formatDate(p.date)}?`];
  });
  return [...new Set(questions)];
}
