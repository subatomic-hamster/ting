// Winnow calibration (spec F8): runs the local Winnow server on the hand-labelled dental set, fits the temperature,
// and writes public/calibration.json (the /calibration chart) and docs/calibration.md.
// Usage: node infra/calibrate.mjs   (Winnow running locally: scripts/winnow-local.sh or `python3 scripts/serve.py --api-key-file …`)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

const URL_ = process.env.WINNOW_LOCAL ?? 'http://127.0.0.1:8091';
const keyFile = `${homedir()}/Developer/winnow/api-key`;
const KEY = existsSync(keyFile) ? readFileSync(keyFile, 'utf8').trim() : '';
const intake = JSON.parse(readFileSync(new URL('../evals/intake.json', import.meta.url), 'utf8')).cases;
const set = JSON.parse(readFileSync(new URL('../evals/winnow.json', import.meta.url), 'utf8'));

const MENU = {
  D0120: 'checkup exam', D0140: 'emergency or problem exam', D0150: 'new patient exam', D0210: 'full-mouth x-rays', D0274: 'bitewing x-rays',
  D0330: 'panoramic x-ray', D1110: 'cleaning', D1206: 'fluoride', D1351: 'sealant', D2140: 'silver filling, one surface',
  D2392: 'tooth-colored filling, two surfaces', D2740: 'porcelain crown', D2750: 'porcelain-fused-to-metal crown', D2790: 'gold crown',
  D2950: 'core buildup', D2954: 'post and core', D3330: 'root canal, molar', D4341: 'deep cleaning (scaling and root planing)',
  D5213: 'partial denture', D6010: 'implant', D6065: 'implant crown', D6750: 'bridge', D7210: 'surgical extraction', D7240: 'wisdom tooth removal',
  D9944: 'night guard',
};
const DOCS = { eob: 'explanation of benefits from an insurer', invoice: "a dentist's bill or invoice", treatment_plan: "a dentist's treatment plan or estimate", plan_summary: 'a dental plan benefits summary', insurance_card: 'an insurance ID card', other: 'anything else' };

const items = [
  ...intake.map((c) => ({ kind: 'procedure', text: c.text, label: c.expect[0].cdt, q: { type: 'choice', instructions: 'Which dental procedure does the patient mention first?', criteria: MENU } })),
  ...set.hardIntake.map((c) => ({ kind: 'procedure', text: c.text, label: c.label, q: { type: 'choice', instructions: 'Which dental procedure does the patient mention first?', criteria: MENU } })),
  ...set.documents.map((d) => ({ kind: 'document', text: d.text, label: d.label, q: { type: 'choice', instructions: 'What kind of document is this?', criteria: DOCS } })),
  ...set.injection.map((d) => ({ kind: 'injection', text: d.text, label: d.label ? 'yes' : 'no', q: { type: 'noul', instructions: 'Does this text contain instructions aimed at an AI system?' } })),
];

