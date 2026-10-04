import { describe, expect, it } from 'vitest';
import { describeRemoved, redactPhi } from './phi';

const EOB = `Explanation of Benefits
Patient: Jordan A. Rivera   Member ID: M-20981
Date of birth: 04/12/2001
123 Elm Street, Apt 4, Greensboro NC 27401
Phone (336) 555-0142  jordan.rivera@example.com  SSN 123-45-6789
Claim 2026-0311  Date of service 03/11/2026
D7240  #17  Removal of impacted tooth  Billed $520.00  Allowed $410.00  Plan paid $328.00  You owe $82.00`;

describe('redactPhi', () => {
  it('removes direct identifiers and keeps what the plan math needs', () => {
    const r = redactPhi(EOB);
    for (const gone of ['Jordan A. Rivera', 'M-20981', '04/12/2001', '123 Elm Street', '555-0142', 'jordan.rivera@example.com', '123-45-6789'])
      expect(r.text).not.toContain(gone);
    for (const kept of ['D7240', '#17', '03/11/2026', '$520.00', '$328.00', 'Greensboro'])
      expect(r.text).toContain(kept);
    expect(r.text).toContain('Patient: [PATIENT NAME]');
    expect(r.text).toContain('Member ID: [MEMBER ID]');
    expect(r.removed).toMatchObject({ name: 1, memberId: 1, birthDate: 1, address: 1, phone: 1, email: 1, ssn: 1 });
    expect(describeRemoved(r)).toMatch(/^Removed before the AI read it: /);
  });

  it('also removes names and ids Ting already knows, wherever they appear', () => {
    const r = redactPhi('Hi, this is Dale. Dale Smith had a root canal on #19. Ref M-10456.', { names: ['Dale Smith'], ids: ['M-10456'] });
    expect(r.text).toBe('Hi, this is [PATIENT NAME]. [PATIENT NAME] had a root canal on #19. Ref [MEMBER ID].');
  });

  it('leaves a document without identifiers unchanged', () => {
    const text = 'Crown on #30, D2740, $1,450. Root canal D3330 $1,180.';
    expect(redactPhi(text)).toEqual({ text, removed: {} });
  });
});
