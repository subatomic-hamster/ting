import { create } from 'zustand';
import type { TraceEvent } from './api';
import { configureMock } from './api/mockApi';
import { DEMO_PLAN_OPTIONS } from './data/demo';
import { isPersonaId, PERSONAS, type PersonaId } from './data/personas';
import { round2 } from './engine/adjudicate';
import { compare } from './engine/compare';
import { applyClaim as applyClaimEvent, claimEventSchema } from './engine/ledger';
import { dentistQuestions, evaluateSchedule, optimize, validatePlacements, type PlannedSchedule } from './engine/schedule';
import type { FeeTable, Ledger, Placement, PlannedProcedure, PlanRules, Profile, ServiceRecord } from './engine/types';
import { clampDate, endOfYear, todayISO, yearOf } from './lib/dates';
import { formatDate, formatMoney, procedureName } from './lib/format';

export type Network = 'in' | 'out';
export type ScheduleKind = 'cheapest' | 'fastest' | 'balanced' | 'custom';

/** Plan years the timeline shows and the optimizer places work in: this one and next. */
export const HORIZON = 2;

export interface LastChange {
  id: number;
  procedureId: string;
  delta: number;
  ms: number;
}

export interface ClaimCheck {
  claimId: string;
  id: string;
  estimated: number;
  actual: number;
  mismatch: boolean;
}

export type MoveResult = { ok: true; delta: number; ms: number } | { ok: false; reason: string };

export interface AppState {
  personaId: PersonaId;
  today: string;
  /** Everything the engine knows about the member. */
  profile: Profile;
  /** Options at open enrollment. */
  plans: PlanRules[];
  network: Network;
  scheduleKind: ScheduleKind;
  /** Dates from timeline drags, when scheduleKind is 'custom'. */
  custom: Placement[];
  trace: TraceEvent[];
  liveClaimIds: string[];
  claimChecks: ClaimCheck[];
  lastChange: LastChange | null;

  loadPersona: (id: PersonaId) => void;
  reset: () => void;
  setPlans: (plans: PlanRules[]) => void;
  setLedger: (ledger: Ledger) => void;
  setNetwork: (network: Network) => void;
  setCurrentPlan: (planId: string) => void;
  addPlan: (rules: PlanRules, asCurrent: boolean) => void;
  setAsOf: (asOf: string) => void;
  simulateDec1: () => void;
  moveProcedure: (procedureId: string, date: string) => MoveResult;
  applySchedule: (kind: Exclude<ScheduleKind, 'custom'>) => void;
  /** Returns why the engine can't schedule them, or undefined when added. */
  addProcedures: (procedures: PlannedProcedure[], history?: ServiceRecord[]) => string | undefined;
  updateProcedure: (id: string, patch: Partial<PlannedProcedure>) => void;
  removeProcedure: (id: string) => void;
  applyClaim: (event: unknown) => void;
  addTrace: (e: TraceEvent) => void;
}

const MAX_TRACE = 200;
let changeId = 0;
const now = () => performance.now();

/** In network the contracted fee applies; out of network the plan allows its UCR fee and the dentist bills the rest. */
function withNetwork(procedures: PlannedProcedure[], network: Network, fees: FeeTable): PlannedProcedure[] {
  const inNetwork = network === 'in';
  return procedures.map((p) =>
    p.inNetwork === inNetwork ? p : { ...p, inNetwork, allowedFee: inNetwork ? fees[p.cdt]?.inNetwork : undefined },
  );
}

function personaState(id: PersonaId, asOf: string) {
  return {
    personaId: id,
    today: todayISO(),
    profile: PERSONAS[id].profile(asOf),
    plans: DEMO_PLAN_OPTIONS,
    network: 'in' as Network,
    scheduleKind: 'cheapest' as ScheduleKind,
    custom: [],
    liveClaimIds: [],
    claimChecks: [],
    lastChange: null,
  };
}

function initialPersona(): PersonaId {
  if (typeof window === 'undefined') return 'dale';
  const p = new URLSearchParams(window.location.search).get('persona');
  return p && isPersonaId(p) ? p : 'dale';
}

