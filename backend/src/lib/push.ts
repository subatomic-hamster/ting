import { ApiGatewayManagementApiClient, GoneException, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { connectionsFor, removeConnection } from './db';
import { logWarn } from './log';

const clients = new Map<string, ApiGatewayManagementApiClient>();
const clientFor = (endpoint: string) => {
  let c = clients.get(endpoint);
  if (!c) clients.set(endpoint, (c = new ApiGatewayManagementApiClient({ endpoint })));
  return c;
};

/** Sends one frame to a socket; a socket that's gone is forgotten. */
export async function sendTo(endpoint: string, connectionId: string, data: unknown): Promise<boolean> {
  try {
    await clientFor(endpoint).send(new PostToConnectionCommand({ ConnectionId: connectionId, Data: JSON.stringify(data) }));
    return true;
  } catch (err) {
    if (err instanceof GoneException) await removeConnection(connectionId);
    else logWarn('push.send_failed', err);
    return false;
  }
}

export async function pushToMember(endpoint: string, member: string, data: unknown): Promise<number> {
  const ids = await connectionsFor(member);
  const sent = await Promise.all(ids.map((id) => sendTo(endpoint, id, data)));
  return sent.filter(Boolean).length;
}
