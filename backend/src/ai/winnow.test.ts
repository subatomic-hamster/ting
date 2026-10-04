import { describe, expect, it } from 'vitest';
import type { CallModel } from './model';
import { normalize, simulatedWinnow, triageDocument, triageRule } from './winnow';

describe('normalize', () => {
  const choice = { type: 'choice' as const, instructions: 'x', criteria: { a: 'A', b: 'B' } };
  it('drops unknown answers and renormalizes', () => expect(normalize({ a: 3, b: 1, c: 5 }, choice)).toEqual({ a: 0.75, b: 0.25 }));
  it('returns null when nothing usable came back', () => expect(normalize({ c: 1 }, choice)).toBeNull());
});

describe('triageRule (spec thresholds)', () => {
  it('routes a confident document type and passes clean text', () => {
    const t = triageRule({ doc_type: { treatment_plan: 0.93, other: 0.07 }, ai_instructions: { yes: 0.02, no: 0.98 } }, 'simulated');
    expect(t).toMatchObject({ docType: 'treatment_plan', quarantined: false, source: 'simulated' });
  });
  it('is unsure below 0.8 and quarantines at an injection probability of 0.5', () => {
    const t = triageRule({ doc_type: { invoice: 0.6, eob: 0.4 }, ai_instructions: { yes: 0.5, no: 0.5 } }, 'winnow');
    expect(t).toMatchObject({ docType: 'unsure', quarantined: true });
  });
});

describe('simulatedWinnow', () => {
  it('turns the model output into per-question distributions', async () => {
    const call: CallModel = async () => ({ doc_type: { plan_summary: 9, other: 1 }, ai_instructions: { yes: 0, no: 1 } });
    const t = await triageDocument('Annual maximum: $1,500', simulatedWinnow(call));
    expect(t).toMatchObject({ docType: 'plan_summary', docTypeP: 0.9, injectionP: 0, quarantined: false });
  });
});
