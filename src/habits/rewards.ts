// SmileStreak reward rules. Pure functions: every credit shown on screen comes
// from here (the UI only formats). Dates are UTC "YYYY-MM-DD".

import type { ServiceRecord } from '../engine/types';
import { addDays, diffDays, maxDate, yearOf } from '../lib/dates';
import type { BrushSession, HabitConsent, RewardLine, RewardProgram, RewardSummary, SessionCheck } from './types';

const round2 = (n: number) => Math.round(n * 100) / 100;

export const sessionDate = (s: BrushSession) => s.startedAt.slice(0, 10);

/** Basic anti-gaming checks. Unverified sessions are kept but never earn credit. */
export function verifySession(s: BrushSession): SessionCheck {
  if (s.durationSec < 30) return { verified: false, reason: 'Too short to count' };
  if (s.durationSec > 15 * 60) return { verified: false, reason: 'Ran over 15 minutes (left running?)' };
  const covered = s.sectorSeconds.filter((sec) => sec >= 10).length;
  if (covered < Math.min(2, s.sectorCount)) return { verified: false, reason: 'Stayed in one spot the whole time' };
  if ((s.source === 'oralb-ble' || s.source === 'esp32') && (s.liveSamples ?? 0) < Math.floor(s.durationSec / 30)) {
    return { verified: false, reason: 'Too few live readings from the device' };
  }
  return { verified: true };
}

/** Verified sessions long enough to count, per day. */
export function countsByDay(sessions: BrushSession[], program: RewardProgram): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const s of sessions) {
    if (s.durationSec < program.day.minSec || !verifySession(s).verified) continue;
    const d = sessionDate(s);
    byDay.set(d, (byDay.get(d) ?? 0) + 1);
  }
  return byDay;
}

export function isGoodDay(byDay: Map<string, number>, date: string, program: RewardProgram): boolean {
  return (byDay.get(date) ?? 0) >= program.day.sessions;
}

const monthStart = (month: string) => `${month}-01`;
function monthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Good days / eligible days for a span (inclusive). */
function goodDaysIn(byDay: Map<string, number>, from: string, to: string, program: RewardProgram) {
  let good = 0;
  let days = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    days += 1;
    if (isGoodDay(byDay, d, program)) good += 1;
  }
  return { good, days };
}

/** A month counts when at least `monthQualifyShare` of its eligible days were good days. */
export function monthQualifies(
  byDay: Map<string, number>,
  month: string,
  consentStart: string,
  program: RewardProgram,
): boolean {
  const from = maxDate(monthStart(month), consentStart);
  const to = monthEnd(month);
  if (from > to) return false;
  const { good, days } = goodDaysIn(byDay, from, to, program);
  // Joining late in a month doesn't earn that month: at least half of it must be observed.
  if (days < 15) return false;
  return good / days >= program.monthQualifyShare;
}

export interface RewardInput {
  program: RewardProgram;
  sessions: BrushSession[];
  /** The member's service history; only Lincoln claims count as verified. */
  ledger: ServiceRecord[];
  consent: HabitConsent;
  asOf: string;
  dentistCheck: boolean; // the no-device alternative: dentist confirms home care at a cleaning
}

