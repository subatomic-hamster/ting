// Optional sign-in: requests with a Cognito ID token act as that member; requests without one are the public
// demo (persona from the query string). A token that fails verification is rejected, never ignored.
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { isPersonaId, type PersonaId } from '../../../src/data/personas';
import type { Group } from './identity';

const USER_POOL_ID = process.env.USER_POOL_ID ?? '';
const CLIENT_ID = process.env.USER_POOL_CLIENT_ID ?? '';

const verifier = USER_POOL_ID && CLIENT_ID ? CognitoJwtVerifier.create({ userPoolId: USER_POOL_ID, tokenUse: 'id', clientId: CLIENT_ID }) : undefined;

export interface Caller {
  sub: string;
  group: Group;
  personaId?: PersonaId;
  email?: string;
  /** When the user last actually signed in (epoch seconds), for step-up checks. */
  authTime: number;
}

export class AuthError extends Error {}

export async function callerOf(event: APIGatewayProxyEventV2): Promise<Caller | undefined> {
  const header = event.headers?.authorization ?? event.headers?.Authorization;
  if (!header) return undefined;
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1];
  if (!token || !verifier) throw new AuthError('Sign-in is not configured');
  let claims: Record<string, unknown>;
  try {
    claims = (await verifier.verify(token)) as unknown as Record<string, unknown>;
  } catch {
    throw new AuthError('Your session has expired. Sign in again.');
  }
  const groups = Array.isArray(claims['cognito:groups']) ? (claims['cognito:groups'] as string[]) : [];
  const group: Group = groups.includes('employer_admin') ? 'employer_admin' : groups.includes('lincoln_analyst') ? 'lincoln_analyst' : 'member';
  const persona = String(claims['ting:persona'] ?? '');
  return {
    sub: String(claims.sub),
    group,
    personaId: isPersonaId(persona) ? persona : undefined,
    email: typeof claims.email === 'string' ? claims.email : undefined,
    authTime: Number(claims.auth_time ?? 0),
  };
}
