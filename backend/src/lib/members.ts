// Members who signed up themselves (Cognito email + password): the sign-up record lives at MEMBER#<id> / SEED.
// A "key" names one member everywhere in the backend: a demo persona id ('dale') or a self-signed-up member id
// ('U-3F9A1C2E77'). `memberOf(key)` turns either into the same persona-shaped Member.
import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { EMPLOYER, isUserMemberId, memberFromRecord, type Member, type MemberPlanId, type MemberRecord } from '../../../src/data/members';
import { isPersonaId, PERSONAS } from '../../../src/data/personas';
import dentists from '../../../src/fixtures/dentists.json';
import { db } from './db';

const TABLE = process.env.TABLE_NAME ?? '';
const today = () => new Date().toISOString().slice(0, 10);

export const isMemberKey = (key: string) => isPersonaId(key) || isUserMemberId(key);

const lifestyleSchema = z.object({
  brushing: z.enum(['once', 'twice', 'more']),
  flossing: z.enum(['daily', 'sometimes', 'rarely']),
  sugaryDrinks: z.enum(['rarely', 'daily', 'several']),
  tobacco: z.boolean(),
  grinding: z.enum(['no', 'yes', 'unsure']),
  bleedingGums: z.boolean(),
  dryMouth: z.boolean(),
});

/** The onboarding survey (engine `PlanPreferences`); unknown keys are dropped, never stored. */
export const surveySchema = z.object({
  plannedWork: z.string().max(1000).optional(),
  lastCleaning: z.enum(['recent', 'sixToTwelveMonths', 'overAYear', 'unknown']).optional(),
  covered: z.enum(['self', 'partner', 'children', 'family']).optional(),
  movesFrequently: z.boolean().optional(),
  surveyCompleted: z.boolean().optional(),
  lastYear: z.enum(['underused', 'some', 'hitMax', 'unknown']).optional(),
  goals: z.array(z.enum(['wisdomTeeth', 'braces', 'implant', 'crown', 'none'])).max(5).optional(),
  lifestyle: lifestyleSchema.optional(),
});

export const newMemberSchema = z.object({
  name: z.string().trim().min(1).max(60),
  planId: z.enum(['acme-basic', 'acme-low', 'acme-high'] satisfies MemberPlanId[]),
  survey: surveySchema,
  currentDentistId: z.string().refine((id) => dentists.dentists.some((d) => d.id === id), 'unknown dentist').optional(),
});

export const habitsSchema = z.object({ twiceDailyRate: z.number().min(0).max(1), days: z.number().int().min(0).max(400) });

/** Pure: a validated sign-up body + who is signed in → the record to store. A re-POST keeps `createdAt` and habits. */
export function recordFromInput(
  input: z.infer<typeof newMemberSchema>,
  caller: { memberId: string; email?: string },
  asOf: string,
  prev?: MemberRecord,
): MemberRecord {
  return {
    memberId: caller.memberId,
    name: input.name,
    email: caller.email ?? prev?.email ?? '',
    employer: EMPLOYER,
    createdAt: prev?.createdAt ?? asOf,
    currentDentistId: input.currentDentistId ?? prev?.currentDentistId ?? 'd01',
    planId: input.planId,
    survey: input.survey,
    ...(prev?.habits && { habits: prev.habits }),
  };
}

export const DEFAULT_NAME = 'Member';

/** Before the survey is saved a signed-up member still gets a working (empty-survey) profile. */
export const defaultRecord = (memberId: string, email = ''): MemberRecord => ({
  memberId,
  name: DEFAULT_NAME,
  email,
  employer: EMPLOYER,
  createdAt: today(),
  currentDentistId: 'd01',
  planId: 'acme-low',
  survey: {},
});

export async function getRecord(memberId: string): Promise<MemberRecord | undefined> {
  const res = await db.send(new GetCommand({ TableName: TABLE, Key: { pk: `MEMBER#${memberId}`, sk: 'SEED' } }));
  if (!res.Item) return undefined;
  const { pk: _pk, sk: _sk, ...record } = res.Item;
  return record as MemberRecord;
}

export async function putRecord(record: MemberRecord) {
  await db.send(new PutCommand({ TableName: TABLE, Item: { pk: `MEMBER#${record.memberId}`, sk: 'SEED', ...record } }));
  return record;
}

export const deleteRecord = (memberId: string) => db.send(new DeleteCommand({ TableName: TABLE, Key: { pk: `MEMBER#${memberId}`, sk: 'SEED' } }));

/** The carrier knows members by member id ('M-10456' / 'U-…'); undefined for an id Ting doesn't serve. */
export async function memberByMemberId(memberId: string): Promise<Member | undefined> {
  const persona = Object.values(PERSONAS).find((p) => p.memberId === memberId);
  if (persona) return persona;
  return isUserMemberId(memberId) ? memberOf(memberId) : undefined;
}

/** A persona id or a `U-` member id → the member. Persona keys are synchronous data; `U-` keys read the stored record. */
export async function memberOf(key: string, fallback: { email?: string } = {}): Promise<Member> {
  if (isPersonaId(key)) return PERSONAS[key];
  if (!isUserMemberId(key)) throw new Error('unknown member key');
  return memberFromRecord((await getRecord(key)) ?? defaultRecord(key, fallback.email));
}
