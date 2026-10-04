// AWS backend client (infra/ deploys it). Same TingApi, same engine types; the Lambda runs the same src/ code.

import { freshIdToken } from '../auth/auth';
import { memberFor, type MemberRecord } from '../data/members';
import { classifyDocument } from '../intake/classify';
import { notify } from '../lib/notify';
import { pdfText } from '../services/pdf';
import { apiContext } from './context';
import type { Contact, ReadDocument, ReceivedDoc, ShareSnapshot, TingApi } from './index';

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
  const token = await freshIdToken();
  const res = await fetch(`${API_URL}${withContext(path)}`, {
    // A connection that silently died (Wi-Fi dropped mid-request) must not hang the app.
    signal: AbortSignal.timeout(25_000),
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers },
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
  // Text files (a forwarded email body, a pasted bill) skip Textract; the backend still screens them.
  if (contentType.startsWith('text/')) return http<ReadDocument>('/documents/text', post({ text: (await file.text()).slice(0, 60_000) }));
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
  getMember: async () => (await http<{ member: MemberRecord | null }>('/me')).member,
  saveMember: async (member) => (await http<{ member: MemberRecord }>('/me', post(member))).member,
  shareHabits: async (habits) => (await http<{ member: MemberRecord }>('/me/habits', post(habits))).member,
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
    const member = memberFor(apiContext.personaId).memberId;
    let ws: WebSocket | undefined;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const open = (delay: number) => {
      ws = new WebSocket(`${WS_URL}?member=${encodeURIComponent(member)}`);
      ws.onopen = () => ws?.send(JSON.stringify({ action: 'replay', member }));
      ws.onmessage = (msg) => {
        try {
          const frame = JSON.parse(String(msg.data)) as { type?: unknown; title?: unknown };
          if (frame.type === 'claim.adjudicated') onEvent(frame);
          // Digests and reminders arrive content-free; a system notification only says there's an update.
          else if (frame.type === 'digest' || frame.type === 'reminder.due') notify('You have a dental benefits update', 'Open Ting to see it.', String(frame.type));
          // The agent read an email, the carrier changed the plan, or something urgent arrived: the app refreshes.
          if (frame.type === 'corpus.updated' || frame.type === 'profile.updated' || frame.type === 'urgent' || frame.type === 'claim.adjudicated')
            window.dispatchEvent(new CustomEvent('ting:signal', { detail: frame }));
          if (frame.type === 'urgent') notify('Important dental benefits update', 'Open Ting to see it.', 'urgent');
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

  // A dentist visit: Lincoln's claims system records and adjudicates it; its change stream delivers the claim to Ting.
  fireMockClaim: async (_profile, opts) => {
    await http('/carrier/visits', post({ underpay: opts?.underpay ?? 0 }));
  },
  submitRules: (rules, evidence, source) => http('/rules/submit', post({ rules, evidence, source })),
  pendingRules: () => http('/rules/pending'),
  approveSubmittedRules: (id) => http('/rules/approve', post({ id })),
  ask: (question, facts) => http('/ask', post({ question, facts })),
  getProfile: () => http('/profile?claims=0'),
  getContact: () => http('/contact'),
  setContact: async (contact) => (await http<{ contact: Contact }>('/contact', post(contact))).contact,
  getOutbox: () => http('/outbox'),
  getReceived: async () => (await http<{ docs: ReceivedDoc[] }>('/corpus')).docs,
  emailAgent: (mail) => http('/demo/email', post(mail)),
  sendMonthlyNow: () => http('/demo/monthly/send', post({})),
  getCarrierRecord: () => http('/carrier/record'),
  changePlan: async (planId) => {
    await http('/carrier/plan-change', post({ planId }));
  },
  getInbox: () => http('/inbox'),
  simulateForward: (mail) => http('/mock/inbound-email', post(mail)),
  approveSender: (address, heldId) => http('/inbox/senders', post({ address, heldId })),
  matchInvoice: (invoice, claims) => http('/invoices/match', post({ invoice, claims })),
  draftAppeal: (discrepancy, plan) => http('/eob/appeal', post({ discrepancy, plan: { name: plan.name, sections: plan.sections } })),
  createShareLink: (scheduleKind, snapshot) => http('/share', post({ scheduleKind, origin: window.location.origin, snapshot })),
  getShare: async (token) => {
    if (!API_URL) return null;
    const res = await fetch(`${API_URL}/share/${encodeURIComponent(token)}`);
    if (res.status === 404 || res.status === 410) return null;
    if (!res.ok) throw new Error(`GET /share → ${res.status}`);
    return (await res.json()) as ShareSnapshot;
  },
  resetDemo: () => http('/demo/reset', post({})),
  getAdminInsights: () => http('/admin/insights'),
  getConsent: () => http('/consent'),
  getPreferences: () => http('/preferences'),
  savePreferences: (prefs) => http('/preferences', post(prefs)),
  getDigest: () => http('/digest'),
  sendTestDigest: () => http('/demo/digest/send', post({})),
  giveConsent: async (version) => {
    await http('/consent', post({ version }));
  },
  deleteMyData: async () => {
    await http('/me/delete', post({}));
  },
  scheduleReminder: (reminder) => http('/reminders', post(reminder)),
  cancelReminder: (reminderId) => http(`/reminders/${encodeURIComponent(reminderId)}`, { method: 'DELETE' }),
};
