import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACME_HIGH, ACME_LOW } from '../data/demo';
import { CDT } from '../engine/cdt';
import type { PlanRules } from '../engine/types';
import { applyAnswers, approveRules, compilePlanText, finalizeRules, localCompiler } from './compile';
import { CDT_CATEGORIES, planRulesJsonSchema, planRulesSchema } from './schema';

const sample = (name: string) => readFileSync(new URL(`../../public/samples/${name}`, import.meta.url), 'utf8');
const LOW_TEXT = sample('acme-benefits-summary.txt');
const HIGH_TEXT = sample('acme-benefits-summary-high.txt');

// Compared field by field: everything except identity (id/name/version) and the `sections` citations,
// which get their own test.
const rulesBody = ({ id: _id, name: _name, version: _version, sections: _sections, ...rest }: PlanRules) => rest;

function finalized(draft: ReturnType<typeof compilePlanText>['draft']): PlanRules {
  const r = finalizeRules(draft);
  if (!r.ok) throw new Error(`not final: missing ${r.missing.join(', ')}; ${r.errors.join('; ')}`);
  return r.rules;
}

describe('Low sample (endodontics not stated)', () => {
  const result = compilePlanText(LOW_TEXT);

  it('asks exactly the endodontics question, as a choice', () => {
    expect(result.questions).toHaveLength(1);
    const [q] = result.questions;
    expect(q?.field).toBe('categoryClass.endodontics');
    expect(q?.prompt).toBe('Is endodontics basic or major on your plan?');
    expect(q?.kind).toBe('choice');
    expect(q?.options?.map((o) => o.value)).toEqual(['preventive', 'basic', 'major', 'ortho', 'excluded']);
  });

  it('does not finalize until it is answered, and names the missing field', () => {
    const r = finalizeRules(result.draft);
    expect(r).toMatchObject({ ok: false, missing: ['categoryClass.endodontics'], errors: [] });
  });

  it("after answering 'basic', rules equal ACME_LOW (all fields but id/name/version/sections)", () => {
    const rules = finalized(applyAnswers(result.draft, { 'categoryClass.endodontics': 'basic' }));
    expect(rulesBody(rules)).toEqual(rulesBody(ACME_LOW));
    expect(rules.name).toBe('Lincoln DentalConnect Low');
  });

  it('cites the same sections as ACME_LOW', () => {
    expect(result.draft.sections).toEqual(ACME_LOW.sections);
  });

  it('cites MaxRewards when it applies the day-65 deposit default', () => {
    expect(result.evidence['maxRewards.depositDay']?.snippet).toMatch(/day 65.*MaxRewards/);
    expect(result.evidence['maxRewards.depositDay']?.section).toBe('Lincoln MaxRewards, §5');
    expect(result.evidence.annualMax).toEqual({ snippet: expect.stringContaining('$1,500'), section: 'Plan Maximums, §4' });
  });

  it('localCompiler gives the same result asynchronously', async () => {
    expect(await localCompiler.compile(LOW_TEXT)).toEqual(result);
  });
});

describe('Low sample PDF', () => {
  it('compiles to the same result as the .txt (text rows rebuilt from pdf.js items)', async () => {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(readFileSync(new URL('../../public/samples/acme-benefits-summary.pdf', import.meta.url)));
    const pdf = await getDocument({ data, verbosity: 0 }).promise;
    const rows: string[] = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const { items } = await (await pdf.getPage(p)).getTextContent();
      const byY = new Map<number, { x: number; str: string }[]>();
      for (const it of items) {
        if (!('str' in it) || !it.str.trim()) continue;
        const y = Math.round(it.transform[5] ?? 0);
        byY.set(y, [...(byY.get(y) ?? []), { x: it.transform[4] ?? 0, str: it.str }]);
      }
      for (const y of [...byY.keys()].sort((a, b) => b - a)) rows.push((byY.get(y) ?? []).sort((a, b) => a.x - b.x).map((i) => i.str).join(' '));
    }
    expect(pdf.numPages).toBe(2);
    const fromPdf = compilePlanText(rows.join('\n'));
    const fromTxt = compilePlanText(LOW_TEXT);
    expect(fromPdf.questions.map((q) => q.field)).toEqual(['categoryClass.endodontics']);
    expect(fromPdf.draft).toEqual(fromTxt.draft);
    expect(fromPdf.evidence).toEqual(fromTxt.evidence);
  });
});

describe('High sample (fully specified)', () => {
  const result = compilePlanText(HIGH_TEXT);

  it('asks nothing and equals ACME_HIGH', () => {
    expect(result.questions).toEqual([]);
    const rules = finalized(result.draft);
    expect(rulesBody(rules)).toEqual(rulesBody(ACME_HIGH));
    expect(rules.sections).toEqual(ACME_HIGH.sections);
  });

  it('reads an explicit MaxRewards deposit day', () => {
    expect(result.evidence['maxRewards.depositDay']?.snippet).toMatch(/^Rollover amounts are deposited on day 65/);
  });
});

