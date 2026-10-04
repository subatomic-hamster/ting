// THE API SEAM. Every backend call goes through `api`.
//
// VITE_USE_MOCKS=true (the default) uses mockApi.ts, which runs the engine, intake and OCR in the browser.
// Set VITE_USE_MOCKS=false to talk to the AWS backend (VITE_API_URL / VITE_WS_URL), which runs the same
// engine in Lambda and returns the same types.

import type { CompileResult } from '../compiler/compile';
import type { Cadence, Detail, Digest } from '../engine/digest';
import type { EobDiscrepancy } from '../engine/eobAppeal';
import type { ClaimRecord, Invoice } from '../engine/reconcile';
import type { ExplainedStep } from '../engine/explain';
import type { Reminder } from '../engine/reminders';
import type { AdjudicatedLine, Ledger, PlannedProcedure, PlanRules, Profile } from '../engine/types';
import type { DocumentKind } from '../intake/classify';
import type { DentistSummary } from '../habits/analytics';
import type { IntakeItem } from '../intake/types';
import type { MemberRecord } from '../data/members';
import type { PhiKind } from '../engine/phi';
import type { HabitSignal } from '../engine/risk';
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
  /** A dentist's bill, parsed. */
  invoice?: Invoice;
  /** The same file was uploaded before (content hash); it's never counted twice. */
  duplicate?: boolean;
  /** Winnow use 5 (AWS only): what each bill line is; only covered procedures count toward the plan. */
  lineChecks?: { text: string; amount: number; category: string; p: number; ask: boolean }[];
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

export type CompiledPlan = CompileResult & {
  triage?: DocumentTriage;
  modelFilled?: string[];
  /** Winnow use 4: an independent reading of each compiled rule; `review` when it's under 0.7. */
  secondReader?: { field: string; statement: string; p: number; review: boolean }[];
};

export interface AskResult {
  intent: 'engine_question' | 'plan_lookup' | 'explanation' | 'medical_advice' | 'out_of_scope';
  p?: number;
  /** Set when the backend answered (redirects, refusals, model explanations). Otherwise the app's engine answers. */
  answer?: string;
  answerBy?: 'engine' | 'model';
  source?: 'winnow' | 'simulated';
}

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

export interface NotificationPrefs {
  cadence: Cadence;
  detail: Detail;
}

export interface Contact {
  email: string;
  monthly: boolean;
  urgent: boolean;
  detail: 'detailed' | 'private';
}

export interface SentEmail {
  at: string;
  kind: 'reply' | 'monthly' | 'urgent' | 'welcome' | 'reminder';
  to: string;
  subject: string;
  text: string;
  html: string;
  delivered: 'agentmail' | 'outbox';
  error?: string;
}

/** A document Ting received by email, what it read from it and what it did. */
export interface ReceivedDoc {
  docId: string;
  receivedAt: string;
  from: string;
  role?: 'member' | 'dentist';
  subject: string;
  quarantined?: boolean;
  urgent?: boolean;
  urgentP?: number;
  urgentSource?: string;
  record?: {
    docType: string;
    summary: string;
    provider?: string;
    serviceDate?: string;
    claimNumber?: string;
    procedures: {
      label: string;
      status: string;
      urgency: string;
      billed?: number;
      planPaid?: number;
      memberOwes?: number;
      deadline?: string;
    }[];
    amounts: { label: string; amount: number }[];
    followUps: string[];
  };
  recorded?: string[];
  flags?: string[];
  /** HIPAA: what was removed before any AI read the document, and the de-identified text it actually saw. */
  deidentified?: { removed: Partial<Record<PhiKind, number>>; preview: string };
  plan?: {
    items: { label: string; date: string; memberOwes: number }[];
    dentist?: { name: string; distanceMiles: number; isCurrent: boolean };
  };
}

