// AWS backend client (infra/ deploys it). Same TingApi, same engine types; the Lambda runs the same src/ code.

import { PERSONAS } from '../data/personas';
import { classifyDocument } from '../intake/classify';
import { pdfText } from '../services/pdf';
import { apiContext } from './context';
import type { ReadDocument, TingApi } from './index';
import { mockClaimEvent } from './mockClaim';

const runtime = typeof window === 'undefined' ? undefined : window.TING_CONFIG;
const API_URL = (runtime?.apiUrl ?? import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const WS_URL = runtime?.wsUrl ?? import.meta.env.VITE_WS_URL ?? '';

function notWired(what: string): never {
  throw new Error(`${what}: not wired yet`);
}

/** Every call carries the demo member and "as of" date, the way a signed-in session would. */
function withContext(path: string): string {
  const q = new URLSearchParams({ persona: apiContext.personaId, asOf: apiContext.asOf });
  return `${path}${path.includes('?') ? '&' : '?'}${q}`;
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) notWired(`VITE_API_URL is not set (${path})`);
  const res = await fetch(`${API_URL}${withContext(path)}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`${init?.method ?? 'GET'} ${path} → ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

/** Uploads straight to S3 with a short-lived presigned URL, then Textract reads it in the backend. */
async function readDocument(file: File): Promise<ReadDocument> {
  const contentType = file.type || 'application/octet-stream';
  const { uploadUrl, key } = await http<{ uploadUrl: string; key: string }>('/documents/upload', post({ name: file.name, contentType }));
  const put = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': contentType } });
  if (!put.ok) throw new Error(`Upload failed → ${put.status}`);
  try {
    return await http<ReadDocument>('/documents', post({ key, contentType }));
  } catch (err) {
    // Textract reads single-page PDFs only; a longer PDF falls back to its own text layer.
    if (contentType !== 'application/pdf') throw err;
    const text = (await pdfText(file)).pages.join('\n');
    return { docId: key, text, ...classifyDocument(text, false) };
  }
}

export const httpApi: TingApi = {
  getSession: () => http('/session'),
  getPlans: () => http('/plans'),
  getLedger: () => http('/ledger'),
  parseDescription: (text) => http('/intake/parse', post({ text })),
  readDocument,
  compilePlan: (text) => http('/rules/compile', post({ text })),
  explain: (line, rules) => http('/explain', post({ line, rules })),

  /** Live claims over WebSocket. On connect the backend replays this member's earlier claims; applying them is idempotent. */
  subscribeLedger: (onEvent) => {
    if (!WS_URL) notWired('VITE_WS_URL is not set (subscribeLedger)');
    const member = PERSONAS[apiContext.personaId].memberId;
    let ws: WebSocket | undefined;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const open = (delay: number) => {
      ws = new WebSocket(`${WS_URL}?member=${encodeURIComponent(member)}`);
      ws.onopen = () => ws?.send(JSON.stringify({ action: 'replay', member }));
      ws.onmessage = (msg) => {
        try {
          onEvent(JSON.parse(String(msg.data)));
        } catch {
          /* ignore malformed frames */
        }
      };
      // API Gateway drops idle sockets after 10 minutes; reconnect and replay.
      ws.onclose = () => {
        if (!closed) retry = setTimeout(() => open(Math.min(delay * 2, 30_000)), delay);
      };
    };
    open(1000);
    return () => {
      closed = true;
      clearTimeout(retry);
      ws?.close();
    };
  },

  fireMockClaim: async (profile) => {
    await http('/mock/claims', post(mockClaimEvent(profile, PERSONAS[apiContext.personaId].memberId)));
  },
  createShareLink: (scheduleKind) => http('/share', post({ scheduleKind, origin: window.location.origin })),
  resetDemo: () => http('/demo/reset', post({})),
};
