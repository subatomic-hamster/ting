// The member's live profile, built on the server from the carrier's records and Ting's corpus, so every channel
// (the app, the email agent, the monthly overview) works from the same facts.
import { DEMO_PLAN_OPTIONS } from '../../../src/data/demo';
import type { Member } from '../../../src/data/members';
import { applyClaim, claimEventSchema } from '../../../src/engine/ledger';
import type { Profile } from '../../../src/engine/types';
import { carrierRecord } from './carrier';
import { plannedFor } from './corpus';
import { claimsFor } from './db';

/** `withClaims: false` leaves the ledger at the seed: the app replays claims from the feed itself, so it can check each EOB. */
export async function memberProfile(member: Member, asOf: string, withClaims = true): Promise<Profile> {
  let profile = member.profile(asOf);
  const [carrier, planned, claims] = await Promise.all([
    carrierRecord(member.memberId).catch(() => undefined),
    plannedFor(member.memberId).catch(() => []),
    withClaims ? claimsFor(member.memberId).catch(() => []) : [],
  ]);
  // The carrier's plan of record (it can change mid-year).
  const planId = carrier?.member?.planId;
  const plan = carrier?.plan ?? DEMO_PLAN_OPTIONS.find((p) => p.id === planId);
  if (plan && plan.id !== profile.currentPlan.id) profile = { ...profile, currentPlan: plan };
  // Procedures learned from emailed documents join the planned work.
  const known = new Set(profile.procedures.map((p) => p.id));
  profile = {
    ...profile,
    procedures: [...profile.procedures, ...planned.filter((p) => !known.has(p.id))],
  };
  // Claims adjudicated since the seed: the ledger moves and completed work leaves the plan (idempotent per claim).
  for (const raw of claims) {
    const parsed = claimEventSchema.safeParse(raw);
    if (parsed.success) profile = applyClaim(profile, parsed.data).profile;
  }
  return profile;
}
