import { describe, expect, it } from 'vitest';
import { memberFromRecord, type MemberRecord } from '../../../src/data/members';
import { PERSONAS } from '../../../src/data/personas';
import { seedRecords } from './carrierModel';

const ASOF = '2026-10-04';
const record: MemberRecord = {
  memberId: 'U-0123456789',
  name: 'Sam',
  email: 'sam@example.com',
  employer: 'Acme Manufacturing',
  createdAt: ASOF,
  currentDentistId: 'd01',
  planId: 'acme-high',
  survey: { lastCleaning: 'recent', covered: 'family', surveyCompleted: true },
};

describe('seedRecords', () => {
  it('keeps the demo personas as they were', () => {
    const dale = seedRecords(PERSONAS.dale, ASOF);
    expect(dale.member).toMatchObject({ memberId: 'M-10456', subscriberId: 'S-10456', employeeId: 'E1001', dependents: [] });
    expect(dale.claims.length).toBeGreaterThan(0);
    expect(seedRecords(PERSONAS.priya, ASOF).member.dependents).toHaveLength(2);
  });

  it('builds a signed-up member from their own record: plan, tier, derived employee id, no seed claims', () => {
    const sam = seedRecords(memberFromRecord(record), ASOF);
    expect(sam.member).toMatchObject({
      memberId: 'U-0123456789',
      subscriberId: 'S-0123456789',
      firstName: 'Sam',
      employeeId: 'E6789',
      planId: 'acme-high',
      coverageTier: 'Whole family',
      dependents: [],
    });
    expect(sam.plan.id).toBe('acme-high');
    // Their history is what they told us ("user"), not carrier claims.
    expect(sam.claims).toEqual([]);
    expect(sam.accumulators).toMatchObject({ memberId: 'U-0123456789', planYear: 2026 });
  });
});
