// HTTP API Lambda: the TingApi routes. Engine, intake and compiler are the same src/ code the browser runs.
import { randomUUID } from 'node:crypto';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DetectDocumentTextCommand, TextractClient } from '@aws-sdk/client-textract';
import { SFNClient, StartSyncExecutionCommand } from '@aws-sdk/client-sfn';
import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DEMO_PLAN_OPTIONS } from '../../src/data/demo';
import { isPersonaId, PERSONAS, type PersonaId } from '../../src/data/personas';
import { claimEventSchema } from '../../src/engine/ledger';
import type { AdjudicatedLine } from '../../src/engine/types';
import { approveRules, compilePlanText } from '../../src/compiler/compile';
import { planRulesSchema } from '../../src/compiler/schema';
import type { PlanRules } from '../../src/engine/types';
import { heuristicMatch, type ClaimRecord, type Invoice } from '../../src/engine/reconcile';
import { classifyDocument } from '../../src/intake/classify';
import { addDays, todayISO } from '../../src/lib/dates';
import { compileWithModel } from './ai/compile';
import { describeWithModel, withWinnow } from './ai/describe';
import { explainWithModel } from './ai/explain';
import { polish } from './ai/polish';
import { appealAmounts, appealDraft, type EobDiscrepancy } from '../../src/engine/eobAppeal';
import { isRec } from './ai/model';
import { triageDocument, type Triage } from './ai/winnow';
import { makeDecide } from './ai/winnowDecide';
import { clarity, enrichDocument, readNotes, routeQuestion, secondReader } from './ai/winnowUses';
import { needsRewrite } from '../../src/engine/decisions';
import { dollarsIn } from '../../src/engine/explain';
import { workerAlive } from './lib/winnowQueue';
import { callBedrock } from './lib/bedrock';
import { AuthError, callerOf, type Caller } from './lib/auth';
import { db, deleteClaims, getShare, putShare } from './lib/db';
import admin from '../../src/fixtures/admin.json';
import { rowsToText } from './lib/layout';
import { checkLine } from './lib/reasoning';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { carrierRecord, changePlan, recordVisit, resetMember } from './lib/carrier';
import { PROVIDERS } from './lib/carrierModel';
import { approveDentistSender, clearCorpus, docsFor, getContact, memberByEmail, plannedFor, setContact } from './lib/corpus';
import { agentAddress, agentMail, outboxFor, sendEmail, verifySvix } from './lib/email';
import { welcomeEmail } from './lib/emailTemplates';
import { sendMonthly, sendUrgent } from './lib/notify';
import { memberProfile } from './lib/profile';
import { evaluateSchedule, topoOrder } from '../../src/engine/schedule';
import type { InboundEmail as AgentEmail } from './emailAgent';
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
const INGEST_ARN = process.env.INGEST_ARN ?? '';
const sfnClient = new SFNClient({});
const lambda = new LambdaClient({});
const EMAIL_AGENT_FN = process.env.EMAIL_AGENT_FN ?? '';

/** The email agent runs asynchronously: the webhook (and the demo composer) return at once. */
const runAgent = (mail: AgentEmail) =>
  lambda.send(
    new InvokeCommand({
      FunctionName: EMAIL_AGENT_FN,
      InvocationType: 'Event',
      Payload: Buffer.from(JSON.stringify(mail)),
    }),
  );
const TABLE = process.env.TABLE_NAME ?? '';

// Winnow: its server, the queue to the Mac worker, or the labelled simulation (see ai/winnowDecide.ts).
const { decide, mode: winnowMode } = makeDecide();

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

/** Winnow use 9 on a set of sentences: the confusing ones are reworded once (amounts checked), the rest kept. */
async function plainLanguage(sentences: string[]) {
  const { scores } = await clarity(sentences, decide);
  return Promise.all(
    sentences.map(async (text, i) => {
      if (!needsRewrite(scores[i])) return { text, clarity: 'plain' as const };
      const r = await polish(text, dollarsIn(text), callBedrock, 'sentence for a patient with no insurance knowledge; use everyday words and no jargon');
      return { text: r.text, clarity: r.source === 'model' ? ('rewritten' as const) : ('plain' as const) };
    }),
  );
}

