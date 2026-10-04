// Winnow uses 4–9 (spec F8). Each sends one request of typed questions; the rules in src/engine/decisions.ts act
// on the answers. Winnow decides fields, never money, and never writes text.
import type { DraftRules } from '../../../src/compiler/compile';
import {
  ACTION_SCALE,
  CLARITY_SCALE,
  HEDGED,
  INTENTS,
  LINE_CATEGORIES,
  likelihoodFromNote,
  lineDecision,
  NOTE_SCALE,
  needsReview,
  route,
  type LineCategory,
} from '../../../src/engine/decisions';
import { pct, usd } from '../../../src/engine/format';
import type { IntakeItem } from '../../../src/intake/types';
import type { Decide, WinnowQuestion, WinnowResult } from './winnow';

const at = (o: unknown, path: string): unknown => path.split('.').reduce<unknown>((x, k) => (x && typeof x === 'object' ? (x as Record<string, unknown>)[k] : undefined), o);
const CLASS = { preventive: 'preventive', basic: 'basic', major: 'major', ortho: 'orthodontic' } as Record<string, string>;

/** A compiled rule as a sentence the document should support, or undefined when it can't be said simply. */
export function statementFor(field: string, draft: DraftRules): string | undefined {
  const v = at(draft, field);
  if (v === undefined) return undefined;
  const [head, a, b] = field.split('.');
  switch (head) {
    case 'annualMax':
      return `The annual maximum benefit is ${usd(Number(v))}.`;
    case 'orthoLifetimeMax':
      return `The orthodontic lifetime maximum is ${usd(Number(v))}.`;
    case 'premiumMonthly':
      return `The monthly premium is ${usd(Number(v))}.`;
    case 'premiumPreTax':
      return v ? 'Premiums are deducted before tax.' : 'Premiums are deducted after tax.';
    case 'deductible':
      return a === 'amount' ? `The annual deductible is ${usd(Number(v))}.` : `The deductible applies to ${(v as string[]).join(' and ')} services.`;
    case 'coinsurance':
      return `${a === 'inNetwork' ? 'In network' : 'Out of network'}, the plan pays ${pct(Number(v))} for ${CLASS[b] ?? b} services.`;
    case 'waitingPeriodMonths':
      return Number(v) ? `${CLASS[a] ?? a} services have a ${v}-month waiting period.` : `${CLASS[a] ?? a} services have no waiting period.`;
    case 'categoryClass':
      return `${a} is covered as a ${v} service.`;
    case 'alternateBenefit':
      return v ? 'Tooth-colored fillings on back teeth are paid at the silver-filling rate.' : 'Tooth-colored fillings are paid at their own rate.';
    case 'preventiveCountsTowardMax':
      return v ? 'Preventive care counts toward the annual maximum.' : 'Preventive care does not count toward the annual maximum.';
    case 'q4DeductibleCarryover':
      return v ? "Deductible met in October, November or December counts toward next year's deductible." : undefined;
    default:
      return undefined;
  }
}

// --- Use 4: plan compiler second reader ------------------------------------------------------------------------------
export async function secondReader(text: string, draft: DraftRules, fields: string[], decide: Decide) {
  const statements = fields.map((f) => ({ field: f, statement: statementFor(f, draft) })).filter((s): s is { field: string; statement: string } => !!s.statement);
  if (!statements.length) return { checks: [], source: undefined };
  const questions: Record<string, WinnowQuestion> = {};
  statements.forEach((s, i) => (questions[`r${i}`] = { type: 'noul', instructions: `Does the plan document state this? "${s.statement}"` }));
  const { answers, source } = await decide({ plan_document: text.slice(0, 24_000) }, questions);
  return {
    checks: statements.map((s, i) => {
      const p = answers[`r${i}`]?.yes ?? 0;
      return { ...s, p: Math.round(p * 1000) / 1000, review: needsReview(p) };
    }),
    source,
  };
}

