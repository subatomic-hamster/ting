// Intake: the model only translates the member's words into phrases the tested parser knows.
// Codes, teeth and probabilities still come from parseDescription.
import { parseDescription } from '../../../src/intake/describe';
import type { IntakeItem, IntakeSource } from '../../../src/intake/types';
import { isRec, type CallModel } from './model';

const SYSTEM = `You normalize a dental patient's description of planned dental work into short plain-English clauses.
Rules:
- One clause per procedure, joined with "; ".
- Use only these procedure words: root canal, crown (porcelain / porcelain fused to metal / gold), core buildup, post and core, filling (tooth-colored or silver, N surfaces), deep cleaning, cleaning, exam, bitewing x-rays, full-mouth x-rays, panoramic x-ray, extraction, surgical extraction, wisdom tooth removal, implant, implant crown, bridge, partial denture, full denture, night guard, sealant, fluoride.
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
    console.warn('describe: model call failed, using the parser alone', err);
  }
  if (!rewritten) return direct;
  const viaModel = parseDescription(rewritten, source);
  const score = (items: IntakeItem[]) => items.reduce((s, i) => s + i.confidence, 0);
  return viaModel.length > direct.length || (viaModel.length === direct.length && score(viaModel) > score(direct)) ? viaModel : direct;
}
