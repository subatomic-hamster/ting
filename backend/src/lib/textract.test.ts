import type { Block } from '@aws-sdk/client-textract';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.hoisted(() => vi.fn());
vi.mock('@aws-sdk/client-textract', () => ({
  TextractClient: class {
    send = send;
  },
  DetectDocumentTextCommand: class {
    constructor(public input: unknown) {}
  },
  StartDocumentTextDetectionCommand: class {
    constructor(public input: unknown) {}
  },
  GetDocumentTextDetectionCommand: class {
    constructor(public input: unknown) {}
  },
}));

const line = (Text: string, Page: number, Top: number, Left = 0.1): Block => ({ BlockType: 'LINE', Text, Page, Geometry: { BoundingBox: { Top, Left, Height: 0.03, Width: 0.2 } } });

// Two pages whose lines sit at the same heights: they must not be merged into one row.
const PAGES = [line('Benefits summary', 1, 0.1), line('Annual maximum', 1, 0.3), line('$1,500', 1, 0.3, 0.7), line('Orthodontia', 2, 0.1), line('Waiting period', 2, 0.3)];

beforeEach(() => send.mockReset());

describe('reading a document with Textract', () => {
  it('lays out each page on its own, in page order', async () => {
    const { blocksToText } = await import('./textract');
    expect(blocksToText([...PAGES].reverse())).toBe('Benefits summary\nAnnual maximum   $1,500\nOrthodontia\nWaiting period');
  });

  it('reads a one-page file synchronously', async () => {
    send.mockResolvedValueOnce({ Blocks: PAGES.slice(0, 1) });
    const { readText } = await import('./textract');
    expect(await readText('b', 'k', 'image/png')).toBe('Benefits summary');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('a multi-page PDF (UnsupportedDocumentException) is read by the asynchronous job instead', async () => {
    vi.useFakeTimers();
    send
      .mockRejectedValueOnce(Object.assign(new Error('unsupported'), { name: 'UnsupportedDocumentException' }))
      .mockResolvedValueOnce({ JobId: 'job-1' })
      .mockResolvedValueOnce({ JobStatus: 'IN_PROGRESS' })
      .mockResolvedValueOnce({ JobStatus: 'SUCCEEDED', Blocks: PAGES });
    const { readText } = await import('./textract');
    const pending = readText('b', 'k', 'application/pdf');
    await vi.advanceTimersByTimeAsync(3000);
    expect(await pending).toContain('Orthodontia');
    vi.useRealTimers();
  });

  it('an image is not retried asynchronously, and a job that never finishes is a clear failure', async () => {
    send.mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'UnsupportedDocumentException' }));
    const { readText, readFailureCode } = await import('./textract');
    await expect(readText('b', 'k', 'image/png')).rejects.toThrow();
    vi.useFakeTimers();
    send.mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'UnsupportedDocumentException' })).mockResolvedValueOnce({ JobId: 'j' }).mockResolvedValue({ JobStatus: 'IN_PROGRESS' });
    const pending = readText('b', 'k', 'application/pdf', 3000).catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(5000);
    const err = (await pending) as Error;
    expect(err.name).toBe('TextractTimeout');
    expect(readFailureCode(err.name)).toBe('pdf_not_readable');
    expect(readFailureCode('{"errorType":"UnsupportedDocumentException"}')).toBe('pdf_not_readable');
    expect(readFailureCode('AccessDenied')).toBe('unreadable');
    vi.useRealTimers();
  });
});
