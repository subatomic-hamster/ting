import { describe, expect, it } from 'vitest';
import { compare } from '../engine/compare';
import { dentalProfile } from '../engine/risk';
import { optimize } from '../engine/schedule';
import type { Lifestyle } from '../engine/types';
import { DEMO_PLAN_OPTIONS } from './demo';
import { memberFor, memberIdFor, profileFromSurvey, registerMember, type MemberRecord } from './members';

const ASOF = '2026-10-04';
const base: MemberRecord = {
  memberId: 'U-0123456789',
  name: 'Sam',
  email: 'sam@example.com',
  employer: 'Acme Manufacturing',
  createdAt: ASOF,
  currentDentistId: 'd01',
  planId: 'acme-low',
  survey: { lastCleaning: 'recent', covered: 'self', lastYear: 'some', goals: [], surveyCompleted: true },
};
const risky: Lifestyle = { brushing: 'once', flossing: 'rarely', sugaryDrinks: 'several', tobacco: true, grinding: 'yes', bleedingGums: true, dryMouth: false };

describe('signed-up members', () => {
  it('derives a stable member id from an account id', () => {
    expect(memberIdFor('3f9a1c2e-77b0-4d1e-9c3a-0e5b6f7a8b9c')).toBe('U-3F9A1C2E77');
  });

  it('a low-risk survey is a Light year with routine preventive care only', () => {
    const p = profileFromSurvey(base, ASOF);
    expect(dentalProfile(base.survey).year).toBe('Light');
    expect(p.procedures.map((x) => x.cdt)).toEqual(['D1110', 'D0120', 'D0274']);
    expect(p.procedures.every((x) => x.likelihood === undefined && !x.deadline)).toBe(true);
    expect(p.ledger.history).toHaveLength(2);
    expect(p.money.premiumDiscount).toBeUndefined();
    expect(() => optimize(p, { horizon: 2 })).not.toThrow();
  });

  it('lifestyle answers raise risk, add "maybe" work with reasons, and earn the wellness discount', () => {
    const r = dentalProfile({ ...base.survey, lifestyle: risky });
    expect(r.caries).toBe('high');
    expect(r.gums).toBe('high');
    expect(r.recallMonths).toBe(3);
    expect(r.predicted.find((x) => x.cdt === 'D4341')?.because).toContain('tobacco use');
    const p = profileFromSurvey({ ...base, survey: { ...base.survey, lifestyle: risky } }, ASOF);
    expect(p.procedures.find((x) => x.cdt === 'D2391')?.likelihood).toBe(0.5);
    expect(p.money.premiumDiscount).toMatchObject({ pct: 0.1, until: '2027-10-04' });
    const c = compare(p, DEMO_PLAN_OPTIONS);
    const low = c.options.find((o) => o.plan.id === 'acme-low');
    // 9 discounted months of next year (Jan–Sep) at 10% of $24.
    expect(low?.premiumDiscount).toBeCloseTo(21.6, 2);
    expect(low?.premiumsAnnual).toBeCloseTo(24 * 12 - 21.6, 2);
  });

  it('good brushing data lowers cavity risk one step; two weeks are needed first', () => {
    const lifestyle: Lifestyle = { ...risky, sugaryDrinks: 'daily', flossing: 'daily', tobacco: false, bleedingGums: false, brushing: 'once' };
    expect(dentalProfile({ lifestyle }).caries).toBe('moderate');
    expect(dentalProfile({ lifestyle }, { twiceDailyRate: 0.9, days: 30 }).caries).toBe('low');
    expect(dentalProfile({ lifestyle }, { twiceDailyRate: 0.9, days: 7 }).caries).toBe('moderate');
  });

  it('a braces goal and a maxed-out year steer the recommendation to the richer plan', () => {
    const p = profileFromSurvey({ ...base, survey: { ...base.survey, goals: ['braces'], lastYear: 'hitMax' } }, ASOF);
    const c = compare(p, DEMO_PLAN_OPTIONS);
    expect(c.best.plan.id).toBe('acme-high');
    expect(c.insights.map((i) => i.id)).toContain('hitMax');
  });

  it('an underused plan two years running suggests the cheaper option', () => {
    const p = profileFromSurvey({ ...base, planId: 'acme-high', survey: { ...base.survey, lastYear: 'underused' } }, ASOF);
    expect(compare(p, DEMO_PLAN_OPTIONS).insights.map((i) => i.id)).toContain('lowUse');
  });

  it('registered members resolve by id; personas still resolve; unknown keys fall back', () => {
    registerMember(base);
    expect(memberFor('U-0123456789').name).toBe('Sam');
    expect(memberFor('priya').name).toBe('Priya');
    expect(memberFor('U-FFFFFFFFFF').name).toBe('Dale');
  });
});
