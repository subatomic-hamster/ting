import { describe, expect, it } from 'vitest';
import { parseTreatmentPlanText } from './treatmentPlan';

const row = (item: { candidates: { cdt: string }[]; teeth: { tooth: number }[]; fee?: number }) => [
  item.candidates[0].cdt,
  item.teeth[0]?.tooth,
  item.fee,
];

describe('parseTreatmentPlanText', () => {
  it('reads a printed row: tooth, code, description, fee', () => {
    const { items, unrecognized } = parseTreatmentPlanText('#19 D3330 Root canal - molar $1,180.00');
    expect(unrecognized).toEqual([]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ source: 'photo', fee: 1180 });
    expect(items[0].candidates).toEqual([{ cdt: 'D3330', p: 0.97 }]);
    expect(items[0].teeth).toEqual([{ tooth: 19, p: 0.98 }]);
    expect(items[0].confidence).toBeCloseTo(0.97 * 0.98, 4);
  });

  it('reads table columns, with or without $ and commas', () => {
    const { items } = parseTreatmentPlanText(
      ['Tooth  Code  Description  Fee', '19   D2950  Core buildup   330.00', '30 | D2740 | Crown porcelain | 1450', '    D1110    Cleaning    120.00'].join('\n'),
    );
    expect(items.map(row)).toEqual([
      ['D2950', 19, 330],
      ['D2740', 30, 1450],
      ['D1110', undefined, 120],
    ]);
    expect(items[2].confidence).toBe(0.97); // cleaning needs no tooth
  });

  it('tolerates OCR noise: O for 0 in codes, fees and tooth numbers', () => {
    const { items, unrecognized } = parseTreatmentPlanText(['#3O D2740 Crown $1,45O.OO', '#19 D333O Root canal $1,18O', '#14 D275O Crown PFM 1,35O.00'].join('\n'));
    expect(unrecognized).toEqual([]);
    expect(items.map(row)).toEqual([
      ['D2740', 30, 1450],
      ['D3330', 19, 1180],
      ['D2750', 14, 1350],
    ]);
  });

  it('returns rows whose code is not in the catalog, without making items of them', () => {
    const { items, unrecognized } = parseTreatmentPlanText('#19 D9999 Mystery $50.00\n#30 D2740 Crown $1,450.00');
    expect(items.map((i) => i.candidates[0].cdt)).toEqual(['D2740']);
    expect(unrecognized).toEqual(['#19 D9999 Mystery $50.00']);
  });

  it('falls back to the description parser for rows without a code, and ignores headers and totals', () => {
    const { items, unrecognized } = parseTreatmentPlanText(
      ['Treatment Plan for Pat Smith', '#19 Root canal - molar $1,180.00', '30  Crown, porcelain  $1,450.00', 'Total estimate $2,630.00'].join('\n'),
    );
    expect(unrecognized).toEqual([]);
    expect(items.map(row)).toEqual([
      ['D3330', 19, 1180],
      ['D2740', 30, 1450],
    ]);
    expect(new Set(items.map((i) => i.id)).size).toBe(2);
  });

  it('does not take words that look like codes', () => {
    expect(parseTreatmentPlanText('Dollop of Dental care').items).toEqual([]);
  });
});