export const useAppStore = create<AppState>()((set, get) => {
  const first = initialPersona();
  configureMock({ personaId: first, asOf: todayISO() });

  const pushTrace = (e: Omit<TraceEvent, 'ts'>) =>
    set((s) => ({ trace: [...s.trace, { ts: new Date().toISOString(), ...e }].slice(-MAX_TRACE) }));
  const setProfile = (profile: Profile) => set({ profile });

  return {
    ...personaState(first, todayISO()),
    trace: [],

    loadPersona: (id) => {
      const asOf = todayISO();
      configureMock({ personaId: id, asOf });
      set(personaState(id, asOf));
      pushTrace({ tool: 'demo.persona', summary: `Switched to ${PERSONAS[id].name}`, ms: 0 });
    },

    reset: () => {
      const id = get().personaId;
      const asOf = todayISO();
      configureMock({ personaId: id, asOf });
      set({ ...personaState(id, asOf), trace: [] });
    },

    setPlans: (plans) => {
      if (plans.length) set({ plans });
    },

    setLedger: (ledger) => setProfile({ ...get().profile, ledger }),

    setNetwork: (network) => {
      const { profile } = get();
      set({ network, profile: { ...profile, procedures: withNetwork(profile.procedures, network, profile.fees) } });
      pushTrace({ tool: 'ui.network', summary: `Network set to ${network === 'in' ? 'in' : 'out of'} network`, ms: 0 });
    },

    setCurrentPlan: (planId) => {
      const plan = get().plans.find((p) => p.id === planId);
      if (plan) setProfile({ ...get().profile, currentPlan: plan });
    },

    addPlan: (rules, asCurrent) => {
      const s = get();
      set({
        plans: [...s.plans.filter((p) => p.id !== rules.id), rules],
        profile: asCurrent ? { ...s.profile, currentPlan: rules } : s.profile,
      });
      pushTrace({ tool: 'rules.approve', summary: `${rules.version} approved${asCurrent ? ' as the current plan' : ' as an option'}`, ms: 0 });
    },

    // Demo time travel rebuilds the persona at the new date so its dentist deadlines stay ahead of "today".
    setAsOf: (asOf) => {
      const s = get();
      configureMock({ asOf });
      const fresh = PERSONAS[s.personaId].profile(asOf);
      set({
        profile: { ...fresh, currentPlan: s.profile.currentPlan, procedures: withNetwork(fresh.procedures, s.network, fresh.fees) },
        scheduleKind: 'cheapest',
        custom: [],
      });
      pushTrace({ tool: 'demo.asOf', summary: `Simulating ${formatDate(asOf, { year: true })}`, ms: 0 });
    },

    simulateDec1: () => get().setAsOf(`${yearOf(get().today)}-12-01`),

    moveProcedure: (procedureId, requested) => {
      const s = get();
      const proc = s.profile.procedures.find((p) => p.id === procedureId);
      if (!proc) return { ok: false, reason: 'Unknown item.' };
      if (proc.locked) return { ok: false, reason: `${procedureName(proc)} is urgent: your dentist set this date.` };

      const before = selectActive(s);
      const date = clampDate(requested, s.profile.asOf, endOfYear(yearOf(s.profile.asOf) + HORIZON - 1));
      const placements = before.placements.map((p) => (p.id === procedureId ? { id: p.id, date } : p));
      const [violation] = validatePlacements(s.profile, placements);
      if (violation) return { ok: false, reason: violation.message };

      const t0 = now();
      set({ scheduleKind: 'custom', custom: placements });
      const after = selectActive(get());
      const ms = now() - t0;
      const delta = round2(after.expectedOwes - before.expectedOwes);
      set({ lastChange: { id: ++changeId, procedureId, delta, ms } });
      pushTrace({ tool: 'timeline.move', summary: `${procedureName(proc)} → ${formatDate(date, { year: true })}; engine re-priced`, ms });
      return { ok: true, delta, ms };
    },

    applySchedule: (kind) => {
      const before = selectActive(get());
      const t0 = now();
      set({ scheduleKind: kind, custom: [] });
      const after = selectActive(get());
      const ms = now() - t0;
      set({ lastChange: { id: ++changeId, procedureId: '', delta: round2(after.expectedOwes - before.expectedOwes), ms } });
      pushTrace({ tool: 'schedule.apply', summary: `Applied the ${kind} schedule`, ms });
    },

    addProcedures: (procedures, history = []) => {
      const s = get();
      // Keep ids unique; links inside the batch follow the renames.
      const taken = new Set(s.profile.procedures.map((p) => p.id));
      const rename = new Map<string, string>();
      for (const p of procedures) {
        let id = p.id;
        for (let n = 2; taken.has(id); n++) id = `${p.id}-${n}`;
        taken.add(id);
        rename.set(p.id, id);
      }
      const added = procedures.map((p) => ({
        ...p,
        id: rename.get(p.id) ?? p.id,
        dependsOn: p.dependsOn?.map((d) => rename.get(d) ?? d),
      }));
      const profile: Profile = {
        ...s.profile,
        procedures: [...s.profile.procedures, ...withNetwork(added, s.network, s.profile.fees)],
        ledger: { ...s.profile.ledger, history: [...s.profile.ledger.history, ...history] },
      };
      try {
        optimizeFor(profile);
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
      set({ profile });
      pushTrace({ tool: 'intake.add', summary: `Added ${added.map(procedureName).join(', ')}`, ms: 0 });
      return undefined;
    },

    updateProcedure: (id, patch) => {
      const { profile } = get();
      setProfile({ ...profile, procedures: profile.procedures.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
    },

    removeProcedure: (id) => {
      const { profile } = get();
      setProfile({
        ...profile,
        procedures: profile.procedures
          .filter((p) => p.id !== id)
          .map((p) => (p.dependsOn?.includes(id) ? { ...p, dependsOn: p.dependsOn.filter((d) => d !== id) } : p)),
      });
    },

    applyClaim: (raw) => {
      const t0 = now();
      try {
        const event = claimEventSchema.parse(raw);
        const s = get();
        const update = applyClaimEvent(s.profile, event);
        if (update.duplicate) return;
        set({
          profile: update.profile,
          liveClaimIds: [...s.liveClaimIds, event.claimId],
          claimChecks: [...s.claimChecks, ...update.checks.map((c) => ({ ...c, claimId: event.claimId }))],
        });
        const off = update.checks.filter((c) => c.mismatch).length;
        pushTrace({
          tool: 'ledger.claim',
          summary: `${event.claimId}: ${update.completed.length} planned item(s) done; ${off ? `${off} EOB line(s) differ from the estimate` : 'EOB matches the estimate'}`,
          ms: now() - t0,
        });
      } catch (err) {
        pushTrace({ tool: 'ledger.claim', summary: `rejected: ${err instanceof Error ? err.message : String(err)}`, ms: now() - t0 });
      }
    },

    addTrace: (e) => set((s) => ({ trace: [...s.trace, e].slice(-MAX_TRACE) })),
  };
});

// ---------------------------------------------------------------------------
// Engine outputs, memoized on their inputs so every component shares one run per change.
// Dragging a visit only re-prices the schedule; the optimizer and plan comparison rerun when the profile changes.
// ---------------------------------------------------------------------------

function memo<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  let last: { args: A; value: R } | undefined;
  return (...args) => {
    const prev = last;
    if (prev && args.every((a, i) => Object.is(a, prev.args[i]))) return prev.value;
    const value = fn(...args);
    last = { args, value };
    return value;
  };
}

/** Runs an engine call and adds it to the audit trail. */
function timed<R>(tool: string, run: () => R, summary: (r: R) => string): R {
  const t0 = now();
  const r = run();
  const e = { ts: new Date().toISOString(), tool, summary: summary(r), ms: round2(now() - t0) };
  queueMicrotask(() => useAppStore.getState().addTrace(e));
  return r;
}

const optimizeFor = memo((profile: Profile) =>
  timed(
    'engine.optimize',
    () => optimize(profile, { horizon: HORIZON }),
    (r) => `${r.evaluated} schedules checked; cheapest ${formatMoney(r.cheapest.expectedOwes)} vs ${formatMoney(r.fastest.expectedOwes)} all now`,
  ),
);

export interface ActiveSchedule extends PlannedSchedule {
  kind: ScheduleKind;
}

const sameIds = (placements: Placement[], procedures: PlannedProcedure[]) =>
  placements.length === procedures.length && procedures.every((p) => placements.some((x) => x.id === p.id));

const activeFor = memo((profile: Profile, kind: ScheduleKind, custom: Placement[]): ActiveSchedule => {
  const opt = optimizeFor(profile);
  // Adding or removing work drops the custom dates; the optimizer's plan takes over.
  if (kind !== 'custom' || !sameIds(custom, profile.procedures)) {
    const k = kind === 'custom' ? 'cheapest' : kind;
    return { ...opt[k], kind: k };
  }
  const ev = timed(
    'engine.evaluate',
    () => evaluateSchedule(profile, custom, { horizon: HORIZON }),
    (r) => `Custom schedule: you pay ${formatMoney(r.expectedOwes)}`,
  );
  return { ...ev, kind, questions: dentistQuestions(profile, custom, opt.fastest.placements) };
});

const comparisonFor = memo((profile: Profile, plans: PlanRules[]) =>
  timed(
    'engine.compare',
    () => compare(profile, plans),
    (c) => `${c.options.length} options for ${c.card.fsa.year}; recommend ${c.best.plan.name}`,
  ),
);

export const selectOptimized = (s: AppState) => optimizeFor(s.profile);
export const selectActive = (s: AppState) => activeFor(s.profile, s.scheduleKind, s.custom);
export const selectComparison = (s: AppState) => comparisonFor(s.profile, s.plans);

export const useOptimized = () => useAppStore(selectOptimized);
export const useActive = () => useAppStore(selectActive);
export const useComparison = () => useAppStore(selectComparison);
export const useProfile = () => useAppStore((s) => s.profile);
