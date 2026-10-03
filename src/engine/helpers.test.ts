import { describe, expect, it } from 'vitest';
import { DEMO_PROFILE } from '../data/demo';
import { PERSONAS } from '../data/personas';
import { leftOnTable, maxGauges, priceDentists } from './helpers';
import { evaluateSchedule, optimize } from './schedule';

describe('engine view helpers', () => {
  const plan = optimize(DEMO_PROFILE, { horizon: 2 }).cheapest;

  it('splits the max into claims, scheduled work and what is left', () => {
    const [now, next] = maxGauges(DEMO_PROFILE, plan);
    expect(now).toMatchObject({ year: 2026, annualMax: 1500, used: 300 });
    expect(now.used + now.scheduled + now.remaining).toBeCloseTo(1500, 2);
    expect(next.year).toBe(2027);
  });

  it('counts unused cleanings and FSA money the schedule leaves behind', () => {
    const empty = { ...DEMO_PROFILE, procedures: [] };
    const left = leftOnTable(empty, evaluateSchedule(empty, [], { horizon: 2 }));
    // One cleaning used in April of a 2-per-year limit; $400 balance, $680 carryover keeps all of it.
    expect(left).toMatchObject({ unusedCleanings: 1, fsaExpiring: 0, maxRemaining: 1200, fsaDeadline: '2026-12-31' });
    const noCarry = { ...empty, money: { ...empty.money, fsaRule: { kind: 'none' as const } } };
    expect(leftOnTable(noCarry, evaluateSchedule(noCarry, [], { horizon: 2 })).fsaExpiring).toBe(400);
  });

  it('prices dentists: out of network adds the balance bill, cheaper fees cost less', () => {
    const profile = PERSONAS.jordan.profile('2026-10-05');
    const ev = optimize(profile, { horizon: 2 }).cheapest;
    const [a, b] = priceDentists(profile, ev.placements, [
      { id: 'a', inNetwork: true, feeMultiplier: 1 },
      { id: 'b', inNetwork: false, feeMultiplier: 0.9 },
    ]);
    expect(a.outOfNetworkExtra).toBeGreaterThan(0);
    expect(b.yourCost).toBe(b.outOfNetworkCost);
    expect(b.inNetworkCost).toBeLessThan(a.inNetworkCost);
    expect(Math.min(a.vsCheapest, b.vsCheapest)).toBe(0);
  });
});
