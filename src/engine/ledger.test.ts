import { describe, expect, it } from 'vitest';
import { DEMO_CLAIM_EVENT, DEMO_PROFILE } from '../data/demo';
import { applyClaim } from './ledger';

describe('claims feed → ledger', () => {
  it('updates the max from the EOB, completes the root canal, unblocks the buildup', () => {
    const r = applyClaim(DEMO_PROFILE, DEMO_CLAIM_EVENT);
    expect(r.completed).toEqual(['rc19']);
    expect(r.profile.ledger.maxUsed).toBe(1100); // 1500 − 400 remaining
    expect(r.profile.procedures.find((p) => p.id === 'rc19')).toBeUndefined();
    expect(r.profile.procedures.find((p) => p.id === 'bu19')?.dependsOn).toEqual([]);
    expect(r.checks).toEqual([{ id: 'rc19', estimated: 200, actual: 200, mismatch: false }]);
  });

  it('is idempotent per claim id', () => {
    const once = applyClaim(DEMO_PROFILE, DEMO_CLAIM_EVENT).profile;
    const twice = applyClaim(once, DEMO_CLAIM_EVENT);
    expect(twice.duplicate).toBe(true);
    expect(twice.profile).toBe(once);
  });

  it('flags an EOB that differs from the estimate by over $25', () => {
    const event = { ...DEMO_CLAIM_EVENT, lines: [{ ...DEMO_CLAIM_EVENT.lines[0], planPaid: 700, memberOwes: 300 }] };
    expect(applyClaim(DEMO_PROFILE, event).checks[0].mismatch).toBe(true);
  });

  it('rejects malformed events at the boundary', () => {
    expect(() => applyClaim(DEMO_PROFILE, { ...DEMO_CLAIM_EVENT, lines: [] })).toThrow();
    expect(() => applyClaim(DEMO_PROFILE, { ...DEMO_CLAIM_EVENT, serviceDate: 'Oct 14' })).toThrow();
  });
});
