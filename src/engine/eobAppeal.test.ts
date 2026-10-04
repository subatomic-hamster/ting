import { describe, expect, it } from 'vitest';
import { ACME_LOW } from '../data/demo';
import { appealAmounts, appealDraft } from './eobAppeal';
import { dollarsIn } from './explain';

const d = { claimId: 'CLM-1', cdt: 'D3330', tooth: 19, serviceDate: '2026-10-03', estimated: 200, actual: 290 };

describe('appealDraft', () => {
  const text = appealDraft(d, ACME_LOW);
  it('names the claim, the date and the plan section', () => {
    expect(text).toContain('CLM-1');
    expect(text).toContain('October 3, 2026');
    expect(text).toContain(ACME_LOW.name);
  });
  it('mentions only the EOB amount, the estimate and their difference', () => {
    expect(new Set(dollarsIn(text))).toEqual(new Set(appealAmounts(d)));
    expect(text).toContain('$90 more');
  });
});
