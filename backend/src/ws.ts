// WebSocket API Lambda: $connect / $disconnect bookkeeping, and "replay" sends a member their earlier claims.
import type { APIGatewayProxyResultV2, APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';
import { isRec } from './ai/model';
import { addConnection, claimsFor, removeConnection } from './lib/db';
import { sendTo } from './lib/push';

type WsEvent = APIGatewayProxyWebsocketEventV2 & { queryStringParameters?: Record<string, string | undefined> };

/** A member id: a demo member ('M-10456') or a member who signed up ('U-3F9A1C2E77'). */
const MEMBER = /^[\w-]{1,64}$/;

export async function handler(event: WsEvent): Promise<APIGatewayProxyResultV2> {
  const { routeKey, connectionId, domainName, stage } = event.requestContext;
  if (routeKey === '$connect') {
    const member = event.queryStringParameters?.member ?? '';
    if (!MEMBER.test(member)) return { statusCode: 400, body: 'member is required' };
    await addConnection(member, connectionId);
    return { statusCode: 200, body: 'connected' };
  }
  if (routeKey === '$disconnect') {
    await removeConnection(connectionId);
    return { statusCode: 200, body: 'bye' };
  }

  let msg: unknown;
  try {
    msg = JSON.parse(event.body ?? '');
  } catch {
    return { statusCode: 400, body: 'bad frame' };
  }
  if (isRec(msg) && msg.action === 'replay' && typeof msg.member === 'string' && MEMBER.test(msg.member)) {
    const endpoint = `https://${domainName}/${stage}`;
    for (const claim of await claimsFor(msg.member)) await sendTo(endpoint, connectionId, claim);
  }
  return { statusCode: 200, body: 'ok' };
}
