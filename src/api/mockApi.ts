// Mock backend: runs Ting's own intake, OCR and engine in the browser, with 300–800 ms of simulated latency.
// The AWS backend runs the same code in Lambda; only the transport differs.

import { localCompiler } from '../compiler/compile';
import { DEMO_PLAN_OPTIONS } from '../data/demo';
import { PERSONAS, type PersonaId } from '../data/personas';
import { topoOrder, evaluateSchedule } from '../engine/schedule';
import { localExplainer } from '../engine/explain';
import type { ClaimEvent } from '../engine/ledger';
import { parseDescription } from '../intake/describe';
import { parseInsuranceCard } from '../intake/insuranceCard';
import { parseTreatmentPlanText } from '../intake/treatmentPlan';
import { addDays, todayISO } from '../lib/dates';
import { localOcr } from '../services/ocr';
import { pdfText } from '../services/pdf';
import type { DocumentKind, TingApi } from './index';

// --- demo state (driven by the demo panel) ---------------------------------

const mock = { personaId: 'dale' as PersonaId, asOf: todayISO() };

/** Demo-only: keep the mock backend in step with the persona switcher and "Simulate Dec 1". */
export function configureMock(opts: { personaId?: PersonaId; asOf?: string }) {
  if (opts.personaId) mock.personaId = opts.personaId;
  if (opts.asOf) mock.asOf = opts.asOf;
}

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
    const plan = parseTreatmentPlanText(text, file.type.startsWith('image/') ? 'photo' : 'upload');
    const kind: DocumentKind = plan.items.length
      ? 'treatment_plan'
      : /annual (deductible|maximum)/i.test(text)
        ? 'plan_summary'
        : parseInsuranceCard(text).groupNumber
          ? 'insurance_card'
          : 'unknown';
    return { docId: `doc-${uid()}`, kind, text, items: plan.items, unrecognized: plan.unrecognized };
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

  /** Lincoln adjudicates the next certain procedure today, exactly as the engine estimated it. */
  async fireMockClaim(profile) {
    await latency();
    const next = topoOrder(profile.procedures).find((p) => (p.likelihood ?? 1) >= 1);
    if (!next) throw new Error('No planned procedure to claim');
    const [line] = evaluateSchedule({ ...profile, procedures: [next] }, [{ id: next.id, date: profile.asOf }]).lines;
    const event: ClaimEvent = {
      type: 'claim.adjudicated',
      member: PERSONAS[mock.personaId].memberId,
      claimId: `CLM-${Date.now().toString(36).toUpperCase()}`,
      serviceDate: profile.asOf,
      provider: { npi: 'demo-0042', inNetwork: next.inNetwork },
      lines: [{ cdt: line.cdt, tooth: line.tooth, billed: line.billed, allowed: line.allowed, planPaid: line.planPaid, memberOwes: line.memberOwes }],
      rulesVersion: line.rulesVersion,
    };
    ledgerListeners.forEach((l) => l(event));
  },

  async createShareLink(scheduleKind) {
    await latency();
    const token = `${mock.personaId}.${scheduleKind}.${uid()}`;
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://ting.example';
    return { url: `${origin}/share/${token}`, expiresAt: addDays(todayISO(), 30) };
  },
};
