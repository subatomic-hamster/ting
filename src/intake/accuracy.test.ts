// Accuracy scorecard (spec F7): the local parser on 30 hand-labelled descriptions. `node infra/eval.mjs` scores
// the deployed Bedrock path on the same set. A case passes when every expected procedure's top code (and tooth,
// when the text names one) matches, in order.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDescription } from './describe';

interface Case {
  text: string;
  expect: { cdt: string; tooth?: number }[];
}
const { cases } = JSON.parse(readFileSync(new URL('../../evals/intake.json', import.meta.url), 'utf8')) as { cases: Case[] };

export function scoreCase(c: Case, items: { candidates: { cdt: string }[]; teeth: { tooth: number }[] }[]): boolean {
  if (items.length !== c.expect.length) return false;
  return c.expect.every((e, i) => items[i].candidates[0]?.cdt === e.cdt && (e.tooth === undefined || items[i].teeth[0]?.tooth === e.tooth));
}

describe('intake accuracy (local parser)', () => {
  const passed = cases.filter((c) => scoreCase(c, parseDescription(c.text)));
  it(`scores ${passed.length}/${cases.length} on the labelled set`, () => {
    // The parser is English-only by design; Spanish and slang are what the Bedrock translator adds.
    expect(passed.length / cases.length).toBeGreaterThanOrEqual(0.7);
  });
});
