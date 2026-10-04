// The carrier database's change stream: a newly adjudicated claim becomes Ting's live "claim adjudicated" event
// (ledger, sockets, the app's profile); a plan change or a denial becomes an urgent email.
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { DynamoDBStreamEvent } from 'aws-lambda';
import type { CarrierClaim, CarrierMember } from './lib/carrierModel';
import { logInfo } from './lib/log';
import { memberByMemberId } from './lib/members';
import { sendUrgent } from './lib/notify';
import { pushToMember } from './lib/push';

const BUS = process.env.EVENT_BUS ?? '';
const WS_ENDPOINT = process.env.WS_ENDPOINT ?? '';
const events = new EventBridgeClient({});

export async function handler(event: DynamoDBStreamEvent) {
  for (const rec of event.Records) {
    const img = rec.dynamodb?.NewImage ? (unmarshall(rec.dynamodb.NewImage as never) as Record<string, unknown>) : undefined;
    const old = rec.dynamodb?.OldImage ? (unmarshall(rec.dynamodb.OldImage as never) as Record<string, unknown>) : undefined;
    if (!img) continue;
    const sk = String(img.sk);
    if (sk.startsWith('CLAIM#')) {
      const claim = img as unknown as CarrierClaim;
      if (claim.origin === 'seed' || (old && old.status === claim.status)) continue;
      if (claim.status === 'adjudicated') {
        await events.send(
          new PutEventsCommand({
            Entries: [
              {
                EventBusName: BUS,
                Source: 'lincoln.claims',
                DetailType: 'claim.adjudicated',
                Detail: JSON.stringify({
                  type: 'claim.adjudicated',
                  member: claim.memberId,
                  claimId: claim.claimId,
                  serviceDate: claim.serviceDate,
                  provider: {
                    npi: claim.providerNpi,
                    inNetwork: claim.inNetwork,
                  },
                  lines: claim.lines.map((l) => ({
                    cdt: l.cdt,
                    tooth: l.tooth,
                    billed: l.billed,
                    allowed: l.allowed,
                    planPaid: l.planPaid,
                    memberOwes: l.memberOwes,
                  })),
                  rulesVersion: claim.rulesVersion,
                }),
              },
            ],
          }),
        );
        logInfo('carrier.claim_synced');
      } else if (claim.status === 'denied') {
        // A demo persona or a member who signed up; any other id isn't one of ours.
        const who = await memberByMemberId(claim.memberId);
        if (who)
          await sendUrgent(
            who,
            `Your insurer denied a claim from ${claim.serviceDate}`,
            [`Claim ${claim.claimId} was denied.`],
            ['Open Ting to see why and draft a message to your insurer.'],
          );
      }
    } else if (sk === 'PROFILE' && old) {
      const m = img as unknown as CarrierMember & { planChangedAt?: string };
      const who = await memberByMemberId(m.memberId);
      if (who && old.planId !== m.planId) {
        if (WS_ENDPOINT)
          await pushToMember(WS_ENDPOINT, m.memberId, {
            type: 'profile.updated',
          });
        // A demo reset rewrites the profile without planChangedAt; only a real change emails the member.
        if (m.planChangedAt && m.planChangedAt !== old.planChangedAt)
          await sendUrgent(
            who,
            'Your dental plan changed',
            [
              `Your insurer's records now show you on ${m.planId} (was ${String(old.planId)}).`,
              'Every estimate and your schedule were recalculated for the new plan.',
            ],
            [
              'Check that this change was expected; if not, contact your benefits team.',
              'Review your schedule in Ting: coverage percentages and waiting periods may differ.',
            ],
          );
      }
      if (who && !old.termDate && m.termDate)
        await sendUrgent(who, 'Your dental coverage is ending', [`Coverage ends ${m.termDate}.`], ['Book covered work before then.']);
    }
  }
  return { ok: true };
}
