import { describe, expect, it } from 'vitest';
import type { LedgerEntry, PlanComparisonRow, ProcedureItem } from '../contracts';
import { addDays } from '../lib/dates';
import { adherence, currentStreak, dentistSummary, habitAdjustment, programEconomics, type ProgramCohort } from './analytics';
import { SMILESTREAK } from './program';
import cohort from './programCohort.json';
import { computeRewards, verifySession, withCredit } from './rewards';
import { seedHistory } from './simulate';
import type { BrushSession, HabitConsent } from './types';

const session = (date: string, slot: 'am' | 'pm', over: Partial<BrushSession> = {}): BrushSession => ({
  id: `${date}-${slot}`,
  deviceId: 'd1',
  source: 'seed',
  startedAt: `${date}T${slot === 'am' ? '07' : '22'}:00:00Z`,
  durationSec: 120,
  sectorCount: 4,
  sectorSeconds: [30, 30, 30, 30],
  pressureWarnings: 0,
  ...over,
});

/** Two good sessions a day from `from` for `days` days. */
function goodDays(from: string, days: number): BrushSession[] {
  const out: BrushSession[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i);
    out.push(session(d, 'am'), session(d, 'pm'));
  }
  return out;
}

const cleaning = (id: string, date: string): LedgerEntry => ({
  id, serviceDate: date, cdt: 'D1110', billed: 125, allowed: 90, planPaid: 90, memberOwes: 0, source: 'claim', isDemoData: true,
});

const optedIn: HabitConsent = { optedIn: true, consentedAt: '2026-01-01', shareWithDentist: false, shareAggregateWithLincoln: false };

describe('verifySession', () => {
  it('accepts a normal session', () => expect(verifySession(session('2026-03-01', 'am')).verified).toBe(true));
  it('rejects very short sessions', () => expect(verifySession(session('2026-03-01', 'am', { durationSec: 20 })).verified).toBe(false));
  it('rejects a brush left running in one spot', () =>
    expect(verifySession(session('2026-03-01', 'am', { sectorSeconds: [120, 0, 0, 0] })).verified).toBe(false));
  it('rejects device sessions with too few live readings', () =>
    expect(verifySession(session('2026-03-01', 'am', { source: 'oralb-ble', liveSamples: 1 })).verified).toBe(false));
});

describe('computeRewards', () => {
  const base = { program: SMILESTREAK, ledger: [] as LedgerEntry[], consent: optedIn, asOf: '2026-04-15', dentistCheck: false };

  it('credits verified cleanings from claims, at most two a year, with no device', () => {
    const ledger = [cleaning('a', '2026-01-10'), cleaning('b', '2026-02-10'), cleaning('c', '2026-03-10'), cleaning('old', '2025-11-01')];
    const r = computeRewards({ ...base, sessions: [], ledger });
    expect(r.cleaningCredit).toBe(2 * SMILESTREAK.cleaningCredit);
    expect(r.lines.filter((l) => l.reason === 'cleaning_verified')).toHaveLength(2);
  });

  it('credits each completed month that meets the goal', () => {
    const r = computeRewards({ ...base, sessions: goodDays('2026-01-01', 105) });
    // Jan, Feb, Mar complete; April is the current month.
    expect(r.lines.filter((l) => l.reason === 'brush_month').map((l) => l.id)).toEqual(['brush-2026-01', 'brush-2026-02', 'brush-2026-03']);
    expect(r.brushingCredit).toBe(3 * SMILESTREAK.brushMonthCredit);
  });

  it('does not credit a month with too many missed days', () => {
    const sessions = goodDays('2026-01-01', 31).filter((s) => s.startedAt.slice(8, 10) < '20');
    const r = computeRewards({ ...base, sessions });
    expect(r.lines.some((l) => l.id === 'brush-2026-01')).toBe(false);
  });

  it('ignores data from before consent', () => {
    const r = computeRewards({ ...base, consent: { ...optedIn, consentedAt: '2026-03-01' }, sessions: goodDays('2026-01-01', 105) });
    expect(r.lines.filter((l) => l.reason === 'brush_month').map((l) => l.id)).toEqual(['brush-2026-03']);
  });

  it('earns nothing until opted in, but shows the preview', () => {
    const r = computeRewards({ ...base, consent: { ...optedIn, optedIn: false }, sessions: [], ledger: [cleaning('a', '2026-01-10')] });
    expect(r.earned).toBe(0);
    expect(r.wouldEarn).toBe(SMILESTREAK.cleaningCredit);
  });

  it('lets the dentist home-care check stand in for a smart brush', () => {
    const r = computeRewards({ ...base, sessions: [], ledger: [cleaning('a', '2026-01-10'), cleaning('b', '2026-03-10')], dentistCheck: true });
    expect(r.brushingCredit).toBe(SMILESTREAK.brushMonthCredit * SMILESTREAK.maxBrushMonths);
    expect(r.earned).toBe(Math.min(SMILESTREAK.annualCap, r.uncapped));
  });

  it('never exceeds the annual cap', () => {
    const r = computeRewards({
      ...base,
      asOf: '2026-12-15',
      sessions: goodDays('2026-01-01', 340),
      ledger: [cleaning('a', '2026-01-10'), cleaning('b', '2026-06-10')],
      dentistCheck: true,
    });
    expect(r.earned).toBe(SMILESTREAK.annualCap);
    expect(r.remainingToCap).toBe(0);
  });
});

