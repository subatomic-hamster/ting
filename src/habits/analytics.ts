// What the brushing data means for each party: the member (streaks, a habit-informed
// estimate), the dentist (a 30-day home-care summary) and Lincoln (aggregate program
// economics). Pure functions; the UI only formats their output.

import type { ProcedureItem } from '../contracts';
import { addDays } from '../lib/dates';
import { countsByDay, isGoodDay, sessionDate, verifySession } from './rewards';
import type { BrushSession, RewardProgram } from './types';

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Sessions that started in [asOf - days, asOf). */
function inWindow(sessions: BrushSession[], asOf: string, days: number) {
  const from = addDays(asOf, -days);
  return sessions.filter((s) => {
    const d = sessionDate(s);
    return d >= from && d < asOf;
  });
}

export interface Adherence {
  goodDays: number;
  days: number;
  rate: number; // share of days meeting the program's daily goal
}

export function adherence(sessions: BrushSession[], asOf: string, program: RewardProgram, days = 30): Adherence {
  const byDay = countsByDay(inWindow(sessions, asOf, days), program);
  let good = 0;
  for (let i = 1; i <= days; i++) if (isGoodDay(byDay, addDays(asOf, -i), program)) good += 1;
  return { goodDays: good, days, rate: days ? round2(good / days) : 0 };
}

/** Consecutive good days ending yesterday (or today, once today's goal is met). */
export function currentStreak(sessions: BrushSession[], asOf: string, program: RewardProgram): number {
  const byDay = countsByDay(sessions, program);
  let day = isGoodDay(byDay, asOf, program) ? asOf : addDays(asOf, -1);
  let streak = 0;
  while (isGoodDay(byDay, day, program) && streak < 400) {
    streak += 1;
    day = addDays(day, -1);
  }
  return streak;
}

export interface CalendarDay {
  date: string;
  sessions: number; // verified sessions
  good: boolean;
  collected: boolean; // false before consent: no data exists
}

export function calendarDays(
  sessions: BrushSession[],
  asOf: string,
  program: RewardProgram,
  consentStart: string | undefined,
  days = 35,
): CalendarDay[] {
  const byDay = new Map<string, number>();
  for (const s of sessions) if (verifySession(s).verified) byDay.set(sessionDate(s), (byDay.get(sessionDate(s)) ?? 0) + 1);
  const good = countsByDay(sessions, program);
  const out: CalendarDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(asOf, -i);
    out.push({
      date,
      sessions: byDay.get(date) ?? 0,
      good: isGoodDay(good, date, program),
      collected: Boolean(consentStart && date >= consentStart),
    });
  }
  return out;
}

export interface HabitAdjustment {
  procedureId: string;
  from: number;
  to: number;
  delta: number;
  reason: string;
}

/**
 * Nudges the likelihood of a "maybe" preventive/basic item by at most 10 points,
 * based on 30-day adherence. Never touches certain work, dentist deadlines, major
 * or ortho work, or money. Only applied when the member chooses to.
 */
export function habitAdjustment(item: ProcedureItem, a: Adherence): HabitAdjustment | null {
  if (item.likelihood === undefined) return null;
  if (item.serviceClass !== 'preventive' && item.serviceClass !== 'basic') return null;
  if (a.days < 14) return null;
  const delta = round2(clamp((0.5 - a.rate) * 0.2, -0.1, 0.1));
  if (Math.abs(delta) < 0.01) return null;
  const to = round2(clamp(item.likelihood + delta, 0.01, 0.99));
  const pct = Math.round(a.rate * 100);
  return {
    procedureId: item.id,
    from: item.likelihood,
    to,
    delta: round2(to - item.likelihood),
    reason:
      delta < 0
        ? `You met the twice-a-day goal on ${pct}% of the last ${a.days} days, which lowers the odds a bit.`
        : `You met the twice-a-day goal on ${pct}% of the last ${a.days} days, which raises the odds a bit.`,
  };
}

export interface DentistSummary {
  days: number;
  sessions: number;
  sessionsPerDay: number;
  avgDurationSec: number;
  twiceDailyRate: number;
  pressureWarningsPerWeek: number;
  sectorCount: number;
  sectorShare: number[]; // share of brushing time per sector (sums to ~1)
  weakest: { index: number; share: number } | null;
  trend: { recent: number; prior: number }; // twice-daily rate, last 14 days vs the 14 before
}

