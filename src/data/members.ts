// Members who signed up themselves. A member record holds what they told Ting at sign-up (the onboarding survey);
// their starting profile is rebuilt from it at any "as of" date, exactly like a demo persona, so the app, the
// Lambdas, the email agent and the monthly overview all treat a signed-up member and a persona the same way.
import { DEMO_FEES } from '../engine/cdt';
import { addDays, addMonths, yearOf } from '../engine/dates';
import { dentalProfile, predictedProcedures, WELLNESS_TERMS, type HabitSignal } from '../engine/risk';
import type { ISODate, PlanPreferences, Profile, ServiceRecord } from '../engine/types';
import { ACME_BASIC, ACME_HIGH, ACME_LOW } from './demo';
import { isPersonaId, PERSONAS, type Persona } from './personas';

/** The employer's plans a member can be enrolled in. */
export const MEMBER_PLANS = [ACME_BASIC, ACME_LOW, ACME_HIGH];
export type MemberPlanId = 'acme-basic' | 'acme-low' | 'acme-high';

export interface MemberRecord {
  memberId: string;
  name: string;
  email: string;
  employer: string;
  /** When the member finished sign-up; the wellness discount runs from here. */
  createdAt: ISODate;
  currentDentistId: string;
  planId: MemberPlanId;
  survey: PlanPreferences;
  /** Brushing data the member chose to share (SmileStreak), which updates the dental profile. */
  habits?: HabitSignal;
}

/** A member: a demo persona or someone who signed up. Everything that needs "who is this" takes one. */
export type Member = Omit<Persona, 'id' | 'age'> & { id: string; age?: number; email?: string; record?: MemberRecord };

export const EMPLOYER = 'Acme Manufacturing';

/** Stable member id for a Cognito user (or a local account): `U-` and the first 10 hex digits of its id. */
export function memberIdFor(sub: string): string {
  return `U-${sub.replace(/[^0-9a-f]/gi, '').slice(0, 10).toUpperCase()}`;
}

export const isUserMemberId = (id: string) => /^U-[0-9A-F]{10}$/.test(id);

const price = (cdt: string) => ({ fee: DEMO_FEES[cdt]?.billed ?? 0, allowedFee: DEMO_FEES[cdt]?.inNetwork });

/** A service the member told us about (not a claim): planPaid is the plan's in-network share of the demo fee. */
function told(date: ISODate, cdt: string): ServiceRecord {
  return { date, cdt, planPaid: DEMO_FEES[cdt]?.inNetwork ?? 0, inNetwork: true, source: 'user' };
}

const PAST_SHARE: Record<NonNullable<PlanPreferences['lastYear']>, [number, number] | undefined> = {
  underused: [0.12, 0.15],
  some: [0.45, 0.5],
  hitMax: [0.55, 1],
  unknown: undefined,
};

/** The starting profile the survey implies. Predicted items are "maybe" work with the reasons in `dentalProfile`. */
export function profileFromSurvey(record: Pick<MemberRecord, 'survey' | 'planId' | 'createdAt' | 'habits'>, asOf: ISODate): Profile {
  const { survey } = record;
  const plan = MEMBER_PLANS.find((p) => p.id === record.planId) ?? ACME_LOW;
  const y = yearOf(asOf);
  // Told at sign-up, so dated from then (a demo time jump doesn't move it).
  const lastVisit =
    survey.lastCleaning === 'recent' ? addDays(record.createdAt, -90) : survey.lastCleaning === 'sixToTwelveMonths' ? addDays(record.createdAt, -240) : undefined;
  const history = lastVisit && yearOf(lastVisit) === y ? [told(lastVisit, 'D1110'), told(lastVisit, 'D0120')] : [];
  const share = PAST_SHARE[survey.lastYear ?? 'unknown'];
  const risk = dentalProfile(survey, record.habits);
  const discountUntil = addMonths(record.createdAt, WELLNESS_TERMS.months);
  return {
    asOf,
    currentPlan: plan,
    ledger: {
      planYear: y,
      coverageStart: `${y - 2}-01-01`,
      maxUsed: plan.preventiveCountsTowardMax ? history.reduce((s, h) => s + h.planPaid, 0) : 0,
      deductibleMet: 0,
      orthoUsed: 0,
      rolloverBalance: 0,
      history,
      pastYears: share
        ? [
            { year: y - 2, planPaid: Math.round(share[0] * plan.annualMax), annualMax: plan.annualMax },
            { year: y - 1, planPaid: Math.round(share[1] * plan.annualMax), annualMax: plan.annualMax },
          ]
        : [],
    },
    procedures: predictedProcedures(risk, price),
    money: {
      fsaOffered: true,
      fsaBalance: 0,
      fsaRule: { kind: 'carryover', max: 680 },
      marginalTaxRate: 0.25,
      ...(survey.lifestyle && discountUntil >= asOf
        ? { premiumDiscount: { pct: WELLNESS_TERMS.pct, until: discountUntil, reason: 'Wellness questions completed' } }
        : {}),
    },
    fees: DEMO_FEES,
    preferences: survey,
  };
}

const COVERAGE: Record<NonNullable<PlanPreferences['covered']>, string> = {
  self: 'Just me',
  partner: 'Me + spouse/partner',
  children: 'Me + kids',
  family: 'Whole family',
};

export function memberFromRecord(record: MemberRecord): Member {
  return {
    id: record.memberId,
    name: record.name,
    email: record.email,
    blurb: 'Signed up with the onboarding survey.',
    memberId: record.memberId,
    employer: record.employer,
    coverage: COVERAGE[record.survey.covered ?? 'self'],
    currentDentistId: record.currentDentistId,
    profile: (asOf) => profileFromSurvey(record, asOf),
    record,
  };
}

// --- in-app registry: the signed-in member's record, so lookups by key stay synchronous -----------------------

const registered = new Map<string, Member>();

export function registerMember(record: MemberRecord): Member {
  const m = memberFromRecord(record);
  registered.set(record.memberId, m);
  return m;
}

/** A persona id or a registered member id → the member. Unknown keys fall back to Dale so the app always renders. */
export function memberFor(key: string): Member {
  if (isPersonaId(key)) return PERSONAS[key];
  return registered.get(key) ?? PERSONAS.dale;
}

export const isKnownMember = (key: string) => isPersonaId(key) || registered.has(key);
