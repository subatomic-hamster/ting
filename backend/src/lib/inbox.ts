// Forwarding inbox storage: approved senders per member, and mail held for the member to approve.
// Held mail expires in 7 days; accepted mail is classified and its raw text is not kept.
import { randomUUID } from 'node:crypto';
import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { InboundEmail } from '../../../src/engine/inbox';
import { db } from './db';

const TABLE = process.env.TABLE_NAME ?? '';
const ttlIn = (days: number) => Math.floor(Date.now() / 1000) + days * 86_400;

export async function sendersFor(member: string): Promise<string[]> {
  const res = await db.send(new GetCommand({ TableName: TABLE, Key: { pk: `MEMBER#${member}`, sk: 'SENDERS' } }));
  return Array.isArray(res.Item?.senders) ? (res.Item.senders as string[]) : [];
}

export async function addSender(member: string, address: string) {
  const senders = [...new Set([...(await sendersFor(member)), address.trim().toLowerCase()])].slice(0, 50);
  await db.send(new PutCommand({ TableName: TABLE, Item: { pk: `MEMBER#${member}`, sk: 'SENDERS', senders } }));
  return senders;
}

export async function holdMail(member: string, mail: InboundEmail) {
  const id = randomUUID().slice(0, 8);
  await db.send(
    new PutCommand({
      TableName: TABLE,
      Item: { pk: `MEMBER#${member}`, sk: `HELD#${id}`, mail, receivedAt: new Date().toISOString(), ttl: ttlIn(7) },
    }),
  );
  return id;
}

export async function heldFor(member: string) {
  const res = await db.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'pk = :pk and begins_with(sk, :p)',
      ExpressionAttributeValues: { ':pk': `MEMBER#${member}`, ':p': 'HELD#' },
    }),
  );
  return (res.Items ?? []).map((i) => ({
    id: String(i.sk).slice(5),
    from: String((i.mail as InboundEmail).from),
    subject: String((i.mail as InboundEmail).subject),
    receivedAt: String(i.receivedAt),
  }));
}

/** Removes a held message and returns it, so it's processed once and not kept. */
export async function takeHeld(member: string, id: string): Promise<InboundEmail | undefined> {
  const res = await db.send(new DeleteCommand({ TableName: TABLE, Key: { pk: `MEMBER#${member}`, sk: `HELD#${id}` }, ReturnValues: 'ALL_OLD' }));
  return res.Attributes?.mail as InboundEmail | undefined;
}
