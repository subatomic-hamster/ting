// Mock backend: runs Ting's own intake, OCR and engine in the browser, with 300–800 ms of simulated latency.
// The AWS backend runs the same code in Lambda; only the transport differs.

import { localCompiler } from '../compiler/compile';
import { DEMO_PLAN_OPTIONS } from '../data/demo';
import admin from '../fixtures/admin.json';
import { PERSONAS } from '../data/personas';
import { buildDigest } from '../engine/digest';
import { appealDraft } from '../engine/eobAppeal';
import { optimize } from '../engine/schedule';
import { localExplainer } from '../engine/explain';
import { classifyDocument } from '../intake/classify';
import { parseDescription } from '../intake/describe';
import { addDays, todayISO } from '../lib/dates';
import { localOcr } from '../services/ocr';
import { pdfText } from '../services/pdf';
import { apiContext as mock } from './context';
import type { NotificationPrefs, ScheduledReminder, ShareSnapshot, TingApi } from './index';
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

/** Shared snapshots, this browser only (the AWS backend keeps them in DynamoDB). */
const shares = new Map<string, ShareSnapshot>();
let prefs: NotificationPrefs = { cadence: 'monthly', detail: 'private' };

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
    return () => ledgerListeners.delete(onEvent);
  },

  async fireMockClaim(profile, opts) {
    await latency();
    const event = mockClaimEvent(profile, PERSONAS[mock.personaId].memberId, opts?.underpay);
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

  async resetDemo() {},

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
