// Accuracy scorecard against the deployed API (Bedrock translator + tested parser), on evals/intake.json.
// Writes docs/accuracy.md. Usage: node infra/eval.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const { Ting: out } = JSON.parse(readFileSync(new URL('./outputs.json', import.meta.url), 'utf8'));
const { cases } = JSON.parse(readFileSync(new URL('../evals/intake.json', import.meta.url), 'utf8'));
const show = (items) => items.map((i) => `${i.candidates[0]?.cdt}${i.teeth[0] ? `#${i.teeth[0].tooth}` : ''}`).join(' ') || '(none)';
const want = (c) => c.expect.map((e) => `${e.cdt}${e.tooth ? `#${e.tooth}` : ''}`).join(' ');
const ok = (c, items) =>
  items.length === c.expect.length && c.expect.every((e, i) => items[i].candidates[0]?.cdt === e.cdt && (e.tooth === undefined || items[i].teeth[0]?.tooth === e.tooth));

const rows = [];
for (const c of cases) {
  const res = await fetch(`${out.ApiUrl}/intake/parse?persona=dale`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: c.text }) });
  const items = res.ok ? await res.json() : [];
  rows.push({ text: c.text, want: want(c), got: show(items), pass: ok(c, items) });
}
const passed = rows.filter((r) => r.pass).length;
const pct = Math.round((passed / rows.length) * 100);
const md = [
  '# Intake accuracy scorecard',
  '',
  `Generated ${new Date().toISOString().slice(0, 10)} against the deployed API. A case passes when every expected procedure's top code (and tooth, when the text names one) matches, in order.`,
  '',
  `- **Bedrock translator + tested parser (live): ${passed}/${rows.length} (${pct}%)**`,
  '- Local parser alone: see `src/intake/accuracy.test.ts` (`npx vitest run src/intake/accuracy.test.ts --reporter=verbose`).',
  '- Engine: the hand-calculated plan cases in `src/engine/engine.test.ts`.',
  '- Caveat: the translator prompt was adjusted once after a first live run on this same set (93% → 100%), so treat this as a development score; a held-out set would be the fair test.',
  '',
  '| Description | Expected | Got | |',
  '| --- | --- | --- | --- |',
  ...rows.map((r) => `| ${r.text} | ${r.want} | ${r.got} | ${r.pass ? 'pass' : 'miss'} |`),
  '',
].join('\n');
writeFileSync(new URL('../docs/accuracy.md', import.meta.url), md);
console.log(`live: ${passed}/${rows.length} (${pct}%)`);
for (const r of rows.filter((x) => !x.pass)) console.log(`  miss: ${r.text} → ${r.got} (want ${r.want})`);
