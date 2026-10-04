import { describe, expect, it } from 'vitest';
import { DEMO_FEES } from './cdt';
import { PERSONAS } from '../data/personas';
import { planNewWork } from './agentPlan';

describe('planNewWork', () => {
  const base = PERSONAS.jordan.profile('2026-10-03');
  const profile = {
    ...base,
    procedures: [
      ...base.procedures,
      {
        id: 'email-d2740-14',
        cdt: 'D2740',
        tooth: 14,
        fee: DEMO_FEES.D2740.billed,
        allowedFee: DEMO_FEES.D2740.inNetwork,
        inNetwork: true,
        deadline: '2027-03-31',
      },
    ],
  };
  const plan = planNewWork(profile, ['email-d2740-14'], 'd06');

  it('schedules the new work before its deadline', () => {
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].date <= '2027-03-31').toBe(true);
  });
  it('suggests an in-network dentist and spreads the cost by month', () => {
    expect(plan.dentist?.inNetwork).toBe(true);
    expect(plan.monthly.reduce((s, m) => s + m.memberOwes, 0)).toBeCloseTo(plan.totalOwed, 1);
  });
});
