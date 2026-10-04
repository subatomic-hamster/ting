// Mock backend: runs Ting's own intake, OCR and engine in the browser, with 300–800 ms of simulated latency.
// The AWS backend runs the same code in Lambda; only the transport differs.

import { approveRules, localCompiler, type CompileResult } from '../compiler/compile';
import { DEMO_PLAN_OPTIONS } from '../data/demo';
import admin from '../fixtures/admin.json';
import { PERSONAS } from '../data/personas';
import { buildDigest } from '../engine/digest';
import { appealDraft } from '../engine/eobAppeal';
import { decideInbound, forwardingAddress } from '../engine/inbox';
import { heuristicMatch } from '../engine/reconcile';
import { localIntent } from '../engine/answer';
import { optimize } from '../engine/schedule';
import type { PlanRules } from '../engine/types';
import { localExplainer } from '../engine/explain';
import { classifyDocument } from '../intake/classify';
import { parseDescription } from '../intake/describe';
import { addDays, todayISO } from '../lib/dates';
import { localOcr } from '../services/ocr';
import { pdfText } from '../services/pdf';
import { apiContext as mock } from './context';
import type { Contact, NotificationPrefs, ScheduledReminder, ShareSnapshot, TingApi } from './index';
import { mockClaimEvent } from './mockClaim';

const latency = () => new Promise<void>((r) => setTimeout(r, 300 + Math.random() * 500));
const uid = () => Math.random().toString(36).slice(2, 8);

async function fileText(file: File): Promise<string> {
  if (file.type === 'application/pdf') return (await pdfText(file)).pages.join('\n');
  if (file.type.startsWith('image/')) return (await localOcr.recognize(file)).text;
  return file.text();
}

// --- ledger events ------------------------------------------------------------

const ledgerListeners = new Set<(e: unknown) => void>();
/** Claims fired this session per persona, replayed to each new subscriber like the WebSocket's `replay`. */
const firedClaims = new Map<string, unknown[]>();

/** Shared snapshots, this browser only (the AWS backend keeps them in DynamoDB). */
const shares = new Map<string, ShareSnapshot>();
const pending: { id: string; rules: PlanRules; evidence: CompileResult['evidence']; source: string; submittedAt: string }[] = [];
let prefs: NotificationPrefs = { cadence: 'monthly', detail: 'private' };
let contact: Contact | null = null;
const inbox: { senders: string[]; held: { id: string; from: string; subject: string; text: string; receivedAt: string }[] } = { senders: [], held: [] };

/** Scheduled reminders, by member. In mock mode the app itself shows them when they come due. */
const reminders = new Map<string, Map<string, ScheduledReminder>>();
const remindersFor = () => {
  const member = PERSONAS[mock.personaId].memberId;
  if (!reminders.has(member)) reminders.set(member, new Map());
  return reminders.get(member)!;
};

