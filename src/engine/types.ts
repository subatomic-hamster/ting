// Ting decision engine: shared types.
// Pure data, no DOM or AWS imports, so the same engine runs in the browser and in Lambda.

/** Calendar date, `YYYY-MM-DD`. */
export type ISODate = string;

export type ServiceClass = 'preventive' | 'basic' | 'major' | 'ortho';

/** CDT category; each plan maps every category to a service class (or excludes it). */
export type CdtCategory =
  | 'diagnostic'
  | 'preventive'
  | 'restorative'
  | 'majorRestorative'
  | 'endodontics'
  | 'periodontics'
  | 'prosthodontics'
  | 'implants'
  | 'oralSurgery'
  | 'orthodontics'
  | 'adjunctive';

/** Plan-document citation keys; every waterfall step and explanation cites one. */
export type RuleKey =
  | 'coinsurance'
  | 'deductible'
  | 'annualMax'
  | 'waitingPeriods'
  | 'frequencyLimits'
  | 'alternateBenefit'
  | 'maxRewards'
  | 'preventiveMax'
  | 'q4Carryover'
  | 'outOfNetwork'
  | 'serviceClasses'
  | 'premium'
  | 'workInProgress';

export interface FrequencyLimit {
  id: string;
  label: string; // "Cleanings: 2 per calendar year"
  codes: string[];
  count: number;
  period: { kind: 'calendarYear' } | { kind: 'months'; months: number };
  perTooth: boolean;
}

/** Lincoln MaxRewards: low-use years roll part of the max into a rollover account. */
export interface MaxRewards {
  threshold: number; // plan-paid claims at or under this earn a rollover
  rolloverAmount: number;
  inNetworkBonus: number; // extra when every claim that year was in network
  accountLimit: number;
  depositDay: number; // day of the following plan year the rollover is deposited (Lincoln: 65)
}

export type OutOfNetworkBasis = { basis: 'ucr'; percentile: 50 | 70 | 80 | 90 | 95 } | { basis: 'mac' };

export interface PlanRules {
  id: string;
  name: string;
  /** insurance = a Lincoln plan; waive = self-pay; membership = a dentist's in-office plan. */
  kind: 'insurance' | 'waive' | 'membership';
  /** Approved rules version; every estimate names the version it used. */
  version: string;
  premiumMonthly: number;
  premiumPreTax: boolean;
  coinsurance: { inNetwork: Record<ServiceClass, number>; outOfNetwork: Record<ServiceClass, number> };
  deductible: { amount: number; appliesTo: ServiceClass[] };
  annualMax: number;
  orthoLifetimeMax: number;
  /** Months from coverage start before each class is covered. Only new enrollees serve them. */
  waitingPeriodMonths: Record<ServiceClass, number>;
  frequencyLimits: FrequencyLimit[];
  categoryClass: Record<CdtCategory, ServiceClass | 'excluded'>;
  /** Back-tooth composite fillings paid at the amalgam rate. */
  alternateBenefit: boolean;
  preventiveCountsTowardMax: boolean;
  /** Deductible met in Oct-Dec also counts toward next year's deductible. */
  q4DeductibleCarryover: boolean;
  maxRewards?: MaxRewards;
  outOfNetwork: OutOfNetworkBasis;
  membership?: { annualFee: number; discount: number };
  sections: Partial<Record<RuleKey, string>>;
}

export interface ServiceRecord {
  date: ISODate;
  cdt: string;
  tooth?: number;
  planPaid: number;
  inNetwork?: boolean;
  source: 'claim' | 'user' | 'invoice';
  claimId?: string;
  /** From the EOB: what the member owes for this line. */
  memberOwes?: number;
}

/** What the member has used. `maxUsed`/`deductibleMet` are for `planYear`. */
export interface Ledger {
  planYear: number;
  coverageStart: ISODate;
  maxUsed: number;
  deductibleMet: number;
  orthoUsed: number;
  /** MaxRewards account already deposited and available. */
  rolloverBalance: number;
  history: ServiceRecord[];
  /** Past plan years, for the "hit the max" / "used under 20%" signals. */
  pastYears: { year: number; planPaid: number; annualMax: number }[];
}

