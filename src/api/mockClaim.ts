import { deductibleAfter } from '../engine/localAgent';
import { topoOrder, evaluateSchedule } from '../engine/schedule';
import type { ClaimEvent } from '../engine/ledger';
import type { Profile } from '../engine/types';
import { useAppStore } from '../store';

/**
 * A past service from an EOB (uploaded or emailed) goes on the member's ledger through the store's claim path, so the
 * annual max used moves, matching planned work is marked done, and a reload or demo time jump replays it. The EOB's own
 * deductible is added on top. Idempotent per claim id.
 */
export function recordPastClaim(event: ClaimEvent, eobDeductible: number): 'recorded' | 'duplicate' {
  const before = useAppStore.getState().profile;
  if (before.ledger.history.some((h) => h.claimId === event.claimId)) return 'duplicate';
  useAppStore.getState().applyClaim(event);
  const after = useAppStore.getState().profile;
  if (after === before) return 'duplicate';
  const met = deductibleAfter(after.currentPlan, before.ledger, after.ledger.deductibleMet, event.serviceDate, eobDeductible);
  if (met !== after.ledger.deductibleMet) useAppStore.setState({ profile: { ...after, ledger: { ...after.ledger, deductibleMet: met } } });
  return 'recorded';
}

/**
 * Lincoln adjudicates the next certain procedure today, exactly as the engine estimated it.
 * `underpay` makes Lincoln pay less than estimated, to demo the EOB check.
 */
export function mockClaimEvent(profile: Profile, member: string, underpay = 0): ClaimEvent {
  const next = topoOrder(profile.procedures).find((p) => (p.likelihood ?? 1) >= 1);
  if (!next) throw new Error('No planned procedure to claim');
  const [line] = evaluateSchedule({ ...profile, procedures: [next] }, [{ id: next.id, date: profile.asOf }]).lines;
  return {
    type: 'claim.adjudicated',
    member,
    claimId: `CLM-${Date.now().toString(36).toUpperCase()}`,
    serviceDate: profile.asOf,
    provider: { npi: 'demo-0042', inNetwork: next.inNetwork },
    lines: [
      {
        cdt: line.cdt,
        tooth: line.tooth,
        billed: line.billed,
        allowed: line.allowed,
        planPaid: Math.max(0, line.planPaid - underpay),
        memberOwes: line.memberOwes + Math.min(underpay, line.planPaid),
      },
    ],
    rulesVersion: line.rulesVersion,
  };
}
