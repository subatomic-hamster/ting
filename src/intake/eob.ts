// An insurer's Explanation of Benefits (OCR'd, a PDF text layer, or pasted in an email) → the claim lines on it.
// Deterministic: a line with a CDT code and its dollar amounts. Amounts are read by label ("Plan paid $90.00") or, in a
// table, by the order of the column headings. The EOB is the source of truth for what the plan paid.
import type { ClaimEvent } from '../engine/ledger';
import { needsTooth } from './describe';

export interface EobLine {
  cdt: string;
  tooth?: number;
  billed: number;
  allowed: number;
  deductible: number;
  planPaid: number;
  memberOwes: number;
}

export interface ParsedEob {
  claimNumber?: string;
  serviceDate?: string;
  provider?: string;
  inNetwork: boolean;
  lines: EobLine[];
}

export const isEobText = (text: string) =>
  /explanation of benefits|\bEOB\b/i.test(text) && /plan paid|insurance paid|you owe|patient responsibility|member responsibility/i.test(text);

type Col = 'billed' | 'allowed' | 'deductible' | 'planPaid' | 'memberOwes';
const COLS: [Col, RegExp][] = [
  ['billed', /\b(?:billed|charge[sd]?|submitted)\b/i],
  ['allowed', /\b(?:allowed|allowance)\b/i],
  ['deductible', /\bdeductible\b/i],
  ['planPaid', /\b(?:plan|insurance|insurer) paid\b|\bpaid by plan\b/i],
  ['memberOwes', /\b(?:you owe|patient (?:owes|responsibility)|member (?:owes|responsibility))\b/i],
];
const AMOUNT = /\$?\s*(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})\b/g;
const CODE = /\bD[0-9OoIl]{4}\b/i;
const num = (s: string) => Number(s.replace(/[$,\s]/g, ''));
const digits = (s: string) => s.replace(/[Oo]/g, '0').replace(/[Il]/g, '1');
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Column order from a heading row such as "Tooth Code Description Billed Allowed Deductible Plan paid You owe". */
function headerOrder(lines: string[]): Col[] | undefined {
  for (const l of lines) {
    const found = COLS.flatMap(([col, re]) => {
      const at = re.exec(l)?.index;
      return at === undefined ? [] : [{ col, at }];
    });
    if (found.length >= 3 && !CODE.test(l)) return found.sort((a, b) => a.at - b.at).map((f) => f.col);
  }
  return undefined;
}

function labelled(rest: string): Partial<Record<Col, number>> {
  const out: Partial<Record<Col, number>> = {};
  for (const [col, re] of COLS) {
    const m = new RegExp(`(?:${re.source})\\s*[:=]?\\s*\\$?\\s*(\\d[\\d,]*(?:\\.\\d{2})?)`, 'i').exec(rest);
    if (m) out[col] = num(m[1]);
  }
  return out;
}

function parseDate(s: string): string | undefined {
  const us = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return iso[0];
  const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const w = /\b([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})/.exec(s);
  const mi = w ? MON.indexOf(w[1].toLowerCase()) : -1;
  return w && mi >= 0 ? `${w[3]}-${String(mi + 1).padStart(2, '0')}-${w[2].padStart(2, '0')}` : undefined;
}

export function parseEob(text: string): ParsedEob {
  const rows = text.split(/\r?\n/).map((l) => l.replace(/[|\t]+/g, '  ').trim()).filter(Boolean);
  const order = headerOrder(rows);
  const lines: EobLine[] = [];
  for (const row of rows) {
    const code = CODE.exec(row);
    if (!code || (code[0].match(/\d/g) ?? []).length < 2) continue;
    const cdt = `D${digits(code[0].slice(1))}`;
    const rest = row.replace(code[0], ' ');
    let got = labelled(rest);
    if (got.billed === undefined && got.planPaid === undefined) {
      const amounts = [...rest.matchAll(AMOUNT)].map((m) => num(`${m[1]}.${m[2]}`));
      const cols: Col[] | undefined =
        order && order.length === amounts.length
          ? order
          : amounts.length === 5
            ? ['billed', 'allowed', 'deductible', 'planPaid', 'memberOwes']
            : amounts.length === 4
              ? ['billed', 'allowed', 'planPaid', 'memberOwes']
              : undefined;
      if (!cols) continue;
      got = Object.fromEntries(cols.map((c, i) => [c, amounts[i]]));
    }
    if (got.planPaid === undefined || got.memberOwes === undefined) continue;
    const hashed = /#\s*([0-9OoIl]{1,2})\b/.exec(rest);
    const tooth = hashed ? Number(digits(hashed[1])) : undefined;
    const allowed = got.allowed ?? round2(got.planPaid + got.memberOwes);
    lines.push({
      cdt,
      tooth: tooth && tooth >= 1 && tooth <= 32 && needsTooth(cdt) ? tooth : undefined,
      billed: got.billed ?? allowed,
      allowed,
      deductible: got.deductible ?? 0,
      planPaid: got.planPaid,
      memberOwes: got.memberOwes,
    });
  }
  const dateAt = /(?:date of service|service date|dos)\b[^0-9A-Za-z]*([^\n]{0,24})/i.exec(text);
  return {
    claimNumber: /claim\s*(?:number|no\.?|#|id)\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{4,})/i.exec(text)?.[1],
    serviceDate: dateAt ? parseDate(dateAt[1]) : undefined,
    provider: /provider\s*:\s*([^.\n(]+)/i.exec(text)?.[1].trim(),
    inNetwork: !/out[- ]of[- ]network/i.test(text),
    lines,
  };
}

/** The adjudicated-claim event the ledger understands. `fallbackId` names a claim whose EOB prints no claim number. */
export function eobToClaim(eob: ParsedEob, opts: { member: string; rulesVersion: string; today: string; fallbackId: string }): ClaimEvent {
  return {
    type: 'claim.adjudicated',
    member: opts.member,
    claimId: eob.claimNumber ?? opts.fallbackId,
    serviceDate: eob.serviceDate ?? opts.today,
    provider: { npi: 'from-eob', inNetwork: eob.inNetwork },
    lines: eob.lines.map((l) => ({ cdt: l.cdt, tooth: l.tooth, billed: l.billed, allowed: l.allowed, planPaid: l.planPaid, memberOwes: l.memberOwes })),
    rulesVersion: opts.rulesVersion,
  };
}