describe('withCredit', () => {
  it('lowers every plan by the same credit without changing the winner', () => {
    const rows = [
      { planId: 'low', name: 'Low', expectedTotal: 800, recommended: false },
      { planId: 'high', name: 'High', expectedTotal: 700, recommended: true },
    ] as PlanComparisonRow[];
    const out = withCredit(rows, 95);
    expect(out.map((r) => r.netTotal)).toEqual([705, 605]);
    expect(out.find((r) => r.recommended)?.planId).toBe('high');
  });
});

describe('analytics', () => {
  it('counts adherence and streaks', () => {
    const sessions = goodDays('2026-03-01', 30);
    expect(adherence(sessions, '2026-03-31', SMILESTREAK).rate).toBe(1);
    expect(currentStreak(sessions, '2026-03-31', SMILESTREAK)).toBe(30);
  });

  it('bounds the habit adjustment to 10 points and skips major work', () => {
    const maybe = { id: 'p', serviceClass: 'basic', likelihood: 0.3 } as ProcedureItem;
    const strong = habitAdjustment(maybe, { goodDays: 30, days: 30, rate: 1 });
    expect(strong?.to).toBe(0.2);
    const weak = habitAdjustment(maybe, { goodDays: 0, days: 30, rate: 0 });
    expect(weak?.to).toBe(0.4);
    expect(habitAdjustment({ ...maybe, serviceClass: 'major' }, { goodDays: 30, days: 30, rate: 1 })).toBeNull();
    expect(habitAdjustment({ ...maybe, likelihood: undefined }, { goodDays: 30, days: 30, rate: 1 })).toBeNull();
  });

  it('finds the weakest quadrant for the dentist', () => {
    const sessions = goodDays('2026-03-01', 30).map((s) => ({ ...s, sectorSeconds: [36, 12, 36, 36] }));
    const d = dentistSummary(sessions, '2026-03-31', SMILESTREAK);
    expect(d?.weakest?.index).toBe(1);
    expect(d?.twiceDailyRate).toBe(1);
  });

  it('computes program economics with an explicit attribution assumption', () => {
    const e = programEconomics(cohort as ProgramCohort, 0.5);
    expect(e.restorativeGapPer1000).toBe(145);
    expect(e.attributedAvoidedCost).toBeCloseTo(e.rawAvoidedCost * 0.5, 1);
    expect(e.lincolnNet).toBeCloseTo(e.attributedAvoidedCost - e.lincolnCost, 1);
    // At the break-even attribution the program roughly pays for itself (the share is rounded for display).
    expect(Math.abs(programEconomics(cohort as ProgramCohort, e.breakEvenAttribution).lincolnNet)).toBeLessThan(e.rawAvoidedCost * 0.01);
  });
});

describe('seedHistory', () => {
  it('is deterministic and starts at consent', () => {
    const a = seedHistory('dale', '2026-10-03', '2026-01-02');
    const b = seedHistory('dale', '2026-10-03', '2026-01-02');
    expect(a).toEqual(b);
    expect(a[0].startedAt >= '2026-01-02').toBe(true);
    expect(seedHistory('jordan', '2026-10-03', undefined)).toEqual([]);
  });

  it("gives Dale a reward-worthy year", () => {
    const sessions = seedHistory('dale', '2026-10-03', '2026-01-02');
    const r = computeRewards({ program: SMILESTREAK, sessions, ledger: [], consent: { ...optedIn, consentedAt: '2026-01-02' }, asOf: '2026-10-03', dentistCheck: false });
    expect(r.brushingCredit).toBe(SMILESTREAK.brushMonthCredit * SMILESTREAK.maxBrushMonths);
  });
});
