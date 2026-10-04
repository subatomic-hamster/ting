// The carrier's system of record (what Lincoln keeps about a dental member), modelled on the industry data sets:
// enrollment (X12 834), claims (837D: CDT code, tooth, surfaces per line), remittance (835: allowed, paid, patient
// responsibility, adjustment reason codes), per-plan-year accumulators, providers (NPI, network) and
// pre-treatment estimates. Pure builders here; storage in carrier.ts.
import { DEMO_FEES } from '../../../src/engine/cdt';
import type { PlanRules } from '../../../src/engine/types';
import type { Member } from '../../../src/data/members';
import dentists from '../../../src/fixtures/dentists.json';

export const GROUP_NUMBER = '00412345';

export interface CarrierMember {
  memberId: string;
  subscriberId: string;
  relationship: 'self' | 'spouse' | 'child';
  firstName: string;
  employer: string;
  employeeId: string;
  groupNumber: string;
  planId: string;
  coverageTier: string;
  effectiveDate: string;
  termDate?: string;
  zip: string;
  /** Contact address on file with the carrier (members can add their own in Ting). */
  email?: string;
  primaryDentistNpi?: string;
  dependents: { name: string; relationship: 'spouse' | 'child'; age: number }[];
}

export interface ClaimLine {
  lineNo: number;
  cdt: string;
  tooth?: number;
  surfaces?: string;
  billed: number;
  allowed: number;
  deductibleApplied: number;
  coinsurancePct: number;
  planPaid: number;
  memberOwes: number;
  /** 835 claim adjustment reason codes, e.g. 45 = charge exceeds fee schedule (contractual), 1 = deductible, 2 = coinsurance. */
  adjustments: { group: 'CO' | 'PR' | 'OA'; carc: string; amount: number }[];
}

export interface CarrierClaim {
  claimId: string;
  memberId: string;
  providerNpi: string;
  inNetwork: boolean;
  receivedDate: string;
  serviceDate: string;
  status: 'received' | 'pended' | 'adjudicated' | 'denied';
  adjudicatedDate?: string;
  paymentMethod?: 'EFT' | 'check';
  lines: ClaimLine[];
  totals: {
    billed: number;
    allowed: number;
    planPaid: number;
    memberOwes: number;
  };
  rulesVersion: string;
  /** seed = history before the demo; visit = a visit adjudicated while Ting is running. */
  origin: 'seed' | 'visit';
}

export interface Accumulators {
  memberId: string;
  planYear: number;
  deductibleMet: number;
  annualMaxUsed: number;
  orthoUsed: number;
  rolloverBalance: number;
}