// --- Use 5: invoice line items -----------------------------------------------------------------------------------------
export async function classifyLines(lines: { text: string; amount: number }[], decide: Decide) {
  if (!lines.length) return { lines: [], source: undefined };
  const questions: Record<string, WinnowQuestion> = {};
  lines.slice(0, 20).forEach((l, i) => (questions[`l${i}`] = { type: 'choice', instructions: `What is this bill line? "${l.text}"`, criteria: { ...LINE_CATEGORIES } }));
  const { answers, source } = await decide({ invoice_lines: lines.map((l) => l.text) }, questions);
  return {
    lines: lines.slice(0, 20).map((l, i) => ({ ...l, ...(answers[`l${i}`] ? lineDecision(answers[`l${i}`]) : { category: 'covered' as LineCategory, p: 0, ask: true }) })),
    source,
  };
}

// --- Use 6: dentist-note reader --------------------------------------------------------------------------------------
export async function readNotes(items: IntakeItem[], decide: Decide): Promise<IntakeItem[]> {
  const hedged = items.map((it, i) => ({ it, i })).filter(({ it }) => HEDGED.test(it.phrase));
  if (!hedged.length) return items;
  const questions: Record<string, WinnowQuestion> = {};
  for (const { it, i } of hedged)
    questions[`n${i}`] = { type: 'score', instructions: `Going only by the dentist's own words, how likely is this work this year? "${it.phrase}"`, scale: [...NOTE_SCALE] };
  const { answers, source } = await decide({ notes: hedged.map(({ it }) => it.phrase) }, questions);
  return items.map((it, i) => {
    const d = answers[`n${i}`];
    return d ? { ...it, likelihood: likelihoodFromNote(d), likelihoodFrom: 'notes' as const, decidedBy: it.decidedBy ?? source } : it;
  });
}

// --- Use 7: notification ranker --------------------------------------------------------------------------------------
export async function rankAlerts(state: Record<string, unknown>, alerts: { id: string; text: string }[], decide: Decide): Promise<WinnowResult> {
  const questions: Record<string, WinnowQuestion> = {};
  alerts.forEach((a, i) => (questions[`a${i}`] = { type: 'score', instructions: `How soon does the member need to act on this alert? "${a.text}"`, scale: [...ACTION_SCALE] }));
  const res = await decide(state, questions);
  return { answers: Object.fromEntries(alerts.map((a, i) => [a.id, res.answers[`a${i}`] ?? {}])), source: res.source };
}

// --- Use 8: router and safety gate -----------------------------------------------------------------------------------
export async function routeQuestion(question: string, decide: Decide) {
  const { answers, source } = await decide({ question: question.slice(0, 1000) }, { intent: { type: 'choice', instructions: 'What kind of question is this?', criteria: { ...INTENTS } } });
  return { ...route(answers.intent ?? { out_of_scope: 1 }), dist: answers.intent ?? {}, source };
}

// --- Use 9: plain-language gate --------------------------------------------------------------------------------------
export async function clarity(sentences: string[], decide: Decide) {
  const questions: Record<string, WinnowQuestion> = {};
  sentences.forEach((s, i) => (questions[`s${i}`] = { type: 'score', instructions: `How easy is this sentence for someone with no insurance knowledge? "${s}"`, scale: [...CLARITY_SCALE] }));
  const { answers, source } = await decide({ sentences }, questions);
  return { scores: sentences.map((_, i) => answers[`s${i}`] ?? {}), source };
}

/** Adds the per-kind Winnow checks to a read document: line items on a bill, the dentist's wording on a plan. */
export async function enrichDocument<T extends { kind: string; items: IntakeItem[]; invoice?: { lines: { text: string; amount: number }[] } }>(
  doc: T,
  decide: Decide,
): Promise<T & { lineChecks?: Awaited<ReturnType<typeof classifyLines>>['lines'] }> {
  try {
    if (doc.kind === 'invoice' && doc.invoice?.lines.length) return { ...doc, lineChecks: (await classifyLines(doc.invoice.lines, decide)).lines };
    if (doc.kind === 'treatment_plan') return { ...doc, items: await readNotes(doc.items, decide) };
  } catch (err) {
    console.warn('document checks skipped', err);
  }
  return doc;
}
