// Live smoke test. Uses only an owned temporary inbox, restores the demo contact,
// and isolates inbound documents in a temporary member partition. Never logs secrets or mail bodies.
// AWS_PROFILE=<your-active-profile> AWS_REGION=us-west-2 node infra/scripts/agentmail-test.mjs
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, paginateQuery } from '@aws-sdk/lib-dynamodb';

const { Ting: out } = JSON.parse(readFileSync(new URL('../outputs.json', import.meta.url), 'utf8'));
const cfg = JSON.parse((await new SecretsManagerClient({}).send(new GetSecretValueCommand({ SecretId: out.AgentMailSecretArn }))).SecretString ?? '{}');
assert(cfg.apiKey && cfg.inboxId && cfg.webhookSecret, 'Run AgentMail setup first');
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const id = randomUUID();
const testMember = `AGENTMAIL-TEST-${id}`;
const subject = `Ting delivery test ${id}`;
const agentPath = `/inboxes/${encodeURIComponent(cfg.inboxId)}`;
async function provider(path, init = {}) {
  const response = await fetch(`https://api.agentmail.to/v0${path}`, {
    ...init, headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw Error(`AgentMail ${init.method ?? 'GET'} failed (${response.status})`);
  const text = await response.text();
  return text ? JSON.parse(text) : undefined;
}
async function app(path, init = {}) {
  const response = await fetch(`${out.ApiUrl}${path}`, { ...init, headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30_000) });
  assert(response.ok, `Ting ${path} failed (${response.status})`);
  return response.json();
}
const get = async (Key) => (await db.send(new GetCommand({ TableName: out.TableName, Key, ConsistentRead: true }))).Item;
const put = async (Item) => db.send(new PutCommand({ TableName: out.TableName, Item }));
const remove = async (Key) => db.send(new DeleteCommand({ TableName: out.TableName, Key }));
async function memberItems(member) {
  const items = [];
  for await (const page of paginateQuery({ client: db }, {
    TableName: out.TableName, KeyConditionExpression: 'pk = :p', ExpressionAttributeValues: { ':p': `MEMBER#${member}` }, ConsistentRead: true,
  })) items.push(...(page.Items ?? []));
  return items;
}
async function waitFor(check, description, seconds = 180) {
  const until = Date.now() + seconds * 1000;
  do {
    const value = await check();
    if (value) { console.log(`PASS ${description}`); return value; }
    await delay(3000);
  } while (Date.now() < until);
  throw Error(`Timed out: ${description}`);
}
let inbox;
let contactChanged = false;
const contactKey = { pk: 'MEMBER#M-20981', sk: 'CONTACT' };
const previous = await get(contactKey);
const previousMapping = previous?.email ? await get({ pk: `EMAIL#${previous.email}`, sk: 'MEMBER' }) : undefined;
async function restoreContact() {
  if (!contactChanged) return;
  // Avoid overwriting concurrent changes by another user during the test.
  const conditions = { ConditionExpression: 'email = :test', ExpressionAttributeValues: { ':test': inbox.inbox_id } };
  if (previous) await db.send(new PutCommand({ TableName: out.TableName, Item: previous, ...conditions }));
  else await db.send(new DeleteCommand({ TableName: out.TableName, Key: contactKey, ...conditions }));
  if (previousMapping) await put(previousMapping);
  contactChanged = false;
}
try {
  const status = await app('/contact?persona=jordan');
  assert(status.live && status.agent === cfg.address, 'Ting has not refreshed AgentMail configuration');
  console.log('PASS live inbox configuration');
  const hooks = await provider('/webhooks');
  assert(hooks.webhooks?.some(h => h.url === `${out.ApiUrl}/email/inbound` && h.enabled && h.event_types.includes('message.received') && h.inbox_ids.includes(cfg.inboxId)), 'Enabled inbox-scoped webhook required');
  console.log('PASS inbox-scoped webhook subscription');
  const invalid = await fetch(`${out.ApiUrl}/email/inbound`, { method: 'POST', body: '{"event_type":"message.received"}', signal: AbortSignal.timeout(15_000) });
  assert.equal(invalid.status, 401, 'Unsigned webhook should be rejected');
  console.log('PASS unsigned webhook rejected');
  for (const [description, timestamp, version] of [
    ['malformed timestamp', 'NaN', 'v1'],
    ['expired timestamp', String(Math.floor(Date.now() / 1000) - 301), 'v1'],
    ['unsupported signature version', String(Math.floor(Date.now() / 1000)), 'v2'],
  ]) {
    const body = '{"event_type":"test"}';
    const signature = createHmac('sha256', Buffer.from(cfg.webhookSecret.replace(/^whsec_/, ''), 'base64')).update(`${id}.${timestamp}.${body}`).digest('base64');
    const response = await fetch(`${out.ApiUrl}/email/inbound`, {
      method: 'POST', body, headers: { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `${version},${signature}` }, signal: AbortSignal.timeout(15_000),
    });
    assert.equal(response.status, 401, `${description} should be rejected`);
    console.log(`PASS ${description} rejected`);
  }
  inbox = await provider('/inboxes', { method: 'POST', body: JSON.stringify({ username: `ting-test-${id.slice(0, 8)}`, display_name: 'Ting integration test' }) });
  const path = `/inboxes/${encodeURIComponent(inbox.inbox_id)}`;
  contactChanged = true;
  await app('/contact?persona=jordan', { method: 'POST', body: JSON.stringify({ email: inbox.inbox_id, monthly: false, urgent: false, detail: 'private' }) });
  const welcome = await waitFor(async () => (await provider(`${path}/messages`)).messages?.find(m => m.subject === 'Ting is set up for your email' && m.labels?.includes('received')), 'welcome email received in owned inbox');
  assert(welcome.message_id, 'Welcome message ID required');
  await restoreContact();
  await put({ pk: `EMAIL#${inbox.inbox_id}`, sk: 'MEMBER', member: testMember, personaId: 'jordan', role: 'member' });
  await put({ pk: `MEMBER#${testMember}`, sk: 'CONTACT', email: inbox.inbox_id, monthly: false, urgent: false, detail: 'private' });
  await provider(`${path}/messages/send`, { method: 'POST', body: JSON.stringify({ to: [cfg.address], subject, text: 'Appointment confirmation: routine checkup on October 20, 2026. No treatment has been completed. No bill, claim, payment, or treatment recommendation is included.' }) });
  const inbound = await waitFor(async () => (await provider(`${agentPath}/messages`)).messages?.find(m => m.subject === subject && m.labels?.includes('received')), 'inbound message received by Ting inbox');
  await waitFor(async () => (await memberItems(testMember)).find(item => item.sk.startsWith('DOC#') && item.subject === subject && item.source === 'email' && item.record?.docType === 'appointment'), 'provider webhook processed and appointment recorded', 300);
  await waitFor(async () => (await memberItems(testMember)).find(item => item.sk.startsWith('OUTBOX#') && item.subject === `Re: ${subject}` && item.delivered === 'agentmail'), 'application reply delivered through AgentMail');
  const reply = await waitFor(async () => (await provider(`${path}/messages`)).messages?.find(m => m.subject === `Re: ${subject}` && m.labels?.includes('received')), 'reply received in owned inbox');
  const full = await provider(`${agentPath}/messages/${encodeURIComponent(inbound.message_id)}`);
  const fullReply = await provider(`${agentPath}/messages/${encodeURIComponent(reply.message_id)}`);
  assert.equal(full.thread_id, fullReply.thread_id, 'Reply must preserve the original Ting thread');
  console.log('PASS reply preserves original thread');
} finally {
  await restoreContact();
  if (inbox) {
    await remove({ pk: `EMAIL#${inbox.inbox_id}`, sk: 'MEMBER' });
    for (const item of await memberItems(testMember)) await remove({ pk: item.pk, sk: item.sk });
    for (const item of await memberItems('M-20981')) {
      if (item.sk.startsWith('OUTBOX#') && item.kind === 'welcome' && item.to === inbox.inbox_id) await remove({ pk: item.pk, sk: item.sk });
    }
    await provider(`/inboxes/${encodeURIComponent(inbox.inbox_id)}`, { method: 'DELETE' });
    console.log('Temporary inbox and member fixtures removed; original contact restored.');
  }
}