/** Accepted mail: only the text is kept long enough to classify and screen it. */
async function readMailText(mail: InboundEmail) {
  const text = `${mail.subject}\n${mail.text}`.slice(0, 60_000);
  const doc = await enrichDocument(classifyDocument(text, false), decide);
  return { docId: `mail-${randomUUID().slice(0, 8)}`, text, ...doc, triage: await safeTriage(text) };
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
  const doc = await enrichDocument(classifyDocument(text, contentType.startsWith('image/')), decide);
  return { docId: key, text, ...doc, triage: await safeTriage(text) };
}

type Route = (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2>;

const routes: Record<string, Route> = {
  'GET /health': async () => json(200, { ok: true }),

  'GET /session': async (e) => {
    const p = PERSONAS[context(e).personaId];
    return json(200, { memberId: p.memberId, name: p.name, employer: p.employer, role: 'member' });
  },

  // Demo options plus every plan version a Lincoln analyst approved.
  'GET /plans': async () => {
    const res = await db.send(
      new QueryCommand({ TableName: TABLE, KeyConditionExpression: 'pk = :p', ExpressionAttributeValues: { ':p': 'RULES#APPROVED' } }),
    );
    const approved = (res.Items ?? []).map((i) => i.rules as PlanRules);
    return json(200, [...DEMO_PLAN_OPTIONS, ...approved.filter((r) => !DEMO_PLAN_OPTIONS.some((d) => d.id === r.id))]);
  },

  // Plan rules review: anyone can submit compiled rules with their evidence; only a Lincoln analyst approves.
  'POST /rules/submit': async (e) => {
    const body = bodyOf(e);
    const parsed = planRulesSchema.safeParse(body.rules);
    if (!parsed.success) throw new HttpError(400, `Rules don't pass the schema: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
    const id = randomUUID().slice(0, 8);
    await db.send(
      new PutCommand({
        TableName: TABLE,
        Item: { pk: 'RULES#PENDING', sk: id, rules: parsed.data, evidence: isRec(body.evidence) ? body.evidence : {}, source: String(body.source ?? '').slice(0, 200), submittedAt: new Date().toISOString() },
      }),
    );
    return json(200, { id, status: 'pending' });
  },
  'GET /rules/pending': async (e) => {
    if (callers.get(e)?.group !== 'lincoln_analyst') throw new HttpError(403, 'Plan analysts only');
    const res = await db.send(new QueryCommand({ TableName: TABLE, KeyConditionExpression: 'pk = :p', ExpressionAttributeValues: { ':p': 'RULES#PENDING' } }));
    return json(200, (res.Items ?? []).map((i) => ({ id: i.sk, rules: i.rules, evidence: i.evidence, source: i.source, submittedAt: i.submittedAt })));
  },
  'POST /rules/approve': async (e) => {
    const caller = callers.get(e);
    if (caller?.group !== 'lincoln_analyst') throw new HttpError(403, 'Plan analysts only');
    const id = str(bodyOf(e).id, 'id', 20);
    const res = await db.send(new DeleteCommand({ TableName: TABLE, Key: { pk: 'RULES#PENDING', sk: id }, ReturnValues: 'ALL_OLD' }));
    if (!res.Attributes) throw new HttpError(404, 'No such submission');
    // Same hashing as the app: identical rules always get the same version.
    const approved = await approveRules(res.Attributes.rules as PlanRules);
    await db.send(
      new PutCommand({
        TableName: TABLE,
        Item: { pk: 'RULES#APPROVED', sk: approved.rules.version, rules: approved.rules, hash: approved.hash, approvedBy: caller.sub, approvedAt: new Date().toISOString() },
      }),
    );
    return json(200, approved);
  },

  // The persona's starting ledger; claims arrive over the WebSocket (replayed on connect), like a live feed.
  'GET /ledger': async (e) => {
    const { personaId, asOf } = context(e);
    return json(200, PERSONAS[personaId].profile(asOf).ledger);
  },

  // Bedrock translates the words; Winnow (or its labelled simulation) sets the probabilities the questions price.
  'POST /intake/parse': async (e) => {
    const text = str(bodyOf(e).text, 'text', 2000);
    const items = await describeWithModel(text, callBedrock);
    try {
      // Winnow use 1 (field probabilities) and use 6 (the dentist's own wording on "maybe" items).
      return json(200, await readNotes(await withWinnow(text, items, decide), decide));
    } catch (err) {
      console.warn('intake: Winnow step failed, keeping the parser probabilities', err);
      return json(200, items);
    }
  },

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
    const doc = await enrichDocument(classifyDocument(text, false), decide);
    return json(200, { docId: `text-${randomUUID().slice(0, 8)}`, text, ...doc, triage: await safeTriage(text) });
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
        { match: { type: 'choice', instructions:
            'Which EOB is for the same dental visit as this invoice? Offices and insurers can record dates of service a day or two apart, so dates within 3 days can be the same visit; matching procedure codes matter most.', criteria } },
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
    // Winnow use 4 runs alongside the Claude step: an independent reading of each rule the regex compiler found
    // (anything under 0.7 goes to human review). Both together stay well inside API Gateway's 30 s limit.
    const local = compilePlanText(text);
    const [compiled, reader] = await Promise.all([
      compileWithModel(text, callBedrock),
      secondReader(text, local.draft, Object.keys(local.evidence), decide).catch((err: unknown) => {
        console.warn('second reader skipped', err);
        return undefined;
      }),
    ]);
    return json(200, { ...compiled, triage, secondReader: reader?.checks, secondReaderSource: reader?.source });
  },

  'GET /winnow/status': async () =>
    json(200, { mode: winnowMode === 'queue' ? ((await workerAlive().catch(() => false)) ? 'live (Mac worker)' : 'simulated (worker offline)') : winnowMode }),

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
    // Winnow use 9: a sentence scored as confusing gets one plainer rewrite, with every amount kept.
    const plain = await plainLanguage(steps.map((s) => s.text)).catch((err: unknown) => {
      console.warn('plain-language gate skipped', err);
      return undefined;
    });
    const out = steps.map((s, i) => ({ ...s, text: plain?.[i]?.text ?? s.text, clarity: plain?.[i]?.clarity }));
    return json(200, reasoning ? out.map((s) => (s.key === 'coinsurance' ? { ...s, reasoning } : s)) : out);
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
    // Step-up: sharing a member's record with a dentist needs a sign-in from the last 10 minutes.
    const caller = callers.get(e);
    if (caller && Date.now() / 1000 - caller.authTime > 600) throw new HttpError(401, 'step_up: sign in again to share your record');
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
  'POST /demo/reminders/run': async (e) => json(200, { delivered: await deliverDue(context(e).asOf, decide) }),

  // Winnow use 8: route a typed question. Engine and plan questions are answered by tested code in the app;
  // medical questions go to the dentist; explanations get a model answer built only from the facts sent.
  'POST /ask': async (e) => {
    const body = bodyOf(e);
    const question = str(body.question, 'question', 1000);
    const r = await routeQuestion(question, decide);
    if (r.intent === 'medical_advice')
      return json(200, { ...r, answer: "That's a question for your dentist. Ting helps with costs and timing, not with what treatment you need." });
    if (r.intent === 'out_of_scope') return json(200, { ...r, answer: 'Ting can answer questions about your dental plan, your costs and when to schedule work.' });
    if (!r.viaModel) return json(200, { ...r, answerBy: 'engine' });
    const facts = String(body.facts ?? '').slice(0, 6000);
    const allowed = dollarsIn(facts);
    const draft = await callBedrock({
      model: 'fast',
      system:
        'Answer the dental-benefits question in at most three plain sentences, using only the facts given. Use only dollar amounts that appear in the facts, exactly as written. If the facts do not answer it, say so. No medical advice.',
      prompt: `Facts:\n${facts}\n\nQuestion: ${question}`,
      tool: { name: 'answer', description: 'The answer.', schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
      maxTokens: 400,
    }).catch(() => undefined);
    const text = isRec(draft) && typeof draft.text === 'string' ? draft.text : '';
    const cents = new Set(allowed.map((n) => Math.round(n * 100)));
    const ok = text && dollarsIn(text).every((n) => cents.has(Math.round(n * 100)));
    return json(200, ok ? { ...r, answer: text, answerBy: 'model' } : { ...r, answerBy: 'engine' });
  },

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
    const { personaId, asOf } = context(e);
    const member = PERSONAS[personaId].memberId;
    const removed = await deleteClaims(member);
    const visits = await resetMember(personaId, asOf).catch(() => 0);
    const docs = await clearCorpus(member).catch(() => 0);
    return json(200, { removed, visits, docs });
  },

  // --- Email -------------------------------------------------------------------------------------------------------
  // AgentMail webhook: verify the Svix signature, hand the message to the agent, answer at once.
  'POST /email/inbound': async (e) => {
    const cfg = await agentMail();
    const raw = e.body ? (e.isBase64Encoded ? Buffer.from(e.body, 'base64').toString('utf8') : e.body) : '';
    const headers = Object.fromEntries(Object.entries(e.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    if (!cfg?.webhookSecret || !verifySvix(cfg.webhookSecret, headers, raw)) throw new HttpError(401, 'Bad signature');
    const evt = JSON.parse(raw) as {
      event_type?: string;
      message?: Record<string, unknown>;
    };
    if (evt.event_type !== 'message.received' || !evt.message) return json(200, { ignored: evt.event_type });
    const m = evt.message;
    if (
      cfg.address &&
      String(m.from ?? '')
        .toLowerCase()
        .includes(cfg.address.toLowerCase())
    )
      return json(200, { ignored: 'own message' });
    await runAgent({
      messageId: String(m.message_id),
      from: String(m.from ?? ''),
      subject: String(m.subject ?? ''),
      // Forwarded mail keeps its content in the full body; extraction can drop it.
      text: String(m.text ?? m.extracted_text ?? ''),
      attachments: (Array.isArray(m.attachments) ? m.attachments : []).map((a: Record<string, unknown>) => ({
        attachmentId: String(a.attachment_id),
        filename: a.filename ? String(a.filename) : undefined,
        contentType: a.content_type ? String(a.content_type) : undefined,
      })),
      source: 'agentmail',
    });
    return json(200, { accepted: true });
  },

  // Demo composer: the same agent, for an email typed in the app (from the member, or from their dentist).
  'POST /demo/email': async (e) => {
    const body = bodyOf(e);
    const { personaId } = context(e);
    const member = PERSONAS[personaId].memberId;
    const fromDentist = body.fromDentist === true;
    let from = fromDentist ? 'frontdesk@greensborofamilydental.example' : ((await getContact(member))?.email ?? `${personaId}@demo.ting.test`);
    if (fromDentist) await approveDentistSender(member, personaId, from);
    else if (!(await memberByEmail(from))) {
      await setContact(member, personaId, {
        email: from,
        monthly: true,
        urgent: true,
        detail: 'detailed',
      });
      from = (await getContact(member))?.email ?? from;
    }
    await runAgent({
      from,
      subject: str(body.subject, 'subject', 300),
      text: str(body.text, 'text', 30_000),
      attachments:
        typeof body.attachmentText === 'string' && body.attachmentText
          ? [
              {
                filename: 'attachment.txt',
                text: body.attachmentText.slice(0, 30_000),
              },
            ]
          : [],
      source: 'demo',
    });
    return json(202, { accepted: true, from });
  },

  'GET /contact': async (e) => {
    const member = PERSONAS[context(e).personaId].memberId;
    return json(200, {
      contact: (await getContact(member)) ?? null,
      agent: await agentAddress(),
      live: !!(await agentMail())?.inboxId,
    });
  },
  'POST /contact': async (e) => {
    const body = bodyOf(e);
    const { personaId } = context(e);
    const member = PERSONAS[personaId].memberId;
    const email = str(body.email, 'email', 200).trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address');
    const prev = await getContact(member);
    const contact = await setContact(member, personaId, {
      email,
      monthly: body.monthly !== false,
      urgent: body.urgent !== false,
      detail: body.detail === 'private' ? 'private' : 'detailed',
    });
    if (prev?.email !== contact.email) {
      const r = welcomeEmail(PERSONAS[personaId].name, await agentAddress());
      await sendEmail({
        member,
        kind: 'welcome',
        to: contact.email,
        subject: r.subject,
        text: r.text,
        html: r.html,
      });
    }
    return json(200, { contact });
  },
  'GET /outbox': async (e) => json(200, await outboxFor(PERSONAS[context(e).personaId].memberId)),
  'GET /corpus': async (e) => {
    const member = PERSONAS[context(e).personaId].memberId;
    const [docs, planned] = await Promise.all([docsFor(member), plannedFor(member)]);
    return json(200, {
      docs: docs.map(({ pk: _pk, sk: _sk, ...d }) => d),
      planned,
    });
  },
  /** The member's live profile: carrier records + Ting's corpus + claims since, as the engine's Profile. */
  'GET /profile': async (e) => {
    const { personaId, asOf } = context(e);
    return json(200, await memberProfile(personaId, asOf, e.queryStringParameters?.claims !== '0'));
  },
  'POST /demo/monthly/send': async (e) => {
    const { personaId, asOf } = context(e);
    const r = await sendMonthly(PERSONAS[personaId].memberId, personaId, asOf);
    return json(200, {
      sent: r.sent,
      delivered: 'delivered' in r ? r.delivered : undefined,
      reason: 'reason' in r ? r.reason : undefined,
    });
  },

  // --- Carrier (Lincoln's system of record) --------------------------------------------------------------------------
  'GET /carrier/record': async (e) => {
    const member = PERSONAS[context(e).personaId].memberId;
    const rec = await carrierRecord(member);
    return json(200, { ...rec, providers: PROVIDERS });
  },
  // Demo: a dentist visit happens. Lincoln's claims system records and adjudicates it; the stream does the rest.
  'POST /carrier/visits': async (e) => {
    const body = bodyOf(e);
    const { personaId, asOf } = context(e);
    const persona = PERSONAS[personaId];
    const profile = await memberProfile(personaId, asOf);
    const next = topoOrder(profile.procedures).find((p) => (p.likelihood ?? 1) >= 1);
    if (!next) throw new HttpError(409, 'No planned procedure left to do');
    const [line] = evaluateSchedule({ ...profile, procedures: [next] }, [{ id: next.id, date: asOf }]).lines;
    const underpay = typeof body.underpay === 'number' ? Math.min(body.underpay, line.planPaid) : 0;
    const visit = await recordVisit({
      memberId: persona.memberId,
      dentistId: persona.currentDentistId,
      serviceDate: asOf,
      inNetwork: next.inNetwork,
      rulesVersion: line.rulesVersion,
      lines: [
        {
          cdt: line.cdt,
          tooth: line.tooth,
          billed: line.billed,
          allowed: line.allowed,
          planPaid: line.planPaid - underpay,
          deductibleApplied: line.deductibleApplied,
        },
      ],
    });
    return json(202, { ...visit, procedure: next.id });
  },
  // Demo: the employer moves the member to another plan mid-year (an urgent email follows).
  'POST /carrier/plan-change': async (e) => {
    const { personaId } = context(e);
    const rec = await carrierRecord(PERSONAS[personaId].memberId);
    const planId = str(bodyOf(e).planId, 'planId', 40);
    if (!['acme-low', 'acme-high'].includes(planId)) throw new HttpError(400, 'Unknown plan');
    if (rec.member?.planId === planId) return json(200, { unchanged: true });
    await changePlan(PERSONAS[personaId].memberId, planId);
    return json(202, { planId });
  },
  'POST /demo/urgent': async (e) => {
    const { personaId } = context(e);
    return json(200, await sendUrgent(PERSONAS[personaId].memberId, personaId, str(bodyOf(e).what, 'what', 200), [], []));
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
