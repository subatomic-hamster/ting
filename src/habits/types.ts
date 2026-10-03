// SmileStreak: opt-in brushing data in exchange for rewards.
// These shapes are shared with the device bridge (hardware/bridge/ting_bridge.py).

export type DeviceKind = 'simulated' | 'oralb' | 'esp32';
export type SessionSource = 'oralb-ble' | 'esp32' | 'simulated' | 'seed';

/** One finished brushing session, as posted by a device or the bridge. */
export interface BrushSession {
  id: string;
  deviceId: string;
  source: SessionSource;
  startedAt: string; // ISO timestamp (UTC)
  durationSec: number;
  sectorCount: number; // 4 quadrants (FDI order: upper right, upper left, lower left, lower right) or 6 zones
  sectorSeconds: number[]; // seconds spent in each sector
  pressureWarnings: number;
  liveSamples?: number; // live readings received during the session (anti-gaming signal)
}

/** One live reading while someone is brushing. */
export interface LiveBrushState {
  deviceId: string;
  deviceName: string;
  source: SessionSource;
  state: 'running' | 'idle' | 'off' | 'charging' | 'unknown';
  elapsedSec: number;
  sector: number; // 1-based; 0 = none
  sectorCount: number;
  pressureHigh: boolean;
  mode?: string;
  ts: string;
}

export type BridgeEvent =
  | { type: 'brush.live'; live: LiveBrushState }
  | { type: 'brush.session'; session: BrushSession }
  | { type: 'bridge.status'; mode: string[]; devices: string[] };

export interface HabitConsent {
  optedIn: boolean;
  consentedAt?: string; // ISO date; only sessions from this date on are collected
  shareWithDentist: boolean; // 30-day summary on the dentist handoff page
  shareAggregateWithLincoln: boolean; // counts in groups of 20+, never individual data
}

export interface RewardProgram {
  id: 'smilestreak';
  name: string;
  annualCap: number;
  cleaningCredit: number;
  maxCleanings: number;
  cleaningCdts: string[];
  brushMonthCredit: number;
  maxBrushMonths: number;
  day: { sessions: number; minSec: number }; // what a "good day" means
  monthQualifyShare: number; // share of the month's days that must be good days
  creditUse: string; // where the credit goes
}

export type RewardReason = 'cleaning_verified' | 'brush_month' | 'dentist_homecare_check';

export interface RewardLine {
  id: string;
  date: string;
  reason: RewardReason;
  label: string;
  credit: number;
  source: string; // where the evidence came from
}

export interface RewardSummary {
  planYear: number;
  lines: RewardLine[];
  uncapped: number;
  wouldEarn: number; // what the member's data qualifies for (shown before opt-in as a preview)
  earned: number; // 0 until opted in
  cap: number;
  remainingToCap: number;
  brushingCredit: number;
  cleaningCredit: number;
  brushingMax: number; // the most the brushing portion can earn (device or dentist check)
  progressPct: number; // shown amount as a share of the cap, 0-100
  currentMonth: { month: string; goodDays: number; daysSoFar: number; needed: number; onTrack: boolean };
}

export interface SessionCheck {
  verified: boolean;
  reason?: string;
}
