// One-time AgentMail setup, after the team stored its API key:
//   aws secretsmanager put-secret-value --secret-id <AgentMailSecretArn> --secret-string '{"apiKey":"am_..."}'
// Creates the agent's inbox and the message.received webhook to the API, then saves the inbox id, address and
// webhook signing secret into the same secret. Never prints the key. Usage (from infra/):
//   AWS_PROFILE=ting-aws AWS_REGION=us-west-2 node scripts/agentmail-setup.mjs [username]
import { readFileSync } from 'node:fs';
import { GetSecretValueCommand, PutSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

const { Ting: out } = JSON.parse(readFileSync(new URL('../outputs.json', import.meta.url), 'utf8'));
const sm = new SecretsManagerClient({});
const cfg = JSON.parse((await sm.send(new GetSecretValueCommand({ SecretId: out.AgentMailSecretArn }))).SecretString ?? '{}');
if (!cfg.apiKey) {
  console.error(`No apiKey in the secret yet. Run:\n  aws secretsmanager put-secret-value --secret-id ${out.AgentMailSecretArn} --secret-string '{"apiKey":"YOUR_KEY"}'`);
  process.exit(1);
}
const api = async (path, init = {}) => {
  const res = await fetch(`https://api.agentmail.to/v0${path}`, { ...init, headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
  return body;
};

const username = process.argv[2] ?? 'ting-dental';
let inbox = cfg.inboxId ? await api(`/inboxes/${encodeURIComponent(cfg.inboxId)}`).catch(() => undefined) : undefined;
if (!inbox) {
  const list = await api('/inboxes');
  inbox = (list.inboxes ?? []).find((i) => String(i.inbox_id ?? i.email ?? '').startsWith(`${username}@`));
}
if (!inbox) inbox = await api('/inboxes', { method: 'POST', body: JSON.stringify({ username, display_name: 'Ting dental benefits' }) });
const inboxId = inbox.inbox_id;
const address = inbox.email ?? inboxId;
console.log(`Inbox: ${address}`);

const url = `${out.ApiUrl.replace(/\/$/, '')}/email/inbound`;
const hooks = await api('/webhooks');
let hook = (hooks.webhooks ?? []).find((w) => w.url === url);
if (!hook) hook = await api('/webhooks', { method: 'POST', body: JSON.stringify({ url, event_types: ['message.received'], inbox_ids: [inboxId] }) });
if (!hook.secret) hook = await api(`/webhooks/${encodeURIComponent(hook.webhook_id)}`);
console.log(`Webhook → ${url}`);

await sm.send(new PutSecretValueCommand({ SecretId: out.AgentMailSecretArn, SecretString: JSON.stringify({ ...cfg, inboxId, address, webhookSecret: hook.secret }) }));
console.log('Saved inbox and webhook secret. Email is live within 5 minutes (the Lambdas re-read the secret).');
