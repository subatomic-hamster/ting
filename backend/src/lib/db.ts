// One DynamoDB table (pk/sk):
//   MEMBER#<id>  CLAIM#<receivedAt>#<claimId>  a claim event, replayed to the member's sockets
//   MEMBER#<id>  CONN#<connectionId>           an open WebSocket
//   CONN#<id>    META                          which member a socket belongs to (for $disconnect)
//   SHARE#<tok>  META                          a dentist handoff link, expires via ttl
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const TABLE = process.env.TABLE_NAME ?? '';
export const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });

const ttlIn = (days: number) => Math.floor(Date.now() / 1000) + days * 86_400;

export async function putClaim(member: string, event: Record<string, unknown> & { claimId: string }) {
  await db.send(
    new PutCommand({
      TableName: TABLE,
      Item: { pk: `MEMBER#${member}`, sk: `CLAIM#${new Date().toISOString()}#${event.claimId}`, event, ttl: ttlIn(30) },
    }),
  );
}

async function queryAll(member: string, prefix: string) {
  const out: Record<string, unknown>[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const res = await db.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'pk = :pk and begins_with(sk, :p)',
        ExpressionAttributeValues: { ':pk': `MEMBER#${member}`, ':p': prefix },
        ExclusiveStartKey: start,
      }),
    );
    out.push(...(res.Items ?? []));
    start = res.LastEvaluatedKey;
  } while (start);
  return out;
}

export const claimsFor = async (member: string) => (await queryAll(member, 'CLAIM#')).map((i) => i.event);

export async function deleteClaims(member: string) {
  const keys = (await queryAll(member, 'CLAIM#')).map((i) => ({ pk: i.pk, sk: i.sk }));
  for (let i = 0; i < keys.length; i += 25) {
    await db.send(new BatchWriteCommand({ RequestItems: { [TABLE]: keys.slice(i, i + 25).map((Key) => ({ DeleteRequest: { Key } })) } }));
  }
  return keys.length;
}

export async function addConnection(member: string, connectionId: string) {
  await db.send(new PutCommand({ TableName: TABLE, Item: { pk: `MEMBER#${member}`, sk: `CONN#${connectionId}`, ttl: ttlIn(1) } }));
  await db.send(new PutCommand({ TableName: TABLE, Item: { pk: `CONN#${connectionId}`, sk: 'META', member, ttl: ttlIn(1) } }));
}

export async function removeConnection(connectionId: string) {
  const meta = await db.send(new GetCommand({ TableName: TABLE, Key: { pk: `CONN#${connectionId}`, sk: 'META' } }));
  const member = meta.Item?.member;
  if (typeof member === 'string') await db.send(new DeleteCommand({ TableName: TABLE, Key: { pk: `MEMBER#${member}`, sk: `CONN#${connectionId}` } }));
  await db.send(new DeleteCommand({ TableName: TABLE, Key: { pk: `CONN#${connectionId}`, sk: 'META' } }));
}

export const connectionsFor = async (member: string) => (await queryAll(member, 'CONN#')).map((i) => String(i.sk).slice('CONN#'.length));

export async function putShare(token: string, data: Record<string, unknown>, days: number) {
  await db.send(new PutCommand({ TableName: TABLE, Item: { pk: `SHARE#${token}`, sk: 'META', ...data, ttl: ttlIn(days) } }));
}
