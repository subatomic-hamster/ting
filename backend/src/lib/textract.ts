// Reads a document in S3 with Textract. A one-page file or image is read synchronously (DetectDocumentText). That call
// rejects a PDF with more than one page (UnsupportedDocumentException), so a PDF falls back to the asynchronous job,
// which reads any number of pages; the caller's time budget bounds how long we wait for it.
import {
  DetectDocumentTextCommand,
  GetDocumentTextDetectionCommand,
  StartDocumentTextDetectionCommand,
  TextractClient,
  type Block,
} from '@aws-sdk/client-textract';
import { rowsToText } from './layout';

const textract = new TextractClient({});

/** Lines → text, one page at a time (line positions only mean something within their own page). */
export function blocksToText(blocks: Block[]): string {
  const pages = new Map<number, Block[]>();
  for (const b of blocks)
    if (b.BlockType === 'LINE' && b.Text && b.Geometry?.BoundingBox) pages.set(b.Page ?? 1, [...(pages.get(b.Page ?? 1) ?? []), b]);
  return [...pages.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, lines]) =>
      rowsToText(
        lines.map((b) => ({ text: b.Text ?? '', top: b.Geometry?.BoundingBox?.Top ?? 0, left: b.Geometry?.BoundingBox?.Left ?? 0, height: b.Geometry?.BoundingBox?.Height ?? 0 })),
      ),
    )
    .join('\n');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class TextractTimeout extends Error {
  override name = 'TextractTimeout';
}

async function readAsync(bucket: string, key: string, budgetMs: number): Promise<string> {
  const deadline = Date.now() + budgetMs;
  const { JobId } = await textract.send(new StartDocumentTextDetectionCommand({ DocumentLocation: { S3Object: { Bucket: bucket, Name: key } } }));
  while (JobId && Date.now() < deadline) {
    await sleep(1000);
    const blocks: Block[] = [];
    let token: string | undefined;
    let status: string | undefined;
    do {
      const page = await textract.send(new GetDocumentTextDetectionCommand({ JobId, NextToken: token }));
      status = page.JobStatus;
      blocks.push(...(page.Blocks ?? []));
      token = status === 'SUCCEEDED' ? page.NextToken : undefined;
    } while (token);
    if (status === 'SUCCEEDED') return blocksToText(blocks);
    if (status === 'FAILED') throw new Error('Textract job failed');
  }
  throw new TextractTimeout('Textract did not finish in time');
}

export async function readText(bucket: string, key: string, contentType: string, budgetMs = 18_000): Promise<string> {
  try {
    const res = await textract.send(new DetectDocumentTextCommand({ Document: { S3Object: { Bucket: bucket, Name: key } } }));
    return blocksToText(res.Blocks ?? []);
  } catch (err) {
    if (contentType === 'application/pdf' && err instanceof Error && err.name === 'UnsupportedDocumentException') return readAsync(bucket, key, budgetMs);
    throw err;
  }
}

/** Why a read failed, from the error name or the workflow's failure cause; the app already falls back to the PDF's own text. */
export const readFailureCode = (cause: string | undefined): 'pdf_not_readable' | 'unreadable' =>
  /UnsupportedDocumentException|TextractTimeout/.test(cause ?? '') ? 'pdf_not_readable' : 'unreadable';
