import { describe, expect, it } from 'vitest';
import { HEDGED, likelihoodFromNote, lineDecision, needsReview, needsRewrite, route, shouldPush } from './decisions';

describe('Winnow decision rules', () => {
  it('second reader: under 0.7 goes to review', () => {
    expect(needsReview(0.69)).toBe(true);
    expect(needsReview(0.95)).toBe(false);
  });
  it('line items: confident category counts, unsure ones are asked', () => {
    expect(lineDecision({ covered: 0.9, other: 0.1 })).toEqual({ category: 'covered', p: 0.9, ask: false });
    expect(lineDecision({ covered: 0.5, missed_appointment: 0.4, other: 0.1 }).ask).toBe(true);
  });
  it("dentist's wording sets the slider start", () => {
    expect(likelihoodFromNote({ 'unlikely this year': 1 })).toBe(0.15);
    expect(likelihoodFromNote({ likely: 1 })).toBe(0.8);
    expect(likelihoodFromNote({ possible: 0.5, likely: 0.5 })).toBe(0.65);
    expect(HEDGED.test('watch #3')).toBe(true);
    expect(HEDGED.test('crown on #30')).toBe(false);
  });
  it('notifications: push only act-this-week at 0.6+, two a week', () => {
    expect(shouldPush({ 'act this week': 0.7 }, 0)).toBe(true);
    expect(shouldPush({ 'act this week': 0.7 }, 2)).toBe(false);
    expect(shouldPush({ 'act this week': 0.5 }, 0)).toBe(false);
  });
  it('router: medical advice at 0.3 is redirected; engine questions stay with the engine', () => {
    expect(route({ medical_advice: 0.3, plan_lookup: 0.7 }).intent).toBe('medical_advice');
    expect(route({ engine_question: 0.8, medical_advice: 0.1 })).toEqual({ intent: 'engine_question', p: 0.8, viaModel: false });
    expect(route({ explanation: 0.9 }).viaModel).toBe(true);
  });
  it('plain-language gate rewrites when the expected score is above 1', () => {
    expect(needsRewrite({ plain: 0.1, 'some jargon': 0.3, confusing: 0.6 })).toBe(true);
    expect(needsRewrite({ plain: 0.8, 'some jargon': 0.2 })).toBe(false);
  });
});
