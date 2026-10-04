import { describe, expect, it } from 'vitest';
import type { CallModel } from './model';
import { fromWinnow, normalize, simulatedWinnow, triageDocument, triageRule } from './winnow';

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

describe('fromWinnow (live server response shapes)', () => {
  it('reads noul as p(true)', () => expect(fromWinnow({ type: 'noul', noul: 0.8 }, { type: 'noul', instructions: 'x' })).toEqual({ yes: 0.8, no: 0.2 }));
  it('reads a choice probability map', () =>
    expect(fromWinnow({ type: 'choice', selected: 'a', probabilities: { a: 0.9, b: 0.1 } }, { type: 'choice', instructions: 'x', criteria: { a: 'A', b: 'B' } })).toEqual({
      a: 0.9,
      b: 0.1,
    }));
  it('maps score indices to labels', () =>
    expect(fromWinnow({ type: 'score', probabilities: { '0': 0.2, '1': 0.8 } }, { type: 'score', instructions: 'x', scale: ['low', 'high'] })).toEqual({
      low: 0.2,
      high: 0.8,
    }));
});