/** The 30-day home-care summary a member can choose to share with their dentist. */
export function dentistSummary(sessions: BrushSession[], asOf: string, program: RewardProgram, days = 30): DentistSummary | null {
  const recent = inWindow(sessions, asOf, days).filter((s) => verifySession(s).verified);
  if (!recent.length) return null;
  const sectorCount = Math.max(...recent.map((s) => s.sectorCount));
  const totals = Array.from({ length: sectorCount }, () => 0);
  for (const s of recent) s.sectorSeconds.forEach((sec, i) => (totals[i] += sec));
  const all = totals.reduce((a, b) => a + b, 0) || 1;
  const sectorShare = totals.map((t) => round2(t / all));
  const even = 1 / sectorCount;
  const minShare = Math.min(...sectorShare);
  const weakIndex = sectorShare.indexOf(minShare);

  const twice = (from: number, to: number) => {
    const byDay = countsByDay(recent, { ...program, day: { sessions: 2, minSec: 1 } });
    let good = 0;
    for (let i = from; i <= to; i++) if (isGoodDay(byDay, addDays(asOf, -i), { ...program, day: { sessions: 2, minSec: 1 } })) good += 1;
    return round2(good / (to - from + 1));
  };

  return {
    days,
    sessions: recent.length,
    sessionsPerDay: round2(recent.length / days),
    avgDurationSec: Math.round(recent.reduce((a, s) => a + s.durationSec, 0) / recent.length),
    twiceDailyRate: twice(1, days),
    pressureWarningsPerWeek: round2((recent.reduce((a, s) => a + s.pressureWarnings, 0) / days) * 7),
    sectorCount,
    sectorShare,
    // Flag a sector only when it gets clearly less than an even share.
    weakest: minShare < even * 0.8 ? { index: weakIndex, share: minShare } : null,
    trend: { recent: twice(1, 14), prior: twice(15, 28) },
  };
}

// --- Lincoln's view: aggregate program economics -----------------------------------

export interface ProgramCohort {
  isDemoData: boolean;
  eligibleMembers: number;
  participants: number;
  preventiveCompletion: { participants: number; nonParticipants: number }; // share with 2 cleanings/yr
  restorativeClaimsPer1000: { participants: number; nonParticipants: number }; // fillings, root canals, crowns
  avgRestorativeClaimPaid: number;
  avgCleaningPaid: number;
  avgCreditPaid: number; // employer-funded
  deviceSubsidy: { perDevice: number; devices: number }; // Lincoln-funded
  groups: { id: string; name: string; n: number; participationRate: number; twiceDailyRate: number }[];
}

export interface ProgramEconomics {
  participationRate: number;
  restorativeGapPer1000: number;
  rawAvoidedClaims: number;
  rawAvoidedCost: number; // if 100% of the gap were caused by the program
  attributedAvoidedCost: number;
  extraCleaningsCost: number; // more cleanings get used (paid at 100%): intended, but a cost
  deviceCost: number;
  lincolnCost: number;
  lincolnNet: number;
  breakEvenAttribution: number; // share of the gap the program must cause to pay for itself
  employerCreditCost: number;
}

/**
 * Honest economics: participants self-select (they likely brushed well already), so only
 * part of their lower claim rate is caused by the program. `attribution` is that share,
 * an assumption to replace with a randomized pilot's result.
 */
export function programEconomics(c: ProgramCohort, attribution: number): ProgramEconomics {
  const gap = c.restorativeClaimsPer1000.nonParticipants - c.restorativeClaimsPer1000.participants;
  const rawAvoidedClaims = round2((gap / 1000) * c.participants);
  const rawAvoidedCost = round2(rawAvoidedClaims * c.avgRestorativeClaimPaid);
  const extraCleanings =
    (c.preventiveCompletion.participants - c.preventiveCompletion.nonParticipants) * c.participants * 2;
  const extraCleaningsCost = round2(extraCleanings * c.avgCleaningPaid);
  const deviceCost = round2(c.deviceSubsidy.perDevice * c.deviceSubsidy.devices);
  const lincolnCost = round2(extraCleaningsCost + deviceCost);
  const attributedAvoidedCost = round2(rawAvoidedCost * attribution);
  return {
    participationRate: round2(c.participants / c.eligibleMembers),
    restorativeGapPer1000: gap,
    rawAvoidedClaims,
    rawAvoidedCost,
    attributedAvoidedCost,
    extraCleaningsCost,
    deviceCost,
    lincolnCost,
    lincolnNet: round2(attributedAvoidedCost - lincolnCost),
    breakEvenAttribution: rawAvoidedCost ? round2(lincolnCost / rawAvoidedCost) : 1,
    employerCreditCost: round2(c.avgCreditPaid * c.participants),
  };
}
