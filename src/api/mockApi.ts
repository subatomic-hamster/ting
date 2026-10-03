// Mock backend: fixture data with 300–800 ms of simulated latency.
// Everything here is demo data.

import type { ClaimAdjudicatedEvent, LedgerEntry, ProcedureItem, WaterfallStep } from '../contracts';
import { FEE_SCHEDULE, procedureFromCdt } from '../fixtures/feeSchedule';
import { PERSONAS, SAMPLE_PLANS, type PersonaId } from '../fixtures/personas';
import { addDays, todayISO, yearOf } from '../lib/dates';
import type { DocumentKind, IntakeQuestion, TingApi } from './index';

// --- demo state (driven by the demo panel) ---------------------------------

const mock = {
  personaId: 'dale' as PersonaId,
  asOf: todayISO(),
  firedClaims: [] as LedgerEntry[],
};

/** Demo-only: keep the mock backend in step with the persona switcher and "Simulate Dec 1". */
export function configureMock(opts: { personaId?: PersonaId; asOf?: string; reset?: boolean }) {
  if (opts.personaId && opts.personaId !== mock.personaId) mock.firedClaims = [];
  if (opts.reset) mock.firedClaims = [];
  if (opts.personaId) mock.personaId = opts.personaId;
  if (opts.asOf) mock.asOf = opts.asOf;
}

const latency = () => new Promise<void>((r) => setTimeout(r, 300 + Math.random() * 500));
const uid = () => Math.random().toString(36).slice(2, 8);

// --- intake: keyword matching ----------------------------------------------

const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, both: 2 };

/** Keyword → CDT, longest keywords first so "deep cleaning" wins over "cleaning". */
const KEYWORDS = FEE_SCHEDULE.flatMap((f) => f.keywords.map((k) => ({ k, cdt: f.cdt }))).sort(
  (a, b) => b.k.length - a.k.length,
);
const AMBIGUOUS = new Set(['cap', 'pull', 'pulled', 'core', 'ortho']);

