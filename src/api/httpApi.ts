// AWS backend client. Endpoints are placeholders until the AWS lane publishes the API; keep the TingApi
// interface and the engine's types, change paths as needed.

import type { TingApi } from './index';

const API_URL = import.meta.env.VITE_API_URL ?? '';
const WS_URL = import.meta.env.VITE_WS_URL ?? '';

function notWired(what: string): never {
  throw new Error(`${what}: not wired yet`);
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) notWired(`VITE_API_URL is not set (${path})`);
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers: init?.body instanceof FormData ? init.headers : { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} → ${res.status}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const httpApi: TingApi = {
  getSession: () => http('/session'),
  getPlans: () => http('/plans'),
  getLedger: () => http('/ledger'),
  parseDescription: (text) => http('/intake/parse', post({ text })),
  readDocument: (file) => {
    const form = new FormData();
    form.append('file', file);
    return http('/documents', { method: 'POST', body: form });
  },
  compilePlan: (text) => http('/rules/compile', post({ text })),
  explain: (line, rules) => http('/explain', post({ line, rulesVersion: rules.version })),
  subscribeLedger: (onEvent) => {
    if (!WS_URL) notWired('VITE_WS_URL is not set (subscribeLedger)');
    const ws = new WebSocket(WS_URL);
    ws.onmessage = (msg) => {
      try {
        onEvent(JSON.parse(String(msg.data)));
      } catch {
        /* ignore malformed frames */
      }
    };
    return () => ws.close();
  },
  fireMockClaim: async () => notWired('fireMockClaim (demo control, mock mode only)'),
  createShareLink: (scheduleKind) => http('/share', post({ scheduleKind })),
  scheduleReminder: (reminder) => http('/reminders', post(reminder)),
  cancelReminder: (reminderId) => http(`/reminders/${encodeURIComponent(reminderId)}`, { method: 'DELETE' }),
};
