// Seeded demo data, labelled "demo data" on screen. Plan numbers follow the spec's worked example:
// $1,500 max with $300 used, root canal + buildup + two crowns quoted in October.
//
// The plan designs mirror real Lincoln-insured employer plans (docs/dental-pricing-and-plan-designs.md):
// Low ≈ Iredell County NC Low Plan 2023–24 ($1,500 max, $50 deductible, preventive/basic/major 100/80/50, the common
// Lincoln split); High ≈ Iredell High / Prosper ISD High 2024–25 ($2,000 max, child braces, 90th-percentile U&C,
// SmileRewards); Basic ≈ Life School of Dallas Low 2025 ($750 max, $100 deductible, 80/80/50, MAC). MaxRewards
// rollover tables are Lincoln's published ones. Premiums are illustrative, within the observed employee-only range.
import { DEMO_FEES } from '../engine/cdt';
import type { CdtCategory, FrequencyLimit, PlanRules, Profile, ServiceClass } from '../engine/types';

const FREQUENCY: FrequencyLimit[] = [
  { id: 'exams', label: 'Exams: 2 per calendar year', codes: ['D0120', 'D0140', 'D0150'], count: 2, period: { kind: 'calendarYear' }, perTooth: false },
  { id: 'cleanings', label: 'Cleanings: 2 per calendar year', codes: ['D1110', 'D1120', 'D4910'], count: 2, period: { kind: 'calendarYear' }, perTooth: false },
  { id: 'bitewings', label: 'Bitewing X-rays: 1 per calendar year', codes: ['D0274'], count: 1, period: { kind: 'calendarYear' }, perTooth: false },
  { id: 'fmx', label: 'Full-mouth or panoramic X-rays: 1 per 60 months', codes: ['D0210', 'D0330'], count: 1, period: { kind: 'months', months: 60 }, perTooth: false },
  {
    id: 'crowns',
    label: 'Crowns and bridges: 1 per tooth per 60 months',
    codes: ['D2740', 'D2750', 'D2790', 'D6065', 'D6240', 'D6750'],
    count: 1,
    period: { kind: 'months', months: 60 },
    perTooth: true,
  },
  { id: 'buildups', label: 'Buildups and posts: 1 per tooth per 60 months', codes: ['D2950', 'D2954'], count: 1, period: { kind: 'months', months: 60 }, perTooth: true },
  { id: 'srp', label: 'Scaling and root planing: 1 per quadrant per 24 months', codes: ['D4341', 'D4342'], count: 1, period: { kind: 'months', months: 24 }, perTooth: true },
  { id: 'nightguard', label: 'Night guards: 1 per 36 months', codes: ['D9944'], count: 1, period: { kind: 'months', months: 36 }, perTooth: false },
];

const CLASSES: Record<CdtCategory, ServiceClass | 'excluded'> = {
  diagnostic: 'preventive',
  preventive: 'preventive',
  restorative: 'basic',
  endodontics: 'basic',
  periodontics: 'basic',
  oralSurgery: 'basic',
  adjunctive: 'basic',
  majorRestorative: 'major',
  prosthodontics: 'major',
  implants: 'major',
  orthodontics: 'excluded',
};

const NO_WAIT: Record<ServiceClass, number> = { preventive: 0, basic: 0, major: 0, ortho: 0 };

const SECTIONS: PlanRules['sections'] = {
  coinsurance: 'Schedule of Benefits, §2',
  deductible: 'Schedule of Benefits, §1',
  annualMax: 'Plan Maximums, §4',
  waitingPeriods: 'Eligibility, §6',
  frequencyLimits: 'Limitations, §8',
  alternateBenefit: 'Limitations, §8.3',
  maxRewards: 'Max Rollover, §5',
  preventiveMax: 'Plan Maximums, §4.2',
  q4Carryover: 'Schedule of Benefits, §1.4',
  outOfNetwork: 'Out-of-Network Benefits, §3',
  serviceClasses: 'Covered Services, §7',
  premium: 'Enrollment Summary',
  workInProgress: 'Work in Progress, §9',
};

export const ACME_LOW: PlanRules = {
  id: 'acme-low',
  name: 'Acme Dental Low',
  kind: 'insurance',
  version: 'PLAN-ACME-LOW-v3',
  premiumMonthly: 24,
  premiumPreTax: true,
  coinsurance: {
    inNetwork: { preventive: 1, basic: 0.8, major: 0.5, ortho: 0 },
    outOfNetwork: { preventive: 1, basic: 0.8, major: 0.5, ortho: 0 },
  },
  deductible: { amount: 50, appliesTo: ['basic', 'major'] },
  annualMax: 1500,
  orthoLifetimeMax: 0,
  waitingPeriodMonths: NO_WAIT,
  frequencyLimits: FREQUENCY,
  categoryClass: CLASSES,
  alternateBenefit: true,
  preventiveCountsTowardMax: true,
  q4DeductibleCarryover: true,
  // Lincoln's MaxRewards table for a $1,500 max: $800 claim threshold, $350 rollover ($500 if only in-network
  // dentists were used), $1,250 account cap, deposited on day 65.
  maxRewards: { threshold: 800, rolloverAmount: 350, inNetworkBonus: 150, accountLimit: 1250, depositDay: 65 },
  outOfNetwork: { basis: 'ucr', percentile: 80 },
  sections: SECTIONS,
};

