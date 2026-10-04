// The carrier database (its own DynamoDB table with a change stream). Ting reads members, plans, accumulators and
// claims from it; a stream consumer (carrierSync.ts) turns new adjudicated claims and plan changes into events.
//   MEMBER#<id> PROFILE          enrollment (834-style)
//   MEMBER#<id> ACCUM#<year>     accumulators
//   MEMBER#<id> CLAIM#<claimId>  claim header + lines (837D / 835)
//   PLAN#<planId> CURRENT        benefit design
//   PROVIDER#<npi> META          provider directory
//   GROUP#<number> META          employer group
import { BatchWriteCommand, DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DEMO_PLAN_OPTIONS } from '../../../src/data/demo';
import type { Member } from '../../../src/data/members';
import { isPersonaId, PERSONAS, type PersonaId } from '../../../src/data/personas';
import type { PlanRules } from '../../../src/engine/types';
import { claimLine, GROUP_NUMBER, PROVIDERS, providerFor, seedRecords, totals, type Accumulators, type CarrierClaim, type CarrierMember } from './carrierModel';

const TABLE = process.env.CARRIER_TABLE ?? '';
export const carrierDb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const put = (Item: Record<string, unknown>) => carrierDb.send(new PutCommand({ TableName: TABLE, Item }));

export async function seedCarrier(asOf: string) {
  await put({
    pk: `GROUP#${GROUP_NUMBER}`,
    sk: 'META',
    groupNumber: GROUP_NUMBER,
    employer: 'Acme Manufacturing',
    planIds: ['acme-low', 'acme-high'],
  });
  for (const p of PROVIDERS) await put({ pk: `PROVIDER#${p.npi}`, sk: 'META', ...p });
  const plans = new Map<string, PlanRules>();
  for (const id of Object.keys(PERSONAS) as PersonaId[]) {
    const r = seedRecords(PERSONAS[id], asOf);
    plans.set(r.plan.id, r.plan);
    await writeSeed(r);
  }
  // Every plan the group offers, so a mid-year plan change has a plan of record to point at.
  for (const plan of DEMO_PLAN_OPTIONS.filter((p) => p.kind === 'insurance')) plans.set(plan.id, plan);
  for (const plan of plans.values()) await put({ pk: `PLAN#${plan.id}`, sk: 'CURRENT', plan });
  return {
    members: Object.keys(PERSONAS).length,
    providers: PROVIDERS.length,
    plans: plans.size,
  };
}

async function writeSeed(r: ReturnType<typeof seedRecords>) {
  await put({ pk: `MEMBER#${r.member.memberId}`, sk: 'PROFILE', ...r.member });
  await put({ pk: `MEMBER#${r.member.memberId}`, sk: `ACCUM#${r.accumulators.planYear}`, ...r.accumulators });
  for (const c of r.claims) await put({ pk: `MEMBER#${c.memberId}`, sk: `CLAIM#${c.claimId}`, ...c });
}

/** A member who signed up: Lincoln's enrollment record and accumulators for them. Safe to run again (it rewrites the seed). */
export async function seedMemberCarrier(member: Member, asOf: string) {
  const r = seedRecords(member, asOf);
  await writeSeed(r);
  // The plan of record, in case this carrier table was seeded before the plan existed (e.g. acme-basic).
  await put({ pk: `PLAN#${r.plan.id}`, sk: 'CURRENT', plan: r.plan });
  return r.member;
}

async function memberItems(memberId: string) {
  const res = await carrierDb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'pk = :p',
      ExpressionAttributeValues: { ':p': `MEMBER#${memberId}` },
    }),
  );
  return res.Items ?? [];
}

export async function carrierRecord(memberId: string) {
  const items = await memberItems(memberId);
  const member = items.find((i) => i.sk === 'PROFILE') as CarrierMember | undefined;
  const claims = items.filter((i) => String(i.sk).startsWith('CLAIM#')) as unknown as CarrierClaim[];
  const accumulators = items.filter((i) => String(i.sk).startsWith('ACCUM#')) as unknown as Accumulators[];
  const planItem = member
    ? await carrierDb.send(
        new GetCommand({
          TableName: TABLE,
          Key: { pk: `PLAN#${member.planId}`, sk: 'CURRENT' },
        }),
      )
    : undefined;
  return {
    member,
    claims: claims.sort((a, b) => (a.serviceDate < b.serviceDate ? -1 : 1)),
    accumulators,
    plan: planItem?.Item?.plan as PlanRules | undefined,
  };
}

