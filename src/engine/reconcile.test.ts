import { describe, expect, it } from 'vitest';
import { claimsFromLedger, decideMatch, heuristicMatch, overbilling, parseInvoice } from './reconcile';

const INVOICE = `Greensboro Family Dental
Statement / Invoice
Patient: Dale Moore
Date of service: 10/03/2026
D3330  Root canal - molar  #19   $1,180.00
Insurance paid                    -$880.00
Amount due                         $412.00`;

describe('parseInvoice', () => {
  it('reads the amount due, date and codes', () =>
    expect(parseInvoice(INVOICE)).toEqual({
      provider: 'Greensboro Family Dental',
      serviceDate: '2026-10-03',
      amountDue: 412,
      codes: ['D3330'],
      lines: [{ text: 'D3330  Root canal - molar  #19   $1,180.00', amount: 1180 }],
    }));
});

describe('matching and the overbilling check', () => {
  const claims = claimsFromLedger([
    { date: '2026-10-03', cdt: 'D3330', tooth: 19, planPaid: 800, memberOwes: 200, inNetwork: true, source: 'claim', claimId: 'CLM-A' },
    { date: '2026-04-10', cdt: 'D1110', planPaid: 85, memberOwes: 0, inNetwork: true, source: 'claim', claimId: 'CLM-B' },
  ]);
  const inv = parseInvoice(INVOICE);
  it('links the invoice to the same visit', () => expect(decideMatch(heuristicMatch(inv, claims))).toMatchObject({ kind: 'linked', claimId: 'CLM-A' }));
  it('flags an in-network bill above the EOB amount, with the spec wording', () => {
    const flag = overbilling(inv, claims[0]);
    expect(flag?.over).toBe(212);
    expect(flag?.message).toBe(
      "Your bill asks for $412, but Lincoln's EOB says you owe $200. In-network dentists agree to accept Lincoln's allowed fee. Ask the office for a corrected bill.",
    );
  });
  it('leaves out charges the plan never covers', () => {
    expect(overbilling({ ...inv, amountDue: 250 }, claims[0], 50)).toBeUndefined();
    expect(overbilling(inv, claims[0], 50)?.over).toBe(162);
  });
  it('does not flag out-of-network bills or bills at the EOB amount', () => {
    expect(overbilling({ ...inv, amountDue: 200 }, claims[0])).toBeUndefined();
    expect(overbilling(inv, { ...claims[0], inNetwork: false })).toBeUndefined();
  });
  it('leaves an invoice with no close claim unlinked', () =>
    expect(decideMatch(heuristicMatch({ ...inv, serviceDate: '2026-01-02', codes: ['D7240'] }, claims)).kind).toBe('unlinked'));
});
