import { beforeEach, expect, it, vi } from 'vitest';
import { PERSONAS } from './data/personas';
import { selectActive, useAppStore } from './store';

vi.mock('./lib/drafts', () => ({ readDraft: vi.fn(), saveDraft: vi.fn() }));

beforeEach(() => {
  useAppStore.getState().reset();
  useAppStore.setState({ profile: PERSONAS.dale.profile('2026-10-04') });
  expect(useAppStore.getState().moveProcedure('cr30', '2027-02-15').ok).toBe(true);
});
const checkDate = () => {
  const active = selectActive(useAppStore.getState());
  expect(active.kind).toBe('custom');
  expect(active.placements.find(p => p.id === 'cr30')?.date).toBe('2027-02-15');
  expect(active.placements.some(p => p.id === 'clean')).toBe(false);
};
it('keeps a chosen crown date when a later claim completes the cleaning', () => {
  useAppStore.getState().applyClaim({
    type: 'claim.adjudicated', member: 'M-10456', claimId: 'late-replay', serviceDate: '2026-10-04',
    provider: { npi: 'test-provider', inNetwork: true }, rulesVersion: useAppStore.getState().profile.currentPlan.version,
    lines: [{ cdt: 'D1110', billed: 120, allowed: 85, planPaid: 85, memberOwes: 0 }],
  });
  checkDate();
  useAppStore.getState().mergeServerProfile(PERSONAS.dale.profile('2026-10-04'));
  checkDate();
});
it('keeps dates for remaining procedures when a server refresh removes completed work', () => {
  const server = PERSONAS.dale.profile('2026-10-04');
  server.procedures = server.procedures.filter(p => p.id !== 'clean');
  useAppStore.getState().mergeServerProfile(server);
  checkDate();
});
it('still chooses a complete schedule when new work has no custom date', () => {
  const server = PERSONAS.dale.profile('2026-10-04');
  server.procedures.push({ id: 'email-new-filling', cdt: 'D2392', fee: 220, inNetwork: true });
  useAppStore.getState().mergeServerProfile(server);
  const active = selectActive(useAppStore.getState());
  expect(active.placements).toHaveLength(server.procedures.length);
  expect(active.kind).toBe('cheapest');
});
