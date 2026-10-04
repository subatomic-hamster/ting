import { describe, expect, it } from 'vitest';
import { PERSONAS } from '../data/personas';
import { dollarsIn } from './explain';
import { monthlyOverview } from './overview';
import { optimize } from './schedule';

describe('monthlyOverview', () => {
  const profile = PERSONAS.dale.profile('2026-10-03');
  const o = monthlyOverview(profile, optimize(profile, { horizon: 2 }).cheapest);

  it('covers the month, upcoming visits and the max', () => {
    expect(o.month).toBe('2026-10');
    expect(o.upcoming.length).toBeGreaterThan(0);
    expect(o.annualMax).toBe(profile.currentPlan.annualMax);
    expect(o.monthsLeft).toBe(3);
  });

  it('flags room left late in the year', () => {
    const light = {
      ...profile,
      procedures: [],
      ledger: { ...profile.ledger, maxUsed: 100 },
    };
    const l = monthlyOverview(light, optimize(light, { horizon: 2 }).cheapest);
    expect(l.onTrack.status).toBe('room to use');
  });

  it('mentions only engine amounts in its messages', () => {
    const known = new Set(o.amounts.map((n) => Math.round(n * 100)));
    for (const s of [o.onTrack.message, ...o.suggestions]) for (const n of dollarsIn(s)) expect(known.has(Math.round(n * 100))).toBe(true);
  });
});
