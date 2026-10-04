// The rules that act on Winnow's answers (spec F8, uses 4–9). Winnow only gives probabilities; every threshold and
// every consequence lives here, tested, so the team can tune them after calibration.

export type Dist = Record<string, number>;

const expected = (d: Dist, labels: string[]) => labels.reduce((s, l, i) => s + i * (d[l] ?? 0), 0);

// Use 4: plan compiler second reader. A compiled rule the document doesn't clearly state goes to human review.
export const SECOND_READER_MIN = 0.7;
export const needsReview = (pStated: number) => pStated < SECOND_READER_MIN;

// Use 5: invoice line items. Only covered procedures count toward the plan; the rest are shown to the member.
export const LINE_CATEGORIES = {
  covered: 'a covered dental procedure',
  missed_appointment: 'a missed or late-cancelled appointment fee',
  cosmetic: 'a cosmetic service such as whitening',
  finance_charge: 'a finance, interest or late-payment charge',
  other: 'anything else',
} as const;
export type LineCategory = keyof typeof LINE_CATEGORIES;
/** Below this, the member is asked what the line is. */
export const LINE_CONFIDENT = 0.7;
export function lineDecision(d: Dist): { category: LineCategory; p: number; ask: boolean } {
  const [category, p] = Object.entries(d).reduce((a, b) => (b[1] > a[1] ? b : a), ['other', 0]) as [LineCategory, number];
  return { category, p, ask: p < LINE_CONFIDENT };
}

// Use 6: the dentist's own wording about a "maybe" item sets where the likelihood slider starts.
export const NOTE_SCALE = ['unlikely this year', 'possible', 'likely'] as const;
const NOTE_POINTS = [0.15, 0.5, 0.8];
/** Expected value over the three points, rounded to 5%. */
export function likelihoodFromNote(d: Dist): number {
  const v = NOTE_SCALE.reduce((s, l, i) => s + NOTE_POINTS[i] * (d[l] ?? 0), 0);
  return Math.round(v * 20) / 20;
}
/** Wording that marks an item as a "maybe" in the first place. */
export const HEDGED = /\b(watch|monitor|may need|might need|possibl[ey]|maybe|eventually|consider|keep an eye|could need|likely)\b/i;

// Use 7: notification ranker. Push only what needs action this week, at most two pushes a week; the rest waits for the digest.
export const ACTION_SCALE = ['informational', 'useful this month', 'act this week'] as const;
export const PUSH_MIN = 0.6;
export const PUSHES_PER_WEEK = 2;
export function shouldPush(d: Dist, pushedThisWeek: number): boolean {
  return (d['act this week'] ?? 0) >= PUSH_MIN && pushedThisWeek < PUSHES_PER_WEEK;
}

// Use 8: router and safety gate for typed questions.
export const INTENTS = {
  engine_question: 'a question about what this member will pay, when, or how to schedule their own work',
  plan_lookup: 'a question about what the dental plan covers, its percentages, deductible, maximum, waiting periods or limits',
  explanation: 'a request to explain an insurance term or why an amount is what it is',
  medical_advice: 'a question about symptoms, diagnosis, whether treatment is needed, pain or medicine',
  out_of_scope: 'anything unrelated to this member’s dental benefits',
} as const;
export type Intent = keyof typeof INTENTS;
/** Deliberately low: a false alarm costs one redirect; a miss means answering a clinical question. */
export const MEDICAL_MIN = 0.3;
export function route(d: Dist): { intent: Intent; p: number; viaModel: boolean } {
  if ((d.medical_advice ?? 0) >= MEDICAL_MIN) return { intent: 'medical_advice', p: d.medical_advice ?? 0, viaModel: false };
  const [intent, p] = Object.entries(d).reduce((a, b) => (b[1] > a[1] ? b : a), ['out_of_scope', 0]) as [Intent, number];
  // Engine and plan questions are answered by tested code; low confidence goes to the writing model with the facts.
  const viaModel = intent === 'explanation' || ((intent === 'engine_question' || intent === 'plan_lookup') && p < 0.5);
  return { intent, p, viaModel };
}

// Use 9: plain-language gate. An expected clarity above 1.0 (0 plain, 1 some jargon, 2 confusing) gets one rewrite.
export const CLARITY_SCALE = ['plain', 'some jargon', 'confusing'] as const;
export const REWRITE_ABOVE = 1.0;
export const needsRewrite = (d: Dist) => expected(d, [...CLARITY_SCALE]) > REWRITE_ABOVE;
