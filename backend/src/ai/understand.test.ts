import { describe, expect, it } from 'vitest';
import { validateRecord } from './understand';

const EOB = `Acme Dental — Explanation of Benefits. Claim C-2026-10-0412. Date of service 10/14/2026.
D3330 Root canal, molar, tooth 19. Billed $1,180.00 Allowed $1,000.00 Plan paid $800.00 You owe $200.00`;

describe('validateRecord', () => {
  it('keeps real codes and amounts that appear in the document', () => {
    const r = validateRecord(
      {
        docType: 'eob',
        summary: 'Root canal processed.',
        claimNumber: 'C-2026-10-0412',
        procedures: [
          {
            description: 'Root canal, molar',
            cdt: 'D3330',
            tooth: 19,
            status: 'completed',
            urgency: 'routine',
            serviceDate: '2026-10-14',
            billed: 1180,
            allowed: 1000,
            planPaid: 800,
            memberOwes: 200,
          },
        ],
        amounts: [{ label: 'You owe', amount: 200 }],
        followUps: [],
      },
      EOB,
    );
    expect(r.procedures[0]).toMatchObject({
      cdt: 'D3330',
      tooth: 19,
      planPaid: 800,
      memberOwes: 200,
      serviceDate: '2026-10-14',
    });
  });

  it('drops invented amounts and re-derives a made-up code from the words', () => {
    const r = validateRecord(
      {
        docType: 'eob',
        summary: 's',
        procedures: [
          {
            description: 'root canal on a molar',
            cdt: 'D9999',
            tooth: 19,
            status: 'completed',
            urgency: 'routine',
            planPaid: 950,
          },
        ],
        amounts: [{ label: 'x', amount: 5000 }],
        followUps: [],
      },
      EOB,
    );
    expect(r.procedures[0].cdt).toBe('D3330');
    expect(r.procedures[0].planPaid).toBeUndefined();
    expect(r.amounts).toEqual([]);
  });

  it('falls back safely on junk', () => {
    const r = validateRecord('nonsense', 'hello');
    expect(r).toMatchObject({ docType: 'other', procedures: [], amounts: [] });
  });
});
