import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEMO_PROFILE } from '../../../src/data/demo';
import { explainLine } from '../../../src/engine/explain';
import { evaluateSchedule } from '../../../src/engine/schedule';
import { parseDescription } from '../../../src/intake/describe';
import { compileWithModel, verifiedAnswers } from './compile';
import { blend, describeWithModel } from './describe';
import { explainWithModel } from './explain';
import type { CallModel } from './model';

const fake =
  (answer: unknown): CallModel =>
  async () =>
    answer;
const failing: CallModel = async () => {
  throw new Error('bedrock down');
};

const LOW_TEXT = readFileSync(new URL('../../../public/samples/acme-benefits-summary.txt', import.meta.url), 'utf8');

describe('describeWithModel', () => {
  it('uses the model only as a translator: codes come from the parser', async () => {
    const items = await describeWithModel('corona en la muela de abajo a la izquierda', fake({ clauses: 'porcelain crown on lower left molar' }));
    expect(items).toHaveLength(1);
    expect(items[0].candidates[0].cdt).toBe('D2740');
    expect(items[0].teeth[0].tooth).toBe(19);
  });

  it("keeps the member's own words when the parser already reads them as well", async () => {
    const text = 'root canal on #19';
    const items = await describeWithModel(text, fake({ clauses: 'root canal' }));
    expect(items).toEqual(parseDescription(text));
  });

  it('falls back to the parser when Bedrock fails', async () => {
    expect(await describeWithModel('crown on #30', failing)).toEqual(parseDescription('crown on #30'));
  });
});

describe('compileWithModel', () => {
  it('drops answers whose quote is not in the document, so the gap stays a question', async () => {
    const r = await compileWithModel(
      LOW_TEXT,
      fake({ answers: [{ field: 'categoryClass.endodontics', value: 'basic', quote: 'Endodontics is a basic service.' }] }),
    );
    expect(r.modelFilled).toEqual([]);
    expect(r.questions.map((q) => q.field)).toEqual(['categoryClass.endodontics']);
  });

  it('accepts a quoted answer and cites it', async () => {
    const quote = 'Annual deductible: $50 per person per calendar year.';
    const answers = verifiedAnswers(
      { answers: [{ field: 'categoryClass.endodontics', value: 'basic', quote }] },
      [{ field: 'categoryClass.endodontics', prompt: 'p', kind: 'choice', options: [{ value: 'basic', label: 'Basic' }] }],
      LOW_TEXT,
    );
    expect(answers).toEqual([{ field: 'categoryClass.endodontics', value: 'basic', quote }]);
  });

  it('rejects a value outside the offered options', () => {
    const answers = verifiedAnswers(
      { answers: [{ field: 'categoryClass.endodontics', value: 'sometimes', quote: 'Annual deductible: $50 per person per calendar year.' }] },
      [{ field: 'categoryClass.endodontics', prompt: 'p', kind: 'choice', options: [{ value: 'basic', label: 'Basic' }] }],
      LOW_TEXT,
    );
    expect(answers).toEqual([]);
  });

  it('returns the regex result unchanged when Bedrock fails', async () => {
    const r = await compileWithModel(LOW_TEXT, failing);
    expect(r.questions.map((q) => q.field)).toEqual(['categoryClass.endodontics']);
  });
});

describe('explainWithModel', () => {
  const profile = { ...DEMO_PROFILE, procedures: [{ id: 'rc', cdt: 'D3330', tooth: 19, fee: 1180, allowedFee: 1000, inNetwork: true }] };
  const [line] = evaluateSchedule(profile, [{ id: 'rc', date: profile.asOf }]).lines;
  const templates = explainLine(line);

  it('keeps model sentences whose dollars are all the engine’s', async () => {
    const out = await explainWithModel(line, fake({ sentences: templates.map((t) => t.text) }));
    expect(out.every((s) => s.source === 'model')).toBe(true);
  });

  it('replaces a sentence with an invented amount by the template', async () => {
    const sentences = templates.map((t, i) => (i === 0 ? 'Your dentist charges $9,999.99 for this.' : t.text));
    const out = await explainWithModel(line, fake({ sentences }));
    expect(out[0]).toMatchObject({ source: 'template', text: templates[0].text });
  });

  it('replaces a sentence that drops one of the engine’s amounts', async () => {
    const sentences = templates.map((t, i) => (i === 0 ? 'Your dentist sets a fee for this.' : t.text));
    const out = await explainWithModel(line, fake({ sentences }));
    expect(out[0].source).toBe('template');
  });
});

describe('blend (parser prior × Winnow reading)', () => {
  const prior = [
    { cdt: 'D7240', p: 0.7 },
    { cdt: 'D7210', p: 0.2 },
    { cdt: 'D7140', p: 0.05 },
  ];
  it('keeps a strong dental prior against a mild literal reading', () => expect(blend(prior, { D7240: 0.2, D7210: 0.2, D7140: 0.6 })[0].cdt).toBe('D7240'));
  it('lets clear evidence overturn the prior', () => {
    const out = blend(prior, { D7240: 0.001, D7210: 0.001, D7140: 0.998 });
    expect(out.reduce((a, b) => (b.p > a.p ? b : a)).cdt).toBe('D7140');
  });
  it('sums to 1', () => expect(blend(prior, { D7240: 0.5, D7210: 0.3, D7140: 0.2 }).reduce((s, c) => s + c.p, 0)).toBeCloseTo(1, 3));
});
