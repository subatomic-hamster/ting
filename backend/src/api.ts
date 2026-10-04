// HTTP API Lambda: the TingApi routes. Engine, intake and compiler are the same src/ code the browser runs.
import { randomUUID } from 'node:crypto';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DetectDocumentTextCommand, TextractClient } from '@aws-sdk/client-textract';
import { SFNClient, StartSyncExecutionCommand } from '@aws-sdk/client-sfn';
import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DEMO_PLAN_OPTIONS } from '../../src/data/demo';
import { isPersonaId, PERSONAS, type PersonaId } from '../../src/data/personas';
import { claimEventSchema } from '../../src/engine/ledger';
import type { AdjudicatedLine } from '../../src/engine/types';
import { compilePlanText } from '../../src/compiler/compile';
import { heuristicMatch, type ClaimRecord, type Invoice } from '../../src/engine/reconcile';
import { classifyDocument } from '../../src/intake/classify';
import { addDays, todayISO } from '../../src/lib/dates';
import { compileWithModel } from './ai/compile';
import { describeWithModel } from './ai/describe';
import { explainWithModel } from './ai/explain';
import { polish } from './ai/polish';
import { appealAmounts, appealDraft, type EobDiscrepancy } from '../../src/engine/eobAppeal';
import { isRec } from './ai/model';
import { liveWinnow, simulatedWinnow, triageDocument, type Decide, type Triage } from './ai/winnow';
import { callBedrock } from './lib/bedrock';
import { AuthError, callerOf, type Caller } from './lib/auth';
import { db, deleteClaims, getShare, putShare } from './lib/db';
import admin from '../../src/fixtures/admin.json';
import { rowsToText } from './lib/layout';
import { checkLine } from './lib/reasoning';
import { addSender, heldFor, holdMail, sendersFor, takeHeld } from './lib/inbox';
import { decideInbound, forwardingAddress, type InboundEmail } from '../../src/engine/inbox';
import { digestFor, getPrefs, prefsSchema, putPrefs, sendDigest } from './lib/digest';
import { cancelReminder, deliverDue, reminderSchema, scheduleReminder } from './lib/reminders';

const s3 = new S3Client({});
const textract = new TextractClient({});
const events = new EventBridgeClient({});
const BUCKET = process.env.DOCS_BUCKET ?? '';
const BUS = process.env.EVENT_BUS ?? '';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? '';
const WINNOW_URL = process.env.WINNOW_URL ?? '';
const INGEST_ARN = process.env.INGEST_ARN ?? '';
const sfnClient = new SFNClient({});
const TABLE = process.env.TABLE_NAME ?? '';

// Winnow when its server is up; otherwise the labelled Claude simulation (the spec's fallback path).
const simulated = simulatedWinnow(callBedrock);
const decide: Decide = WINNOW_URL
  ? async (state, questions) => {
      try {
        return await liveWinnow(WINNOW_URL)(state, questions);
      } catch (err) {
        console.warn('Winnow unavailable, using the simulation', err);
        return simulated(state, questions);
      }
    }
  : simulated;