export const mockApi: TingApi = {
  async getSession() {
    await latency();
    const p = PERSONAS[mock.personaId];
    return { memberId: p.memberId, name: p.name, employer: p.employer, role: 'member' };
  },

  async getPlans() {
    await latency();
    return DEMO_PLAN_OPTIONS;
  },

  async getLedger() {
    await latency();
    return PERSONAS[mock.personaId].profile(mock.asOf).ledger;
  },

  async parseDescription(text) {
    await latency();
    return parseDescription(text);
  },

  async readDocument(file) {
    const text = await fileText(file);
    return { docId: `doc-${uid()}`, text, ...classifyDocument(text, file.type.startsWith('image/')) };
  },

  async compilePlan(text) {
    await latency();
    return localCompiler.compile(text);
  },

  async explain(line, rules) {
    await latency();
    return localExplainer.explain(line, rules);
  },

  subscribeLedger(onEvent) {
    ledgerListeners.add(onEvent);
    // A claim fired before the app subscribed (the starting ledger was still loading) still lands.
    for (const event of firedClaims.get(mock.personaId) ?? []) onEvent(event);
    return () => ledgerListeners.delete(onEvent);
  },

  async fireMockClaim(profile, opts) {
    await latency();
    const event = mockClaimEvent(profile, PERSONAS[mock.personaId].memberId, opts?.underpay);
    firedClaims.set(mock.personaId, [...(firedClaims.get(mock.personaId) ?? []), event]);
    ledgerListeners.forEach((l) => l(event));
  },

  async createShareLink(scheduleKind, snapshot) {
    await latency();
    const token = `${mock.personaId}.${scheduleKind}.${uid()}`;
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://ting.example';
    const expiresAt = addDays(todayISO(), 30);
    if (snapshot) shares.set(token, { ...snapshot, sharedAt: new Date().toISOString(), expiresAt });
    return { url: `${origin}/share/${token}`, expiresAt };
  },

  async getShare(token) {
    return shares.get(token) ?? null;
  },

  async resetDemo() {
    firedClaims.delete(mock.personaId);
  },

  async submitRules(rules, evidence, source) {
    await latency();
    const id = uid();
    pending.push({ id, rules, evidence, source, submittedAt: new Date().toISOString() });
    return { id, status: 'pending' };
  },
  async pendingRules() {
    return [...pending];
  },
  async approveSubmittedRules(id) {
    const i = pending.findIndex((p) => p.id === id);
    if (i < 0) throw new Error('No such submission');
    const [p] = pending.splice(i, 1);
    return approveRules(p.rules);
  },

  async ask(question) {
    await latency();
    const intent = localIntent(question);
    if (intent === 'medical_advice') return { intent, answer: "That's a question for your dentist. Ting helps with costs and timing, not with what treatment you need." };
    if (intent === 'out_of_scope') return { intent, answer: 'Ting can answer questions about your dental plan, your costs and when to schedule work.' };
    return { intent, answerBy: 'engine' };
  },

  async getProfile() {
    return null; // the store already holds the persona's profile
  },
  async getContact() {
    return { contact, agent: 'ting-dental@agentmail.to', live: false };
  },
  async setContact(next) {
    contact = next;
    return next;
  },
  async getOutbox() {
    return [];
  },
  async getReceived() {
    return [];
  },
  async emailAgent() {
    throw new Error('The email agent needs the live backend');
  },
  async sendMonthlyNow() {
    return { sent: false, reason: 'needs the live backend' };
  },
  async getCarrierRecord() {
    return null;
  },
  async changePlan() {},

  async getInbox() {
    await latency();
    return { address: forwardingAddress(PERSONAS[mock.personaId].memberId), senders: [...inbox.senders], held: inbox.held.map(({ id, from, subject, receivedAt }) => ({ id, from, subject, receivedAt })) };
  },
  async simulateForward(mail) {
    await latency();
    const d = decideInbound({ ...mail, auth: { spf: true, dkim: true, dmarc: true } }, undefined, inbox.senders);
    if (d.action === 'reject') return { status: 'rejected', reason: d.reason };
    if (d.action === 'hold') {
      const id = uid();
      inbox.held.push({ id, ...mail, receivedAt: new Date().toISOString() });
      return { status: 'held', reason: d.reason };
    }
    const text = `${mail.subject}\n${mail.text}`;
    return { status: 'accepted', doc: { docId: `mail-${uid()}`, text, ...classifyDocument(text, false) } };
  },
  async approveSender(address, heldId) {
    await latency();
    inbox.senders = [...new Set([...inbox.senders, address.toLowerCase()])];
    const held = inbox.held.find((h) => h.id === heldId);
    inbox.held = inbox.held.filter((h) => h.id !== heldId);
    if (!held) return { senders: inbox.senders };
    const text = `${held.subject}\n${held.text}`;
    return { senders: inbox.senders, doc: { docId: `mail-${uid()}`, text, ...classifyDocument(text, false) } };
  },

  async matchInvoice(invoice, claims) {
    await latency();
    return { probs: heuristicMatch(invoice, claims), source: 'heuristic' };
  },

  async draftAppeal(discrepancy, plan) {
    await latency();
    return { text: appealDraft(discrepancy, plan), source: 'template' };
  },

  async getAdminInsights() {
    await latency();
    const shown = admin.groups.filter((g) => g.n >= 20);
    return { employer: admin.employer, groups: shown, hidden: admin.groups.length - shown.length, isDemoData: true };
  },
  async getConsent() {
    return {};
  },
  async giveConsent() {},
  async getPreferences() {
    return prefs;
  },
  async savePreferences(next) {
    await latency();
    prefs = next;
    return prefs;
  },
  async getDigest() {
    await latency();
    const profile = PERSONAS[mock.personaId].profile(mock.asOf);
    return { ...buildDigest(profile, optimize(profile, { horizon: 2 }).cheapest), source: 'template' };
  },
  async sendTestDigest() {
    await latency();
    return { emailed: false, pushedTo: 0, private: prefs.detail !== 'detailed' };
  },
  async deleteMyData() {},

  async scheduleReminder(reminder) {
    await latency();
    const scheduled: ScheduledReminder = { reminderId: reminder.id, sendOn: reminder.sendOn, channels: ['in_app'] };
    remindersFor().set(reminder.id, scheduled);
    return scheduled;
  },

  async cancelReminder(reminderId) {
    await latency();
    remindersFor().delete(reminderId);
  },
};
