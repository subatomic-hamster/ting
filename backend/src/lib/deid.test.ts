import { describe, expect, it, vi } from 'vitest';
import type { Decide } from '../ai/winnow';
import { deidentify, deidentifiedDecide, deidentifiedModel, knownOf } from './deid';

const known = knownOf({ name: 'Sam Rivera', memberId: 'U-0123456789' });
const DOC = 'Patient name: Sam Rivera\nMember ID: U-0123456789\nDOB: 03/04/1980\nsam@example.com 336-555-0142\nD3330 root canal #14 billed $1,180.00 on 2026-09-30';

describe('de-identification at the model boundary', () => {
  it('removes identifiers, keeps what the plan math needs, and reports counts without values', () => {
    const d = deidentify(DOC, known);
    expect(d.text).not.toMatch(/Rivera|Sam|U-0123456789|03\/04\/1980|sam@example|555-0142/);
    expect(d.text).toContain('D3330');
    expect(d.text).toContain('$1,180.00');
    expect(d.text).toContain('2026-09-30');
    expect(d.removed.email).toBe(1);
    expect(d.removed.phone).toBe(1);
    expect(JSON.stringify(d.removed)).not.toContain('Rivera');
    expect(d.preview).toBe(d.text.slice(0, 600));
  });

  it('the preview is at most 600 characters', () => expect(deidentify('x'.repeat(5000), known).preview).toHaveLength(600));

  it('the placeholder name of a member who has not finished sign-up is not treated as a name', () =>
    expect(knownOf({ name: 'Member', memberId: 'U-0123456789' }).names).toEqual([]));

  it('Winnow gets de-identified state and questions', async () => {
    const decide = vi.fn<Decide>().mockResolvedValue({ answers: {}, source: 'simulated' });
    await deidentifiedDecide(decide, known)({ document_text: DOC, nested: ['Sam Rivera'] }, { q: { type: 'noul', instructions: 'Is this for Sam Rivera?' } });
    const [state, questions] = decide.mock.calls[0];
    expect(JSON.stringify(state)).not.toMatch(/Rivera|sam@example|U-0123456789/);
    expect(JSON.stringify(questions)).not.toMatch(/Rivera/);
  });

  it('the model gets a de-identified prompt', async () => {
    const call = vi.fn().mockResolvedValue({});
    await deidentifiedModel(call, known)({ model: 'fast', system: 'sys', prompt: DOC, tool: { name: 't', description: '', schema: {} }, maxTokens: 1 });
    expect(call.mock.calls[0][0].prompt).not.toMatch(/Rivera|sam@example|U-0123456789/);
    expect(call.mock.calls[0][0].system).toBe('sys');
  });
});
