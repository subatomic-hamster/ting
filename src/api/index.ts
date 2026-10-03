// THE API SEAM. Every backend call goes through `api`.
//
// VITE_USE_MOCKS=true (the default) uses mockApi.ts. Set VITE_USE_MOCKS=false
// and fill in httpApi.ts to talk to the real backend (VITE_API_URL / VITE_WS_URL).

import type {
  ClaimAdjudicatedEvent,
  LedgerEntry,
  PlanRules,
  ProcedureItem,
  TraceEvent,
  WaterfallStep,
} from '../contracts';
import { httpApi } from './httpApi';
import { mockApi } from './mockApi';

export interface Session {
  memberId: string;
  name: string;
  employer: string;
  role: 'member' | 'employer_admin' | 'lincoln_analyst';
}

export interface IntakeQuestion {
  id: string;
  text: string;
  why: string;
  options: string[];
}

export type DocumentKind = 'eob' | 'invoice' | 'treatment_plan' | 'plan_summary' | 'insurance_card' | 'unknown';

export interface TingApi {
  getSession(): Promise<Session>;
  getPlans(): Promise<PlanRules[]>;
  getLedger(): Promise<LedgerEntry[]>;
  parseDescription(text: string): Promise<{ items: ProcedureItem[]; questions: IntakeQuestion[] }>;
  uploadDocument(file: File): Promise<{ docId: string; kind: DocumentKind; items?: ProcedureItem[] }>;
  explain(procedureId: string, steps: WaterfallStep[]): Promise<WaterfallStep[]>; // fills explanation + verification
  subscribeLedger(onEvent: (e: ClaimAdjudicatedEvent) => void): () => void; // WebSocket in real mode
  fireMockClaim(): Promise<void>; // demo control
  createShareLink(scheduleKind: string): Promise<{ url: string; expiresAt: string }>;
}

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false';

// --- audit trail: every call is timed and reported to listeners -------------

type TraceListener = (e: TraceEvent) => void;
const listeners = new Set<TraceListener>();

export function onApiTrace(listener: TraceListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(tool: string, summary: string, ms: number) {
  const e: TraceEvent = { ts: new Date().toISOString(), tool, summary, ms: Math.round(ms * 100) / 100 };
  listeners.forEach((l) => l(e));
}

function describe(value: unknown): string {
  if (Array.isArray(value)) return `${value.length} records`;
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (Array.isArray(v.items)) return `${v.items.length} items`;
    if (typeof v.kind === 'string') return `kind: ${v.kind}`;
    if (typeof v.url === 'string') return 'link created';
    if (typeof v.name === 'string') return `signed in as ${v.name}`;
  }
  return 'ok';
}

function traced(impl: TingApi): TingApi {
  const wrapped: Record<string, unknown> = {};
  for (const [name, fn] of Object.entries(impl) as [string, (...args: unknown[]) => unknown][]) {
    wrapped[name] = (...args: unknown[]) => {
      const t0 = performance.now();
      const out = fn.apply(impl, args);
      const tool = `api.${name}${USE_MOCKS ? ' (mock)' : ''}`;
      if (out instanceof Promise) {
        return out.then(
          (v) => {
            emit(tool, describe(v), performance.now() - t0);
            return v;
          },
          (err: unknown) => {
            emit(tool, `failed: ${err instanceof Error ? err.message : String(err)}`, performance.now() - t0);
            throw err;
          },
        );
      }
      emit(tool, 'subscribed', performance.now() - t0);
      return out;
    };
  }
  return wrapped as unknown as TingApi;
}

export const api: TingApi = traced(USE_MOCKS ? mockApi : httpApi);
