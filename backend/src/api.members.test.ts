// Self sign-up through the HTTP handler, with DynamoDB replaced by an in-memory table (no AWS, no network).
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_FEES } from '../../src/engine/cdt';
import { makeMemDb } from './testing/memdb';

const mocks = vi.hoisted(() => ({ memdb: undefined as unknown, caller: vi.fn() }));
vi.mock('@aws-sdk/lib-dynamodb', async (orig) => ({ ...(await orig<typeof import('@aws-sdk/lib-dynamodb')>()), DynamoDBDocumentClient: { from: () => mocks.memdb } }));
vi.mock('./lib/auth', async (orig) => ({ ...(await orig<typeof import('./lib/auth')>()), callerOf: mocks.caller }));

const ID = 'U-0123456789';
const member = { sub: '0123456789abcdef', group: 'member', memberId: ID, email: 'Sam@Example.com', authTime: Math.floor(Date.now() / 1000) };
const ASOF = '2026-10-04';
const survey = { lastCleaning: 'recent', covered: 'self', lastYear: 'some', goals: [], surveyCompleted: true };

type Handler = (e: APIGatewayProxyEventV2) => Promise<{ statusCode: number; body?: string }>;
type Rec = Record<string, unknown>;
let call: <T = Rec>(method: string, path: string, body?: unknown, query?: Record<string, string>) => Promise<{ status: number; json: T }>;
let memdb: ReturnType<typeof makeMemDb>;
const rows = (table: string) => memdb.items(table);

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv('TABLE_NAME', 'ting');
  vi.stubEnv('CARRIER_TABLE', 'carrier');
  memdb = makeMemDb();
  mocks.memdb = memdb;
  mocks.caller.mockReset().mockResolvedValue(undefined);
  const { handler } = (await import('./api')) as { handler: Handler };
  call = async <T>(method: string, path: string, body?: unknown, query?: Record<string, string>) => {
    const res = await handler({
      rawPath: path,
      queryStringParameters: query,
      headers: {},
      body: body === undefined ? undefined : JSON.stringify(body),
      isBase64Encoded: false,
      requestContext: { http: { method } },
    } as APIGatewayProxyEventV2);
    return { status: res.statusCode, json: (res.body ? JSON.parse(res.body) : undefined) as T };
  };
});
afterEach(() => vi.unstubAllEnvs());

describe('signed out (public demo)', () => {
  it('keeps serving the persona from ?persona=', async () => {
    const r = await call('GET', '/session', undefined, { persona: 'jordan' });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ memberId: 'M-20981', name: 'Jordan' });
  });
  it('GET /me and POST /me are 401', async () => {
    expect((await call('GET', '/me')).status).toBe(401);
    expect((await call('POST', '/me', {})).status).toBe(401);
  });
});

describe('Acme SSO user (persona)', () => {
  beforeEach(() => mocks.caller.mockResolvedValue({ sub: 's', group: 'member', personaId: 'priya', authTime: 0 }));
  it('acts as the persona, has no sign-up record, and cannot create one', async () => {
    expect((await call('GET', '/session')).json).toMatchObject({ name: 'Priya' });
    expect((await call('GET', '/me')).json).toEqual({ member: null });
    expect((await call('POST', '/me', { name: 'X', planId: 'acme-low', survey: {} })).status).toBe(403);
  });
});

