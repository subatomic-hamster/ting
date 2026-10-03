// Mock backend: runs Ting's own intake, OCR and engine in the browser, with 300–800 ms of simulated latency.
// The AWS backend runs the same code in Lambda; only the transport differs.

import { localCompiler } from '../compiler/compile';
import { DEMO_PLAN_OPTIONS } from '../data/demo';
import { PERSONAS } from '../data/personas';
import { localExplainer } from '../engine/explain';
import { classifyDocument } from '../intake/classify';
import { parseDescription } from '../intake/describe';
import { addDays, todayISO } from '../lib/dates';
import { localOcr } from '../services/ocr';
import { pdfText } from '../services/pdf';
import { apiContext as mock } from './context';
import type { TingApi } from './index';
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

  async fireMockClaim(profile) {
    await latency();
    const event = mockClaimEvent(profile, PERSONAS[mock.personaId].memberId);
    ledgerListeners.forEach((l) => l(event));
  },

  async createShareLink(scheduleKind) {
    await latency();
    const token = `${mock.personaId}.${scheduleKind}.${uid()}`;
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://ting.example';
    return { url: `${origin}/share/${token}`, expiresAt: addDays(todayISO(), 30) };
  },

  async resetDemo() {},
};
