import { z } from 'zod';
import { round2 } from './adjudicate';
import { yearOf } from './dates';
import { evaluateSchedule } from './schedule';
import type { Profile } from './types';

// Lincoln "claim adjudicated" event: same shape from the mock feed and production EventBridge.
export const claimEventSchema = z.object({
  type: z.literal('claim.adjudicated'),
  member: z.string(),
  claimId: z.string(),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  provider: z.object({ npi: z.string(), inNetwork: z.boolean() }),
  lines: z
    .array(
      z.object({
        cdt: z.string().regex(/^D\d{4}$/),
        tooth: z.number().int().min(1).max(32).optional(),
        billed: z.number().nonnegative(),
        allowed: z.number().nonnegative(),
        planPaid: z.number().nonnegative(),
        memberOwes: z.number().nonnegative(),
      }),
    )
    .min(1),
  annualMaxRemaining: z.number().nonnegative().optional(),
  rulesVersion: z.string(),
});
export type ClaimEvent = z.infer<typeof claimEventSchema>;

/** An EOB that differs from Ting's estimate by more than this triggers the EOB check. */
export const EOB_MISMATCH = 25;

export interface ClaimUpdate {
  profile: Profile;
  /** Planned procedures this claim completed. */
  completed: string[];
  /** EOB vs estimate, per completed procedure. */
  checks: { id: string; estimated: number; actual: number; mismatch: boolean }[];
  duplicate: boolean;
}

/** Writes an adjudicated claim to the ledger and marks the matching planned work done. Idempotent per claimId. */
export function applyClaim(profile: Profile, raw: unknown): ClaimUpdate {
  const event = claimEventSchema.parse(raw);
  const { ledger } = profile;
  if (ledger.history.some((h) => h.claimId === event.claimId)) return { profile, completed: [], checks: [], duplicate: true };

  const completed: string[] = [];
  const checks: ClaimUpdate['checks'] = [];
  let deductible = 0;
  for (const line of event.lines) {
    const match = profile.procedures.find((p) => p.cdt === line.cdt && p.tooth === line.tooth && !completed.includes(p.id));
    if (!match) continue;
    completed.push(match.id);
    const estimate = evaluateSchedule({ ...profile, procedures: [match] }, [{ id: match.id, date: event.serviceDate }]).lines[0];
    deductible += estimate.deductibleApplied;
    const mismatch = Math.abs(estimate.memberOwes - line.memberOwes) > EOB_MISMATCH;
    checks.push({ id: match.id, estimated: estimate.memberOwes, actual: line.memberOwes, mismatch });
  }

  const sameYear = yearOf(event.serviceDate) === ledger.planYear;
  const paid = event.lines.reduce((s, l) => s + l.planPaid, 0);
  // The EOB is the source of truth for the max; fall back to adding up plan payments.
  const maxUsed =
    event.annualMaxRemaining !== undefined ? round2(profile.currentPlan.annualMax - event.annualMaxRemaining) : round2(ledger.maxUsed + paid);
  return {
    profile: {
      ...profile,
      ledger: {
        ...ledger,
        maxUsed: sameYear ? Math.max(ledger.maxUsed, maxUsed) : ledger.maxUsed,
        deductibleMet: sameYear ? round2(Math.min(profile.currentPlan.deductible.amount, ledger.deductibleMet + deductible)) : ledger.deductibleMet,
        history: [
          ...ledger.history,
          ...event.lines.map((l) => ({
            date: event.serviceDate,
            cdt: l.cdt,
            tooth: l.tooth,
            planPaid: l.planPaid,
            memberOwes: l.memberOwes,
            inNetwork: event.provider.inNetwork,
            source: 'claim' as const,
            claimId: event.claimId,
          })),
        ],
      },
      procedures: profile.procedures
        .filter((p) => !completed.includes(p.id))
        .map((p) => (p.dependsOn?.some((d) => completed.includes(d)) ? { ...p, dependsOn: p.dependsOn.filter((d) => !completed.includes(d)) } : p)),
    },
    completed,
    checks,
    duplicate: false,
  };
}