export const memberForPersona = (personaId: string) => (isPersonaId(personaId) ? PERSONAS[personaId].memberId : undefined);

/**
 * A dentist visit as Lincoln's claims system records it: the claim arrives ("received"), then is adjudicated with
 * 835-style amounts and the accumulators move. The stream turns the adjudication into a live event for Ting.
 */
export async function recordVisit(input: {
  memberId: string;
  dentistId: string;
  serviceDate: string;
  inNetwork: boolean;
  rulesVersion: string;
  lines: {
    cdt: string;
    tooth?: number;
    billed: number;
    allowed: number;
    planPaid: number;
    deductibleApplied: number;
  }[];
  claimId?: string;
}) {
  const claimId = input.claimId ?? `CLM-${Date.now().toString(36).toUpperCase()}`;
  const provider = providerFor(input.dentistId);
  const lines = input.lines.map((l, i) => claimLine(i + 1, l.cdt, l.billed, l.allowed, l.planPaid, l.deductibleApplied, l.tooth));
  const base: CarrierClaim = {
    claimId,
    memberId: input.memberId,
    providerNpi: provider.npi,
    inNetwork: input.inNetwork,
    receivedDate: input.serviceDate,
    serviceDate: input.serviceDate,
    status: 'received',
    lines,
    totals: totals(lines),
    rulesVersion: input.rulesVersion,
    origin: 'visit',
  };
  await put({
    pk: `MEMBER#${input.memberId}`,
    sk: `CLAIM#${claimId}`,
    ...base,
  });
  // Adjudication: the claim is paid and the member's accumulators move.
  await put({
    pk: `MEMBER#${input.memberId}`,
    sk: `CLAIM#${claimId}`,
    ...base,
    status: 'adjudicated',
    adjudicatedDate: input.serviceDate,
    paymentMethod: 'EFT',
  });
  const year = Number(input.serviceDate.slice(0, 4));
  await carrierDb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: `MEMBER#${input.memberId}`, sk: `ACCUM#${year}` },
      UpdateExpression: 'ADD annualMaxUsed :paid, deductibleMet :ded SET memberId = :m, planYear = :y',
      ExpressionAttributeValues: {
        ':paid': base.totals.planPaid,
        ':ded': lines.reduce((s, l) => s + l.deductibleApplied, 0),
        ':m': input.memberId,
        ':y': year,
      },
    }),
  );
  return { claimId, provider: provider.name, totals: base.totals };
}

/** Plan change (e.g. a mid-year correction from the employer): the stream turns it into an urgent notice. */
export async function changePlan(memberId: string, planId: string) {
  await carrierDb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: `MEMBER#${memberId}`, sk: 'PROFILE' },
      UpdateExpression: 'SET planId = :p, planChangedAt = :t',
      ExpressionAttributeValues: {
        ':p': planId,
        ':t': new Date().toISOString(),
      },
    }),
  );
}

/** Demo reset: drops visits recorded during the demo and restores the seeded accumulators and plan. */
export async function resetMember(member: Member, asOf: string) {
  const seed = seedRecords(member, asOf);
  const items = await memberItems(seed.member.memberId);
  const visits = items.filter((i) => String(i.sk).startsWith('CLAIM#') && i.origin === 'visit');
  for (let i = 0; i < visits.length; i += 25)
    await carrierDb.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE]: visits.slice(i, i + 25).map((v) => ({ DeleteRequest: { Key: { pk: v.pk, sk: v.sk } } })),
        },
      }),
    );
  await put({
    pk: `MEMBER#${seed.member.memberId}`,
    sk: 'PROFILE',
    ...seed.member,
  });
  await put({
    pk: `MEMBER#${seed.member.memberId}`,
    sk: `ACCUM#${seed.accumulators.planYear}`,
    ...seed.accumulators,
  });
  return visits.length;
}

export const deleteCarrierItem = (pk: string, sk: string) => carrierDb.send(new DeleteCommand({ TableName: TABLE, Key: { pk, sk } }));
