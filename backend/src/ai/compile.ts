// Plan compiler: the tested regex reader goes first. The model may only fill fields the reader left as
// questions, and only with a sentence it quotes from the document. Unquoted or unverifiable answers are
// dropped, so a gap stays a question, never a default.
import {
  applyAnswers,
  compilePlanText,
  finalizeRules,
  questionsFor,
  type Answer,
  type AnswerPath,
  type CompileResult,
  type CompilerQuestion,
} from '../../../src/compiler/compile';
import { logWarn } from '../lib/log';
import { isRec, type CallModel } from './model';

const SYSTEM = `You read a US dental plan benefits summary and answer specific questions about it.
Answer a question only if the document states the answer explicitly. Never guess, infer from typical plans, or use outside knowledge.
For every answer, "quote" must be copied character for character from the document (one sentence or table row, at most 300 characters).
Percentages: give the number of percent (80 for 80%). Money: plain numbers without $ or commas. Booleans: true or false.
For a choice question, "value" must be one of the listed option values.
Skip any question the document does not answer.`;

const TOOL = {
  name: 'plan_answers',
  description: 'Answers found in the benefits summary, each with a verbatim quote.',
  schema: {
    type: 'object',
    properties: {
      answers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string' },
            value: { type: ['string', 'number', 'boolean'] },
            quote: { type: 'string' },
          },
          required: ['field', 'value', 'quote'],
        },
      },
    },
    required: ['answers'],
  },
};

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();

function describeQuestion(q: CompilerQuestion): string {
  const options = q.options?.length ? ` Options: ${q.options.map((o) => `${o.value} (${o.label})`).join(', ')}.` : '';
  return `- field "${q.field}" (${q.kind}): ${q.prompt}${options}`;
}

/** Accepted model answers, each verified against the document text. */
export function verifiedAnswers(raw: unknown, questions: CompilerQuestion[], text: string): { field: AnswerPath; value: Answer; quote: string }[] {
  if (!isRec(raw) || !Array.isArray(raw.answers)) return [];
  const doc = norm(text);
  const out: { field: AnswerPath; value: Answer; quote: string }[] = [];
  for (const a of raw.answers) {
    if (!isRec(a) || typeof a.quote !== 'string' || typeof a.field !== 'string') continue;
    const q = questions.find((x) => x.field === a.field);
    const value = a.value;
    if (!q || !(typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')) continue;
    const quote = a.quote.trim();
    if (quote.length < 8 || !doc.includes(norm(quote))) continue;
    if (q.options?.length && !q.options.some((o) => o.value === String(value))) continue;
    if (out.some((o) => o.field === q.field)) continue;
    out.push({ field: q.field, value, quote });
  }
  return out;
}

export async function compileWithModel(text: string, call: CallModel): Promise<CompileResult & { modelFilled: AnswerPath[] }> {
  const local = compilePlanText(text);
  if (!local.questions.length) return { ...local, modelFilled: [] };
  let raw: unknown;
  try {
    raw = await call({
      model: 'smart',
      system: SYSTEM,
      prompt: `Questions:\n${local.questions.map(describeQuestion).join('\n')}\n\nDocument:\n<document>\n${text.slice(0, 60_000)}\n</document>`,
      tool: TOOL,
      maxTokens: 2000,
    });
  } catch (err) {
    logWarn('compile.model_failed', err);
    return { ...local, modelFilled: [] };
  }

  let draft = local.draft;
  const evidence = { ...local.evidence };
  const modelFilled: AnswerPath[] = [];
  const errorCount = (d: typeof draft) => {
    const r = finalizeRules(d);
    return r.ok ? 0 : r.errors.length;
  };
  for (const a of verifiedAnswers(raw, local.questions, text)) {
    const next = applyAnswers(draft, { [a.field]: a.value });
    // An answer that makes the rules invalid (a 500% coinsurance, say) is dropped and stays a question.
    if (errorCount(next) > errorCount(draft)) continue;
    draft = next;
    evidence[a.field] = { snippet: a.quote, section: 'read by Bedrock' };
    modelFilled.push(a.field);
  }
  return { draft, evidence, questions: questionsFor(draft), modelFilled };
}
