// F6 digests: per-member preferences, and the daily rule sends whichever digests are due.
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { isPersonaId, PERSONAS, type PersonaId } from '../../../src/data/personas';
import { buildDigest, digestDue, PRIVATE_DIGEST, type Digest } from '../../../src/engine/digest';
import { optimize } from '../../../src/engine/schedule';
import { polish } from '../ai/polish';
import { callBedrock } from './bedrock';
import { db } from './db';
import { pushToMember } from './push';

const TABLE = process.env.TABLE_NAME ?? '';
const REMINDER_EMAIL = process.env.REMINDER_EMAIL ?? '';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? '';
const WS_ENDPOINT = process.env.WS_ENDPOINT ?? '';
const ses = new SESv2Client({});

export const prefsSchema = z.object({ cadence: z.enum(['weekly', 'monthly', 'off']), detail: z.enum(['private', 'detailed']) });
export type Prefs = z.infer<typeof prefsSchema>;
export const DEFAULT_PREFS: Prefs = { cadence: 'monthly', detail: 'private' };

export async function getPrefs(member: string): Promise<Prefs> {
  const res = await db.send(new GetCommand({ TableName: TABLE, Key: { pk: `MEMBER#${member}`, sk: 'PREFS' } }));
  const parsed = prefsSchema.safeParse(res.Item?.prefs);
  return parsed.success ? parsed.data : DEFAULT_PREFS;
}

export async function putPrefs(member: string, personaId: PersonaId, prefs: Prefs) {
  // gsi1 lists every member with preferences, so the daily rule can find whose digest is due.
  await db.send(new PutCommand({ TableName: TABLE, Item: { pk: `MEMBER#${member}`, sk: 'PREFS', gsi1pk: 'PREFS', gsi1sk: member, member, personaId, prefs } }));
  return prefs;
}

/** The engine's digest for a member as of a date, reworded by the model only if every amount survives. */
export async function digestFor(personaId: PersonaId, asOf: string): Promise<Digest & { source: 'model' | 'template' }> {
  const profile = PERSONAS[personaId].profile(asOf);
  const digest = buildDigest(profile, optimize(profile, { horizon: 2 }).cheapest);
  const { text, source } = await polish(digest.body, digest.amounts, callBedrock, 'monthly dental benefits summary');
  return { ...digest, body: text, source };
}

async function email(subject: string, body: string) {
  if (!REMINDER_EMAIL) return false;
  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: REMINDER_EMAIL,
      Destination: { ToAddresses: [REMINDER_EMAIL] },
      Content: { Simple: { Subject: { Data: subject }, Body: { Text: { Data: `${body}\n\n${WEB_ORIGIN}` } } } },
    }),
  );
  return true;
}

/** Sends one member's digest now: content-free unless they chose detailed emails. */
export async function sendDigest(member: string, personaId: PersonaId, prefs: Prefs, asOf: string) {
  const digest = await digestFor(personaId, asOf);
  const out = prefs.detail === 'detailed' ? { title: digest.title, body: digest.body } : PRIVATE_DIGEST;
  const pushedTo = WS_ENDPOINT ? await pushToMember(WS_ENDPOINT, member, { type: 'digest', title: PRIVATE_DIGEST.title }) : 0;
  let emailed = false;
  try {
    emailed = await email(out.title, out.body);
  } catch (err) {
    console.warn('digest email failed', member, err);
  }
  return { member, digest, emailed, pushedTo, private: prefs.detail !== 'detailed' };
}

export async function deliverDigests(asOf: string) {
  const res = await db.send(
    new QueryCommand({ TableName: TABLE, IndexName: 'gsi1', KeyConditionExpression: 'gsi1pk = :p', ExpressionAttributeValues: { ':p': 'PREFS' } }),
  );
  const sent = [];
  for (const item of res.Items ?? []) {
    const prefs = prefsSchema.safeParse(item.prefs);
    const personaId = String(item.personaId);
    if (!prefs.success || !isPersonaId(personaId) || !digestDue(prefs.data.cadence, asOf)) continue;
    sent.push(await sendDigest(String(item.member), personaId, prefs.data, asOf));
  }
  return sent;
}