describe('member who signed up with a password', () => {
  beforeEach(() => mocks.caller.mockResolvedValue(member));

  it('has no record until the survey is saved, but every route still works', async () => {
    expect((await call('GET', '/me')).json).toEqual({ member: null });
    const profile = await call('GET', '/profile', undefined, { asOf: ASOF });
    expect(profile.status).toBe(200);
    expect(profile.json).toMatchObject({ currentPlan: { id: 'acme-low' } });
    expect((await call('GET', '/session')).json).toMatchObject({ memberId: ID, name: 'Member' });
  });

  it('POST /me stores the record, seeds the carrier and links the email', async () => {
    const r = await call('POST', '/me', { name: 'Sam', planId: 'acme-high', survey }, { asOf: ASOF });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({
      member: { memberId: ID, name: 'Sam', email: 'Sam@Example.com', employer: 'Acme Manufacturing', createdAt: ASOF, currentDentistId: 'd01', planId: 'acme-high' },
    });
    const seed = rows('ting').find((i) => i.pk === `MEMBER#${ID}` && i.sk === 'SEED');
    expect(seed).toMatchObject({ name: 'Sam' });
    expect(seed?.ttl).toBeUndefined();
    expect(rows('carrier').find((i) => i.pk === `MEMBER#${ID}` && i.sk === 'PROFILE')).toMatchObject({ planId: 'acme-high', employeeId: 'E6789', firstName: 'Sam' });
    expect(rows('carrier').some((i) => i.pk === 'PLAN#acme-high')).toBe(true);
    expect(rows('ting').find((i) => i.pk === 'EMAIL#sam@example.com')).toMatchObject({ member: ID, key: ID, role: 'member' });
    expect(rows('ting').find((i) => i.sk === 'CONTACT')).toMatchObject({ email: 'sam@example.com', monthly: true, urgent: true, detail: 'detailed' });

    // The member's routes now act on their own profile, built from the survey and the carrier's plan of record.
    expect((await call('GET', '/me')).json).toMatchObject({ member: { name: 'Sam' } });
    expect((await call('GET', '/session')).json).toMatchObject({ memberId: ID, name: 'Sam' });
    const profile = (await call<{ currentPlan: { id: string }; ledger: { history: { source: string }[] }; procedures: { cdt: string }[] }>('GET', '/profile', undefined, { asOf: ASOF })).json;
    expect(profile.currentPlan.id).toBe('acme-high');
    expect(profile.ledger.history.length).toBeGreaterThan(0);
    expect(profile.ledger.history.every((h) => h.source === 'user')).toBe(true);
    // Their starting work is priced from the fee table, not copied from a demo persona.
    expect(profile.procedures.every((p) => DEMO_FEES[p.cdt] !== undefined)).toBe(true);
  });

  it('a second POST /me updates the record and keeps createdAt', async () => {
    await call('POST', '/me', { name: 'Sam', planId: 'acme-low', survey }, { asOf: ASOF });
    const r = await call('POST', '/me', { name: 'Samantha', planId: 'acme-basic', survey: { ...survey, covered: 'family' }, currentDentistId: 'd03' }, { asOf: '2026-11-01' });
    expect(r.json).toMatchObject({ member: { name: 'Samantha', planId: 'acme-basic', createdAt: ASOF, currentDentistId: 'd03' } });
    expect(rows('ting').filter((i) => String(i.pk).startsWith('EMAIL#'))).toHaveLength(1);
  });

  it('rejects an invalid sign-up with a 400', async () => {
    expect((await call('POST', '/me', { name: '', planId: 'acme-low', survey: {} })).status).toBe(400);
    expect((await call('POST', '/me', { name: 'Sam', planId: 'gold', survey: {} })).status).toBe(400);
    expect((await call('POST', '/me', { name: 'Sam', planId: 'acme-low', survey: { plannedWork: 'x'.repeat(1001) } })).status).toBe(400);
    expect((await call('POST', '/me', { name: 'Sam', planId: 'acme-low', survey: {}, currentDentistId: 'nope' })).status).toBe(400);
  });

  it('POST /me/habits stores brushing data and needs a saved record', async () => {
    expect((await call('POST', '/me/habits', { twiceDailyRate: 0.9, days: 30 })).status).toBe(409);
    await call('POST', '/me', { name: 'Sam', planId: 'acme-low', survey }, { asOf: ASOF });
    const r = await call('POST', '/me/habits', { twiceDailyRate: 0.9, days: 30 });
    expect(r.json).toMatchObject({ member: { habits: { twiceDailyRate: 0.9, days: 30 } } });
    expect((await call('POST', '/me/habits', { twiceDailyRate: 2, days: 30 })).status).toBe(400);
    expect((await call('POST', '/me/habits', { twiceDailyRate: 0.5, days: 401 })).status).toBe(400);
  });

  it('share links use the member id and resolve', async () => {
    const made = await call<{ url: string }>('POST', '/share', { scheduleKind: 'cheapest', snapshot: { hello: 'world' }, origin: 'http://localhost:5173' });
    expect(made.status).toBe(200);
    const token = made.json.url.split('/share/')[1];
    expect(token).toMatch(/^U-0123456789\.cheapest\.[0-9a-f]{32}$/);
    mocks.caller.mockResolvedValue(undefined);
    expect((await call('GET', `/share/${token}`)).json).toMatchObject({ hello: 'world' });
  });

  it('POST /me/delete removes the record, contact, address mapping, documents and preferences', async () => {
    await call('POST', '/me', { name: 'Sam', planId: 'acme-low', survey }, { asOf: ASOF });
    for (const sk of ['DOC#2026#a', 'OUTBOX#1', 'PREFS', 'PLANNED#x']) await memdb.send(new PutCommand({ TableName: 'ting', Item: { pk: `MEMBER#${ID}`, sk } }));
    expect((await call('POST', '/me/delete')).status).toBe(200);
    expect(rows('ting').filter((i) => String(i.pk).startsWith('MEMBER#') || String(i.pk).startsWith('EMAIL#'))).toEqual([]);
  });
});
