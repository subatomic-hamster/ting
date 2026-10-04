// F3 dental profile: what the onboarding survey (and, if the member opts in, brushing data) says about the
// coming year. Deterministic and explainable: every predicted item names the answers that produced it.
// Loosely follows CAMBRA-style caries risk and common periodontal risk factors; it is an educational
// estimate for budgeting, never a diagnosis, and it never adds certain work or a deadline (only the dentist does).
import type { PlanPreferences, PlannedProcedure } from './types';

export type RiskTier = 'low' | 'moderate' | 'high';

export interface PredictedItem {
  cdt: string;
  label: string;
  /** 0..1; a goal the member chose is certain (1) but has no deadline. */
  likelihood: number;
  /** Plain-language reasons, each tied to an answer. */
  because: string[];
}

export interface DentalProfile {
  caries: RiskTier;
  gums: RiskTier;
  /** Months between cleanings that fits this risk. */
  recallMonths: 3 | 4 | 6;
  /** "Light", "Routine" or "Heavy" year (spec F3 profile output). */
  year: 'Light' | 'Routine' | 'Heavy';
  predicted: PredictedItem[];
  /** Brushing data that changed the result, when the member shared it. */
  habitNote?: string;
}

export interface HabitSignal {
  /** Share of days meeting twice-a-day brushing. */
  twiceDailyRate: number;
  days: number;
}

const tier = (points: number): RiskTier => (points >= 4 ? 'high' : points >= 2 ? 'moderate' : 'low');

/** Brushing data counts only after two weeks, and only nudges the caries score by one point either way. */
export function habitPoints(h?: HabitSignal): number {
  if (!h || h.days < 14) return 0;
  if (h.twiceDailyRate >= 0.8) return -1;
  if (h.twiceDailyRate < 0.4) return 1;
  return 0;
}

export function dentalProfile(prefs: PlanPreferences, habits?: HabitSignal): DentalProfile {
  const l = prefs.lifestyle;
  const why: { caries: string[]; gums: string[] } = { caries: [], gums: [] };
  let caries = 0;
  let gums = 0;
  const add = (kind: 'caries' | 'gums', pts: number, reason: string) => {
    if (kind === 'caries') caries += pts;
    else gums += pts;
    why[kind].push(reason);
  };
  if (prefs.lastCleaning === 'overAYear') {
    add('caries', 1, 'last cleaning over a year ago');
    add('gums', 1, 'last cleaning over a year ago');
  }
  if (l) {
    if (l.sugaryDrinks === 'several') add('caries', 2, 'sugary drinks several times a day');
    else if (l.sugaryDrinks === 'daily') add('caries', 1, 'a sugary drink most days');
    if (l.brushing === 'once') add('caries', 1, 'brushing once a day');
    if (l.flossing === 'rarely') {
      add('caries', 1, 'rarely flossing');
      add('gums', 1, 'rarely flossing');
    }
    if (l.dryMouth) add('caries', 1, 'dry mouth');
    if (l.tobacco) add('gums', 2, 'tobacco use');
    if (l.bleedingGums) add('gums', 2, 'gums that bleed when brushing');
  }
  const hp = habitPoints(habits);
  let habitNote: string | undefined;
  if (hp !== 0 && habits) {
    const pct = Math.round(habits.twiceDailyRate * 100);
    habitNote =
      hp < 0
        ? `Your brush shows twice-a-day brushing on ${pct}% of the last ${habits.days} days, which lowers your cavity risk one step.`
        : `Your brush shows twice-a-day brushing on only ${pct}% of the last ${habits.days} days, which raises your cavity risk one step.`;
    caries = Math.max(0, caries + hp);
    if (hp > 0) why.caries.push(`brushing data: twice a day on ${pct}% of days`);
  }
  const c = tier(caries);
  const g = tier(gums);
  const predicted: PredictedItem[] = [];
  // The routine year everyone has: two cleanings and exams, bitewings once a year.
  predicted.push({ cdt: 'D1110', label: 'Cleaning', likelihood: 1, because: ['two cleanings a year are covered as preventive care'] });
  predicted.push({ cdt: 'D0120', label: 'Checkup exam', likelihood: 1, because: ['checkups come with each cleaning'] });
  predicted.push({ cdt: 'D0274', label: 'Bitewing X-rays', likelihood: 1, because: ['bitewing X-rays are usually taken once a year'] });
  if (c !== 'low')
    predicted.push({
      cdt: 'D2391',
      label: 'Filling (maybe)',
      likelihood: c === 'high' ? 0.5 : 0.25,
      because: why.caries,
    });
  if (g !== 'low')
    predicted.push({
      cdt: 'D4341',
      label: 'Deep cleaning, one quadrant (maybe)',
      likelihood: g === 'high' ? 0.4 : 0.15,
      because: why.gums,
    });
  if (l?.grinding === 'yes' || l?.grinding === 'unsure')
    predicted.push({
      cdt: 'D9944',
      label: 'Night guard (maybe)',
      likelihood: l.grinding === 'yes' ? 0.6 : 0.25,
      because: [l.grinding === 'yes' ? 'you grind or clench your teeth' : 'you might grind your teeth'],
    });
  for (const goal of prefs.goals ?? []) {
    const g2 = GOALS[goal];
    if (g2) predicted.push({ ...g2, likelihood: 1, because: ['a goal you named for the next two years'] });
  }
  const recallMonths = g === 'high' ? 3 : c === 'high' || g === 'moderate' ? 4 : 6;
  const heavy = (prefs.goals ?? []).some((x) => x === 'braces' || x === 'implant') || c === 'high' || g === 'high';
  const light = c === 'low' && g === 'low' && !(prefs.goals ?? []).length;
  return { caries: c, gums: g, recallMonths, year: heavy ? 'Heavy' : light ? 'Light' : 'Routine', predicted, habitNote };
}

export const GOALS: Record<NonNullable<PlanPreferences['goals']>[number], Omit<PredictedItem, 'likelihood' | 'because'> | undefined> = {
  wisdomTeeth: { cdt: 'D7240', label: 'Wisdom tooth removal' },
  braces: { cdt: 'D8080', label: 'Braces' },
  implant: { cdt: 'D6010', label: 'Implant' },
  crown: { cdt: 'D2740', label: 'Crown' },
  none: undefined,
};

/** Survey-predicted items as planned procedures; their ids start with "risk-" so the app can tell them apart. */
export function predictedProcedures(profile: DentalProfile, price: (cdt: string) => Pick<PlannedProcedure, 'fee' | 'allowedFee' | 'feeSource' | 'allowedFeeSource'>): PlannedProcedure[] {
  return profile.predicted.map((item, i) => ({
    id: `risk-${item.cdt.toLowerCase()}-${i}`,
    cdt: item.cdt,
    label: item.label.replace(/ \(maybe\)$/, ''),
    inNetwork: true,
    ...price(item.cdt),
    ...(item.likelihood < 1 ? { likelihood: item.likelihood } : {}),
  }));
}

/** Sample wellness terms (demo data): completing the optional lifestyle questions earns a premium discount. */
export const WELLNESS_TERMS = { pct: 0.1, months: 12 } as const;
