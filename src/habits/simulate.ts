// Demo data: deterministic brushing history per persona, and a live session
// player for the "Brush now" button. Everything here is simulated.

import type { PersonaId } from '../fixtures/personas';
import { addDays, diffDays } from '../lib/dates';
import type { BrushSession, HabitConsent, LiveBrushState } from './types';

interface HabitProfile {
  deviceName: string;
  morning: number; // chance of brushing
  evening: number;
  meanSec: number;
  sdSec: number;
  weakSector: number; // 0-based quadrant that gets less time
  pressurePerSession: number; // average high-pressure warnings
  consent: (year: number) => HabitConsent;
}

export const HABIT_PROFILES: Record<PersonaId, HabitProfile> = {
  // Consistent brusher who presses too hard and rushes the upper left.
  dale: {
    deviceName: 'Oral-B iO Series 5 (demo)',
    morning: 0.99,
    evening: 0.97,
    meanSec: 128,
    sdSec: 10,
    weakSector: 1,
    pressurePerSession: 0.2,
    consent: (y) => ({ optedIn: true, consentedAt: `${y}-01-02`, shareWithDentist: true, shareAggregateWithLincoln: true }),
  },
  // Hasn't joined yet: the demo shows the opt-in moment.
  jordan: {
    deviceName: 'Oral-B Pro 1000 (demo)',
    morning: 0.75,
    evening: 0.5,
    meanSec: 85,
    sdSec: 22,
    weakSector: 3,
    pressurePerSession: 0.05,
    consent: () => ({ optedIn: false, shareWithDentist: false, shareAggregateWithLincoln: false }),
  },
  // Joined in July; good but not perfect; hasn't shared with her dentist.
  priya: {
    deviceName: 'Oral-B Genius X (demo)',
    morning: 0.96,
    evening: 0.9,
    meanSec: 118,
    sdSec: 11,
    weakSector: 2,
    pressurePerSession: 0.1,
    consent: (y) => ({ optedIn: true, consentedAt: `${y}-07-01`, shareWithDentist: false, shareAggregateWithLincoln: true }),
  },
};

/** Small seeded PRNG (mulberry32) so every demo run shows the same history. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function normal(rand: () => number, mean: number, sd: number) {
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function splitSectors(rand: () => number, duration: number, weak: number): number[] {
  const weights = [0, 1, 2, 3].map((i) => (i === weak ? 0.55 : 1) * (0.85 + rand() * 0.3));
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => Math.round((w / total) * duration));
}

/** Brushing history from consent until the day before `asOf` (no data exists before consent). */
export function seedHistory(personaId: PersonaId, asOf: string, consentedAt: string | undefined): BrushSession[] {
  if (!consentedAt || consentedAt >= asOf) return [];
  const p = HABIT_PROFILES[personaId];
  const rand = rng(hash(`${personaId}:${consentedAt}`));
  const out: BrushSession[] = [];
  const days = diffDays(asOf, consentedAt);
  for (let i = 0; i < days; i++) {
    const date = addDays(consentedAt, i);
    for (const [slot, chance, hour] of [
      ['am', p.morning, 7],
      ['pm', p.evening, 22],
    ] as const) {
      const roll = rand();
      const duration = Math.round(Math.min(200, Math.max(35, normal(rand, p.meanSec, p.sdSec))));
      const minute = Math.floor(rand() * 50);
      const pressure = rand() < p.pressurePerSession ? 1 + Math.floor(rand() * 2) : 0;
      const sectors = splitSectors(rand, duration, p.weakSector);
      if (roll > chance) continue;
      out.push({
        id: `seed-${personaId}-${date}-${slot}`,
        deviceId: `${personaId}-brush`,
        source: 'seed',
        startedAt: `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`,
        durationSec: duration,
        sectorCount: 4,
        sectorSeconds: sectors,
        pressureWarnings: pressure,
      });
    }
  }
  return out;
}

export interface LivePlayer {
  stop: () => void;
}

/**
 * Plays a simulated session: `durationSec` of brushing at `speed`x (120 s at 10x = 12 s),
 * emitting live readings and finally a finished session.
 */
export function playSimulatedSession(opts: {
  deviceId: string;
  deviceName: string;
  startedAt: string;
  durationSec?: number;
  speed?: number;
  onLive: (l: LiveBrushState) => void;
  onDone: (s: BrushSession) => void;
}): LivePlayer {
  const duration = opts.durationSec ?? 120;
  const speed = opts.speed ?? 10;
  const tickMs = 250;
  const step = (tickMs / 1000) * speed;
  const sectorSeconds = [0, 0, 0, 0];
  let elapsed = 0;
  let samples = 0;
  let warnings = 0;
  let wasHigh = false;
  const burstAt = duration * (0.35 + Math.random() * 0.3);

  const live = (state: LiveBrushState['state'], sector: number, pressureHigh: boolean): LiveBrushState => ({
    deviceId: opts.deviceId,
    deviceName: opts.deviceName,
    source: 'simulated',
    state,
    elapsedSec: Math.round(elapsed),
    sector,
    sectorCount: 4,
    pressureHigh,
    mode: 'daily clean',
    ts: new Date().toISOString(),
  });

  const timer = setInterval(() => {
    const sector = Math.min(4, Math.floor(elapsed / (duration / 4)) + 1);
    const high = elapsed >= burstAt && elapsed < burstAt + 4;
    if (high && !wasHigh) warnings += 1;
    wasHigh = high;
    samples += 1;
    opts.onLive(live('running', sector, high));
    sectorSeconds[sector - 1] += step;
    elapsed += step;
    if (elapsed >= duration) {
      clearInterval(timer);
      elapsed = duration;
      opts.onLive(live('idle', 0, false));
      opts.onDone({
        id: `sim-${Date.now().toString(36)}`,
        deviceId: opts.deviceId,
        source: 'simulated',
        startedAt: opts.startedAt,
        durationSec: duration,
        sectorCount: 4,
        sectorSeconds: sectorSeconds.map((s) => Math.round(s)),
        pressureWarnings: warnings,
        liveSamples: samples,
      });
    }
  }, tickMs);

  return { stop: () => clearInterval(timer) };
}
