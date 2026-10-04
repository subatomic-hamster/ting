import { describe, expect, it } from 'vitest';
import { PERSONAS } from '../data/personas';
import { DEMO_PLAN_OPTIONS } from '../data/demo';
import { SMILESTREAK } from '../habits/program';
import { habitSignal } from '../habits/analytics';
import { seedHistory } from '../habits/simulate';
import { compare } from './compare';
import { yearEndReview } from './overview';
import { habitEffect } from './risk';
import { optimize } from './schedule';
import type { Lifestyle } from './types';

const moderate: Lifestyle = { brushing: 'once', flossing: 'daily', sugaryDrinks: 'daily', tobacco: false, grinding: 'no', bleedingGums: false, dryMouth: false };

describe('habitEffect', () => {
  it('good brushing lowers cavity risk and removes the filling', () => {
    const e = habitEffect({ lifestyle: moderate }, { twiceDailyRate: 0.9, days: 30 });
    expect(e?.text).toBe('Cavity risk: moderate → low. Filling likelihood 25% → removed.');
  });
  it('poor brushing raises it', () => {
    const e = habitEffect({ lifestyle: { ...moderate, brushing: 'twice' } }, { twiceDailyRate: 0.2, days: 30 });
    expect(e?.text).toBe('Cavity risk: low → moderate. Filling likelihood none → 25%.');
  });
  it('does nothing under two weeks or in the middle range', () => {
    expect(habitEffect({ lifestyle: moderate }, { twiceDailyRate: 0.9, days: 7 })).toBeUndefined();
    expect(habitEffect({ lifestyle: moderate }, { twiceDailyRate: 0.6, days: 30 })).toBeUndefined();
    expect(habitEffect({ lifestyle: moderate })).toBeUndefined();
  });
});

describe('habitSignal', () => {
  it('scores only the days since consent, so a fresh opt-in is not penalised', () => {
    const asOf = '2026-10-04';
    expect(habitSignal([], asOf, SMILESTREAK, undefined)).toBeNull();
    expect(habitSignal([], asOf, SMILESTREAK, asOf)).toBeNull();
    expect(habitSignal([], asOf, SMILESTREAK, '2026-10-01')).toEqual({ twiceDailyRate: 0, days: 3 });
  });
  it('a consistent brusher importing 30 days shares a high rate', () => {
    const asOf = '2026-10-04';
    const consent = '2026-09-04';
    const s = habitSignal(seedHistory('U-NEW', asOf, consent), asOf, SMILESTREAK, consent);
    expect(s?.days).toBe(30);
    expect(s?.twiceDailyRate).toBeGreaterThanOrEqual(0.8);
  });
});

describe('yearEndReview', () => {
  const profile = PERSONAS.dale.profile('2026-10-03');
  const r = yearEndReview(profile, optimize(profile, { horizon: 2 }).cheapest, compare(profile, DEMO_PLAN_OPTIONS));
  it('reports the plan year against the max using engine numbers', () => {
    expect(r.annualMax).toBe(profile.currentPlan.annualMax);
    expect(r.used).toBe(profile.ledger.maxUsed);
    expect(['over', 'under', 'on track']).toContain(r.status);
    expect(r.nextYear).toBe(2027);
  });
  it('recommends the comparison winner with its totals', () => {
    const c = compare(profile, DEMO_PLAN_OPTIONS);
    expect(r.recommendation.plan).toBe(c.best.plan.name);
    expect(r.recommendation.total).toBe(c.best.total);
  });
});
