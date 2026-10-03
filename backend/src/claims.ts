// EventBridge target: a "claim adjudicated" event lands in the ledger and goes to the member's open dashboards.
import type { EventBridgeEvent } from 'aws-lambda';
import { claimEventSchema } from '../../src/engine/ledger';
import { putClaim } from './lib/db';
import { pushToMember } from './lib/push';

const WS_ENDPOINT = process.env.WS_ENDPOINT ?? '';

export async function handler(event: EventBridgeEvent<'claim.adjudicated', unknown>) {
  const parsed = claimEventSchema.safeParse(event.detail);
  if (!parsed.success) {
    console.warn('rejected claim event', parsed.error.issues);
    return { ok: false };
  }
  const claim = parsed.data;
  await putClaim(claim.member, claim);
  const sent = await pushToMember(WS_ENDPOINT, claim.member, claim);
  console.log(JSON.stringify({ claimId: claim.claimId, member: claim.member, pushedTo: sent }));
  return { ok: true, pushedTo: sent };
}
