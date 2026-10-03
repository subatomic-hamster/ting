import { create } from 'zustand';
import { configureMock } from './api/mockApi';
import type {
  ClaimAdjudicatedEvent,
  EngineInput,
  EngineResult,
  LedgerEntry,
  Network,
  PlanRules,
  ProcedureItem,
  ScheduleOption,
  TraceEvent,
} from './contracts';
import { memberTotalDelta, runEngine } from './engine';
import { buildEngineInput, PERSONAS, type PersonaId } from './fixtures/personas';
import { clampDate, endOfYear, todayISO, yearOf } from './lib/dates';
import { formatDate } from './lib/format';

export interface LastChange {
  id: number;
  procedureId: string;
  delta: number; // from the engine helper, never computed in the UI
  ms: number;
}

export type MoveResult = { ok: true; delta: number; ms: number } | { ok: false; reason: string };

export interface AppState {
  personaId: PersonaId;
  today: string;
  plans: PlanRules[];
  selectedPlanId: string;
  ledger: LedgerEntry[];
  procedures: ProcedureItem[];
  overrides: EngineInput['overrides'];
  network: Network;
  asOf: string;
  fsa: EngineInput['fsa'];
  marginalTaxRate: number;
  trace: TraceEvent[];
  liveClaimIds: string[];
  lastChange: LastChange | null;

  loadPersona: (id: PersonaId) => void;
  reset: () => void;
  setPlans: (plans: PlanRules[]) => void;
  setLedger: (ledger: LedgerEntry[]) => void;
  setNetwork: (network: Network) => void;
  setSelectedPlan: (planId: string) => void;
  setAsOf: (asOf: string) => void;
  simulateDec1: () => void;
  moveProcedure: (procedureId: string, date: string) => MoveResult;
  applySchedule: (kind: ScheduleOption['kind']) => void;
  addProcedures: (items: ProcedureItem[]) => void;
  updateProcedure: (id: string, patch: Partial<ProcedureItem>) => void;
  removeProcedure: (id: string) => void;
  applyClaim: (e: ClaimAdjudicatedEvent) => void;
  addTrace: (e: TraceEvent) => void;
}

const MAX_TRACE = 200;
let changeId = 0;

function personaState(id: PersonaId, asOf: string) {
  const today = todayISO();
  const input = buildEngineInput(PERSONAS[id], asOf, today);
  return {
    personaId: id,
    today,
    plans: input.plans,
    selectedPlanId: input.selectedPlanId,
    ledger: input.ledger,
    procedures: input.procedures,
    overrides: [],
    network: input.network,
    asOf,
    fsa: input.fsa,
    marginalTaxRate: input.marginalTaxRate,
    liveClaimIds: [],
    lastChange: null,
  };
}

function initialPersona(): PersonaId {
  if (typeof window === 'undefined') return 'dale';
  const p = new URLSearchParams(window.location.search).get('persona');
  return p && p in PERSONAS ? (p as PersonaId) : 'dale';
}

const now = () => performance.now();

