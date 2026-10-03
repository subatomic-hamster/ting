import { describe, expect, it } from 'vitest';
import type { EngineInput } from '../contracts';
import { buildEngineInput, PERSONAS } from '../fixtures/personas';
import { runEngine } from './index';

const AS_OF = '2026-10-03';

function dale(overrides: EngineInput['overrides'] = [], network: EngineInput['network'] = 'in'): EngineInput {
  return { ...buildEngineInput(PERSONAS.dale, AS_OF), overrides, network };
}

const total = (input: EngineInput) => runEngine(input).activeSchedule.memberTotal;

describe('placeholder engine', () => {
  it.each(['in', 'out'] as const)('youPay equals the sum of the steps (%s-network)', (network) => {
    for (const persona of Object.values(PERSONAS)) {
      const result = runEngine({ ...buildEngineInput(persona, AS_OF), network });
      for (const steps of Object.values(result.waterfalls)) {
        const youPay = steps[steps.length - 1];
        expect(youPay.key).toBe('youPay');
        const sum = steps.slice(0, -1).reduce((a, s) => a + s.amount, 0);
        expect(youPay.amount).toBeCloseTo(sum, 2);
        expect(youPay.runningTotal).toBeCloseTo(sum, 2);
      }
    }
  });

  it('moving a non-locked item across Dec 31 changes memberTotal', () => {
    const before = total(dale([{ procedureId: 'p-cr30', date: '2026-12-15' }]));
    const after = total(dale([{ procedureId: 'p-cr30', date: '2027-01-06' }]));
    expect(after).not.toBe(before);
    expect(after).toBeLessThan(before); // the annual max resets in January
  });

  it('locked items ignore overrides', () => {
    const base = runEngine(dale());
    const moved = runEngine(dale([{ procedureId: 'p-rc19', date: '2027-03-01' }]));
    const date = (r: typeof base) => r.activeSchedule.items.find((i) => i.procedureId === 'p-rc19')?.date;
    expect(date(moved)).toBe(date(base));
    expect(moved.activeSchedule.memberTotal).toBe(base.activeSchedule.memberTotal);
  });

  it('the cheapest schedule is never more expensive than doing everything now', () => {
    const r = runEngine(dale());
    const cheapest = r.schedules.find((s) => s.kind === 'cheapest')!;
    const fastest = r.schedules.find((s) => s.kind === 'fastest')!;
    expect(cheapest.memberTotal).toBeLessThanOrEqual(fastest.memberTotal);
    expect(cheapest.savingsVsAllNow).toBeGreaterThan(0);
  });

  it('the network toggle changes what you pay', () => {
    expect(total(dale([], 'out'))).not.toBe(total(dale([], 'in')));
  });
});