function parse(text: string): { items: ProcedureItem[]; questions: IntakeQuestion[] } {
  let rest = ` ${text.toLowerCase()} `;
  const items: ProcedureItem[] = [];
  const questions: IntakeQuestion[] = [];
  const maybe = /\b(maybe|might|possibly|could need|may need|probably)\b/.test(rest);

  for (const { k, cdt } of KEYWORDS) {
    const re = new RegExp(`(\\b(?:a|an|one|two|three|four|both|\\d)\\s+)?${k.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}s?\\b([^.,;]{0,40})`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(rest))) {
      const countWord = m[1]?.trim();
      const count = countWord ? (NUMBER_WORDS[countWord] ?? (Number(countWord) || 1)) : 1;
      const teeth = [...m[2].matchAll(/(?:#|tooth\s+|number\s+)(\d{1,2})/g)].map((t) => Number(t[1]));
      for (let i = 0; i < Math.min(count, 4); i++) {
        const tooth = teeth[i];
        items.push(
          procedureFromCdt(cdt, {
            id: `p-${cdt}-${uid()}`,
            tooth,
            source: 'typed',
            confidence: AMBIGUOUS.has(k) ? 0.72 : tooth || cdt < 'D2000' ? 0.94 : 0.86,
            likelihood: maybe ? 0.5 : undefined,
          }),
        );
      }
      // Consume the keyword (not the trailing words, which may name other procedures).
      const used = m[0].length - m[2].length;
      rest = rest.slice(0, m.index) + ' '.repeat(used) + rest.slice(m.index + used);
    }
  }

  const needsTooth = items.find((i) => i.tooth === undefined && ['major', 'basic'].includes(i.serviceClass));
  if (needsTooth) {
    questions.push({
      id: 'tooth',
      text: `Which tooth is the ${needsTooth.label.toLowerCase()} for?`,
      why: 'The tooth number lets us check frequency limits, like one crown per tooth every five years.',
      options: ['Upper', 'Lower', 'Not sure'],
    });
  }
  if (maybe) {
    questions.push({
      id: 'likelihood',
      text: 'How likely is the "maybe" work?',
      why: 'We weigh maybe-work by its odds when comparing plans, so a 30% chance counts less than a sure thing.',
      options: ['Unlikely (25%)', 'Coin flip (50%)', 'Likely (75%)'],
    });
  }
  return { items, questions };
}

// --- explanations (the AI fills these in real mode) -------------------------

function explainStep(s: WaterfallStep): WaterfallStep {
  const text: Record<WaterfallStep['key'], string> = {
    fee: "This is the dentist's full price before any insurance.",
    networkDiscount:
      s.amount < 0
        ? 'This dentist is in network, so they agreed to a lower price. You never owe the difference.'
        : "Out-of-network dentists haven't agreed to a price, so they can bill you above what the plan allows (balance billing).",
    deductible: s.label.includes('waived')
      ? "Preventive care skips the deductible, so the plan starts paying right away."
      : s.label.includes('met')
        ? "You've already paid your deductible this year, so the plan shares the cost from the first dollar."
        : 'You pay this part first each year before the plan starts sharing costs.',
    coinsurance: 'The plan pays this share of the allowed price; the rest is yours.',
    maxCap:
      s.amount > 0
        ? "The plan has hit its yearly limit, so it stops paying. The part it can't cover moves to you."
        : "There's still room under this year's limit, so nothing extra moves to you.",
    youPay: 'This is your estimated share. An FSA can cover it with pre-tax money.',
  };
  const checkable = s.key !== 'fee' && s.key !== 'youPay';
  return {
    ...s,
    explanation: text[s.key],
    verification: checkable ? (s.citation ? 'verified' : 'unverified') : s.verification,
  };
}

// --- ledger events ------------------------------------------------------------

const ledgerListeners = new Set<(e: ClaimAdjudicatedEvent) => void>();

function seededClaim(): ClaimAdjudicatedEvent {
  const persona = PERSONAS[mock.personaId];
  return {
    type: 'claim.adjudicated',
    member: persona.memberId,
    claimId: `CLM-${Date.now().toString(36).toUpperCase()}`,
    serviceDate: mock.asOf,
    provider: { npi: '1999999984', inNetwork: true },
    lines: [{ cdt: 'D3330', tooth: 19, billed: 1350, allowed: 1000, planPaid: 800, memberOwes: 200 }],
    annualMaxRemaining: 400,
    rulesVersion: SAMPLE_PLANS.find((p) => p.id === persona.selectedPlanId)?.rulesVersion ?? 'unknown',
  };
}

function docKind(file: File): DocumentKind {
  const n = file.name.toLowerCase();
  if (/eob|explanation/.test(n)) return 'eob';
  if (/invoice|receipt|statement/.test(n)) return 'invoice';
  if (/card/.test(n)) return 'insurance_card';
  if (/summary|sbc|benefit|plan/.test(n)) return 'plan_summary';
  if (/treatment|estimate|quote/.test(n) || file.type.startsWith('image/')) return 'treatment_plan';
  return 'unknown';
}

// --- the mock API ---------------------------------------------------------------

export const mockApi: TingApi = {
  async getSession() {
    await latency();
    const p = PERSONAS[mock.personaId];
    return { memberId: p.memberId, name: p.name, employer: p.employer, role: 'member' };
  },

  async getPlans() {
    await latency();
    return SAMPLE_PLANS;
  },

  async getLedger() {
    await latency();
    return [...PERSONAS[mock.personaId].ledger(yearOf(mock.asOf)), ...mock.firedClaims];
  },

  async parseDescription(text) {
    await latency();
    return parse(text);
  },

  async uploadDocument(file) {
    await latency();
    const kind = docKind(file);
    const items =
      kind === 'treatment_plan'
        ? [
            procedureFromCdt('D2740', { id: `p-D2740-${uid()}`, tooth: 14, source: 'photo', confidence: 0.82 }),
            procedureFromCdt('D2392', { id: `p-D2392-${uid()}`, tooth: 15, source: 'photo', confidence: 0.93 }),
          ]
        : undefined;
    return { docId: `doc-${uid()}`, kind, items };
  },

  async explain(_procedureId, steps) {
    await latency();
    return steps.map(explainStep);
  },

  subscribeLedger(onEvent) {
    ledgerListeners.add(onEvent);
    return () => ledgerListeners.delete(onEvent);
  },

  async fireMockClaim() {
    await latency();
    const e = seededClaim();
    mock.firedClaims.push(
      ...e.lines.map((l, i) => ({
        id: `${e.claimId}-${i}`,
        serviceDate: e.serviceDate,
        ...l,
        source: 'claim' as const,
        isDemoData: true,
      })),
    );
    ledgerListeners.forEach((l) => l(e));
  },

  async createShareLink(scheduleKind) {
    await latency();
    const token = `${mock.personaId}.${scheduleKind}.${uid()}`;
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://ting.example';
    return { url: `${origin}/share/${token}`, expiresAt: addDays(todayISO(), 30) };
  },
};
