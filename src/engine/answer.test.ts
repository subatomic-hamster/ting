import { describe, expect, it } from 'vitest';
import { ACME_LOW } from '../data/demo';
import { PERSONAS } from '../data/personas';
import { costAnswer, localIntent, planAnswer } from './answer';
import { optimize } from './schedule';

describe('typed-question answers from tested code', () => {
  it('plan lookups come from the rules', () => {
    expect(planAnswer("what's my deductible?", ACME_LOW)).toContain('$50');
    expect(planAnswer('what is the annual max', ACME_LOW)).toContain('$1,500');
  });
  it('cost questions come from the engine schedule', () => {
    const profile = PERSONAS.dale.profile('2026-10-03');
    const cheapest = optimize(profile, { horizon: 2 }).cheapest;
    const a = costAnswer('how much is my crown?', cheapest);
    expect(a).toMatch(/Crown .* you pay \$/);
  });
  it('the in-browser router sends symptoms to the dentist', () => {
    expect(localIntent('my tooth hurts, do I need a root canal?')).toBe('medical_advice');
    expect(localIntent('what is my deductible')).toBe('plan_lookup');
  });
});
