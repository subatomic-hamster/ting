// HIPAA de-identification at the model boundary. Whatever leaves our code for Bedrock or Winnow goes through
// `redactPhi` first (src/engine/phi.ts); the original text stays in this process for the deterministic parsers.
// The member's own name and member id are always removed, wherever they appear.
import { redactPhi, type PhiKind, type Redaction } from '../../../src/engine/phi';
import type { Decide } from '../ai/winnow';
import type { CallModel } from '../ai/model';
import { DEFAULT_NAME } from './members';

export interface Known {
  names: string[];
  ids: string[];
}

/** The placeholder name of a member who hasn't saved the survey is a common word ("Member"); it isn't redacted. */
export const knownOf = (m: { name: string; memberId: string }): Known => ({ names: m.name === DEFAULT_NAME ? [] : [m.name], ids: [m.memberId] });

export interface Deidentified {
  text: string;
  removed: Partial<Record<PhiKind, number>>;
  /** First 600 characters of the de-identified text: what the model actually saw. */
  preview: string;
}

export function deidentify(text: string, known: Known): Deidentified {
  const r: Redaction = redactPhi(text, known);
  return { text: r.text, removed: r.removed, preview: r.text.slice(0, 600) };
}

/** The shape stored on a received document and returned with a read one. */
export const summaryOf = (d: Deidentified) => ({ removed: d.removed, preview: d.preview });

const deepRedact = (v: unknown, known: Known): unknown =>
  typeof v === 'string'
    ? redactPhi(v, known).text
    : Array.isArray(v)
      ? v.map((x) => deepRedact(x, known))
      : typeof v === 'object' && v !== null
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepRedact(x, known)]))
        : v;

/** A Winnow client that never sees an identifier: every string in the state and the questions is redacted. */
export const deidentifiedDecide =
  (decide: Decide, known: Known): Decide =>
  (state, questions) =>
    decide(deepRedact(state, known) as typeof state, deepRedact(questions, known) as typeof questions);

/** A model client whose prompt is redacted (the system prompt is ours and static). */
export const deidentifiedModel =
  (call: CallModel, known: Known): CallModel =>
  (req) =>
    call({ ...req, prompt: redactPhi(req.prompt, known).text });
