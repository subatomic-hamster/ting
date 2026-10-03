import { useEffect, useState } from 'react';
import { DEMO_PLAN_OPTIONS, DEMO_PROFILE } from '../data/demo';
import type { ISODate, PlanRules, Profile } from '../engine/types';

export type ScheduleKind = 'cheapest' | 'balanced' | 'fastest';

export interface ActivityItem {
  date: ISODate;
  text: string;
  kind: 'claim' | 'intake' | 'plan' | 'check';
}

export interface AppState {
  profile: Profile;
  planOptions: PlanRules[];
  /** Plan chosen for next year; undefined = Ting's recommendation. */
  nextPlanId?: string;
  scheduleKind: ScheduleKind;
  /** Dates the user dragged; overrides the optimizer's plan for those procedures. */
  manual: Record<string, ISODate>;
  onboarded: boolean;
  household: 'me' | 'spouse' | 'family';
  activity: ActivityItem[];
}

export const initialState = (): AppState => ({
  profile: DEMO_PROFILE,
  planOptions: DEMO_PLAN_OPTIONS,
  scheduleKind: 'cheapest',
  manual: {},
  onboarded: false,
  household: 'me',
  activity: [],
});

const KEY = 'ting.state.v1';

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...initialState(), ...(JSON.parse(raw) as Partial<AppState>) };
  } catch {
    // Private window or blocked storage: start from the demo profile.
  }
  return initialState();
}

/** App state, kept in this browser. Production keeps it with Lincoln (DynamoDB), never with the employer. */
export function useAppState() {
  const [state, setState] = useState<AppState>(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Storage full or blocked; the session still works.
    }
  }, [state]);
  return [state, setState] as const;
}
