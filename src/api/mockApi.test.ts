import { describe, expect, it } from 'vitest';
import { PERSONAS } from '../data/personas';
import { applyClaim } from '../engine/ledger';
import { mockApi } from './mockApi';

describe('mock API', () => {
  it('reads a description with the intake parser', async () => {
    const items = await mockApi.parseDescription('Root canal on #19 and a crown on 19');
    expect(items.map((i) => i.candidates[0].cdt)).toEqual(['D3330', 'D2740']);
    expect(items[0].teeth[0].tooth).toBe(19);
  });

  it('emits a claim the ledger accepts and that matches the estimate', async () => {
    const profile = PERSONAS.dale.profile('2026-10-05');
    const events: unknown[] = [];
    const stop = mockApi.subscribeLedger((e) => events.push(e));
    await mockApi.fireMockClaim(profile);
    stop();
    const update = applyClaim(profile, events[0]);
    expect(update.completed).toEqual(['rc19']);
    expect(update.checks[0].mismatch).toBe(false);
    expect(update.profile.ledger.maxUsed).toBeGreaterThan(profile.ledger.maxUsed);
  });
});
