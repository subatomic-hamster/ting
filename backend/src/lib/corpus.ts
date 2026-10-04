// What Ting knows about a member beyond the carrier's records: documents they emailed (with everything extracted from
// them), procedures planned from those documents, their email address and notification settings.
//   MEMBER#<id>  DOC#<receivedAt>#<docId>   an emailed document and what Ting made of it
//   MEMBER#<id>  PLANNED#<procedureId>      a procedure learned from a document (dentist note, treatment plan)
//   MEMBER#<id>  CONTACT                    email address + notification settings
//   EMAIL#<addr> MEMBER                     who an address belongs to (members and their approved dentists)
import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { PlannedProcedure } from '../../../src/engine/types';
import type { PersonaId } from '../../../src/data/personas';
import { db } from './db';

const TABLE = process.env.TABLE_NAME ?? '';
const norm = (addr: string) =>
  addr
    .trim()
    .toLowerCase()
    .replace(/^.*<([^>]+)>.*$/, '$1');

export interface Contact {
  email: string;
  monthly: boolean;
  urgent: boolean;
  /** Detailed emails carry amounts and procedures; private ones only say there's an update. */
  detail: 'detailed' | 'private';
}

export async function setContact(member: string, personaId: PersonaId, contact: Contact) {
  const prev = await getContact(member);
  if (prev && norm(prev.email) !== norm(contact.email))
    await db.send(
      new DeleteCommand({
        TableName: TABLE,
        Key: { pk: `EMAIL#${norm(prev.email)}`, sk: 'MEMBER' },
      }),
    );
  // gsi1 lists every member with a contact address, for the monthly overview run.
  await db.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        pk: `MEMBER#${member}`,
        sk: 'CONTACT',
        ...contact,
        email: norm(contact.email),
        personaId,
        member,
        gsi1pk: 'CONTACT',
        gsi1sk: member,
      },
    }),
  );
  await db.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        pk: `EMAIL#${norm(contact.email)}`,
        sk: 'MEMBER',
        member,
        personaId,
        role: 'member',
      },
    }),
  );
  return { ...contact, email: norm(contact.email) };
}

export async function getContact(member: string): Promise<Contact | undefined> {
  const res = await db.send(
    new GetCommand({
      TableName: TABLE,
      Key: { pk: `MEMBER#${member}`, sk: 'CONTACT' },
    }),
  );
  return res.Item ? (res.Item as unknown as Contact) : undefined;
}

/** A dentist's office the member approved may email Ting about them directly. */
export async function approveDentistSender(member: string, personaId: PersonaId, address: string) {
  await db.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        pk: `EMAIL#${norm(address)}`,
        sk: 'MEMBER',
        member,
        personaId,
        role: 'dentist',
      },
    }),
  );
}

export async function memberByEmail(address: string): Promise<{ member: string; personaId: PersonaId; role: 'member' | 'dentist' } | undefined> {
  const res = await db.send(
    new GetCommand({
      TableName: TABLE,
      Key: { pk: `EMAIL#${norm(address)}`, sk: 'MEMBER' },
    }),
  );
  return res.Item
    ? (res.Item as unknown as {
        member: string;
        personaId: PersonaId;
        role: 'member' | 'dentist';
      })
    : undefined;
}

export async function putDoc(member: string, doc: Record<string, unknown> & { docId: string }) {
  const receivedAt = new Date().toISOString();
  await db.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        pk: `MEMBER#${member}`,
        sk: `DOC#${receivedAt}#${doc.docId}`,
        receivedAt,
        ...doc,
      },
    }),
  );
  return receivedAt;
}

async function byPrefix(member: string, prefix: string) {
  const res = await db.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'pk = :p and begins_with(sk, :s)',
      ExpressionAttributeValues: { ':p': `MEMBER#${member}`, ':s': prefix },
    }),
  );
  return res.Items ?? [];
}

export const docsFor = async (member: string) => (await byPrefix(member, 'DOC#')).reverse();

export async function putPlanned(member: string, procedure: PlannedProcedure, docId: string) {
  await db.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        pk: `MEMBER#${member}`,
        sk: `PLANNED#${procedure.id}`,
        procedure,
        docId,
      },
    }),
  );
}

export const plannedFor = async (member: string) => (await byPrefix(member, 'PLANNED#')).map((i) => i.procedure as PlannedProcedure);

/** Demo reset: forget emailed documents and the procedures planned from them. */
export async function clearCorpus(member: string) {
  const items = [...(await byPrefix(member, 'DOC#')), ...(await byPrefix(member, 'PLANNED#')), ...(await byPrefix(member, 'OUTBOX#'))];
  for (const i of items) await db.send(new DeleteCommand({ TableName: TABLE, Key: { pk: i.pk, sk: i.sk } }));
  return items.length;
}

export async function allContacts(): Promise<(Contact & { member: string; personaId: PersonaId })[]> {
  const res = await db.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: 'gsi1',
      KeyConditionExpression: 'gsi1pk = :p',
      ExpressionAttributeValues: { ':p': 'CONTACT' },
    }),
  );
  return (res.Items ?? []) as unknown as (Contact & {
    member: string;
    personaId: PersonaId;
  })[];
}
