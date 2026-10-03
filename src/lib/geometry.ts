// Drawing helpers: map engine amounts and dates to percentages for bars,
// gauges and the timeline. They produce layout numbers, never dollar figures.

import type { MaxGauge } from '../engine/helpers';
import type { WaterfallStep } from '../engine/types';
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

export const isTotal = (s: WaterfallStep) => s.key === 'fee' || s.key === 'youPay';

/** Floating bars for a waterfall: each step spans from the previous running total to its own. */
export function waterfallBars(steps: WaterfallStep[]): Bar[] {
  const scale = Math.max(1, ...steps.map((s) => s.running));
  return steps.map((s, i) => {
    const start = isTotal(s) ? 0 : (steps[i - 1]?.running ?? 0);
    const end = s.running;
    return {
      leftPct: percentOf(Math.min(start, end), scale),
      widthPct: percentOf(Math.abs(end - start), scale),
      tone: isTotal(s) ? 'total' : s.delta < 0 ? 'down' : s.delta > 0 ? 'up' : 'flat',
    };
  });
}

export interface GaugeSegments {
  usedPct: number;
  scheduledPct: number;
  rolloverPct: number;
}

/** Splits a max gauge into stacked segments of its full capacity (max + rollover). */
export function gaugeSegments(g: MaxGauge): GaugeSegments {
  const capacity = g.annualMax + g.rollover;
  return {
    usedPct: percentOf(g.used, capacity),
    scheduledPct: percentOf(g.scheduled, capacity),
    rolloverPct: percentOf(g.rollover, capacity),
  };
}

/** Horizontal position of a date between `start` and `end`, as a percentage. */
export function datePct(date: string, start: string, end: string): number {
  return percentOf(diffDays(date, start), diffDays(end, start));
}
