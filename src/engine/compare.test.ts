import { describe, expect, it } from 'vitest';
import { ACME_HIGH, ACME_LOW, DEMO_PLAN_OPTIONS, DEMO_PROFILE, WAIVE } from '../data/demo';
import { compare, priceOption, recommendFsa, tippingPoint } from './compare';
import { dollarsIn, explainLine, verifyNumbers } from './explain';
import { evaluateSchedule } from './schedule';

describe('plan comparison (F4)', () => {
  const c = compare(DEMO_PROFILE, DEMO_PLAN_OPTIONS);

  it('recommends the lowest expected total and shows the bad year beside it', () => {
    const totals = c.options.map((o) => o.total);
    expect(c.best.total).toBe(Math.min(...totals));
    expect(c.best.plan.id).toBe('acme-high');
    for (const o of c.options) expect(o.badYearTotal).toBeGreaterThanOrEqual(o.total);
  });

  it('total = care cost + premiums after the pre-tax saving', () => {
    const high = c.options.find((o) => o.plan.id === 'acme-high');
    expect(high?.premiumsAnnual).toBe(576);
    expect(high?.premiumCost).toBe(403.2); // 576 × (1 − 30%)
    expect(high?.total).toBe(Math.round(((high?.careCost ?? 0) + 403.2) * 100) / 100);
  });

  it('waiving pays the full fee: no network discount, no plan', () => {
    const waive = priceOption(DEMO_PROFILE, WAIVE);
    const nextYear = waive.schedule.lines.filter((l) => l.year === 2027);
    expect(nextYear.length).toBeGreaterThan(0);
    for (const l of nextYear) expect(l.memberOwes).toBe(l.billed);
  });

  it('finds the "maybe" tipping point: High wins above it, Low below', () => {
    const t = tippingPoint(DEMO_PROFILE, [ACME_LOW, ACME_HIGH], 'rc3');
    expect(t).toBeDefined();
    expect(t?.below).toBe('acme-low');
    expect(t?.above).toBe('acme-high');
    const at = (p: number) => {
      const profile = { ...DEMO_PROFILE, procedures: DEMO_PROFILE.procedures.map((q) => (q.id === 'rc3' ? { ...q, likelihood: p } : q)) };
      const [low, high] = [priceOption(profile, ACME_LOW), priceOption(profile, ACME_HIGH)];
      return high.total - low.total;
    };
    const p = t?.likelihood ?? 0;
    expect(at(p - 0.03)).toBeGreaterThan(0);
    expect(at(p + 0.03)).toBeLessThan(0);
    expect(t?.text).toMatch(/^Above a \d+% chance of the root canal on #3, Acme Dental High pays for itself\.$/);
  });

  it('flags a past year that hit the max', () => {
    expect(c.insights.find((i) => i.id === 'hitMax')?.text).toContain('2025');
  });
});

describe('FSA amount', () => {
  it('covers expected next-year care minus the carryover, rounded up to $10, capped at the IRS limit', () => {
    const high = priceOption(DEMO_PROFILE, ACME_HIGH);
    const fsa = recommendFsa(DEMO_PROFILE, high);
    const [thisYear, nextYear] = high.schedule.years;
    expect(fsa.carryoverIn).toBe(Math.min(680, DEMO_PROFILE.money.fsaBalance - thisYear.owes));
    expect(fsa.election).toBe(Math.ceil((nextYear.owes - fsa.carryoverIn) / 10) * 10);
    const huge = recommendFsa({ ...DEMO_PROFILE, money: { ...DEMO_PROFILE.money, fsaBalance: 0 } }, {
      ...high,
      schedule: { ...high.schedule, years: [thisYear, { ...nextYear, owes: 9000 }] },
    });
    expect(huge.election).toBe(3400);
  });
});

describe('Enrollment Card', () => {
  const { card } = compare(DEMO_PROFILE, DEMO_PLAN_OPTIONS);
  it('sums up plan, FSA, dates and savings with the disclaimer', () => {
    expect(card.summary).toContain('choose Acme Dental High');
    expect(card.summary).toContain(`elect $${card.fsa.election.toLocaleString('en-US')} FSA`);
    expect(card.summary).toMatch(/before Dec 31 \(2026 FSA\)/);
    expect(card.summary).toMatch(/Jan 4 \(2027 FSA\)/);
    expect(card.expectedSavings).toBeGreaterThan(0);
    expect(card.disclaimer).toBe('Educational estimate — not insurance or tax advice.');
    expect(card.items.find((i) => i.id === 'cr19')?.prepDated).toBe(true);
  });
});

describe('explanations', () => {
  const ev = evaluateSchedule({ ...DEMO_PROFILE, ledger: { ...DEMO_PROFILE.ledger, maxUsed: 1300 } }, [{ id: 'cr30', date: '2026-10-20' }]);
  const line = ev.lines[0];

  it('one sentence per waterfall step, each citing its section, every dollar from the engine', () => {
    const steps = explainLine(line);
    expect(steps.map((s) => s.key)).toEqual(line.waterfall.map((s) => s.key));
    expect(steps.find((s) => s.key === 'maxCap')?.text).toBe(
      'Only $200 of your 2026 annual max is left, so the plan pays $200 instead of $600 and you pay the other $400.',
    );
    expect(steps.find((s) => s.key === 'maxCap')?.section).toBe('Plan Maximums, §4');
    for (const s of steps) expect(verifyNumbers(s.text, line)).toEqual({ ok: true, unknown: [] });
  });

  it('rejects a sentence with a dollar figure the engine never produced', () => {
    expect(dollarsIn('You pay $1,180.50 and $7')).toEqual([1180.5, 7]);
    expect(verifyNumbers('The plan pays $999 for this crown.', line)).toEqual({ ok: false, unknown: [999] });
  });
});
