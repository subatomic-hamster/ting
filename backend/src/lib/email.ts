// Email: AgentMail (the agent's own inbox, sending and receiving) when its key is in Secrets Manager; every message is
// also written to an outbox the app can show, so the demo never depends on an inbox loading on stage.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { db } from './db';

const TABLE = process.env.TABLE_NAME ?? '';
const SECRET_ARN = process.env.AGENTMAIL_SECRET_ARN ?? '';
const API = 'https://api.agentmail.to/v0';
const secrets = new SecretsManagerClient({});

export interface AgentMailConfig {
  apiKey: string;
  inboxId?: string;
  address?: string;
  webhookSecret?: string;
}

let cached: { at: number; cfg?: AgentMailConfig } = { at: 0 };
/** The AgentMail key and inbox, from Secrets Manager (refreshed every 5 minutes so a new key takes effect quickly). */
export async function agentMail(): Promise<AgentMailConfig | undefined> {
  if (!SECRET_ARN) return undefined;
  if (Date.now() - cached.at < 300_000) return cached.cfg;
  try {
    const res = await secrets.send(new GetSecretValueCommand({ SecretId: SECRET_ARN }));
    const parsed = JSON.parse(res.SecretString ?? '{}') as Partial<AgentMailConfig>;
    cached = {
      at: Date.now(),
      cfg: parsed.apiKey ? (parsed as AgentMailConfig) : undefined,
    };
  } catch {
    cached = { at: Date.now(), cfg: undefined };
  }
  return cached.cfg;
}

export const agentAddress = async () => (await agentMail())?.address ?? 'ting@agentmail.to';

async function call<T>(cfg: AgentMailConfig, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`AgentMail ${init.method ?? 'GET'} ${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

export type EmailKind = 'reply' | 'monthly' | 'urgent' | 'welcome' | 'reminder';

export interface OutgoingEmail {
  member: string;
  kind: EmailKind;
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Reply in the same thread as this received message. */
  inReplyTo?: string;
}

/** Sends through AgentMail when configured and records the message in the member's outbox either way. */
export async function sendEmail(mail: OutgoingEmail): Promise<{ delivered: 'agentmail' | 'outbox'; error?: string }> {
  let delivered: 'agentmail' | 'outbox' = 'outbox';
  let error: string | undefined;
  const cfg = await agentMail();
  if (cfg?.inboxId) {
    try {
      const inbox = encodeURIComponent(cfg.inboxId);
      if (mail.inReplyTo)
        await call(cfg, `/inboxes/${inbox}/messages/${encodeURIComponent(mail.inReplyTo)}/reply`, {
          method: 'POST',
          body: JSON.stringify({ text: mail.text, html: mail.html }),
        });
      else
        await call(cfg, `/inboxes/${inbox}/messages/send`, {
          method: 'POST',
          body: JSON.stringify({
            to: [mail.to],
            subject: mail.subject,
            text: mail.text,
            html: mail.html,
          }),
        });
      delivered = 'agentmail';
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      console.warn('email send failed, kept in the outbox', error);
    }
  }
  const at = new Date().toISOString();
  await db.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        pk: `MEMBER#${mail.member}`,
        sk: `OUTBOX#${at}`,
        at,
        kind: mail.kind,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        delivered,
        error,
        ttl: Math.floor(Date.now() / 1000) + 30 * 86_400,
      },
    }),
  );
  return { delivered, error };
}

export async function outboxFor(member: string) {
  const res = await db.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'pk = :p and begins_with(sk, :s)',
      ExpressionAttributeValues: { ':p': `MEMBER#${member}`, ':s': 'OUTBOX#' },
      ScanIndexForward: false,
      Limit: 30,
    }),
  );
  return (res.Items ?? []).map(({ pk: _pk, sk: _sk, ...rest }) => rest);
}

/** Full message (event payloads leave out large bodies). */
export async function fetchMessage(messageId: string): Promise<Record<string, unknown> | undefined> {
  const cfg = await agentMail();
  if (!cfg?.inboxId) return undefined;
  return call(cfg, `/inboxes/${encodeURIComponent(cfg.inboxId)}/messages/${encodeURIComponent(messageId)}`);
}

/** An attachment's extracted text (PDF, Word, text) or its bytes for OCR. */
export async function fetchAttachment(messageId: string, attachmentId: string): Promise<{ text?: string; bytes?: Uint8Array; contentType?: string }> {
  const cfg = await agentMail();
  if (!cfg?.inboxId) return {};
  const meta = await call<{
    download_url?: string;
    text_url?: string;
    content_type?: string;
  }>(cfg, `/inboxes/${encodeURIComponent(cfg.inboxId)}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`);
  if (meta.text_url) {
    const t = await fetch(meta.text_url, {
      signal: AbortSignal.timeout(15_000),
    });
    if (t.ok) return { text: await t.text(), contentType: meta.content_type };
  }
  if (meta.download_url) {
    const b = await fetch(meta.download_url, {
      signal: AbortSignal.timeout(15_000),
    });
    if (b.ok)
      return {
        bytes: new Uint8Array(await b.arrayBuffer()),
        contentType: meta.content_type ?? b.headers.get('content-type') ?? undefined,
      };
  }
  return {};
}

/** Svix signature check for AgentMail webhooks: HMAC-SHA256 over "id.timestamp.body" with the whsec_ secret. */
export function verifySvix(secret: string, headers: Record<string, string | undefined>, body: string, now = Date.now()): boolean {
  const id = headers['svix-id'];
  const ts = headers['svix-timestamp'];
  const sigs = headers['svix-signature'];
  if (!id || !ts || !sigs || !secret) return false;
  if (Math.abs(now / 1000 - Number(ts)) > 300) return false; // replay window
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest();
  return sigs.split(' ').some((s) => {
    const [, sig] = s.split(',');
    const got = Buffer.from(sig ?? '', 'base64');
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}
