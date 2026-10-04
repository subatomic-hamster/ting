import { describe, expect, it } from 'vitest';
import { PERSONAS } from '../../../src/data/personas';
import { DEMO_FEES } from '../../../src/engine/cdt';
import { evaluateSchedule } from '../../../src/engine/schedule';
import { makeItem } from '../../../src/intake/describe';
import { toProcedures } from '../../../src/intake/questions';
import { dentistInNetwork, priceEmailed } from './emailPricing';

const ASOF = '2026-10-04';
const profile = PERSONAS.dale.profile(ASOF);
const owes = (proc: ReturnType<typeof toProcedures>[number]) => evaluateSchedule({ ...profile, procedures: [proc] }, [{ id: proc.id, date: ASOF }]).lines[0];
const item = (id: string, fee?: number) => makeItem({ id, source: 'upload', phrase: 'root canal', candidates: [{ cdt: 'D3330', p: 1 }], teeth: [{ tooth: 14, p: 1 }], fee });

describe('work learned from an emailed document', () => {
  const quoted = toProcedures([item('email-quoted', DEMO_FEES.D3330.billed)], profile)[0];
  const catalog = toProcedures([item('catalog')], profile)[0];

  it('without the fix the quote is charged in full (the bug)', () => {
    expect(quoted.allowancePending).toBe(true);
    // No allowance was applied, so the member would pay more than for the same code at the same dentist.
    expect(owes(quoted).memberOwes).toBeGreaterThan(owes(catalog).memberOwes);
  });

  it('is priced at the in-network allowance like the same code from the catalog', () => {
    const priced = priceEmailed(quoted, profile, true);
    expect(priced).toMatchObject({ inNetwork: true, allowedFee: DEMO_FEES.D3330.inNetwork, fee: DEMO_FEES.D3330.billed });
    expect(priced.allowancePending).toBeUndefined();
    expect(priced.feeSource?.kind).toBe('quote');
    expect(priced.allowedFeeSource).toEqual(DEMO_FEES.D3330.source);
    const line = owes(priced);
    expect(line.allowed).toBe(DEMO_FEES.D3330.inNetwork);
    expect(line.memberOwes).toBe(owes(catalog).memberOwes);
    expect(line.memberOwes).toBeLessThan(DEMO_FEES.D3330.billed);
  });

  it('an out-of-network dentist leaves the allowance unconfirmed', () => {
    const priced = priceEmailed(quoted, profile, false);
    expect(priced).toMatchObject({ inNetwork: false, allowancePending: true });
    expect(priced.allowedFee).toBeUndefined();
  });

  it('work with no quote is left as it was', () => expect(priceEmailed(catalog, profile, true)).toBe(catalog));

  it('knows which demo dentists are in network', () => {
    expect(dentistInNetwork('d01')).toBe(true);
    expect(dentistInNetwork('d02')).toBe(false);
  });
});
