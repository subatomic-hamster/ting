// Intake: the model only translates the member's words into phrases the tested parser knows.
// Codes, teeth and probabilities still come from parseDescription.
import { CDT } from '../../../src/engine/cdt';
import { makeItem, parseDescription, withoutCount } from '../../../src/intake/describe';
import type { IntakeItem, IntakeSource } from '../../../src/intake/types';
import { logWarn } from '../lib/log';
import { isRec, type CallModel } from './model';
import type { Decide, WinnowQuestion } from './winnow';

const SYSTEM = `You normalize a dental patient's description of planned dental work into short plain-English clauses.
Rules:
- One clause per procedure, joined with "; ".
- When the patient gives a number of the same procedure, write ONE clause with the number ("2 fillings", "3 wisdom teeth removed", "two crowns on the lower back molars"). Never repeat a clause once per tooth.
- Use only these procedure words: root canal, crown (porcelain / porcelain fused to metal / gold), core buildup, post, filling (tooth-colored or silver, N surfaces), deep cleaning, cleaning, checkup exam, emergency exam, new patient exam, bitewing x-rays, full-mouth x-rays, panoramic x-ray, extraction, surgical extraction, wisdom tooth removal, implant, implant crown, bridge, partial denture, full denture, night guard, sealant, fluoride.
- Keep words that change the procedure, such as emergency, toothache, surgical, broken or impacted.
- Keep tooth details exactly as stated: a tooth number as "#N"; otherwise only the words the patient used for upper/lower, left/right, molar/premolar/front/back.
- Never invent a tooth number, side, arch, material, surface count or procedure the patient did not state.
- If the patient says the crown replaces an old or existing crown, add "replacing the old one" to that clause.
- Translate other languages to English. Drop anything that is not a procedure.`;

const TOOL = {
  name: 'normalized_description',
  description: 'The description rewritten as clauses the parser understands.',
  schema: {
    type: 'object',
    properties: { clauses: { type: 'string', description: 'Clauses joined with "; ". Empty if no dental procedure is described.' } },
    required: ['clauses'],
  },
};

/** The member's own words win when the tested parser already reads them at least as well. */
export async function describeWithModel(text: string, call: CallModel, source: IntakeSource = 'text'): Promise<IntakeItem[]> {
  const direct = parseDescription(text, source);
  let rewritten = '';
  try {
    const out = await call({ model: 'fast', system: SYSTEM, prompt: text.slice(0, 2000), tool: TOOL, maxTokens: 400 });
    rewritten = isRec(out) && typeof out.clauses === 'string' ? out.clauses.trim() : '';
  } catch (err) {
    logWarn('describe.model_failed', err);
  }
  if (!rewritten) return direct;
  const viaModel = parseDescription(rewritten, source);
  const score = (items: IntakeItem[]) => items.reduce((s, i) => s + i.confidence, 0);
  return viaModel.length > direct.length || (viaModel.length === direct.length && score(viaModel) > score(direct)) ? viaModel : direct;
}

// --- Winnow use 1: probabilities for the fields the intake questions price ---------------------------------------

const CROWNS = new Set(['D2740', 'D2750', 'D2790']);

export function blend(prior: IntakeItem['candidates'], winnow: Record<string, number>): IntakeItem['candidates'] {
  const raw = prior.map((c) => ({ cdt: c.cdt, p: Math.sqrt(Math.max(c.p, 1e-6) * Math.max(winnow[c.cdt] ?? 0, 1e-6)) }));
  const total = raw.reduce((s, c) => s + c.p, 0);
  return raw.map((c) => ({ cdt: c.cdt, p: Math.round((c.p / total) * 1e4) / 1e4 }));
}

/**
 * One Winnow request for every uncertain field: which code (when there's more than one candidate) and whether a
 * crown replaces an old one. The engine then prices each answer and asks only when guessing would cost money.
 */
export async function withWinnow(text: string, items: IntakeItem[], decide: Decide): Promise<IntakeItem[]> {
  const questions: Record<string, WinnowQuestion> = {};
  // One appointment ("3 fillings") is one question, asked without the count so "3" is never read as 3 surfaces.
  const lead = items.map((item, i) => (item.visit ? items.findIndex((x) => x.visit === item.visit) : i));
  items.forEach((item, i) => {
    if (lead[i] !== i) return;
    if (item.candidates.length > 1)
      questions[`code_${i}`] = {
        type: 'choice',
        instructions: `Which procedure does "${withoutCount(item.phrase)}" describe?`,
        criteria: Object.fromEntries(item.candidates.map((c) => [c.cdt, CDT[c.cdt] ? `${CDT[c.cdt].short} (${CDT[c.cdt].description})` : c.cdt])),
      };
    if (CROWNS.has(item.candidates[0]?.cdt ?? '') && item.replacement !== undefined)
      questions[`replacement_${i}`] = { type: 'noul', instructions: 'Does this crown replace an existing crown on the same tooth?' };
  });
  if (!Object.keys(questions).length) return items;
  const { answers, source } = await decide({ description: withoutCount(text).slice(0, 2000) }, questions);
  return items.map((item, i) => {
    const code = answers[`code_${lead[i]}`];
    const repl = answers[`replacement_${lead[i]}`];
    if (!code && !repl) return item;
    // The parser's dental priors and Winnow's reading of these exact words, combined (geometric mean): Winnow can
    // overturn a prior with clear evidence, but a literal reading alone doesn't erase what's usual in dentistry.
    const candidates = code ? blend(item.candidates, code) : item.candidates;
    const { confidence: _c, ...base } = item;
    return { ...makeItem({ ...base, candidates, replacement: repl ? repl.yes : item.replacement }), decidedBy: source };
  });
}