export const useAppStore = create<AppState>()((set, get) => {
  const first = initialPersona();
  configureMock({ personaId: first, asOf: todayISO() });

  const pushTrace = (e: Omit<TraceEvent, 'ts'>) =>
    set((s) => ({ trace: [...s.trace, { ts: new Date().toISOString(), ...e }].slice(-MAX_TRACE) }));

  return {
    ...personaState(first, todayISO()),
    trace: [],

    loadPersona: (id) => {
      const asOf = todayISO();
      configureMock({ personaId: id, asOf, reset: true });
      set(personaState(id, asOf));
      pushTrace({ tool: 'demo.persona', summary: `Switched to ${PERSONAS[id].name}`, ms: 0 });
    },

    reset: () => {
      const id = get().personaId;
      const asOf = todayISO();
      configureMock({ personaId: id, asOf, reset: true });
      set({ ...personaState(id, asOf), trace: [] });
    },

    setPlans: (plans) => {
      if (!plans.length) return;
      set((s) => ({
        plans,
        selectedPlanId: plans.some((p) => p.id === s.selectedPlanId) ? s.selectedPlanId : plans[0].id,
      }));
    },

    setLedger: (ledger) => set({ ledger }),

    setNetwork: (network) => {
      set({ network });
      pushTrace({ tool: 'ui.network', summary: `Network set to ${network === 'in' ? 'in' : 'out of'} network`, ms: 0 });
    },

    setSelectedPlan: (selectedPlanId) => set({ selectedPlanId }),

    setAsOf: (asOf) => {
      configureMock({ asOf });
      set({ asOf });
    },

    simulateDec1: () => {
      const asOf = `${yearOf(get().today)}-12-01`;
      configureMock({ asOf });
      set({ asOf });
      pushTrace({ tool: 'demo.asOf', summary: `Simulating ${formatDate(asOf, { year: true })}`, ms: 0 });
    },

    moveProcedure: (procedureId, requested) => {
      const s = get();
      const proc = s.procedures.find((p) => p.id === procedureId);
      if (!proc) return { ok: false, reason: 'Unknown item' };
      if (proc.locked) return { ok: false, reason: 'Your dentist set this deadline' };

      const before = selectResult(s);
      const date = clampDate(requested, s.asOf, endOfYear(yearOf(s.asOf) + 1));
      const dates = new Map(before.activeSchedule.items.map((i) => [i.procedureId, i.date]));
      for (const dep of proc.dependsOn ?? []) {
        const d = dates.get(dep);
        if (d && date < d) {
          const name = s.procedures.find((p) => p.id === dep)?.label ?? 'another item';
          return { ok: false, reason: `Has to come after ${name}` };
        }
      }
      for (const other of s.procedures) {
        const d = dates.get(other.id);
        if (other.dependsOn?.includes(procedureId) && d && date > d) {
          return { ok: false, reason: `Has to come before ${other.label}` };
        }
      }

      const t0 = now();
      set({ overrides: [...s.overrides.filter((o) => o.procedureId !== procedureId), { procedureId, date }] });
      const after = selectResult(get());
      const ms = now() - t0;
      const delta = memberTotalDelta(before, after);
      set({ lastChange: { id: ++changeId, procedureId, delta, ms } });
      pushTrace({
        tool: 'timeline.move',
        summary: `${proc.label}${proc.tooth ? ` #${proc.tooth}` : ''} → ${formatDate(date, { year: true })}; engine re-ran`,
        ms,
      });
      return { ok: true, delta, ms };
    },

    applySchedule: (kind) => {
      const s = get();
      const before = selectResult(s);
      const option = before.schedules.find((o) => o.kind === kind);
      if (!option) return;
      const t0 = now();
      set({ overrides: option.items.filter((i) => !i.locked).map((i) => ({ procedureId: i.procedureId, date: i.date })) });
      const after = selectResult(get());
      const ms = now() - t0;
      set({ lastChange: { id: ++changeId, procedureId: '', delta: memberTotalDelta(before, after), ms } });
      pushTrace({ tool: 'schedule.apply', summary: `Applied the ${kind} schedule`, ms });
    },

    addProcedures: (items) => set((s) => ({ procedures: [...s.procedures, ...items] })),

    updateProcedure: (id, patch) =>
      set((s) => ({ procedures: s.procedures.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),

    removeProcedure: (id) =>
      set((s) => ({
        procedures: s.procedures.filter((p) => p.id !== id),
        overrides: s.overrides.filter((o) => o.procedureId !== id),
      })),

    applyClaim: (e) => {
      const entries: LedgerEntry[] = e.lines.map((l, i) => ({
        id: `${e.claimId}-${i}`,
        serviceDate: e.serviceDate,
        cdt: l.cdt,
        tooth: l.tooth,
        billed: l.billed,
        allowed: l.allowed,
        planPaid: l.planPaid,
        memberOwes: l.memberOwes,
        source: 'claim',
        isDemoData: true,
      }));
      set((s) => {
        if (s.ledger.some((x) => x.id === entries[0]?.id)) return {};
        // Work that now has a claim is done: drop it from the plan.
        const done = new Set(
          s.procedures.filter((p) => e.lines.some((l) => l.cdt === p.cdt && l.tooth === p.tooth)).map((p) => p.id),
        );
        return {
          ledger: [...s.ledger, ...entries],
          procedures: s.procedures.filter((p) => !done.has(p.id)),
          overrides: s.overrides.filter((o) => !done.has(o.procedureId)),
          liveClaimIds: [...s.liveClaimIds, ...entries.map((x) => x.id)],
        };
      });
      pushTrace({ tool: 'ledger.claim', summary: `${e.claimId} adjudicated (${e.lines.length} line)`, ms: 0 });
    },

    addTrace: (e) => set((s) => ({ trace: [...s.trace, e].slice(-MAX_TRACE) })),
  };
});

// ---------------------------------------------------------------------------
// Derived engine result: memoized on a shallow comparison of the inputs, so
// every component shares one synchronous engine run per state change.
// ---------------------------------------------------------------------------

type InputKey = [
  AppState['plans'],
  AppState['selectedPlanId'],
  AppState['ledger'],
  AppState['procedures'],
  AppState['overrides'],
  AppState['network'],
  AppState['asOf'],
  AppState['fsa'],
  AppState['marginalTaxRate'],
];

let cache: { key: InputKey; input: EngineInput; result: EngineResult } | null = null;

function keyOf(s: AppState): InputKey {
  return [s.plans, s.selectedPlanId, s.ledger, s.procedures, s.overrides, s.network, s.asOf, s.fsa, s.marginalTaxRate];
}

function ensure(s: AppState) {
  const key = keyOf(s);
  if (cache && key.every((k, i) => Object.is(k, cache!.key[i]))) return cache;
  const input: EngineInput = {
    plans: s.plans,
    selectedPlanId: s.selectedPlanId,
    ledger: s.ledger,
    procedures: s.procedures,
    overrides: s.overrides,
    network: s.network,
    asOf: s.asOf,
    fsa: s.fsa,
    marginalTaxRate: s.marginalTaxRate,
  };
  cache = { key, input, result: runEngine(input) };
  return cache;
}

export const selectResult = (s: AppState): EngineResult => ensure(s).result;
export const selectInput = (s: AppState): EngineInput => ensure(s).input;

export const useResult = () => useAppStore(selectResult);
export const useEngineInput = () => useAppStore(selectInput);

export const selectPlan = (s: AppState) => s.plans.find((p) => p.id === s.selectedPlanId) ?? s.plans[0];
