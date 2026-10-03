import { useDeferredValue, useMemo, useState } from 'react';
import { compare, type Comparison } from '../engine/compare';
import { evaluateSchedule, optimize, type OptimizeResult } from '../engine/schedule';
import type { Placement, PlanRules, ScheduleEvaluation } from '../engine/types';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AddWork } from './screens/AddWork';
import { ComparePlans } from './screens/ComparePlans';
import { Decisions } from './screens/Decisions';
import { Onboarding } from './screens/Onboarding';
import { PlanRulesScreen } from './screens/PlanRulesScreen';
import { Schedule } from './screens/Schedule';
import { useAppState, type AppState } from './state';

export interface Ctx {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  comparison: Comparison;
  nextPlan: PlanRules;
  optimized: OptimizeResult;
  /** The schedule on screen: the chosen optimizer plan with any dragged dates applied. */
  schedule: ScheduleEvaluation;
  placements: Placement[];
  go: (tab: Tab) => void;
}

const TABS = [
  ['decisions', 'Your decisions'],
  ['schedule', 'Schedule'],
  ['compare', 'Compare plans'],
  ['add', 'Add dental work'],
  ['plan', 'Plan rules'],
] as const;
export type Tab = (typeof TABS)[number][0];

export function App() {
  const [state, setState] = useAppState();
  const [tab, setTab] = useState<Tab>('decisions');
  const { profile, planOptions } = state;

  // Comparison reruns the optimizer per option; defer it so sliders stay responsive.
  const deferredProfile = useDeferredValue(profile);
  const comparison = useMemo(() => compare(deferredProfile, planOptions), [deferredProfile, planOptions]);
  const nextPlan = planOptions.find((p) => p.id === state.nextPlanId) ?? comparison.best.plan;
  const optimized = useMemo(() => optimize(profile, { nextPlan }), [profile, nextPlan]);
  const chosen = optimized[state.scheduleKind];
  const { manual } = state;
  const placements = useMemo(() => chosen.placements.map((p) => ({ id: p.id, date: manual[p.id] ?? p.date })), [chosen, manual]);
  const schedule = useMemo(
    () => (Object.keys(manual).length ? evaluateSchedule(profile, placements, { nextPlan }) : chosen),
    [manual, profile, placements, nextPlan, chosen],
  );

  const ctx: Ctx = { state, update: setState, comparison, nextPlan, optimized, schedule, placements, go: setTab };

  return (
    <>
      <header className="top">
        <div className="top-inner">
          <div className="brand-row">
            <span className="wordmark">ting</span>
            <span className="who">Jordan Rivera · Acme Corp · {profile.currentPlan.name}</span>
            <span className="demo-tag" title="Seeded plan, claims and fees for the demo">Demo data</span>
          </div>
          {state.onboarded && (
            <nav className="tabs" aria-label="Sections">
              {TABS.map(([id, label]) => (
                <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
                  {label}
                </button>
              ))}
            </nav>
          )}
        </div>
      </header>
      <main>
        <ErrorBoundary resetKey={tab}>
        {!state.onboarded ? (
          <Onboarding ctx={ctx} />
        ) : tab === 'decisions' ? (
          <Decisions ctx={ctx} />
        ) : tab === 'schedule' ? (
          <Schedule ctx={ctx} />
        ) : tab === 'compare' ? (
          <ComparePlans ctx={ctx} />
        ) : tab === 'add' ? (
          <AddWork ctx={ctx} />
        ) : (
          <PlanRulesScreen ctx={ctx} />
        )}
        </ErrorBoundary>
      </main>
    </>
  );
}
