// Explanations: the model rewrites the engine's template sentences in plainer words. Any sentence with a
// dollar figure the engine didn't produce is replaced by the template, so every number stays the engine's.
import { dollarsIn, explainLine, verifyNumbers, type ExplainedStep } from '../../../src/engine/explain';
import type { AdjudicatedLine } from '../../../src/engine/types';
import { isRec, type CallModel } from './model';

const SYSTEM = `You rewrite sentences that explain a dental insurance estimate so a patient with no insurance knowledge understands them.
Rules:
- One sentence per input sentence, same order, same meaning.
- Keep every dollar amount exactly as written (same digits, cents and $ sign). Do not add, remove, compute or round any amount.
- Plain words, at most 30 words per sentence, no jargon unless the input uses it, no advice.`;

const TOOL = {
  name: 'plain_sentences',
  description: 'The rewritten sentences, one per input sentence, in order.',
  schema: {
    type: 'object',
    properties: { sentences: { type: 'array', items: { type: 'string' } } },
    required: ['sentences'],
  },
};

export async function explainWithModel(
  line: AdjudicatedLine,
  call: CallModel,
): Promise<(ExplainedStep & { source: 'model' | 'template' })[]> {
  const steps = explainLine(line);
  let sentences: unknown[] = [];
  try {
    const out = await call({
      model: 'fast',
      system: SYSTEM,
      prompt: steps.map((s, i) => `${i + 1}. ${s.text}`).join('\n'),
      tool: TOOL,
      maxTokens: 1200,
    });
    if (isRec(out) && Array.isArray(out.sentences)) sentences = out.sentences;
  } catch (err) {
    console.warn('explain: model call failed, using templates', err);
  }
  return steps.map((step, i) => {
    const text = typeof sentences[i] === 'string' ? sentences[i].trim() : '';
    // Every amount must be the engine's, and none of the template's amounts may go missing.
    const kept = dollarsIn(step.text).every((n) => dollarsIn(text).includes(n));
    return text && kept && verifyNumbers(text, line).ok ? { ...step, text, source: 'model' } : { ...step, source: 'template' };
  });
}
