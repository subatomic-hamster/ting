// THE API SEAM. Every backend call goes through `api`.
//
// VITE_USE_MOCKS=true (the default) uses mockApi.ts, which runs the engine, intake and OCR in the browser.
// Set VITE_USE_MOCKS=false to talk to the AWS backend (VITE_API_URL / VITE_WS_URL), which runs the same
// engine in Lambda and returns the same types.

import type { CompileResult } from '../compiler/compile';
import type { ExplainedStep } from '../engine/explain';
import type { Reminder } from '../engine/reminders';
import type { AdjudicatedLine, Ledger, PlannedProcedure, PlanRules, Profile } from '../engine/types';
import type { DocumentKind } from '../intake/classify';
import type { DentistSummary } from '../habits/analytics';
import type { IntakeItem } from '../intake/types';
import type { ActiveSchedule } from '../store';
import { httpApi } from './httpApi';
import { mockApi } from './mockApi';

export interface Session {
  memberId: string;
  name: string;
  employer: string;
  role: 'member' | 'employer_admin' | 'lincoln_analyst';
}

export type { DocumentKind };

export interface ReadDocument {
  docId: string;
  kind: DocumentKind;
  /** Text read from the file (OCR or PDF text layer). */
  text: string;
  /** Procedures found on a treatment plan. */
  items: IntakeItem[];
  /** Codes on a treatment plan Ting doesn't know yet. */
  unrecognized: string[];
  /** Winnow's read of the file (AWS only): document type and whether it tries to instruct an AI. */
  triage?: DocumentTriage;
}

export interface DocumentTriage {
  docType: string;
  docTypeP: number;
  injectionP: number;
  /** The text never reached the writing model. */
  quarantined: boolean;
  /** 'simulated' until the Winnow GPU server is up. */
  source: 'winnow' | 'simulated';
}

export type CompiledPlan = CompileResult & { triage?: DocumentTriage; modelFilled?: string[] };

/** What a dentist handoff link shows: a frozen copy of the member's plan at the moment they shared it. */
export interface ShareSnapshot {
  patientName: string;
  procedures: PlannedProcedure[];
  schedule: ActiveSchedule;
  rulesVersion: string;
  /** Only when the member chose to share smart-brush data with their dentist. */
  homeCare?: DentistSummary | null;
  sharedAt: string;
  expiresAt: string;
}

export interface AdminInsights {
  employer: string;
  groups: { id: string; title: string; metric: string; detail: string; n: number }[];
  hidden: number;
  isDemoData: boolean;
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
  compilePlan(text: string): Promise<CompiledPlan>;
  /** One plain sentence per waterfall step; the caller checks every dollar with verifyNumbers before showing it. */
  explain(line: AdjudicatedLine, rules: PlanRules): Promise<ExplainedStep[]>;
  /** Live "claim adjudicated" events (WebSocket in AWS); the store validates and applies them. */
  subscribeLedger(onEvent: (event: unknown) => void): () => void;
  /** Demo control: Lincoln's mock claims feed emits an EOB for the next planned procedure. */
  fireMockClaim(profile: Profile): Promise<void>;
  /** A signed, expiring link for the dentist. The snapshot is what the link shows on any device. */
  createShareLink(scheduleKind: string, snapshot?: Omit<ShareSnapshot, 'sharedAt' | 'expiresAt'>): Promise<{ url: string; expiresAt: string }>;
  /** The snapshot behind a link, or null when it's unknown or expired. */
  getShare(token: string): Promise<ShareSnapshot | null>;
  /** Employer view: aggregates only. The server drops groups under 20 and requires the employer_admin role. */
  getAdminInsights(): Promise<AdminInsights>;
  getConsent(): Promise<{ version?: string; at?: string }>;
  giveConsent(version: string): Promise<void>;
  /** Signed-in member: delete claims, reminders and consent. */
  deleteMyData(): Promise<void>;
  /** Demo control: forget this member's claims so the next session starts clean. */
  resetDemo(): Promise<void>;
  /**
   * Year-end reminder from engine/reminders (EventBridge Scheduler + SES in AWS, where the Lambda can rebuild
   * the text with buildReminders at send time). Scheduling the same reminder id again replaces it.
   */
  scheduleReminder(reminder: Reminder): Promise<ScheduledReminder>;
  cancelReminder(reminderId: string): Promise<void>;
}

const runtime = typeof window === 'undefined' ? undefined : window.TING_CONFIG;
export const USE_MOCKS = runtime?.useMocks ?? import.meta.env.VITE_USE_MOCKS !== 'false';

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