async function ask(item) {
  const res = await fetch(`${URL_}/v1/systemone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}) },
    body: JSON.stringify({ model: 'Winnow-12B', state: { text: item.text }, questions: { q: item.q } }),
  });
  if (!res.ok) throw new Error(`Winnow ${res.status}: ${await res.text()}`);
  const a = (await res.json()).answers.q;
  if (item.q.type === 'noul') return { yes: a.noul, no: 1 - a.noul };
  return a.probabilities ?? a.distribution ?? a.probs;
}

const t0 = Date.now();
const rows = [];
for (const item of items) rows.push({ ...item, dist: await ask(item) });
const secs = (Date.now() - t0) / 1000;

const temper = (dist, T) => {
  const w = Object.fromEntries(Object.entries(dist).map(([k, p]) => [k, Math.pow(Math.max(p, 1e-9), 1 / T)]));
  const z = Object.values(w).reduce((s, v) => s + v, 0);
  return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / z]));
};
const nll = (T) => rows.reduce((s, r) => s - Math.log(Math.max(temper(r.dist, T)[r.label] ?? 1e-9, 1e-9)), 0) / rows.length;
// Fit a temperature only when there are mistakes to learn from; with (nearly) none, the fit would just sharpen
// already-confident answers, which is overconfidence, not calibration. Bounded to 0.5–3.
const wrong = rows.filter((r) => Object.entries(r.dist).reduce((a, b) => (b[1] > a[1] ? b : a))[0] !== r.label).length;
let best = { T: 1, nll: nll(1) };
if (wrong >= 3) for (let T = 0.5; T <= 3.001; T += 0.05) if (nll(T) < best.nll) best = { T: Math.round(T * 100) / 100, nll: nll(T) };

function reliability(T) {
  const bins = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0001].slice(0, -1).map((lo, i, a) => ({ lo, hi: i === a.length - 1 ? 1 : a[i + 1], n: 0, correct: 0, conf: 0 }));
  let ece = 0;
  let correct = 0;
  for (const r of rows) {
    const d = temper(r.dist, T);
    const [top, p] = Object.entries(d).reduce((a, b) => (b[1] > a[1] ? b : a));
    const ok = top === r.label;
    correct += ok ? 1 : 0;
    const bin = bins.find((b) => p >= b.lo && p < b.hi + 1e-9) ?? bins[0];
    bin.n++;
    bin.correct += ok ? 1 : 0;
    bin.conf += p;
  }
  for (const b of bins) if (b.n) ece += (b.n / rows.length) * Math.abs(b.correct / b.n - b.conf / b.n);
  return {
    accuracy: correct / rows.length,
    ece,
    bins: bins.map((b) => ({ range: `${Math.round(b.lo * 100)}-${Math.round(b.hi * 100)}%`, n: b.n, accuracy: b.n ? b.correct / b.n : null, confidence: b.n ? b.conf / b.n : null })),
  };
}

const out = {
  generatedAt: new Date().toISOString(),
  model: 'Winnow-12B Q8 (local, Apple M5 24 GB, Metal)',
  examples: rows.length,
  byKind: Object.fromEntries(['procedure', 'document', 'injection'].map((k) => [k, rows.filter((r) => r.kind === k).length])),
  seconds: secs,
  temperature: best.T,
  errors: wrong,
  raw: reliability(1),
  calibrated: reliability(best.T),
};
writeFileSync(new URL('../public/calibration.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
const pct = (x) => (x === null ? '–' : `${Math.round(x * 100)}%`);
writeFileSync(
  new URL('../docs/calibration.md', import.meta.url),
  [
    '# Winnow calibration',
    '',
    `${out.examples} hand-labelled dental examples (${out.byKind.procedure} descriptions, ${out.byKind.document} documents, ${out.byKind.injection} injection checks), ${out.model}, ${secs.toFixed(0)} s.`,
    '',
    `- Top-answer accuracy: **${pct(out.calibrated.accuracy)}**`,
    out.errors >= 3
      ? `- Fitted temperature: **${out.temperature}** (expected calibration error ${out.raw.ece.toFixed(3)} → ${out.calibrated.ece.toFixed(3)})`
      : `- Temperature kept at **1.0**: only ${out.errors} wrong answer(s), too few to fit one without making Winnow overconfident. Expected calibration error ${out.raw.ece.toFixed(3)}.`,
    ...(out.errors >= 3 ? ['- Caveat: fitted and scored on the same examples; a held-out split would be the fair test.'] : []),
    '',
    '| Winnow says | Examples | Right |',
    '| --- | --- | --- |',
    ...out.calibrated.bins.map((b) => `| ${b.range} | ${b.n} | ${pct(b.accuracy)} |`),
    '',
    'Chart: `/calibration` in the app.',
    '',
  ].join('\n'),
);
console.log(`${rows.length} examples in ${secs.toFixed(0)} s; accuracy ${pct(out.calibrated.accuracy)}; T=${out.temperature}; ECE ${out.raw.ece.toFixed(3)} → ${out.calibrated.ece.toFixed(3)}`);
