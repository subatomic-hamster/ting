import { describe, expect, it } from 'vitest';
import { DEMO_PROFILE } from '../data/demo';
import { parseDescription } from './describe';
import { ASK_THRESHOLD, intakeQuestions, toProcedures } from './questions';

describe('toProcedures', () => {
  it('prices the top answer from the fee table, in network, with stable ids', () => {
    const items = parseDescription('crown on tooth 19 and a deep cleaning');
    const procs = toProcedures(items, DEMO_PROFILE);
    expect(procs).toEqual([
      { id: items[0].id, cdt: 'D2740', tooth: 19, fee: 1450, allowedFee: 1200, inNetwork: true },
      { id: items[1].id, cdt: 'D4341', tooth: undefined, fee: 300, allowedFee: 210, inNetwork: true },
    ]);
    expect(toProcedures(parseDescription('crown on tooth 19 and a deep cleaning'), DEMO_PROFILE).map((p) => p.id)).toEqual(procs.map((p) => p.id));
  });

  it('uses the fee the document states', () => {
    const [item] = parseDescription('crown on tooth 19');
    expect(toProcedures([{ ...item, fee: 1300 }], DEMO_PROFILE)[0]).toMatchObject({ fee: 1300, allowedFee: 1200 });
  });
});

describe('intakeQuestions', () => {
  it('asks whether the crown replaces an old one: the frequency limit changes the bill by $600', () => {
    const items = parseDescription("crown on a back tooth, I think it's replacing the old one");
    const qs = intakeQuestions(items, DEMO_PROFILE);
    expect(qs.map((q) => q.field)).toEqual(['replacement']);
    const [q] = qs;
    expect(q.itemId).toBe(items[0].id);
    expect(q.preselected).toBe('yes');
    expect(q.options.map((o) => [o.value, o.p, o.owes])).toEqual([
      ['yes', 0.65, 1200], // frequency limit: denied, owes the whole allowed fee
      ['no', 0.35, 600], // 50% of $1,200
    ]);
    expect(q.expectedCostOfGuessing).toBe(210); // 0.35 x $600
    expect(q.why).toBe("If it doesn't replace an existing crown instead you'd pay $600 less.");
    expect(q.expectedCostOfGuessing).toBeGreaterThan(ASK_THRESHOLD);
  });

  it('does not ask which of #19 / #30 or which crown material when the bill is the same', () => {
    const items = parseDescription('Crown on a lower back molar and a deep cleaning');
    expect(items[0].teeth.map((t) => t.tooth)).toEqual([19, 30]);
    expect(intakeQuestions(items, DEMO_PROFILE)).toEqual([]);
  });

  it('asks which tooth when the teeth bill differently', () => {
    // Tooth #30 already has a crown on file from 2 years ago, #19 does not.
    const profile = {
      ...DEMO_PROFILE,
      ledger: { ...DEMO_PROFILE.ledger, history: [...DEMO_PROFILE.ledger.history, { date: '2024-10-01', cdt: 'D2740', tooth: 30, planPaid: 600, source: 'claim' as const }] },
    };
    const [q] = intakeQuestions(parseDescription('crown on a lower back molar'), profile);
    expect(q.field).toBe('tooth');
    expect(q.options.map((o) => [o.value, o.owes])).toEqual([['19', 600], ['30', 1200]]);
    expect(q.expectedCostOfGuessing).toBe(300);
    expect(q.why).toBe("If it's tooth #30 instead you'd pay $600 more.");
  });

  it('accepts an inferred code when the alternatives cost little in expectation', () => {
    // Root canal, no tooth words: molar owes $200, premolar $170, front $150 (80% after deductible).
    // Expected cost of guessing is about $15, under the $25 threshold.
    expect(intakeQuestions(parseDescription('root canal'), DEMO_PROFILE).filter((q) => q.field === 'cdt')).toEqual([]);
  });
});
