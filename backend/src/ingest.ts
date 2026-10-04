// Steps of the document ingestion workflow (Step Functions, infra/lib/ting-stack.ts): read → screen → record.
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DetectDocumentTextCommand, TextractClient } from '@aws-sdk/client-textract';
import { classifyDocument } from '../../src/intake/classify';
import { liveWinnow, simulatedWinnow, triageDocument, type Decide } from './ai/winnow';
import { callBedrock } from './lib/bedrock';
import { rowsToText } from './lib/layout';

const s3 = new S3Client({});
const textract = new TextractClient({});
const WINNOW_URL = process.env.WINNOW_URL ?? '';
const decide: Decide = WINNOW_URL ? liveWinnow(WINNOW_URL) : simulatedWinnow(callBedrock);

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
}

export async function handler(event: ReadInput | ScreenInput) {
  if (event.step === 'read') {
    const head = await s3.send(new HeadObjectCommand({ Bucket: event.bucket, Key: event.key }));
    const res = await textract.send(new DetectDocumentTextCommand({ Document: { S3Object: { Bucket: event.bucket, Name: event.key } } }));
    const text = rowsToText(
      (res.Blocks ?? [])
        .filter((b) => b.BlockType === 'LINE' && b.Text && b.Geometry?.BoundingBox)
        .map((b) => ({ text: b.Text ?? '', top: b.Geometry?.BoundingBox?.Top ?? 0, left: b.Geometry?.BoundingBox?.Left ?? 0, height: b.Geometry?.BoundingBox?.Height ?? 0 })),
    );
    // The S3 ETag of a single-part upload is its content hash: the same file uploaded twice is caught.
    return { key: event.key, contentType: event.contentType, text, hash: (head.ETag ?? '').replace(/"/g, '') };
  }
  const doc = classifyDocument(event.text, event.contentType.startsWith('image/'));
  let triage;
  try {
    triage = await triageDocument(event.text, decide);
  } catch (err) {
    console.warn('triage failed', err);
  }
  return { docId: event.key, text: event.text, hash: event.hash, ...doc, triage };
}
