// HTTP API Lambda: the TingApi routes. Engine, intake and compiler are the same src/ code the browser runs.
import { randomUUID } from 'node:crypto';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DetectDocumentTextCommand, TextractClient } from '@aws-sdk/client-textract';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DEMO_PLAN_OPTIONS } from '../../src/data/demo';
import { isPersonaId, PERSONAS, type PersonaId } from '../../src/data/personas';
import { claimEventSchema } from '../../src/engine/ledger';
import type { AdjudicatedLine } from '../../src/engine/types';
import { classifyDocument } from '../../src/intake/classify';
import { addDays, todayISO } from '../../src/lib/dates';
import { compileWithModel } from './ai/compile';
import { describeWithModel } from './ai/describe';
import { explainWithModel } from './ai/explain';
import { isRec } from './ai/model';
import { callBedrock } from './lib/bedrock';
import { deleteClaims, putShare } from './lib/db';
import { rowsToText } from './lib/layout';

const s3 = new S3Client({});
const textract = new TextractClient({});
const events = new EventBridgeClient({});
const BUCKET = process.env.DOCS_BUCKET ?? '';
const BUS = process.env.EVENT_BUS ?? '';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? '';

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

/** Demo session: the persona and "as of" date the demo panel picked. A real deployment reads them from Cognito. */
function context(event: APIGatewayProxyEventV2): { personaId: PersonaId; asOf: string } {
  const q = event.queryStringParameters ?? {};
  const personaId = q.persona && isPersonaId(q.persona) ? q.persona : 'dale';
  const asOf = q.asOf && /^\d{4}-\d{2}-\d{2}$/.test(q.asOf) ? q.asOf : todayISO();
  return { personaId, asOf };
}

/** Share links point at the web app; only the app's own origin (or local dev) is trusted. */
function trustedOrigin(origin: unknown): string {
  if (typeof origin === 'string' && (origin === WEB_ORIGIN || /^http:\/\/localhost(:\d+)?$/.test(origin))) return origin;
  return WEB_ORIGIN;
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
  return { docId: key, text, ...classifyDocument(text, contentType.startsWith('image/')) };
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

  'POST /documents': async (e) => {
    const body = bodyOf(e);
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

  'POST /rules/compile': async (e) => json(200, await compileWithModel(str(bodyOf(e).text, 'text', 120_000), callBedrock)),

  'POST /explain': async (e) => {
    const body = bodyOf(e);
    const line = body.line as AdjudicatedLine | undefined;
    if (!isRec(line) || !Array.isArray(line.waterfall)) throw new HttpError(400, 'line is required');
    return json(200, await explainWithModel(line, callBedrock, body.language === 'es' ? 'es' : 'en'));
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
    const token = `${personaId}.${kind}.${randomUUID().slice(0, 8)}`;
    await putShare(token, { personaId, scheduleKind: kind }, 30);
    return json(200, { url: `${trustedOrigin(body.origin)}/share/${token}`, expiresAt: addDays(todayISO(), 30) });
  },

  'POST /demo/reset': async (e) => {
    const removed = await deleteClaims(PERSONAS[context(e).personaId].memberId);
    return json(200, { removed });
  },
};

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  // CORS preflights reach the $default route; API Gateway adds the CORS headers, the status must be 2xx.
  if (event.requestContext.http.method === 'OPTIONS') return { statusCode: 204, body: '' };
  const route = routes[`${event.requestContext.http.method} ${event.rawPath}`];
  if (!route) return json(404, { error: 'Not found' });
  try {
    return await route(event);
  } catch (err) {
    if (err instanceof HttpError) return json(err.status, { error: err.message });
    console.error(event.rawPath, err);
    return json(500, { error: 'Internal error' });
  }
}
