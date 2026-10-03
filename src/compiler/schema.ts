// Strict schema for compiled plan rules. Bedrock's structured output must satisfy `planRulesJsonSchema`;
// the local compiler's result is validated by the same schema before approval.
import { z } from 'zod';
import type { PlanRules } from '../engine/types';

const pct = z.number().min(0).max(1);
const money = z.number().min(0);
const serviceClass = z.enum(['preventive', 'basic', 'major', 'ortho']);
const byClass = <T extends z.ZodType>(v: T) => z.strictObject({ preventive: v, basic: v, major: v, ortho: v });
const waitMonths = z.number().int().min(0).max(24);
const classOrExcluded = z.enum(['preventive', 'basic', 'major', 'ortho', 'excluded']);

const categoryClassSchema = z.strictObject({
  diagnostic: classOrExcluded,
  preventive: classOrExcluded,
  restorative: classOrExcluded,
  majorRestorative: classOrExcluded,
  endodontics: classOrExcluded,
  periodontics: classOrExcluded,
  prosthodontics: classOrExcluded,
  implants: classOrExcluded,
  oralSurgery: classOrExcluded,
  orthodontics: classOrExcluded,
  adjunctive: classOrExcluded,
});

const frequencyLimitSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  codes: z.array(z.string().regex(/^D\d{4}$/)).min(1),
  count: z.number().int().min(1),
  period: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('calendarYear') }),
    z.strictObject({ kind: z.literal('months'), months: z.number().int().min(1).max(120) }),
  ]),
  perTooth: z.boolean(),
});

const maxRewardsSchema = z.strictObject({
  threshold: money,
  rolloverAmount: money,
  inNetworkBonus: money,
  accountLimit: money,
  depositDay: z.number().int().min(1).max(365),
});

const outOfNetworkSchema = z.discriminatedUnion('basis', [
  z.strictObject({
    basis: z.literal('ucr'),
    percentile: z.union([z.literal(50), z.literal(70), z.literal(80), z.literal(90), z.literal(95)]),
  }),
  z.strictObject({ basis: z.literal('mac') }),
]);

const sectionsSchema = z.strictObject({
  coinsurance: z.string().optional(),
  deductible: z.string().optional(),
  annualMax: z.string().optional(),
  waitingPeriods: z.string().optional(),
  frequencyLimits: z.string().optional(),
  alternateBenefit: z.string().optional(),
  maxRewards: z.string().optional(),
  preventiveMax: z.string().optional(),
  q4Carryover: z.string().optional(),
  outOfNetwork: z.string().optional(),
  serviceClasses: z.string().optional(),
  premium: z.string().optional(),
  workInProgress: z.string().optional(),
});

export const planRulesSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['insurance', 'waive', 'membership']),
  version: z.string().min(1),
  premiumMonthly: money,
  premiumPreTax: z.boolean(),
  coinsurance: z.strictObject({ inNetwork: byClass(pct), outOfNetwork: byClass(pct) }),
  deductible: z.strictObject({ amount: money, appliesTo: z.array(serviceClass) }),
  annualMax: money,
  orthoLifetimeMax: money,
  waitingPeriodMonths: byClass(waitMonths),
  frequencyLimits: z.array(frequencyLimitSchema),
  categoryClass: categoryClassSchema,
  alternateBenefit: z.boolean(),
  preventiveCountsTowardMax: z.boolean(),
  q4DeductibleCarryover: z.boolean(),
  maxRewards: maxRewardsSchema.optional(),
  outOfNetwork: outOfNetworkSchema,
  membership: z.strictObject({ annualFee: money, discount: pct }).optional(),
  sections: sectionsSchema,
});

export const SERVICE_CLASSES = serviceClass.options;
export const CDT_CATEGORIES = categoryClassSchema.keyof().options;

/** JSON Schema handed to Bedrock structured output. */
export const planRulesJsonSchema = z.toJSONSchema(planRulesSchema);

// Compile-time guard: the schema and `PlanRules` must be mutually assignable (drift fails `tsc`).
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
export type SchemaMatchesPlanRules = Assert<Equal<z.infer<typeof planRulesSchema>, PlanRules>>;
