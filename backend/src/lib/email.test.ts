import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ secret: vi.fn(), db: vi.fn() }));
vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: class { send = mocks.secret; },
  GetSecretValueCommand: class { constructor(public input: unknown) {} },
}));
vi.mock('./db', () => ({ db: { send: mocks.db } }));

const secret = `whsec_${Buffer.from('test-only-signing-secret').toString('base64')}`;
const now = 1_800_000_000_000;
const body = '{"event_type":"message.received"}';
function signed(timestamp = String(now / 1000), payload = body) {
  const signature = createHmac('sha256', Buffer.from(secret.slice(6), 'base64')).update(`event-test.${timestamp}.${payload}`).digest('base64');
  return { 'svix-id': 'event-test', 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` };
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('AGENTMAIL_SECRET_ARN', 'test-secret');
  vi.stubEnv('TABLE_NAME', 'test-table');
  mocks.secret.mockReset().mockResolvedValue({ SecretString: JSON.stringify({ apiKey: 'test-only-key', inboxId: 'test@agentmail.to' }) });
  mocks.db.mockReset().mockResolvedValue({});
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('AgentMail webhook signatures', () => {
  it('accepts valid signatures and rotated signature lists', async () => {
    const { verifySvix } = await import('./email');
    expect(verifySvix(secret, signed(), body, now)).toBe(true);
    const headers = signed();
    headers['svix-signature'] = `v1,invalid ${headers['svix-signature']}`;
    expect(verifySvix(secret, headers, body, now)).toBe(true);
  });
  it('rejects tampered bodies, wrong secrets, unsupported versions and missing headers', async () => {
    const { verifySvix } = await import('./email');
    expect(verifySvix(secret, signed(), `${body} `, now)).toBe(false);
    expect(verifySvix('whsec_d3Jvbmc=', signed(), body, now)).toBe(false);
    expect(verifySvix(secret, { ...signed(), 'svix-signature': signed()['svix-signature'].replace('v1,', 'v2,') }, body, now)).toBe(false);
    expect(verifySvix(secret, {}, body, now)).toBe(false);
  });
  it.each(['NaN', 'Infinity', '', '1800000000.5', '-1800000000', '99999999999999999999'])('rejects even correctly signed malformed timestamp %s', async (timestamp) => {
    const { verifySvix } = await import('./email');
    expect(verifySvix(secret, signed(timestamp), body, now)).toBe(false);
  });
  it.each([-301, 301])('rejects signed timestamps outside the replay window (%s seconds)', async (offset) => {
    const { verifySvix } = await import('./email');
    expect(verifySvix(secret, signed(String(now / 1000 + offset)), body, now)).toBe(false);
  });
});

const mail = { member: 'test-member', kind: 'welcome' as const, to: 'recipient@agentmail.to', subject: 'Test', text: 'Test body', html: '<p>Test body</p>' };
describe('AgentMail delivery and outbox', () => {
  it('sends new mail and records successful provider delivery', async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ message_id: 'test-id' }));
    vi.stubGlobal('fetch', request);
    const { sendEmail } = await import('./email');
    expect(await sendEmail(mail)).toEqual({ delivered: 'agentmail', error: undefined });
    expect(request.mock.calls[0][0]).toBe('https://api.agentmail.to/v0/inboxes/test%40agentmail.to/messages/send');
    expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({ to: [mail.to], subject: mail.subject });
    expect(mocks.db.mock.calls[0][0].input.Item).toMatchObject({ pk: 'MEMBER#test-member', delivered: 'agentmail', kind: 'welcome' });
  });
  it('replies in the original thread using the encoded message ID', async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ message_id: 'reply-id' }));
    vi.stubGlobal('fetch', request);
    const { sendEmail } = await import('./email');
    await sendEmail({ ...mail, kind: 'reply', inReplyTo: '<message/id>' });
    expect(request.mock.calls[0][0]).toContain('/messages/%3Cmessage%2Fid%3E/reply');
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ text: mail.text, html: mail.html });
  });
  it('keeps mail in the outbox when the provider fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unavailable', { status: 503 })));
    const { sendEmail } = await import('./email');
    expect((await sendEmail(mail)).delivered).toBe('outbox');
    expect(mocks.db.mock.calls[0][0].input.Item).toMatchObject({ delivered: 'outbox', text: mail.text });
  });
  it('does not call the provider with an unconfigured secret', async () => {
    mocks.secret.mockResolvedValue({ SecretString: '{}' });
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    const { sendEmail } = await import('./email');
    expect((await sendEmail(mail)).delivered).toBe('outbox');
    expect(request).not.toHaveBeenCalled();
  });
});
