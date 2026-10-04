// EventBridge target: a "claim adjudicated" event lands in the ledger and goes to the member's open dashboards.
import type { EventBridgeEvent } from 'aws-lambda';
import { claimEventSchema } from '../../src/engine/ledger';
import { putClaim } from './lib/db';
import { logInfo, logWarn } from './lib/log';
import { pushToMember } from './lib/push';

const WS_ENDPOINT = process.env.WS_ENDPOINT ?? '';

export async function handler(event: EventBridgeEvent<'claim.adjudicated', unknown>) {
  const parsed = claimEventSchema.safeParse(event.detail);
  if (!parsed.success) {
    logWarn('claims.rejected_event');
    return { ok: false };
  }
  const claim = parsed.data;
  await putClaim(claim.member, claim);
  const sent = await pushToMember(WS_ENDPOINT, claim.member, claim);
  logInfo('claims.stored', { pushedTo: sent });
  return { ok: true, pushedTo: sent };
}
