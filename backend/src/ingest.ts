// Steps of the document ingestion workflow (Step Functions, infra/lib/ting-stack.ts): read → screen → record.
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { classifyDocument } from '../../src/intake/classify';
import { triageDocument } from './ai/winnow';
import { makeDecide } from './ai/winnowDecide';
import { enrichDocument } from './ai/winnowUses';
import { deidentify, deidentifiedDecide, knownOf, summaryOf } from './lib/deid';
import { logWarn } from './lib/log';
import { memberByMemberId } from './lib/members';
import { readText } from './lib/textract';

const s3 = new S3Client({});
const { decide } = makeDecide();

interface ReadInput {
  step: 'read';
  bucket: string;
  key: string;
  contentType: string;
}
interface ScreenInput {
  step: 'screen';
  key: string;
  contentType: string;
  text: string;
  hash: string;
  /** Member id, so the member's own name and id are removed before Winnow reads the text. */
  member?: string;
}

export async function handler(event: ReadInput | ScreenInput) {
  if (event.step === 'read') {
    const head = await s3.send(new HeadObjectCommand({ Bucket: event.bucket, Key: event.key }));
    // Multi-page PDFs are read with Textract's asynchronous job (see lib/textract.ts).
    const text = await readText(event.bucket, event.key, event.contentType);
    // The S3 ETag of a single-part upload is its content hash: the same file uploaded twice is caught.
    return { key: event.key, contentType: event.contentType, text, hash: (head.ETag ?? '').replace(/"/g, '') };
  }
  const who = event.member ? await memberByMemberId(event.member).catch(() => undefined) : undefined;
  const known = who ? knownOf(who) : { names: [], ids: event.member ? [event.member] : [] };
  const safe = deidentifiedDecide(decide, known);
  const doc = await enrichDocument(classifyDocument(event.text, event.contentType.startsWith('image/')), safe);
  let triage;
  const deid = deidentify(event.text, known);
  try {
    triage = await triageDocument(deid.text, decide);
  } catch (err) {
    logWarn('ingest.triage_failed', err);
  }
  return { docId: event.key, text: event.text, hash: event.hash, ...doc, triage, deidentified: summaryOf(deid) };
}