async function safeTriage(text: string): Promise<Triage | undefined> {
  if (!text.trim()) return undefined;
  try {
    return await triageDocument(text, decide);
  } catch (err) {
    console.warn('triage failed', err);
    return undefined;
  }
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const json = (status: number, body: unknown): APIGatewayProxyResultV2 => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

function bodyOf(event: APIGatewayProxyEventV2): Record<string, unknown> {
  if (!event.body) return {};
  const text = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  try {
    const parsed: unknown = JSON.parse(text);
    if (isRec(parsed)) return parsed;
  } catch {
    /* fall through */
  }
  throw new HttpError(400, 'Body must be a JSON object');
}

const str = (v: unknown, name: string, max = 20_000): string => {
  if (typeof v !== 'string' || !v.trim()) throw new HttpError(400, `${name} is required`);
  if (v.length > max) throw new HttpError(413, `${name} is too long`);
  return v;
};

const callers = new WeakMap<APIGatewayProxyEventV2, Caller>();

/** Signed in: the member from the Cognito token. Public demo: the persona the demo panel picked. */
function context(event: APIGatewayProxyEventV2): { personaId: PersonaId; asOf: string } {
  const q = event.queryStringParameters ?? {};
  const signedIn = callers.get(event)?.personaId;
  const personaId = signedIn ?? (q.persona && isPersonaId(q.persona) ? q.persona : 'dale');
  const asOf = q.asOf && /^\d{4}-\d{2}-\d{2}$/.test(q.asOf) ? q.asOf : todayISO();
  return { personaId, asOf };
}

/** Share links point at the web app; only the app's own origin (or local dev) is trusted. */
function trustedOrigin(origin: unknown): string {
  if (typeof origin === 'string' && (origin === WEB_ORIGIN || /^http:\/\/localhost(:\d+)?$/.test(origin))) return origin;
  return WEB_ORIGIN;
}

/** Accepted mail: only the text is kept long enough to classify and screen it. */
async function readMailText(mail: InboundEmail) {
  const text = `${mail.subject}\n${mail.text}`.slice(0, 60_000);
  return { docId: `mail-${randomUUID().slice(0, 8)}`, text, ...classifyDocument(text, false), triage: await safeTriage(text) };
}

async function readUpload(key: string, contentType: string) {
  if (!/^uploads\/[\w-]+\/[\w.-]+$/.test(key)) throw new HttpError(400, 'Unknown upload');
  const res = await textract.send(new DetectDocumentTextCommand({ Document: { S3Object: { Bucket: BUCKET, Name: key } } }));
  const text = rowsToText(
    (res.Blocks ?? [])
      .filter((b) => b.BlockType === 'LINE' && b.Text && b.Geometry?.BoundingBox)
      .map((b) => {
        const box = b.Geometry?.BoundingBox;
        return { text: b.Text ?? '', top: box?.Top ?? 0, left: box?.Left ?? 0, height: box?.Height ?? 0 };
      }),
  );
  return { docId: key, text, ...classifyDocument(text, contentType.startsWith('image/')), triage: await safeTriage(text) };
}

type Route = (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2>;

const routes: Record<string, Route> = {
  'GET /health': async () => json(200, { ok: true }),

  'GET /session': async (e) => {
    const p = PERSONAS[context(e).personaId];
    return json(200, { memberId: p.memberId, name: p.name, employer: p.employer, role: 'member' });
  },

  'GET /plans': async () => json(200, DEMO_PLAN_OPTIONS),

  // The persona's starting ledger; claims arrive over the WebSocket (replayed on connect), like a live feed.
  'GET /ledger': async (e) => {
    const { personaId, asOf } = context(e);
    return json(200, PERSONAS[personaId].profile(asOf).ledger);
  },

  'POST /intake/parse': async (e) => json(200, await describeWithModel(str(bodyOf(e).text, 'text', 2000), callBedrock)),

  'POST /documents/upload': async (e) => {
    const body = bodyOf(e);
    const contentType = str(body.contentType, 'contentType', 100);
    if (!/^(image\/(png|jpeg|tiff)|application\/pdf)$/.test(contentType)) throw new HttpError(415, 'Upload a PNG, JPEG, TIFF or PDF');
    const name = String(body.name ?? 'document').replace(/[^\w.-]+/g, '_').slice(-80) || 'document';
    const key = `uploads/${randomUUID()}/${name}`;
    const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }), { expiresIn: 300 });
    return json(200, { uploadUrl, key });
  },

  'POST /documents/text': async (e) => {
    const text = str(bodyOf(e).text, 'text', 60_000);
    return json(200, { docId: `text-${randomUUID().slice(0, 8)}`, text, ...classifyDocument(text, false), triage: await safeTriage(text) });
  },

  // Winnow use 3: which EOB is this invoice for? The thresholds (0.9 link / 0.5 confirm) live in the engine.
  'POST /invoices/match': async (e) => {
    const body = bodyOf(e);
    const claims = Array.isArray(body.claims) ? (body.claims as ClaimRecord[]).slice(0, 5) : [];
    const invoice = body.invoice as Invoice | undefined;
    if (!isRec(invoice)) throw new HttpError(400, 'invoice is required');
    if (!claims.length) return json(200, { probs: { none: 1 }, source: 'heuristic' });
    const labels = 'ABCDE';
    const criteria: Record<string, string> = {};
    claims.forEach((c, i) => (criteria[labels[i]] = `EOB ${c.claimId}: service ${c.date}, codes ${c.codes.join(' ')}, member owes $${c.memberOwes}`));
    criteria.none = 'none of these';
    try {
      const { answers, source } = await decide(
        { invoice: { provider: invoice.provider, serviceDate: invoice.serviceDate, amountDue: invoice.amountDue, codes: invoice.codes } },
        { match: { type: 'choice', instructions: 'Which EOB is for the same dental visit as this invoice?', criteria } },
      );
      const dist = answers.match;
      if (!dist) throw new Error('no distribution');
      const probs: Record<string, number> = { none: dist.none ?? 0 };
      claims.forEach((c, i) => (probs[c.claimId] = dist[labels[i]] ?? 0));
      return json(200, { probs, source });
    } catch (err) {
      console.warn('invoice match fell back to the heuristic', err);
      return json(200, { probs: heuristicMatch(invoice, claims), source: 'heuristic' });
    }
  },

  // F2 channel 2: the member's forwarding address. Production receives mail with SES inbound; the demo posts it.
  'GET /inbox': async (e) => {
    const member = PERSONAS[context(e).personaId].memberId;
    return json(200, { address: forwardingAddress(member), senders: await sendersFor(member), held: await heldFor(member) });
  },
  'POST /mock/inbound-email': async (e) => {
    const body = bodyOf(e);
    const auth = isRec(body.auth) ? body.auth : {};
    const mail: InboundEmail = {
      from: str(body.from, 'from', 200),
      subject: String(body.subject ?? '').slice(0, 200),
      text: str(body.text, 'text', 60_000),
      auth: { spf: auth.spf !== false, dkim: auth.dkim !== false, dmarc: auth.dmarc !== false },
    };
    const member = PERSONAS[context(e).personaId].memberId;
    const decision = decideInbound(mail, callers.get(e)?.email, await sendersFor(member));
    if (decision.action === 'reject') return json(200, { status: 'rejected', reason: decision.reason });
    if (decision.action === 'hold') return json(200, { status: 'held', reason: decision.reason, heldId: await holdMail(member, mail) });
    return json(200, { status: 'accepted', doc: await readMailText(mail) });
  },
  'POST /inbox/senders': async (e) => {
    const body = bodyOf(e);
    const member = PERSONAS[context(e).personaId].memberId;
    const senders = await addSender(member, str(body.address, 'address', 200));
    const held = typeof body.heldId === 'string' ? await takeHeld(member, body.heldId) : undefined;
    return json(200, { senders, doc: held ? await readMailText(held) : undefined });
  },

  'POST /documents': async (e) => {
    const body = bodyOf(e);
    // The ingestion workflow (Step Functions) when deployed: read → screen → record, with duplicate detection.
    if (INGEST_ARN) {
      const key = str(body.key, 'key', 300);
      if (!/^uploads\/[\w-]+\/[\w.-]+$/.test(key)) throw new HttpError(400, 'Unknown upload');
      const run = await sfnClient.send(
        new StartSyncExecutionCommand({
          stateMachineArn: INGEST_ARN,
          input: JSON.stringify({ bucket: BUCKET, key, contentType: str(body.contentType, 'contentType', 100), member: PERSONAS[context(e).personaId].memberId }),
        }),
      );
      const out = run.output ? (JSON.parse(run.output) as { doc?: Record<string, unknown>; duplicate?: boolean; error?: string }) : {};
      if (run.status !== 'SUCCEEDED' || out.error || !out.doc) throw new HttpError(422, 'Ting could not read this file');
      return json(200, { ...out.doc, duplicate: out.duplicate === true, pipeline: run.executionArn?.split(':').slice(-2).join(':') });
    }
    try {
      return json(200, await readUpload(str(body.key, 'key', 300), str(body.contentType, 'contentType', 100)));
    } catch (err) {
      if (err instanceof HttpError) throw err;
      const name = err instanceof Error ? err.name : '';
      // Multi-page PDFs need async Textract; the client falls back to the PDF's text layer.
      if (/UnsupportedDocument|BadDocument|DocumentTooLarge/.test(name)) throw new HttpError(422, `Textract could not read this file (${name})`);
      throw err;
    }
  },

  // Winnow screens the document first; a quarantined document is read by the regex compiler only.
  'POST /rules/compile': async (e) => {
    const text = str(bodyOf(e).text, 'text', 120_000);
    const triage = await safeTriage(text);
    if (triage?.quarantined) return json(200, { ...compilePlanText(text), modelFilled: [], triage });
    return json(200, { ...(await compileWithModel(text, callBedrock)), triage });
  },

  'GET /winnow/status': async () => json(200, { mode: WINNOW_URL ? 'live' : 'simulated', url: WINNOW_URL ? 'configured' : undefined }),

  'POST /explain': async (e) => {
    const body = bodyOf(e);
    const line = body.line as AdjudicatedLine | undefined;
    if (!isRec(line) || !Array.isArray(line.waterfall)) throw new HttpError(400, 'line is required');
    const [steps, reasoning] = await Promise.all([
      explainWithModel(line, callBedrock, body.language === 'es' ? 'es' : 'en'),
      checkLine(line).catch((err: unknown) => {
        console.warn('automated reasoning failed', err);
        return undefined;
      }),
    ]);
    return json(200, reasoning ? steps.map((s) => (s.key === 'coinsurance' ? { ...s, reasoning } : s)) : steps);
  },

  // Demo control standing in for Lincoln's claims platform: validate, then publish to the claims bus.
  'POST /mock/claims': async (e) => {
    const parsed = claimEventSchema.safeParse(bodyOf(e));
    if (!parsed.success) throw new HttpError(400, `Not a claim event: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
    const res = await events.send(
      new PutEventsCommand({
        Entries: [{ EventBusName: BUS, Source: 'ting.mock-lincoln', DetailType: 'claim.adjudicated', Detail: JSON.stringify(parsed.data) }],
      }),
    );
    if (res.FailedEntryCount) throw new Error(`EventBridge rejected the claim: ${res.Entries?.[0]?.ErrorMessage}`);
    return json(202, { claimId: parsed.data.claimId });
  },

  'POST /share': async (e) => {
    const body = bodyOf(e);
    const kind = str(body.scheduleKind, 'scheduleKind', 20);
    if (!/^(cheapest|fastest|balanced|custom)$/.test(kind)) throw new HttpError(400, 'Unknown schedule');
    const { personaId } = context(e);
    // Unguessable token; the persona/kind prefix keeps old mock-style links readable.
    const token = `${personaId}.${kind}.${randomUUID().replace(/-/g, '')}`;
    const snapshot = body.snapshot;
    if (snapshot !== undefined && (!isRec(snapshot) || JSON.stringify(snapshot).length > 200_000)) throw new HttpError(400, 'Bad snapshot');
    const expiresAt = addDays(todayISO(), 30);
    await putShare(token, { personaId, scheduleKind: kind, snapshot: snapshot ? { ...snapshot, sharedAt: new Date().toISOString(), expiresAt } : undefined }, 30);
    return json(200, { url: `${trustedOrigin(body.origin)}/share/${token}`, expiresAt });
  },

  'POST /reminders': async (e) => {
    const parsed = reminderSchema.safeParse(bodyOf(e));
    if (!parsed.success) throw new HttpError(400, `Not a reminder: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
    return json(200, await scheduleReminder(PERSONAS[context(e).personaId].memberId, parsed.data));
  },

  // Demo control: send the reminders due on the demo's "as of" date, the way the daily rule does.
  'POST /demo/reminders/run': async (e) => json(200, { delivered: await deliverDue(context(e).asOf) }),

  // F7: the engine drafts the message from the EOB and the estimate; the model may only reword it.
  'POST /eob/appeal': async (e) => {
    const body = bodyOf(e);
    const d = body.discrepancy as EobDiscrepancy | undefined;
    const plan = body.plan as { name?: unknown; sections?: unknown } | undefined;
    if (!isRec(d) || typeof d.claimId !== 'string' || typeof d.estimated !== 'number' || typeof d.actual !== 'number' || typeof d.cdt !== 'string')
      throw new HttpError(400, 'discrepancy is required');
    if (!isRec(plan) || typeof plan.name !== 'string') throw new HttpError(400, 'plan is required');
    const draft = appealDraft(d, { name: plan.name, sections: isRec(plan.sections) ? (plan.sections as Record<string, string>) : {} });
    return json(200, await polish(draft, appealAmounts(d), callBedrock, 'message to an insurance company'));
  },

  'GET /preferences': async (e) => json(200, await getPrefs(PERSONAS[context(e).personaId].memberId)),
  'POST /preferences': async (e) => {
    const parsed = prefsSchema.safeParse(bodyOf(e));
    if (!parsed.success) throw new HttpError(400, 'cadence must be weekly, monthly or off; detail private or detailed');
    const { personaId } = context(e);
    return json(200, await putPrefs(PERSONAS[personaId].memberId, personaId, parsed.data));
  },
  'GET /digest': async (e) => {
    const { personaId, asOf } = context(e);
    return json(200, await digestFor(personaId, asOf));
  },
  // Demo control: send this member's digest now (on stage), with their privacy preference applied.
  'POST /demo/digest/send': async (e) => {
    const { personaId, asOf } = context(e);
    const member = PERSONAS[personaId].memberId;
    const r = await sendDigest(member, personaId, await getPrefs(member), asOf);
    return json(200, { emailed: r.emailed, pushedTo: r.pushedTo, private: r.private, digest: r.digest });
  },

  // Employer view: aggregates only, and groups under 20 never leave the server.
  'GET /admin/insights': async (e) => {
    const caller = callers.get(e);
    if (!caller) throw new HttpError(401, 'Sign in as an employer benefits admin');
    if (caller.group !== 'employer_admin') throw new HttpError(403, 'Employer admins only');
    const shown = admin.groups.filter((g) => g.n >= 20);
    return json(200, { employer: admin.employer, isDemoData: true, groups: shown, hidden: admin.groups.length - shown.length });
  },

  // First sign-in consent: what Ting reads, what it never shares with the employer, how to delete everything.
  'POST /consent': async (e) => {
    const caller = callers.get(e);
    if (!caller) throw new HttpError(401, 'Sign in first');
    const version = str(bodyOf(e).version, 'version', 20);
    await db.send(new PutCommand({ TableName: TABLE, Item: { pk: `USER#${caller.sub}`, sk: 'CONSENT', version, at: new Date().toISOString() } }));
    return json(200, { version });
  },
  'GET /consent': async (e) => {
    const caller = callers.get(e);
    if (!caller) throw new HttpError(401, 'Sign in first');
    const res = await db.send(new GetCommand({ TableName: TABLE, Key: { pk: `USER#${caller.sub}`, sk: 'CONSENT' } }));
    return json(200, res.Item ? { version: res.Item.version, at: res.Item.at } : {});
  },

  // "Delete everything": claims, reminders and consent for the signed-in member.
  'POST /me/delete': async (e) => {
    const caller = callers.get(e);
    if (!caller) throw new HttpError(401, 'Sign in first');
    const member = caller.personaId ? PERSONAS[caller.personaId].memberId : undefined;
    const removed = member ? await deleteClaims(member) : 0;
    if (member) for (const id of ['nov1', 'dec1', 'fsa']) await cancelReminder(member, `${todayISO().slice(0, 4)}-${id}`);
    await db.send(new DeleteCommand({ TableName: TABLE, Key: { pk: `USER#${caller.sub}`, sk: 'CONSENT' } }));
    return json(200, { removed });
  },

  'POST /demo/reset': async (e) => {
    const removed = await deleteClaims(PERSONAS[context(e).personaId].memberId);
    return json(200, { removed });
  },
};

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  // CORS preflights reach the $default route; API Gateway adds the CORS headers, the status must be 2xx.
  if (event.requestContext.http.method === 'OPTIONS') return { statusCode: 204, body: '' };
  const method = event.requestContext.http.method;
  try {
    const caller = await callerOf(event);
    if (caller) callers.set(event, caller);
  } catch (err) {
    if (err instanceof AuthError) return json(401, { error: err.message });
    throw err;
  }
  const reminder = /^\/reminders\/([\w-]{1,40})$/.exec(event.rawPath);
  const share = /^\/share\/([\w.-]{1,80})$/.exec(event.rawPath);
  if (method === 'GET' && share) {
    const item = await getShare(share[1]);
    if (item === 'expired') return json(410, { error: 'This link has expired' });
    if (!item?.snapshot) return json(404, { error: 'Not found' });
    return json(200, item.snapshot);
  }
  const route: Route | undefined =
    method === 'DELETE' && reminder
      ? async (e) => {
          await cancelReminder(PERSONAS[context(e).personaId].memberId, reminder[1]);
          return { statusCode: 204, body: '' };
        }
      : routes[`${method} ${event.rawPath}`];
  if (!route) return json(404, { error: 'Not found' });
  try {
    return await route(event);
  } catch (err) {
    if (err instanceof HttpError) return json(err.status, { error: err.message });
    console.error(event.rawPath, err);
    return json(500, { error: 'Internal error' });
  }
}