export function computeRewards({ program, sessions, ledger, consent, asOf, dentistCheck }: RewardInput): RewardSummary {
  const year = yearOf(asOf);
  const consentStart = consent.consentedAt ?? asOf;
  const lines: RewardLine[] = [];

  // 1. Cleanings, verified from Lincoln's own claims. No device needed.
  ledger
    .filter((e) => e.source === 'claim' && program.cleaningCdts.includes(e.cdt) && yearOf(e.date) === year && e.date <= asOf)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, program.maxCleanings)
    .forEach((e) =>
      lines.push({
        id: `clean-${e.claimId ?? `${e.date}-${e.cdt}`}`,
        date: e.date,
        reason: 'cleaning_verified',
        label: 'Cleaning verified from your Lincoln claim',
        credit: program.cleaningCredit,
        source: e.claimId ? `Claim ${e.claimId}` : `Claim on ${e.date}`,
      }),
    );

  // 2. Brushing months, from collected sessions (only after consent).
  const byDay = countsByDay(sessions.filter((s) => sessionDate(s) >= consentStart), program);
  const currentMonth = asOf.slice(0, 7);
  let brushMonths = 0;
  for (let m = 1; m <= 12 && brushMonths < program.maxBrushMonths; m++) {
    const month = `${year}-${String(m).padStart(2, '0')}`;
    if (month >= currentMonth) break;
    if (monthQualifies(byDay, month, consentStart, program)) {
      brushMonths += 1;
      lines.push({
        id: `brush-${month}`,
        date: monthEnd(month),
        reason: 'brush_month',
        label: `Brushing goal met in ${new Date(`${month}-15T00:00:00Z`).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })}`,
        credit: program.brushMonthCredit,
        source: 'Device summaries',
      });
    }
  }

  // 3. Reasonable alternative: no smart brush needed. A dentist's home-care check tops
  //    the brushing portion up to its maximum, so everyone can earn the full reward.
  const brushingMax = program.brushMonthCredit * program.maxBrushMonths;
  const brushingSoFar = brushMonths * program.brushMonthCredit;
  if (dentistCheck && brushingSoFar < brushingMax) {
    lines.push({
      id: 'dentist-check',
      date: asOf,
      reason: 'dentist_homecare_check',
      label: 'Dentist confirmed good home care (no-device option)',
      credit: brushingMax - brushingSoFar,
      source: 'Dentist attestation',
    });
  }

  const sumOf = (reasons: RewardLine['reason'][]) =>
    round2(lines.filter((l) => reasons.includes(l.reason)).reduce((a, l) => a + l.credit, 0));
  const uncapped = sumOf(['cleaning_verified', 'brush_month', 'dentist_homecare_check']);
  const wouldEarn = Math.min(program.annualCap, uncapped);
  const earned = consent.optedIn ? wouldEarn : 0;

  // Progress this month (completed days only).
  const from = maxDate(monthStart(currentMonth), consentStart);
  const yesterday = addDays(asOf, -1);
  const progress = from <= yesterday ? goodDaysIn(byDay, from, yesterday, program) : { good: 0, days: 0 };
  const eligibleThisMonth = Math.max(0, diffDays(monthEnd(currentMonth), from) + 1);
  const needed = Math.ceil(eligibleThisMonth * program.monthQualifyShare);

  return {
    planYear: year,
    lines,
    uncapped,
    wouldEarn,
    earned,
    cap: program.annualCap,
    remainingToCap: round2(program.annualCap - wouldEarn),
    cleaningCredit: sumOf(['cleaning_verified']),
    brushingCredit: sumOf(['brush_month', 'dentist_homecare_check']),
    brushingMax,
    progressPct: round2(((consent.optedIn ? earned : wouldEarn) / program.annualCap) * 100),
    currentMonth: {
      month: currentMonth,
      goodDays: progress.good,
      daysSoFar: progress.days,
      needed,
      onTrack: progress.days === 0 || progress.good / progress.days >= program.monthQualifyShare,
    },
  };
}

export interface CreditedRow {
  planId: string;
  name: string;
  expectedTotal: number;
  credit: number;
  netTotal: number;
  recommended: boolean;
}

/**
 * Next year's expected cost per plan, net of the SmileStreak credit. The credit is
 * the same on every plan, so it lowers the total without changing which plan wins.
 */
/** One plan option from the engine's comparison. */
export interface ComparisonRow {
  planId: string;
  name: string;
  expectedTotal: number;
  recommended: boolean;
}

export function withCredit(rows: ComparisonRow[], credit: number): CreditedRow[] {
  return rows.map((r) => ({
    planId: r.planId,
    name: r.name,
    expectedTotal: r.expectedTotal,
    credit,
    netTotal: round2(r.expectedTotal - credit),
    recommended: r.recommended,
  }));
}