export interface CarrierRecord {
  member?: Record<string, unknown> & {
    memberId: string;
    planId: string;
    groupNumber: string;
    employer: string;
    coverageTier: string;
    effectiveDate: string;
  };
  plan?: PlanRules;
  accumulators: {
    planYear: number;
    deductibleMet: number;
    annualMaxUsed: number;
    orthoUsed: number;
    rolloverBalance: number;
  }[];
  claims: {
    claimId: string;
    serviceDate: string;
    status: string;
    providerNpi: string;
    inNetwork: boolean;
    origin: string;
    totals: {
      billed: number;
      allowed: number;
      planPaid: number;
      memberOwes: number;
    };
    lines: {
      lineNo: number;
      cdt: string;
      tooth?: number;
      billed: number;
      allowed: number;
      planPaid: number;
      memberOwes: number;
      adjustments: { group: string; carc: string; amount: number }[];
    }[];
  }[];
  providers: {
    npi: string;
    name: string;
    inNetwork: boolean;
    dentistId: string;
  }[];
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

/** What the sign-up survey sends; the server adds the member id, email, employer and dates. */
export type NewMember = Pick<MemberRecord, 'name' | 'planId' | 'survey'> & { currentDentistId?: string };

export interface TingApi {
  getSession(): Promise<Session>;
  /** The signed-in member's sign-up record, or null when they haven't finished the onboarding survey. */
  getMember(): Promise<MemberRecord | null>;
  /** Finish sign-up: stores the survey; the insurer's record is seeded and the member's email is linked to the agent. */
  saveMember(member: NewMember): Promise<MemberRecord>;
  /** SmileStreak: brushing data the member chose to share, which updates their dental profile. */
  shareHabits(habits: HabitSignal): Promise<MemberRecord>;
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
  fireMockClaim(profile: Profile, opts?: { underpay?: number }): Promise<void>;
  /** Which of the member's claims (EOBs) this invoice is for: a probability per claim id plus "none" (Winnow use 3 in AWS). */
  matchInvoice(invoice: Invoice, claims: ClaimRecord[]): Promise<{ probs: Record<string, number>; source: 'winnow' | 'simulated' | 'heuristic' }>;
  /** F2 forwarding address: approved senders and mail waiting for approval. */
  getInbox(): Promise<{ address: string; senders: string[]; held: { id: string; from: string; subject: string; receivedAt: string }[] }>;
  /** Demo control standing in for SES inbound: an email arrives at the member's forwarding address. */
  simulateForward(mail: { from: string; subject: string; text: string }): Promise<{ status: 'accepted' | 'held' | 'rejected'; reason?: string; doc?: ReadDocument }>;
  approveSender(address: string, heldId?: string): Promise<{ senders: string[]; doc?: ReadDocument }>;
  /** Plan rules review: submit compiled rules with their evidence; a Lincoln analyst approves them. */
  submitRules(rules: PlanRules, evidence: CompileResult['evidence'], source: string): Promise<{ id: string; status: 'pending' }>;
  pendingRules(): Promise<{ id: string; rules: PlanRules; evidence: CompileResult['evidence']; source: string; submittedAt: string }[]>;
  approveSubmittedRules(id: string): Promise<{ rules: PlanRules; hash: string }>;
  /** Winnow use 8: routes a typed question; `facts` (engine numbers) is all a model may use for explanations. */
  ask(question: string, facts: string): Promise<AskResult>;
  /** The member's live profile from the carrier's records and Ting's corpus (AWS); the persona's in mock mode. */
  getProfile(): Promise<Profile | null>;
  getContact(): Promise<{
    contact: Contact | null;
    agent: string;
    live: boolean;
  }>;
  setContact(contact: Contact): Promise<Contact>;
  getOutbox(): Promise<SentEmail[]>;
  getReceived(): Promise<ReceivedDoc[]>;
  /** Demo composer: an email to the agent, from the member or from their dentist. */
  emailAgent(mail: { subject: string; text: string; fromDentist?: boolean }): Promise<{ accepted: boolean; from: string }>;
  sendMonthlyNow(): Promise<{ sent: boolean; reason?: string }>;
  /** Lincoln's system of record for this member. */
  getCarrierRecord(): Promise<CarrierRecord | null>;
  /** Demo: the employer moves the member to another plan mid-year. */
  changePlan(planId: string): Promise<void>;
  /** F7: a factual message to Lincoln about an EOB that differs from the estimate. */
  draftAppeal(discrepancy: EobDiscrepancy, plan: Pick<PlanRules, 'name' | 'sections'>): Promise<{ text: string; source: 'model' | 'template' }>;
  /** A signed, expiring link for the dentist. The snapshot is what the link shows on any device. */
  createShareLink(scheduleKind: string, snapshot?: Omit<ShareSnapshot, 'sharedAt' | 'expiresAt'>): Promise<{ url: string; expiresAt: string }>;
  /** The snapshot behind a link, or null when it's unknown or expired. */
  getShare(token: string): Promise<ShareSnapshot | null>;
  /** Employer view: aggregates only. The server drops groups under 20 and requires the employer_admin role. */
  getAdminInsights(): Promise<AdminInsights>;
  getConsent(): Promise<{ version?: string; at?: string }>;
  /** F6 notification settings. */
  getPreferences(): Promise<NotificationPrefs>;
  savePreferences(prefs: NotificationPrefs): Promise<NotificationPrefs>;
  /** The engine's digest for this member (reworded by Bedrock in AWS, amounts checked). */
  getDigest(): Promise<Digest & { source?: string }>;
  /** Demo control: send this member's digest now, with their privacy preference applied. */
  sendTestDigest(): Promise<{ emailed: boolean; pushedTo: number; private: boolean }>;
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

/** The engine runs in the browser, so when the network drops the live API falls back to the in-browser one. */
const LOCAL_WHEN_OFFLINE = new Set<keyof TingApi>(['getSession', 'getPlans', 'getLedger', 'parseDescription', 'readDocument', 'compilePlan', 'explain', 'getDigest', 'matchInvoice', 'draftAppeal', 'ask']);
const offline = (err: unknown) =>
  (typeof navigator !== 'undefined' && !navigator.onLine) || err instanceof TypeError || (err instanceof DOMException && err.name === 'TimeoutError');

function withOfflineFallback(live: TingApi, local: TingApi): TingApi {
  const wrapped: Record<string, unknown> = {};
  for (const [name, fn] of Object.entries(live) as [keyof TingApi, (...args: unknown[]) => unknown][]) {
    if (!LOCAL_WHEN_OFFLINE.has(name)) {
      wrapped[name] = fn;
      continue;
    }
    wrapped[name] = async (...args: unknown[]) => {
      // Known offline: don't wait on a connection that may never answer.
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        emit(`api.${name} (offline)`, 'no network; answered in the browser', 0);
        return (local[name] as (...a: unknown[]) => unknown).apply(local, args);
      }
      try {
        return await fn.apply(live, args);
      } catch (err) {
        if (!offline(err)) throw err;
        emit(`api.${name} (offline)`, 'network unavailable; answered in the browser', 0);
        return (local[name] as (...a: unknown[]) => unknown).apply(local, args);
      }
    };
  }
  return wrapped as unknown as TingApi;
}

export const api: TingApi = traced(USE_MOCKS ? mockApi : withOfflineFallback(httpApi, mockApi));
