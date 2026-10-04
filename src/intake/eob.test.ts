import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyDocument } from './classify';
import { parseEob } from './eob';

// What tesseract returned for public/samples/eob-wisdom-tooth.png.
const OCR = `Acme Dental - Explanation of Benefits

This is not a bill

Patient: Jordan Rivera

Member ID: ACM-4471920

Date of birth: 04/17/1989

Address: 128 Maple Street, Greensboro NC 27401

Claim number: C-2026-03-0412

Date of service: 03/11/2026

Provider: Greensboro Family Dental (in network)

Tooth Code Description Billed Allowed Deductible Plan paid You owe
#17 D7240 Wisdom tooth removal $557.00 $369.00 $50.00 $255.20 $113.80
Total $557.00 $369.00 $50.00 $255.20 $113.80
Demo document - not a real patient record.`;

const WISDOM = { cdt: 'D7240', tooth: 17, billed: 557, allowed: 369, deductible: 50, planPaid: 255.2, memberOwes: 113.8 };

describe('EOB reader', () => {
  it('reads the OCR of the sample EOB image', () => {
    const eob = parseEob(OCR);
    expect(eob.lines).toEqual([WISDOM]);
    expect(eob.claimNumber).toBe('C-2026-03-0412');
    expect(eob.serviceDate).toBe('2026-03-11');
    expect(eob.provider).toBe('Greensboro Family Dental');
    expect(eob.inNetwork).toBe(true);
  });

  it('reads the sample text file the image was made from', () => {
    expect(parseEob(readFileSync('public/samples/eob-wisdom-tooth.txt', 'utf8')).lines).toEqual([WISDOM]);
  });

  it('is classified as an EOB, not a treatment plan, even though it lists a code and amounts', () => {
    const doc = classifyDocument(OCR, true);
    expect(doc.kind).toBe('eob');
    expect(doc.items).toEqual([]);
    expect(doc.eob?.lines).toHaveLength(1);
  });

  it('reads labelled amounts in an emailed EOB (no deductible column)', () => {
    const eob = parseEob(
      'Acme Dental . Explanation of Benefits. This is not a bill.\nClaim number: C-2026-10-0587. Date of service: 10/01/2026. Provider: College Hill Dental.\nD1110 Prophylaxis adult . Billed $125.00 Allowed $90.00 Plan paid $90.00 You owe $0.00\nD0274 Bitewings, four films . Billed $85.00 Allowed $64.00 Plan paid $64.00 You owe $0.00',
    );
    expect(eob.lines.map((l) => [l.cdt, l.billed, l.allowed, l.planPaid, l.memberOwes])).toEqual([
      ['D1110', 125, 90, 90, 0],
      ['D0274', 85, 64, 64, 0],
    ]);
    expect(eob.serviceDate).toBe('2026-10-01');
    expect(eob.provider).toBe('College Hill Dental');
  });

  it('keeps a dentist treatment plan a treatment plan and a bill a bill', () => {
    expect(classifyDocument(readFileSync('public/samples/treatment-plan.txt', 'utf8'), true).kind).toBe('treatment_plan');
    expect(classifyDocument(readFileSync('public/samples/invoice.txt', 'utf8'), true).kind).toBe('invoice');
  });

  it('survives OCR look-alike digits in the code and tooth', () => {
    const eob = parseEob('Explanation of Benefits\nDate of service: 3/1/2026\n#l7 D724O Wisdom $557.00 $369.00 $50.00 $255.20 $113.80');
    expect(eob.lines.map((l) => [l.cdt, l.tooth])).toEqual([['D7240', 17]]);
    expect(eob.serviceDate).toBe('2026-03-01');
  });
});