export interface CarrierProvider {
  npi: string;
  name: string;
  specialty: 'general' | 'endodontics' | 'periodontics' | 'oral surgery' | 'orthodontics';
  zip: string;
  lat: number;
  lng: number;
  inNetwork: boolean;
  acceptingNew: boolean;
  feeMultiplier: number;
  /** Ting's demo dentist id, for pricing with the engine. */
  dentistId: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A valid-format NPI (Luhn over the 80840 prefix), demo only. */
export function demoNpi(seed: number): string {
  const base = String(123400000 + seed).slice(0, 9);
  const digits = `80840${base}`.split('').map(Number);
  let sum = 0;
  for (let i = digits.length - 1, alt = true; i >= 0; i--, alt = !alt) {
    let d = digits[i];
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return `${base}${(10 - (sum % 10)) % 10}`;
}

export const PROVIDERS: CarrierProvider[] = dentists.dentists.map((d, i) => ({
  npi: demoNpi(i + 1),
  name: d.name,
  specialty: 'general',
  zip: dentists.zip,
  lat: d.lat,
  lng: d.lng,
  inNetwork: d.inNetwork,
  acceptingNew: d.acceptingNew,
  feeMultiplier: d.feeMultiplier,
  dentistId: d.id,
}));

export const providerFor = (dentistId: string) => PROVIDERS.find((p) => p.dentistId === dentistId) ?? PROVIDERS[0];

/** One adjudicated claim line with 835-style adjustments. */
export function claimLine(
  lineNo: number,
  cdt: string,
  billed: number,
  allowed: number,
  planPaid: number,
  deductibleApplied: number,
  tooth?: number,
): ClaimLine {
  const memberOwes = round2(allowed - planPaid);
  const coinsurancePct = allowed - deductibleApplied > 0 ? round2(planPaid / (allowed - deductibleApplied)) : 0;
  const adjustments: ClaimLine['adjustments'] = [];
  if (billed > allowed)
    adjustments.push({
      group: 'CO',
      carc: '45',
      amount: round2(billed - allowed),
    });
  if (deductibleApplied > 0) adjustments.push({ group: 'PR', carc: '1', amount: deductibleApplied });
  if (memberOwes - deductibleApplied > 0)
    adjustments.push({
      group: 'PR',
      carc: '2',
      amount: round2(memberOwes - deductibleApplied),
    });
  return {
    lineNo,
    cdt,
    tooth,
    billed,
    allowed,
    deductibleApplied,
    coinsurancePct,
    planPaid,
    memberOwes,
    adjustments,
  };
}

export function totals(lines: ClaimLine[]) {
  const sum = (k: 'billed' | 'allowed' | 'planPaid' | 'memberOwes') => round2(lines.reduce((s, l) => s + l[k], 0));
  return {
    billed: sum('billed'),
    allowed: sum('allowed'),
    planPaid: sum('planPaid'),
    memberOwes: sum('memberOwes'),
  };
}

/** Everything the carrier holds for a demo member, as of a date: enrollment, plan, accumulators, claim history. */
const PERSONA_EMPLOYEE_IDS: Record<string, string> = { dale: 'E1001', jordan: 'E1002', priya: 'E1003' };

/** Works for a demo persona and for a member who signed up (`U-` id: an employee number derived from the member id). */
export function seedRecords(persona: Member, asOf: string) {
  const profile = persona.profile(asOf);
  const provider = providerFor(persona.currentDentistId);
  const member: CarrierMember = {
    memberId: persona.memberId,
    subscriberId: persona.memberId.replace(/^[MU]-/, 'S-'),
    relationship: 'self',
    firstName: persona.name,
    employer: persona.employer,
    employeeId: PERSONA_EMPLOYEE_IDS[persona.id] ?? `E${persona.memberId.slice(-4)}`,
    groupNumber: GROUP_NUMBER,
    planId: profile.currentPlan.id,
    coverageTier: persona.coverage,
    effectiveDate: profile.ledger.coverageStart,
    zip: dentists.zip,
    primaryDentistNpi: provider.npi,
    dependents:
      persona.id === 'priya'
        ? [
            { name: 'Child 1', relationship: 'child', age: 13 },
            { name: 'Child 2', relationship: 'child', age: 9 },
          ]
        : [],
  };
  const claims: CarrierClaim[] = profile.ledger.history
    .filter((h) => h.source === 'claim')
    .map((h, i) => {
      const fee = DEMO_FEES[h.cdt];
      const allowed = fee?.inNetwork ?? h.planPaid;
      const lines = [claimLine(1, h.cdt, fee?.billed ?? allowed, allowed, h.planPaid, 0, h.tooth)];
      return {
        claimId: h.claimId ?? `CLM-SEED-${persona.memberId}-${i + 1}`,
        memberId: persona.memberId,
        providerNpi: provider.npi,
        inNetwork: h.inNetwork !== false,
        receivedDate: h.date,
        serviceDate: h.date,
        status: 'adjudicated' as const,
        adjudicatedDate: h.date,
        paymentMethod: 'EFT' as const,
        lines,
        totals: totals(lines),
        rulesVersion: profile.currentPlan.version,
        origin: 'seed' as const,
      };
    });
  const accumulators: Accumulators = {
    memberId: persona.memberId,
    planYear: profile.ledger.planYear,
    deductibleMet: profile.ledger.deductibleMet,
    annualMaxUsed: profile.ledger.maxUsed,
    orthoUsed: profile.ledger.orthoUsed,
    rolloverBalance: profile.ledger.rolloverBalance,
  };
  return {
    member,
    plan: profile.currentPlan as PlanRules,
    claims,
    accumulators,
  };
}
