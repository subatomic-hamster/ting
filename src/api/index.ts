// THE API SEAM. Every backend call goes through `api`.
//
// VITE_USE_MOCKS=true (the default) uses mockApi.ts, which runs the engine, intake and OCR in the browser.
// Set VITE_USE_MOCKS=false to talk to the AWS backend (VITE_API_URL / VITE_WS_URL), which runs the same
// engine in Lambda and returns the same types.

import type { CompileResult } from '../compiler/compile';
import type { ExplainedStep } from '../engine/explain';
import type { Reminder } from '../engine/reminders';
import type { AdjudicatedLine, Ledger, PlanRules, Profile } from '../engine/types';
import type { IntakeItem } from '../intake/types';
import { httpApi } from './httpApi';
import { mockApi } from './mockApi';

export interface Session {
  memberId: string;
  name: string;
  employer: string;
  role: 'member' | 'employer_admin' | 'lincoln_analyst';
}

export type DocumentKind = 'treatment_plan' | 'plan_summary' | 'insurance_card' | 'unknown';

export interface ReadDocument {
  docId: string;
  kind: DocumentKind;
  /** Text read from the file (OCR or PDF text layer). */
  text: string;
  /** Procedures found on a treatment plan. */
  items: IntakeItem[];
  /** Codes on a treatment plan Ting doesn't know yet. */
  unrecognized: string[];
}

export interface TraceEvent {
  ts: string;
  tool: string;
  summary: string;
  ms: number;
}

export interface ScheduledReminder {
  reminderId: string;
  sendOn: string;
  /** Where it will be delivered: in the app (mock), or email too once SES is wired. */
  channels: ('in_app' | 'email')[];
}

export interface TingApi {
  getSession(): Promise<Session>;
  /** Plan options at open enrollment, including waiving coverage and the dentist's membership plan. */
  getPlans(): Promise<PlanRules[]>;
  getLedger(): Promise<Ledger>;
  /** Typed or spoken description → procedures with confidence (Bedrock in AWS). */
  parseDescription(text: string): Promise<IntakeItem[]>;
  /** Photo, PDF or text file → its text and, for a treatment plan, the procedures on it (Textract in AWS). */
  readDocument(file: File): Promise<ReadDocument>;
  /** Benefits summary text → draft plan rules, the evidence for each, and questions for what it doesn't say (Bedrock in AWS). */
  compilePlan(text: string): Promise<CompileResult>;
  /** One plain sentence per waterfall step; the caller checks every dollar with verifyNumbers before showing it. */
  explain(line: AdjudicatedLine, rules: PlanRules): Promise<ExplainedStep[]>;
  /** Live "claim adjudicated" events (WebSocket in AWS); the store validates and applies them. */
  subscribeLedger(onEvent: (event: unknown) => void): () => void;
  /** Demo control: Lincoln's mock claims feed emits an EOB for the next planned procedure. */
  fireMockClaim(profile: Profile): Promise<void>;
  createShareLink(scheduleKind: string): Promise<{ url: string; expiresAt: string }>;
  /**
   * Year-end reminder from engine/reminders (EventBridge Scheduler + SES in AWS, where the Lambda can rebuild
   * the text with buildReminders at send time). Scheduling the same reminder id again replaces it.
   */
  scheduleReminder(reminder: Reminder): Promise<ScheduledReminder>;
  cancelReminder(reminderId: string): Promise<void>;
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
    if (Array.isArray(v.items) && typeof v.kind === 'string') return `${v.kind}: ${v.items.length} items`;
    if (Array.isArray(v.history)) return `${v.history.length} services`;
    if (typeof v.url === 'string') return 'link created';
    if (typeof v.reminderId === 'string' && typeof v.sendOn === 'string') return `reminder scheduled for ${v.sendOn}`;
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
