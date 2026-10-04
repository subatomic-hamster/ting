import { frequencyEligibleFrom, planYearsFor, round2, waitingPeriodEnds } from './adjudicate';
import { nameOf } from './cdt';
import { addDays, dateOfDay, firstBusinessDay, formatDate, toDay, yearOf } from './dates';
import { usd } from './format';
import { DEFAULT_GAP_DAYS, evaluateSchedule, isOverdue, topoOrder, type ScheduleOptions } from './schedule';
import type { ISODate, PlacementReason, Profile, ScheduleEvaluation } from './types';

const EPS = 0.005;
const lower = (s: string) => s.replace(/^./, (c) => c.toLowerCase());

/**
 * One plain sentence per procedure: why it sits on its date, tied to the plan year (max, deductible, frequency limits,
 * what it follows). Every figure comes from the engine's own adjudication of this schedule or of the
 * "do it at the earliest date" alternative; nothing is estimated here.
 */
export function placementReasons(
  profile: Profile,
  schedule: ScheduleEvaluation,
  opts: ScheduleOptions = {},
): Record<string, PlacementReason> {
  const planYears = planYearsFor(profile, opts.nextPlan, opts.horizon ?? 3);
  const y0 = planYears[0].year;
  const at = new Map(schedule.placements.map((p) => [p.id, p.date]));
  const lineOf = new Map(schedule.lines.map((l) => [l.id, l]));
  const procOf = new Map(profile.procedures.map((p) => [p.id, p]));
  const firstOf = (y: number): ISODate => (y === y0 ? profile.asOf : firstBusinessDay(y));
  const out: Record<string, PlacementReason> = {};

  let now: { dates: Map<string, ISODate>; lines: ScheduleEvaluation['lines'] } | undefined;
  const doItNow = () => {
    if (now) return now;
    const dates = new Map<string, ISODate>();
    for (const p of topoOrder(profile.procedures)) {
      const d = at.get(p.id) ?? profile.asOf;
      if (yearOf(d) <= y0) {
        dates.set(p.id, d);
        continue;
      }
      let e = profile.asOf;
      for (const dep of p.dependsOn ?? []) {
        const depDate = dates.get(dep);
        const after = depDate ? addDays(depDate, p.gapDays ?? DEFAULT_GAP_DAYS) : e;
        if (after > e) e = after;
      }
      dates.set(p.id, e);
    }
    const placements = schedule.placements.map((p) => ({ id: p.id, date: dates.get(p.id) ?? p.date }));
    now = { dates, lines: evaluateSchedule(profile, placements, opts).lines };
    return now;
  };

  for (const proc of profile.procedures) {
    const date = at.get(proc.id);
    const line = lineOf.get(proc.id);
    if (!date || !line) continue;
    const year = line.year;
    const py = planYears.find((y) => y.year === year) ?? planYears[0];
    const rules = py.rules;
    const cls = line.serviceClass;

    // Annual max left right after this visit.
    const countsToMax = rules.kind === 'insurance' && cls !== 'ortho' && cls !== 'excluded' && !(cls === 'preventive' && !rules.preventiveCountsTowardMax);
    const maxLeftAfter =
      rules.kind === 'insurance' && cls !== 'ortho' ? round2(Math.max(0, line.maxRemainingBefore - (countsToMax ? line.planPaid : 0))) : undefined;

    // Earliest the plan year and the visits it follows allow.
    const gap = proc.gapDays ?? DEFAULT_GAP_DAYS;
    const deps = (proc.dependsOn ?? []).flatMap((d) => {
      const dep = procOf.get(d);
      const depDate = at.get(d);
      return dep && depDate ? [{ dep, ready: addDays(depDate, gap) }] : [];
    });
    const depEnd = deps.reduce<ISODate>((m, d) => (d.ready > m ? d.ready : m), '');
    const start = depEnd > firstOf(year) ? depEnd : firstOf(year);

    const make = (kind: PlacementReason['kind'], text: string): PlacementReason => ({
      id: proc.id,
      kind,
      text,
      year,
      ...(maxLeftAfter !== undefined && { maxLeftAfter }),
      ...(kind === 'overdue' && { overdue: true }),
    });

    if (isOverdue(profile, proc) && proc.deadline) {
      out[proc.id] = make('overdue', `Overdue: your dentist wanted this by ${formatDate(proc.deadline)}. Book as soon as possible.`);
      continue;
    }
    if (proc.locked) {
      out[proc.id] = make('locked', `Locked: urgent, your dentist set this date${proc.deadline ? ` (deadline ${formatDate(proc.deadline)})` : ''}.`);
      continue;
    }

    const wait = waitingPeriodEnds(cls, py);
    if (wait && wait > start && date === wait) {
      out[proc.id] = make('waiting', `Not before ${formatDate(wait)}: your plan's waiting period for ${cls} care ends then.`);
      continue;
    }

    const eligible = frequencyEligibleFrom(proc, rules, profile.ledger.history, start);
    if (eligible > start && date === eligible) {
      const limit = rules.frequencyLimits.find((l) => l.codes.includes(proc.cdt));
      const last = profile.ledger.history
        .filter((h) => limit?.codes.includes(h.cdt) && (!limit.perTooth || h.tooth === proc.tooth))
        .map((h) => h.date)
        .sort()
        .pop();
      out[proc.id] = make(
        'frequency',
        `Not before ${formatDate(eligible)}: the plan limits this (${limit?.label ?? 'frequency limit'})${last ? `; your last one was ${formatDate(last)}` : ''}.`,
      );
      continue;
    }

    if (depEnd && depEnd > firstOf(year) && date === depEnd) {
      const first = deps.reduce((a, b) => (b.ready > a.ready ? b : a));
      out[proc.id] = make('dependency', `Waits for ${lower(nameOf(first.dep))} first: it comes ${gap} days after that visit.`);
      continue;
    }

    if (year > y0 || toDay(date) > toDay(start)) {
      // Compare with doing this year's-end work now: every visit that waits for a later plan year goes at its earliest date.
      const nowPlan = doItNow();
      const earliest = nowPlan.dates.get(proc.id) ?? date;
      if (year > y0 && date > earliest) {
        const alt = nowPlan.lines.find((l) => l.id === proc.id);
        const saved = alt ? round2(alt.memberOwes - line.memberOwes) : 0;
        if (alt && !alt.denied && saved > EPS) {
          const gain = round2(line.planPaid - alt.planPaid);
          out[proc.id] =
            alt.capReduction > EPS && gain > EPS
              ? make(
                  'moved',
                  `Moved to ${formatDate(date)}: your ${alt.year} max has ${usd(alt.maxRemainingBefore)} left; in ${year} ${usd(line.maxRemainingBefore)} is available, so the plan pays ${usd(gain)} more and you pay ${usd(saved)} less.`,
                )
              : make('moved', `Moved to ${formatDate(date)}: in ${year} this costs you ${usd(saved)} less than doing it on ${formatDate(earliest)}.`);
          continue;
        }
        // No saving for this visit alone, but the visits that wait together would run this year's max out.
        const capped = nowPlan.lines.find((l) => l.year === y0 && l.capReduction > EPS && l.id !== proc.id);
        const more = round2(nowPlan.lines.reduce((s, l) => s + l.memberOwes, 0) - schedule.lines.reduce((s, l) => s + l.memberOwes, 0));
        if (capped && more > EPS) {
          out[proc.id] = make(
            'moved',
            `Moved to ${formatDate(date)} with the other year-end work: done now, your ${y0} max (${usd(capped.maxRemainingBefore)} left by ${lower(nameOf(procOf.get(capped.id) ?? proc))}) runs out and you'd pay ${usd(more)} more; in ${year} it resets.`,
          );
          continue;
        }
      }
      const mr = rules.maxRewards;
      if (mr && date === dateOfDay(year, mr.depositDay)) {
        out[proc.id] = make('rollover', `Held until ${formatDate(date)}: your max rollover is deposited on day ${mr.depositDay} of the plan year, which raises your ${year} max.`);
        continue;
      }
      out[proc.id] = make('moved', `Set for ${formatDate(date)} to fit the rest of the plan and your dentist's window${proc.deadline ? ` (deadline ${formatDate(proc.deadline)})` : ''}.`);
      continue;
    }

    // At the earliest date: say what the plan year does to it.
    const dedAmount = rules.deductible.amount;
    const subject = cls !== 'excluded' && rules.deductible.appliesTo.includes(cls);
    let text: string;
    if (line.denied) text = `Earliest date, but not covered: ${line.denied.detail}`;
    else if (line.capReduction > EPS)
      text = `Kept in ${year}: only ${usd(line.maxRemainingBefore)} of your ${year} max is left, so the plan pays ${usd(line.planPaid)}${proc.deadline ? `; your dentist's deadline is ${formatDate(proc.deadline)}` : ''}.`;
    else if (dedAmount > 0 && subject && line.deductibleApplied === 0) text = `Kept in ${year}: the ${usd(dedAmount)} deductible is already met this year.`;
    else if (line.deductibleApplied > 0) text = `Kept in ${year}: earliest date. The ${usd(line.deductibleApplied)} deductible comes out of this visit.`;
    else if (dedAmount > 0 && !subject) text = `Kept in ${year}: ${cls} care has no deductible, and your ${year} max still covers it.`;
    else text = `Kept in ${year}: earliest date, and your ${year} max still covers it.`;
    out[proc.id] = make('kept', text);
  }
  return out;
}