describe('missing fields become questions', () => {
  it('asks for the annual max when the text omits it', () => {
    const text = LOW_TEXT.split('\n').filter((l) => !/^Annual maximum benefit/.test(l)).join('\n');
    const { questions, draft } = compilePlanText(text);
    expect(draft.annualMax).toBeUndefined();
    expect(questions.map((q) => q.field)).toEqual(['annualMax', 'categoryClass.endodontics']);
    expect(questions[0]).toMatchObject({ kind: 'number' });
  });

  it('asks everything for an empty document, yes/no questions last, no silent defaults', () => {
    const { questions, draft } = compilePlanText('Nothing useful here.');
    const fields = questions.map((q) => q.field);
    expect(fields).toContain('annualMax');
    expect(fields).toContain('coinsurance.inNetwork.major');
    expect(fields.slice(-4)).toEqual(['premiumPreTax', 'alternateBenefit', 'preventiveCountsTowardMax', 'q4DeductibleCarryover']);
    expect(draft.maxRewards).toBeUndefined(); // no MaxRewards mention, no day-65 default
    const r = finalizeRules(draft);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.missing).toEqual(fields);
  });

  it('applyAnswers reads percents, booleans and choices', () => {
    const d = applyAnswers(compilePlanText('x').draft, {
      'coinsurance.inNetwork.basic': '80%',
      'coinsurance.inNetwork.major': 0.5,
      alternateBenefit: 'yes',
      'deductible.appliesTo': 'basic,major',
      outOfNetwork: '80',
      annualMax: '1500',
    });
    expect(d.coinsurance?.inNetwork).toEqual({ basic: 0.8, major: 0.5 });
    expect(d.alternateBenefit).toBe(true);
    expect(d.deductible?.appliesTo).toEqual(['basic', 'major']);
    expect(d.outOfNetwork).toEqual({ basis: 'ucr', percentile: 80 });
    expect(d.annualMax).toBe(1500);
    expect(applyAnswers(d, { outOfNetwork: 'mac' }).outOfNetwork).toEqual({ basis: 'mac' });
  });

  it('finalizeRules reports bad values as errors, not missing', () => {
    const draft = applyAnswers(compilePlanText(HIGH_TEXT).draft, { 'coinsurance.inNetwork.major': 150000 });
    const r = finalizeRules(draft);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.errors.join()).toMatch(/coinsurance\.inNetwork\.major/);
  });
});

describe('approveRules', () => {
  const base = finalized(compilePlanText(HIGH_TEXT).draft);

  it('hash is stable, ignores version, and names the version', async () => {
    const a = await approveRules(base);
    const b = await approveRules({ ...base, version: 'something-else' });
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(b.hash).toBe(a.hash);
    expect(a.rules.version).toBe(`PLAN-LINCOLN-DENTALCONNECT-HIGH-${a.hash.slice(0, 8)}`);
    // key order must not matter
    const reordered = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(base).reverse()))) as PlanRules;
    expect((await approveRules(reordered)).hash).toBe(a.hash);
  });

  it('hash changes when a value changes', async () => {
    const a = await approveRules(base);
    const b = await approveRules({ ...base, annualMax: base.annualMax + 1 });
    expect(b.hash).not.toBe(a.hash);
    expect(b.rules.version).not.toBe(a.rules.version);
  });
});

describe('planRulesSchema', () => {
  it('accepts the demo plans', () => {
    expect(planRulesSchema.safeParse(ACME_LOW).success).toBe(true);
    expect(planRulesSchema.safeParse(ACME_HIGH).success).toBe(true);
  });

  it('rejects coinsurance 1.5', () => {
    const bad = { ...ACME_LOW, coinsurance: { ...ACME_LOW.coinsurance, inNetwork: { ...ACME_LOW.coinsurance.inNetwork, basic: 1.5 } } };
    expect(planRulesSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects unknown keys, top level and nested', () => {
    expect(planRulesSchema.safeParse({ ...ACME_LOW, surprise: 1 }).success).toBe(false);
    expect(planRulesSchema.safeParse({ ...ACME_LOW, deductible: { ...ACME_LOW.deductible, extra: 1 } }).success).toBe(false);
  });

  it('rejects a missing category and an out-of-range waiting period', () => {
    const { endodontics: _e, ...rest } = ACME_LOW.categoryClass;
    expect(planRulesSchema.safeParse({ ...ACME_LOW, categoryClass: rest }).success).toBe(false);
    const wait = { ...ACME_LOW.waitingPeriodMonths, major: 25 };
    expect(planRulesSchema.safeParse({ ...ACME_LOW, waitingPeriodMonths: wait }).success).toBe(false);
  });

  it('covers every CDT category and exports a strict JSON schema', () => {
    expect([...CDT_CATEGORIES].sort()).toEqual([...new Set(Object.values(CDT).map((c) => c.category))].sort());
    expect(planRulesJsonSchema).toMatchObject({ type: 'object', additionalProperties: false });
  });
});
