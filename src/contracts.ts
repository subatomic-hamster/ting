export type ServiceClass = 'preventive' | 'basic' | 'major' | 'ortho';
export type Network = 'in' | 'out';

export interface PlanRules {
  id: string;
  name: string;               // e.g. "Low", "High"
  rulesVersion: string;       // e.g. "PLAN-ACME-v3"
  monthlyPremium: number;     // employee share
  deductible: { individual: number; family?: number; waivedFor: ServiceClass[] };
  annualMax: number;
  coinsurance: Record<ServiceClass, { in: number; out: number }>; // plan pays, 0-1
  outOfNetworkAllowance: { method: 'UCR_PERCENTILE' | 'MAC'; percentile?: number };
  waitingPeriodMonths: Partial<Record<ServiceClass, number>>;
  frequencyLimits: { cdt: string; count: number; per: 'calendarYear' | 'rollingMonths'; months?: number }[];
  alternateBenefitPosteriorComposites?: boolean;
  maxRewards?: { claimsThreshold: number; rollover: number; rolloverInNetwork: number; accountCap: number; depositDayOfYear: number };
  orthoLifetimeMax?: number;
  planYearStart: string;      // "01-01"
  citations?: Record<string, string>; // rule key -> plan section text
}

export interface ProcedureItem {
  id: string;
  cdt: string;                // e.g. "D2740"
  label: string;              // "Porcelain crown"
  serviceClass: ServiceClass;
  tooth?: number;
  feeIn: number;
  feeOut: number;
  feeRange?: [number, number];
  deadline?: string;          // ISO date, set only by the dentist
  locked: boolean;            // urgent: cannot be moved
  dependsOn?: string[];       // ids that must come first
  likelihood?: number;        // 0-1 for "maybe" items; undefined = certain
  source: 'typed' | 'voice' | 'photo' | 'claim' | 'upload' | 'seed';
  confidence: number;         // 0-1
}

export interface LedgerEntry {
  id: string;
  serviceDate: string;
  cdt: string;
  tooth?: number;
  billed: number;
  allowed: number;
  planPaid: number;
  memberOwes: number;
  source: 'claim' | 'invoice' | 'fsa' | 'manual';
  linkedIds?: string[];
  isDemoData: boolean;
}

export interface ClaimAdjudicatedEvent {
  type: 'claim.adjudicated';
  member: string;
  claimId: string;
  serviceDate: string;
  provider: { npi: string; inNetwork: boolean };
  lines: { cdt: string; tooth?: number; billed: number; allowed: number; planPaid: number; memberOwes: number }[];
  annualMaxRemaining: number;
  rulesVersion: string;
}

export interface EngineInput {
  plans: PlanRules[];
  selectedPlanId: string;
  ledger: LedgerEntry[];
  procedures: ProcedureItem[];
  overrides: { procedureId: string; date: string }[]; // from timeline drags
  network: Network;
  asOf: string;               // "today"; the demo can set it to Dec 1
  fsa: { balance: number; forfeitDate: string; nextYearElection?: number; rule: 'carryover' | 'grace' | 'none' };
  marginalTaxRate: number;
}

export type WaterfallKey = 'fee' | 'networkDiscount' | 'deductible' | 'coinsurance' | 'maxCap' | 'youPay';
export interface WaterfallStep {
  key: WaterfallKey;
  label: string;
  amount: number;             // signed change at this step
  runningTotal: number;
  explanation?: string;       // filled by the AI later; mock text for now
  citation?: string;
  verification?: 'verified' | 'unverified' | 'pending';
}

export interface ScheduledItem {
  procedureId: string;
  date: string;
  planYear: number;
  planPays: number;
  memberPays: number;
  fsaPays: number;
  locked: boolean;
  dentistQuestion?: string;   // "Can #19 safely wait until Jan 6?"
}

export interface ScheduleOption {
  kind: 'cheapest' | 'fastest' | 'balanced' | 'custom';
  items: ScheduledItem[];
  memberTotal: number;
  afterTaxTotal: number;
  finishDate: string;
  savingsVsAllNow: number;
}

export interface MaxGauge {
  planYear: number;
  annualMax: number;
  used: number;
  scheduled: number;
  remaining: number;
  rolloverBalance?: number;
}

export interface PlanComparisonRow {
  planId: string;
  name: string;
  annualPremium: number;
  expectedOutOfPocket: number;
  badYearOutOfPocket: number;
  expectedTotal: number;
  recommended: boolean;
  reason: string;
  tippingPoint?: { procedureId: string; likelihood: number }; // "above 18%, High pays for itself"
}

export interface TraceEvent { ts: string; tool: string; summary: string; ms: number }

export interface EngineResult {
  rulesVersion: string;
  waterfalls: Record<string, WaterfallStep[]>; // by procedureId
  schedules: ScheduleOption[];
  activeSchedule: ScheduleOption;              // reflects overrides
  gauges: MaxGauge[];
  deductible: { met: number; total: number };
  comparison: PlanComparisonRow[];
  fsa: { recommendedElection: number; irsLimit: number; carryoverLimit: number; forfeitDate: string; atRisk: number };
  leftOnTable: { unusedCleanings: number; maxRemaining: number; fsaExpiring: number };
  enrollmentCard: { planId: string; fsaElection: number; actions: { label: string; date?: string }[]; expectedSavings: number };
  trace: TraceEvent[];
}