export interface PlannedProcedure {
  id: string;
  cdt: string;
  tooth?: number;
  label?: string;
  /** Dentist's billed fee. */
  fee: number;
  /** Contracted fee (in network) or known allowance; looked up when absent. */
  allowedFee?: number;
  inNetwork: boolean;
  /** Set by the dentist only. Nothing is ever scheduled after it. */
  deadline?: ISODate;
  /** Urgent: fixed at the earliest date, can't be moved. */
  locked?: boolean;
  dependsOn?: string[];
  /** Minimum days after the procedures it depends on. */
  gapDays?: number;
  /** Procedures sharing a visit id are done in one appointment ("2 fillings"), so they're always on the same date. */
  visit?: string;
  /** Ting picked the tooth to price it (nobody said which): it's priced, never shown as a tooth number. */
  toothGuessed?: boolean;
  /** 0..1, for the dentist's "maybe" items. Absent = certain. */
  likelihood?: number;
}

export type FsaRule = { kind: 'carryover'; max: number } | { kind: 'grace'; until: string /* MM-DD */ } | { kind: 'none' };

export interface Money {
  fsaOffered: boolean;
  /** Unspent balance in the current plan year's FSA. */
  fsaBalance: number;
  fsaRule: FsaRule;
  /** Next year's planned election. Absent = flexible up to the IRS limit (Ting recommends it). */
  nextYearElection?: number;
  /** Combined marginal rate saved on pre-tax dollars (federal + state + FICA). */
  marginalTaxRate: number;
}

export interface FeeEntry {
  /** A typical dentist's billed fee. */
  billed: number;
  /** In-network contracted fee estimate. */
  inNetwork: number;
}
export type FeeTable = Record<string, FeeEntry>;

/** Everything the engine needs about one covered person. */
export interface Profile {
  asOf: ISODate;
  currentPlan: PlanRules;
  ledger: Ledger;
  procedures: PlannedProcedure[];
  money: Money;
  fees: FeeTable;
}

export interface Placement {
  id: string;
  date: ISODate;
}

export type WaterfallKey =
  | 'fee'
  | 'networkDiscount'
  | 'membershipDiscount'
  | 'coinsurance'
  | 'alternateBenefit'
  | 'deductible'
  | 'maxCap'
  | 'denied'
  | 'youPay';

export interface WaterfallStep {
  key: WaterfallKey;
  label: string;
  /** Change to what the member pays (negative = taken off the bill). Totals carry the running amount. */
  delta: number;
  running: number;
  section?: string;
}

export interface AdjudicatedLine {
  id: string;
  cdt: string;
  tooth?: number;
  /** Display only: see PlannedProcedure.toothGuessed. */
  toothGuessed?: boolean;
  /** Display only: the procedure's own name, when it has one. */
  label?: string;
  date: ISODate;
  year: number;
  serviceClass: ServiceClass | 'excluded';
  billed: number;
  allowed: number;
  /** Fee the plan's percentage is applied to (lower than allowed under the alternate benefit). */
  benefitBase: number;
  coinsuranceRate: number;
  deductibleApplied: number;
  /** Plan's share before the max cap. */
  planShare: number;
  planPaid: number;
  capReduction: number;
  memberOwes: number;
  /** Out of network: amount above the plan's allowance the dentist can bill. */
  balanceBill: number;
  maxRemainingBefore: number;
  denied?: { reason: 'waitingPeriod' | 'frequency' | 'notCovered'; detail: string };
  rulesVersion: string;
  waterfall: WaterfallStep[];
}

export interface YearCost {
  year: number;
  planVersion: string;
  owes: number;
  planPaid: number;
  fsaUsed: number;
  pocket: number;
  /** After-tax cost of this year's care. */
  cost: number;
  maxUsed: number;
  maxRemaining: number;
  rolloverEarned: number;
}

export interface ScheduleEvaluation {
  placements: Placement[];
  /** Lines when every procedure (including every "maybe") happens. */
  lines: AdjudicatedLine[];
  /** Expected values over the "maybe" outcomes. */
  expectedOwes: number;
  expectedCost: number;
  /** Cost if every "maybe" happens. */
  badYearCost: number;
  years: YearCost[];
  finish: ISODate;
}
