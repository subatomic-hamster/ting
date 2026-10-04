// Rewords a deterministic draft without touching its amounts: the result must mention exactly the allowed
// dollar figures (all of them, nothing else), or the draft is returned unchanged.
import { dollarsIn } from '../../../src/engine/explain';
import { isRec, type CallModel } from './model';

export async function polish(draft: string, allowed: number[], call: CallModel, purpose: string): Promise<{ text: string; source: 'model' | 'template' }> {
  try {
    const out = await call({
      model: 'fast',
      system: `You edit a short ${purpose} so it is clear, polite and plain. Keep every fact, name, date, claim number and dollar amount exactly as written. Do not add facts, amounts, advice or promises. Keep it under 120 words and keep the line breaks.`,
      prompt: draft,
      tool: { name: 'edited', description: 'The edited text.', schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
      maxTokens: 600,
    });
    const text = isRec(out) && typeof out.text === 'string' ? out.text.trim() : '';
    const cents = (ns: number[]) => new Set(ns.map((n) => Math.round(n * 100)));
    const got = cents(dollarsIn(text));
    const want = cents(allowed);
    const same = got.size === want.size && [...want].every((n) => got.has(n));
    if (text && same) return { text, source: 'model' };
  } catch (err) {
    console.warn(`polish (${purpose}) failed, using the draft`, err);
  }
  return { text: draft, source: 'template' };
}
