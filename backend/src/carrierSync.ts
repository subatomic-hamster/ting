// The carrier database's change stream: a newly adjudicated claim becomes Ting's live "claim adjudicated" event
// (ledger, sockets, the app's profile); a plan change or a denial becomes an urgent email.
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { DynamoDBStreamEvent } from 'aws-lambda';
import { PERSONAS, type PersonaId } from '../../src/data/personas';
import type { CarrierClaim, CarrierMember } from './lib/carrierModel';
import { sendUrgent } from './lib/notify';
import { pushToMember } from './lib/push';

const BUS = process.env.EVENT_BUS ?? '';
const WS_ENDPOINT = process.env.WS_ENDPOINT ?? '';
const events = new EventBridgeClient({});

const personaOf = (memberId: string) => (Object.keys(PERSONAS) as PersonaId[]).find((p) => PERSONAS[p].memberId === memberId);

export async function handler(event: DynamoDBStreamEvent) {
  for (const rec of event.Records) {
    const img = rec.dynamodb?.NewImage ? (unmarshall(rec.dynamodb.NewImage as never) as Record<string, unknown>) : undefined;
    const old = rec.dynamodb?.OldImage ? (unmarshall(rec.dynamodb.OldImage as never) as Record<string, unknown>) : undefined;
    if (!img) continue;
    const sk = String(img.sk);
    if (sk.startsWith('CLAIM#')) {
      const claim = img as unknown as CarrierClaim;
      const persona = personaOf(claim.memberId);
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
        console.log(JSON.stringify({ synced: claim.claimId, member: claim.memberId }));
      } else if (claim.status === 'denied' && persona) {
        await sendUrgent(
          claim.memberId,
          persona,
          `Your insurer denied a claim from ${claim.serviceDate}`,
          [`Claim ${claim.claimId} was denied.`],
          ['Open Ting to see why and draft a message to your insurer.'],
        );
      }
    } else if (sk === 'PROFILE' && old) {
      const m = img as unknown as CarrierMember & { planChangedAt?: string };
      const persona = personaOf(m.memberId);
      if (persona && old.planId !== m.planId) {
        if (WS_ENDPOINT)
          await pushToMember(WS_ENDPOINT, m.memberId, {
            type: 'profile.updated',
          });
        // A demo reset rewrites the profile without planChangedAt; only a real change emails the member.
        if (m.planChangedAt && m.planChangedAt !== old.planChangedAt)
          await sendUrgent(
            m.memberId,
            persona,
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
      if (persona && !old.termDate && m.termDate)
        await sendUrgent(m.memberId, persona, 'Your dental coverage is ending', [`Coverage ends ${m.termDate}.`], ['Book covered work before then.']);
    }
  }
  return { ok: true };
}
