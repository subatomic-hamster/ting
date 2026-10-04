// Reconciliation: one visit can arrive as Lincoln's EOB and the dentist's invoice. The EOB is the source of truth
// for what the plan paid; the invoice adds what the dentist billed. An in-network dentist agrees to accept
// Lincoln's allowed fee, so an invoice asking for more than the EOB's "member owes" is flagged.
import { toDay } from './dates';
import { usd } from './format';
import type { ServiceRecord } from './types';

export interface Invoice {
  provider?: string;
  serviceDate?: string;
  /** What the invoice asks the patient to pay. */
  amountDue?: number;
  codes: string[];
  /** Charge lines (not totals, payments or adjustments), for the line-item check. */
  lines: { text: string; amount: number }[];
}

export interface ClaimRecord {
  claimId: string;
  date: string;
  codes: string[];
  inNetwork: boolean;
  /** EOB total the member owes for the claim. */
  memberOwes: number;
}

const MONEY = /\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)/;
const DUE = /(amount due|balance due|patient (?:balance|responsibility|portion)|please pay|total due|you owe)/i;

/** Pulls the patient's amount due, date of service, provider and codes from an invoice's text. */
export function parseInvoice(text: string): Invoice {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const dueLine = [...lines].reverse().find((l) => DUE.test(l) && MONEY.test(l.replace(DUE, '')));
  const amountDue = dueLine ? Number(MONEY.exec(dueLine.replace(DUE, ''))?.[1].replace(/,/g, '')) : undefined;
  const dateLine = lines.find((l) => /date of service|service date|visit date|date:/i.test(l)) ?? '';
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(dateLine) ?? /(\d{4})-(\d{2})-(\d{2})/.exec(dateLine);
  const serviceDate = !m ? undefined : m[3].length === 4 ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : `${m[1]}-${m[2]}-${m[3]}`;
  const codes = [...new Set([...text.matchAll(/\bD\d{4}\b/g)].map((x) => x[0]))];
  const charges = lines
    .filter((l) => !DUE.test(l) && !/insurance|adjustment|payment|paid|total|balance|credit/i.test(l) && /\$\s*\d/.test(l) && !/-\s*\$/.test(l))
    .map((l) => ({ text: l, amount: Number((/\$\s*([\d,]+(?:\.\d{2})?)\s*$/.exec(l) ?? /\$\s*([\d,]+(?:\.\d{2})?)/.exec(l))?.[1].replace(/,/g, '')) }))
    .filter((c) => Number.isFinite(c.amount) && c.amount > 0);
  return { provider: lines[0], serviceDate, amountDue, codes, lines: charges };
}

export const isInvoiceText = (text: string) => /\binvoice\b|\bstatement\b|amount due|balance due/i.test(text) && !/explanation of benefits/i.test(text);

/** Groups EOB lines in the ledger into claims. */
export function claimsFromLedger(history: ServiceRecord[]): ClaimRecord[] {
  const by = new Map<string, ClaimRecord>();
  for (const h of history) {
    if (h.source !== 'claim' || !h.claimId || h.memberOwes === undefined) continue;
    const c = by.get(h.claimId) ?? { claimId: h.claimId, date: h.date, codes: [], inNetwork: h.inNetwork !== false, memberOwes: 0 };
    c.codes.push(h.cdt);
    c.memberOwes = Math.round((c.memberOwes + h.memberOwes) * 100) / 100;
    by.set(h.claimId, c);
  }
  return [...by.values()];
}

/** Heuristic match probabilities (the Winnow stand-in): same visit within 3 days, shared codes, nothing else close. */
export function heuristicMatch(inv: Invoice, claims: ClaimRecord[]): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const c of claims) {
    const days = inv.serviceDate ? Math.abs(toDay(inv.serviceDate) - toDay(c.date)) : 99;
    const shared = inv.codes.filter((x) => c.codes.includes(x)).length;
    scores[c.claimId] = (days <= 3 ? 0.6 : 0.05) + (shared ? 0.35 : inv.codes.length ? 0 : 0.15);
  }
  const best = Math.max(0, ...Object.values(scores));
  const total = Object.values(scores).reduce((s, v) => s + v, 0) + (1 - best) * 0.5;
  const entries: [string, number][] = [...Object.entries(scores), ['none', (1 - best) * 0.5]];
  return Object.fromEntries(entries.map(([k, v]) => [k, Math.round((v / total) * 1e4) / 1e4]));
}

export type MatchDecision = { kind: 'linked' | 'confirm'; claimId: string; p: number } | { kind: 'unlinked'; p: number };

/** Spec thresholds: 0.9+ links, 0.5–0.9 asks the member to confirm, below 0.5 stays unlinked. */
export function decideMatch(probs: Record<string, number>): MatchDecision {
  const [claimId, p] = Object.entries(probs)
    .filter(([k]) => k !== 'none')
    .reduce<[string, number]>((a, b) => (b[1] > a[1] ? b : a), ['', 0]);
  if (!claimId || p < 0.5) return { kind: 'unlinked', p };
  return { kind: p >= 0.9 ? 'linked' : 'confirm', claimId, p };
}

/**
 * The consumer-protection check: an in-network bill above the EOB's member-owes amount. `notCovered` is what the bill
 * legitimately charges outside the plan (a missed-appointment fee, whitening), found by the line-item check.
 */
export function overbilling(inv: Invoice, claim: ClaimRecord, notCovered = 0): { over: number; message: string } | undefined {
  if (!claim.inNetwork || inv.amountDue === undefined || inv.amountDue - notCovered <= claim.memberOwes + 0.5) return undefined;
  const over = Math.round((inv.amountDue - notCovered - claim.memberOwes) * 100) / 100;
  return {
    over,
    message: notCovered
      ? `Your bill asks for ${usd(inv.amountDue)}. Leaving out ${usd(notCovered)} the plan doesn't cover, that's ${usd(inv.amountDue - notCovered)}, but your insurer's EOB says you owe ${usd(claim.memberOwes)}. In-network dentists agree to accept your insurer's allowed fee. Ask the office for a corrected bill.`
      : `Your bill asks for ${usd(inv.amountDue)}, but your insurer's EOB says you owe ${usd(claim.memberOwes)}. In-network dentists agree to accept your insurer's allowed fee. Ask the office for a corrected bill.`,
  };
}