export const ACME_HIGH: PlanRules = {
  ...ACME_LOW,
  id: 'acme-high',
  name: 'Acme Dental High',
  version: 'PLAN-ACME-HIGH-v3',
  premiumMonthly: 46,
  // Real Lincoln Low/High pairs keep the same 100/80/50 split; High buys a bigger max, braces and better out-of-network pay.
  coinsurance: {
    inNetwork: { preventive: 1, basic: 0.8, major: 0.5, ortho: 0.5 },
    outOfNetwork: { preventive: 1, basic: 0.8, major: 0.5, ortho: 0.5 },
  },
  annualMax: 2000,
  orthoLifetimeMax: 1500,
  categoryClass: { ...CLASSES, orthodontics: 'ortho' },
  alternateBenefit: false,
  preventiveCountsTowardMax: false,
  // No published Lincoln table for a $2,000 max was found; this is the nearest one ($1,750 max).
  maxRewards: { threshold: 800, rolloverAmount: 350, inNetworkBonus: 175, accountLimit: 1500, depositDay: 65 },
  outOfNetwork: { basis: 'ucr', percentile: 90 },
};

/** The cost-conscious tier some employers add below Low (Life School of Dallas Low 2025; Prosper ISD Standard 2024–25). */
export const ACME_BASIC: PlanRules = {
  ...ACME_LOW,
  id: 'acme-basic',
  name: 'Acme Dental Basic',
  version: 'PLAN-ACME-BASIC-v1',
  premiumMonthly: 16,
  coinsurance: {
    inNetwork: { preventive: 0.8, basic: 0.8, major: 0.5, ortho: 0 },
    outOfNetwork: { preventive: 0.8, basic: 0.8, major: 0.5, ortho: 0 },
  },
  deductible: { amount: 100, appliesTo: ['basic', 'major'] },
  annualMax: 750,
  q4DeductibleCarryover: false,
  maxRewards: undefined,
  // Maximum allowable charge: out of network, the plan pays from the in-network fee schedule.
  outOfNetwork: { basis: 'mac' },
};

function selfPay(id: string, name: string, kind: 'waive' | 'membership', annualFee = 0, discount = 0): PlanRules {
  return {
    ...ACME_LOW,
    id,
    name,
    kind,
    version: `${id.toUpperCase()}-v1`,
    premiumMonthly: Math.round((annualFee / 12) * 100) / 100,
    premiumPreTax: false,
    annualMax: 0,
    maxRewards: undefined,
    membership: kind === 'membership' ? { annualFee, discount } : undefined,
    sections: {},
  };
}

export const WAIVE: PlanRules = selfPay('waive', 'Waive coverage and pay yourself', 'waive');
export const MEMBERSHIP: PlanRules = selfPay('membership', "Your dentist's membership plan", 'membership', 399, 0.2);

export const DEMO_PLAN_OPTIONS: PlanRules[] = [ACME_BASIC, ACME_LOW, ACME_HIGH, WAIVE, MEMBERSHIP];

export const DEMO_PROFILE: Profile = {
  asOf: '2026-10-05',
  currentPlan: ACME_LOW,
  ledger: {
    planYear: 2026,
    coverageStart: '2023-01-01',
    maxUsed: 300,
    deductibleMet: 50,
    orthoUsed: 0,
    rolloverBalance: 0,
    history: [
      { date: '2026-04-10', cdt: 'D0120', planPaid: 45, inNetwork: true, source: 'claim' },
      { date: '2026-04-10', cdt: 'D0274', planPaid: 55, inNetwork: true, source: 'claim' },
      { date: '2026-04-10', cdt: 'D1110', planPaid: 85, inNetwork: true, source: 'claim' },
      { date: '2026-06-18', cdt: 'D2392', tooth: 14, planPaid: 115, inNetwork: true, source: 'claim' },
    ],
    pastYears: [
      { year: 2024, planPaid: 410, annualMax: 1500 },
      { year: 2025, planPaid: 1500, annualMax: 1500 },
    ],
  },
  procedures: [
    { id: 'rc19', cdt: 'D3330', tooth: 19, fee: 1180, allowedFee: 1000, inNetwork: true, deadline: '2026-11-15', locked: true },
    { id: 'bu19', cdt: 'D2950', tooth: 19, fee: 330, allowedFee: 250, inNetwork: true, deadline: '2027-03-31', dependsOn: ['rc19'] },
    { id: 'cr19', cdt: 'D2740', tooth: 19, fee: 1450, allowedFee: 1200, inNetwork: true, deadline: '2027-03-31', dependsOn: ['bu19'] },
    { id: 'cr30', cdt: 'D2740', tooth: 30, fee: 1450, allowedFee: 1200, inNetwork: true, deadline: '2027-03-31' },
    { id: 'clean', cdt: 'D1110', fee: 120, allowedFee: 85, inNetwork: true, deadline: '2027-01-31' },
    { id: 'rc3', cdt: 'D3330', tooth: 3, fee: 1180, allowedFee: 1000, inNetwork: true, deadline: '2027-12-31', likelihood: 0.3 },
  ],
  money: {
    fsaOffered: true,
    fsaBalance: 400,
    fsaRule: { kind: 'carryover', max: 680 },
    marginalTaxRate: 0.3,
  },
  fees: DEMO_FEES,
};

/** Seeded Lincoln EOB for the simulated claims feed: same shape as production. */
export const DEMO_CLAIM_EVENT = {
  type: 'claim.adjudicated',
  member: 'tok_7f3k2',
  claimId: 'C-2026-10-0412',
  serviceDate: '2026-10-14',
  provider: { npi: 'demo-0042', inNetwork: true },
  lines: [{ cdt: 'D3330', tooth: 19, billed: 1180, allowed: 1000, planPaid: 800, memberOwes: 200 }],
  annualMaxRemaining: 400,
  rulesVersion: 'PLAN-ACME-LOW-v3',
} as const;
