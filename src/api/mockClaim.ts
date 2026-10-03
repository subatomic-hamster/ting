import { topoOrder, evaluateSchedule } from '../engine/schedule';
import type { ClaimEvent } from '../engine/ledger';
import type { Profile } from '../engine/types';

/** Lincoln adjudicates the next certain procedure today, exactly as the engine estimated it. */
export function mockClaimEvent(profile: Profile, member: string): ClaimEvent {
  const next = topoOrder(profile.procedures).find((p) => (p.likelihood ?? 1) >= 1);
  if (!next) throw new Error('No planned procedure to claim');
  const [line] = evaluateSchedule({ ...profile, procedures: [next] }, [{ id: next.id, date: profile.asOf }]).lines;
  return {
    type: 'claim.adjudicated',
    member,
    claimId: `CLM-${Date.now().toString(36).toUpperCase()}`,
    serviceDate: profile.asOf,
    provider: { npi: 'demo-0042', inNetwork: next.inNetwork },
    lines: [{ cdt: line.cdt, tooth: line.tooth, billed: line.billed, allowed: line.allowed, planPaid: line.planPaid, memberOwes: line.memberOwes }],
    rulesVersion: line.rulesVersion,
  };
}
