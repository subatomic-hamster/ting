// Drawing helpers: map engine amounts and dates to percentages for bars,
// gauges and the timeline. They produce layout numbers, never dollar figures.

import type { MaxGauge, WaterfallStep } from '../contracts';
import { diffDays } from './dates';

const clampPct = (n: number) => Math.max(0, Math.min(100, n));

/** `part` as a percentage of `whole` (0 when whole is 0). */
export function percentOf(part: number, whole: number): number {
  return whole > 0 ? clampPct((part / whole) * 100) : 0;
}

export interface Bar {
  leftPct: number;
  widthPct: number;
  tone: 'total' | 'down' | 'up' | 'flat';
}

/** Floating bars for a waterfall: each step spans from the previous running total to its own. */
export function waterfallBars(steps: WaterfallStep[]): Bar[] {
  const scale = Math.max(1, ...steps.map((s) => s.runningTotal), ...steps.map((s) => s.amount));
  return steps.map((s, i) => {
    const isTotal = s.key === 'fee' || s.key === 'youPay';
    const start = isTotal ? 0 : (steps[i - 1]?.runningTotal ?? 0);
    const end = s.runningTotal;
    return {
      leftPct: percentOf(Math.min(start, end), scale),
      widthPct: percentOf(Math.abs(end - start), scale),
      tone: isTotal ? 'total' : s.amount < 0 ? 'down' : s.amount > 0 ? 'up' : 'flat',
    };
  });
}

export interface GaugeSegments {
  usedPct: number;
  scheduledPct: number;
  remainingPct: number;
  rolloverPct: number;
}

/** Splits a max gauge into stacked segments of its full capacity (max + rollover). */
export function gaugeSegments(g: MaxGauge): GaugeSegments {
  const capacity = g.annualMax + (g.rolloverBalance ?? 0);
  return {
    usedPct: percentOf(g.used, capacity),
    scheduledPct: percentOf(g.scheduled, capacity),
    remainingPct: percentOf(g.remaining, capacity),
    rolloverPct: percentOf(g.rolloverBalance ?? 0, capacity),
  };
}

/** Horizontal position of a date between `start` and `end`, as a percentage. */
export function datePct(date: string, start: string, end: string): number {
  return percentOf(diffDays(date, start), diffDays(end, start));
}
