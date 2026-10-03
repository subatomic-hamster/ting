import type { RewardProgram } from './types';

/**
 * SAMPLE program terms for the demo. A real program needs Lincoln actuarial and
 * compliance review; it is designed to fit wellness-incentive rules:
 * opt-in, rewards only (never a surcharge), a reasonable alternative that needs
 * no device (cleanings + a dentist home-care check), a cap, and re-qualifying yearly.
 */
export const SMILESTREAK: RewardProgram = {
  id: 'smilestreak',
  name: 'SmileStreak',
  annualCap: 120,
  cleaningCredit: 25,
  maxCleanings: 2,
  cleaningCdts: ['D1110', 'D1120', 'D4910'],
  brushMonthCredit: 10,
  maxBrushMonths: 7,
  day: { sessions: 2, minSec: 100 },
  monthQualifyShare: 0.8,
  creditUse: "Paid next plan year as an employer-funded wellness deposit to your FSA/HSA, or added to your plan's rollover balance.",
};

/** FDI quadrant names in the order brushes report sectors. */
export const QUADRANTS = ['Upper right', 'Upper left', 'Lower left', 'Lower right'];

export function sectorName(index: number, sectorCount: number): string {
  if (sectorCount === 4) return QUADRANTS[index] ?? `Sector ${index + 1}`;
  return `Zone ${index + 1}`;
}
