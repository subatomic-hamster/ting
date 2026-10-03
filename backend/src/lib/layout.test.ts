import { describe, expect, it } from 'vitest';
import { classifyDocument } from '../../../src/intake/classify';
import { rowsToText, type PlacedLine } from './layout';

// Real Textract output for public/samples/treatment-plan.png: [text, top, left, height].
const RAW: [string, number, number, number][] = [
  ['Greensboro Family Dental - Treatment Plan', 0.0934, 0.0492, 0.0509],
  ['Tooth', 0.3681, 0.0492, 0.0329],
  ['Code', 0.3683, 0.1644, 0.0329],
  ['Description', 0.368, 0.2893, 0.0409],
  ['Fee', 0.3693, 0.9114, 0.0321],
  ['#19', 0.4395, 0.0491, 0.032],
  ['D3330', 0.4394, 0.1648, 0.032],
  ['Root canal - molar', 0.4381, 0.2895, 0.0334],
  ['$1,180.00', 0.4378, 0.8456, 0.0383],
  ['#19', 0.5116, 0.0491, 0.0317],
  ['D2950', 0.5115, 0.1649, 0.032],
  ['Core buildup', 0.5097, 0.2892, 0.041],
  ['$330.00', 0.5096, 0.8656, 0.0369],
  ['#19', 0.5837, 0.0491, 0.0318],
  ['D2740', 0.5834, 0.1648, 0.0321],
  ['Crown - porcelain/ceramic', 0.5816, 0.2891, 0.041],
  ['$1,450.00', 0.5818, 0.8455, 0.0382],
  ['#30', 0.6578, 0.0492, 0.0317],
  ['D2740', 0.6574, 0.1648, 0.0321],
  ['Crown - porcelain/ceramic', 0.6559, 0.2891, 0.0409],
  ['$1,450.00', 0.656, 0.8457, 0.0378],
  ['D1110', 0.7296, 0.1647, 0.0321],
  ['Prophylaxis - adult', 0.7281, 0.2896, 0.0409],
  ['$120.00', 0.7281, 0.8654, 0.0366],
  ['Total estimate', 0.7982, 0.0492, 0.0329],
  ['$4,530.00', 0.7985, 0.8458, 0.0381],
];
// Shuffled, as Textract doesn't promise reading order.
const lines: PlacedLine[] = RAW.map(([text, top, left, height]) => ({ text, top, left, height })).reverse();

describe('rowsToText', () => {
  it('joins the cells of each table row left to right', () => {
    const rows = rowsToText(lines).split('\n');
    expect(rows).toContain('#19   D3330   Root canal - molar   $1,180.00');
    expect(rows).toContain('D1110   Prophylaxis - adult   $120.00');
    expect(rows[0]).toBe('Greensboro Family Dental - Treatment Plan');
  });

  it('gives the treatment-plan parser one item per row', () => {
    const doc = classifyDocument(rowsToText(lines), true);
    expect(doc.kind).toBe('treatment_plan');
    expect(doc.items.map((i) => `${i.candidates[0].cdt}#${i.teeth[0]?.tooth ?? '-'}@${i.fee}`)).toEqual([
      'D3330#19@1180',
      'D2950#19@330',
      'D2740#19@1450',
      'D2740#30@1450',
      'D1110#-@120',
    ]);
  });
});
