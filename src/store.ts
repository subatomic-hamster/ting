import { create } from "zustand";
import { readDraft, saveDraft } from "./lib/drafts";
import type { ScheduledReminder, TraceEvent } from "./api";
import { configureApi } from "./api/context";
import { DEMO_PLAN_OPTIONS } from "./data/demo";
import { isPersonaId, PERSONAS, type PersonaId } from "./data/personas";
import { round2 } from "./engine/adjudicate";
import { compare } from "./engine/compare";
import {
  applyClaim as applyClaimEvent,
  claimEventSchema,
} from "./engine/ledger";
import { buildReminders, reminderStatus } from "./engine/reminders";
import {
  dentistQuestions,
  evaluateSchedule,
  optimize,
  validatePlacements,
  type PlannedSchedule,
} from "./engine/schedule";
import type {
  FeeTable,
  Ledger,
  Placement,
  PlannedProcedure,
  PlanRules,
  PlanPreferences,
  Profile,
  ServiceRecord,
} from "./engine/types";
import { clampDate, endOfYear, todayISO, yearOf } from "./lib/dates";
import { formatDate, formatMoney, procedureName } from "./lib/format";

export type Network = "in" | "out";
export type ScheduleKind = "cheapest" | "fastest" | "balanced" | "custom";

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

export type MoveResult =
  { ok: true; delta: number; ms: number } | { ok: false; reason: string };

export interface AppState {
  personaId: PersonaId;
  removedProcedureIds: string[];
  patchedProcedureIds: string[];
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
  /** Claim events received from the feed, replayed onto each server profile. */
  liveClaims: unknown[];
  claimChecks: ClaimCheck[];
  lastChange: LastChange | null;
  /** Year-end reminders the member opted into (null: not opted in). */
  scheduledReminders: ScheduledReminder[] | null;
  dismissedReminders: string[];

  loadPersona: (id: PersonaId) => void;
  reset: () => void;
  setPlans: (plans: PlanRules[]) => void;
  setLedger: (ledger: Ledger) => void;
  setNetwork: (network: Network) => void;
  setCurrentPlan: (planId: string) => void;
  setPlanPreferences: (preferences: PlanPreferences) => void;
  addPlan: (rules: PlanRules, asCurrent: boolean) => void;
  setAsOf: (asOf: string) => void;
  simulateDec1: () => void;
  moveProcedure: (procedureId: string, date: string) => MoveResult;
  applySchedule: (kind: Exclude<ScheduleKind, "custom">) => void;
  /** Returns why the engine can't schedule them, or undefined when added. */
  addProcedures: (
    procedures: PlannedProcedure[],
    history?: ServiceRecord[],
  ) => string | undefined;
  updateProcedure: (id: string, patch: Partial<PlannedProcedure>) => void;
  removeProcedure: (id: string) => void;
  restoreProcedures: (before: PlannedProcedure[], ids: string[]) => void;
  applyClaim: (event: unknown) => void;
  /** The server's live profile (carrier records + emailed documents) replaces the persona's; work added in this browser is kept. */
  mergeServerProfile: (server: Profile) => void;
  addTrace: (e: TraceEvent) => void;
  setScheduledReminders: (scheduled: ScheduledReminder[] | null) => void;
  dismissReminder: (id: string) => void;
}

const MAX_TRACE = 200;
let changeId = 0;
const now = () => performance.now();

/** In network the contracted fee applies; out of network the plan allows its UCR fee and the dentist bills the rest. */
function withNetwork(
  procedures: PlannedProcedure[],
  network: Network,
  fees: FeeTable,
): PlannedProcedure[] {
  const inNetwork = network === "in";
  return procedures.map((p) =>
    p.inNetwork === inNetwork
      ? p
      : {
          ...p,
          inNetwork,
          allowedFee: inNetwork ? fees[p.cdt]?.inNetwork : undefined,
          allowedFeeSource:
            p.feeSource?.kind === "quote" || p.feeSource?.kind === "benchmark"
              ? undefined
              : inNetwork
                ? fees[p.cdt]?.source
                : undefined,
          allowancePending:
            p.feeSource?.kind === "quote" || p.feeSource?.kind === "benchmark",
          ...(p.feeSource?.kind === "quote" || p.feeSource?.kind === "benchmark"
            ? { allowedFee: undefined, alternateAllowedFee: undefined }
            : {}),
        },
  );
}

function personaState(id: PersonaId, asOf: string) {
  return {
    personaId: id,
    removedProcedureIds: [] as string[],
    patchedProcedureIds: [] as string[],
    today: todayISO(),
    profile: PERSONAS[id].profile(asOf),
    plans: DEMO_PLAN_OPTIONS,
    network: "in" as Network,
    scheduleKind: "cheapest" as ScheduleKind,
    custom: [],
    liveClaimIds: [],
    liveClaims: [] as unknown[],
    claimChecks: [],
    lastChange: null,
    scheduledReminders: null,
    dismissedReminders: [],
  };
}

function initialPersona(): PersonaId {
  if (typeof window === "undefined") return "dale";
  const p = new URLSearchParams(window.location.search).get("persona");
  return p && isPersonaId(p) ? p : "dale";
}

type Draft = Pick<
  AppState,
  | "profile"
  | "plans"
  | "network"
  | "scheduleKind"
  | "custom"
  | "removedProcedureIds"
  | "patchedProcedureIds"
  | "liveClaimIds"
  | "liveClaims"
  | "claimChecks"
  | "scheduledReminders"
  | "dismissedReminders"
>;
function restorePersona(id: PersonaId) {
  const fresh = personaState(id, todayISO());
  const saved = readDraft<Draft>("treatment", id);
  if (!saved) return fresh;
  try {
    if (
      !saved.profile ||
      !Array.isArray(saved.profile.procedures) ||
      !saved.profile.procedures.every(
        (p) => Number.isFinite(p.fee) && p.fee >= 0,
      )
    )
      return fresh;
    optimize(saved.profile, { horizon: HORIZON });
    configureApi({ asOf: saved.profile.asOf });
    return { ...fresh, ...saved };
  } catch {
    return fresh;
  }
}
export const useAppStore = create<AppState>()((set, get) => {
  const first = initialPersona();
  configureApi({ personaId: first, asOf: todayISO() });

  const pushTrace = (e: Omit<TraceEvent, "ts">) =>
    set((s) => ({
      trace: [...s.trace, { ts: new Date().toISOString(), ...e }].slice(
        -MAX_TRACE,
      ),
    }));
  const setProfile = (profile: Profile) => set({ profile });

  return {
    ...restorePersona(first),
    trace: [],

    loadPersona: (id) => {
      const asOf = todayISO();
      configureApi({ personaId: id, asOf });
      set(restorePersona(id));
      pushTrace({
        tool: "demo.persona",
        summary: `Switched to ${PERSONAS[id].name}`,
        ms: 0,
      });
    },

    reset: () => {
      const id = get().personaId;
      const asOf = todayISO();
      configureApi({ personaId: id, asOf });
      set({ ...personaState(id, asOf), trace: [] });
    },

    setPlanPreferences: (preferences) => {
      setProfile({ ...get().profile, preferences });
    },

    setPlans: (plans) => {
      if (plans.length) set({ plans });
    },

    setLedger: (ledger) => {
      const s = get();
      const history = [
        ...ledger.history,
        ...s.profile.ledger.history.filter(
          (h) =>
            h.source === "user" &&
            !ledger.history.some(
              (x) =>
                x.date === h.date && x.cdt === h.cdt && x.tooth === h.tooth,
            ),
        ),
      ];
      let profile = { ...s.profile, ledger: { ...ledger, history } };
      for (const raw of s.liveClaims)
        profile = applyClaimEvent(profile, claimEventSchema.parse(raw)).profile;
      setProfile(profile);
    },

    setNetwork: (network) => {
      const { profile } = get();
      set({
        network,
        profile: {
          ...profile,
          procedures: withNetwork(profile.procedures, network, profile.fees),
        },
      });
      pushTrace({
        tool: "ui.network",
        summary: `Network set to ${network === "in" ? "in" : "out of"} network`,
        ms: 0,
      });
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
      pushTrace({
        tool: "rules.approve",
        summary: `${rules.version} approved${asCurrent ? " as the current plan" : " as an option"}`,
        ms: 0,
      });
    },

    // Demo time travel rebuilds the persona at the new date so its dentist deadlines stay ahead of "today".
    setAsOf: (asOf) => {
      const s = get();
      configureApi({ asOf });
      const fresh = PERSONAS[s.personaId].profile(asOf);
      set({
        profile: {
          ...fresh,
          currentPlan: s.profile.currentPlan,
          procedures: withNetwork(fresh.procedures, s.network, fresh.fees),
        },
        scheduleKind: "cheapest",
        custom: [],
      });
      pushTrace({
        tool: "demo.asOf",
        summary: `Simulating ${formatDate(asOf, { year: true })}`,
        ms: 0,
      });
    },

    simulateDec1: () => get().setAsOf(`${yearOf(get().today)}-12-01`),

    moveProcedure: (procedureId, requested) => {
      const s = get();
      const proc = s.profile.procedures.find((p) => p.id === procedureId);
      if (!proc) return { ok: false, reason: "Unknown item." };
      // A visit ("2 fillings") moves as one appointment.
      const together = proc.visit
        ? s.profile.procedures.filter((p) => p.visit === proc.visit)
        : [proc];
      const locked = together.find((p) => p.locked);
      if (locked)
        return {
          ok: false,
          reason: `${procedureName(locked)} is urgent: your dentist set this date.`,
        };

      const before = selectActive(s);
      const date = clampDate(
        requested,
        s.profile.asOf,
        endOfYear(yearOf(s.profile.asOf) + HORIZON - 1),
      );
      const ids = new Set(together.map((p) => p.id));
      const placements = before.placements.map((p) =>
        ids.has(p.id) ? { id: p.id, date } : p,
      );
      const [violation] = validatePlacements(s.profile, placements);
      if (violation) return { ok: false, reason: violation.message };

      const t0 = now();
      set({ scheduleKind: "custom", custom: placements });
      const after = selectActive(get());
      const ms = now() - t0;
      const delta = round2(after.expectedOwes - before.expectedOwes);
      set({ lastChange: { id: ++changeId, procedureId, delta, ms } });
      pushTrace({
        tool: "timeline.move",
        summary: `${procedureName(proc)} → ${formatDate(date, { year: true })}; engine re-priced`,
        ms,
      });
      return { ok: true, delta, ms };
    },

    applySchedule: (kind) => {
      const before = selectActive(get());
      const t0 = now();
      set({ scheduleKind: kind, custom: [] });
      const after = selectActive(get());
      const ms = now() - t0;
      set({
        lastChange: {
          id: ++changeId,
          procedureId: "",
          delta: round2(after.expectedOwes - before.expectedOwes),
          ms,
        },
      });
      pushTrace({
        tool: "schedule.apply",
        summary: `Applied the ${kind} schedule`,
        ms,
      });
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
        visit: p.visit && (rename.get(p.visit) ?? p.visit),
      }));
      const profile: Profile = {
        ...s.profile,
        procedures: [
          ...s.profile.procedures,
          ...withNetwork(added, s.network, s.profile.fees),
        ],
        ledger: {
          ...s.profile.ledger,
          history: [...s.profile.ledger.history, ...history],
        },
      };
      try {
        optimizeFor(profile);
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
      set({ profile });
      pushTrace({
        tool: "intake.add",
        summary: `Added ${added.map(procedureName).join(", ")}`,
        ms: 0,
      });
      return undefined;
    },

    updateProcedure: (id, patch) => {
      const { profile } = get();
      const proposed = {
        ...profile,
        procedures: profile.procedures.map((p) =>
          p.id === id ? { ...p, ...patch } : p,
        ),
      };
      optimizeFor(proposed);
      set({
        profile: proposed,
        patchedProcedureIds: [...new Set([...get().patchedProcedureIds, id])],
      });
    },

    removeProcedure: (id) => {
      const { profile } = get();
      set({
        removedProcedureIds: [...new Set([...get().removedProcedureIds, id])],
      });
      setProfile({
        ...profile,
        procedures: profile.procedures
          .filter((p) => p.id !== id)
          .map((p) =>
            p.dependsOn?.includes(id)
              ? { ...p, dependsOn: p.dependsOn.filter((d) => d !== id) }
              : p,
          ),
      });
    },

    restoreProcedures: (before, ids) => {
      const s = get();
      const restoreIds = new Set(ids);
      const current = new Map(s.profile.procedures.map((p) => [p.id, p]));
      const available = new Set([...current.keys(), ...ids]);
      const procedures: PlannedProcedure[] = before.flatMap((p) => {
        if (restoreIds.has(p.id))
          return [
            { ...p, dependsOn: p.dependsOn?.filter((id) => available.has(id)) },
          ];
        const edited = current.get(p.id);
        if (!edited) return [];
        return [
          {
            ...edited,
            dependsOn: [
              ...new Set([
                ...(edited.dependsOn ?? []),
                ...(p.dependsOn ?? []).filter((id) => restoreIds.has(id)),
              ]),
            ].filter((id) => available.has(id)),
          },
        ];
      });
      const oldIds = new Set(before.map((p) => p.id));
      procedures.push(...s.profile.procedures.filter((p) => !oldIds.has(p.id)));
      const profile = { ...s.profile, procedures };
      optimizeFor(profile);
      set({
        profile,
        removedProcedureIds: s.removedProcedureIds.filter(
          (id) => !restoreIds.has(id),
        ),
        patchedProcedureIds: [
          ...new Set([
            ...s.patchedProcedureIds,
            ...procedures.map((p) => p.id),
          ]),
        ],
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
          custom: s.custom.filter((placement) => update.profile.procedures.some((p) => p.id === placement.id)),
          liveClaimIds: [...s.liveClaimIds, event.claimId],
          liveClaims: [...s.liveClaims, event],
          claimChecks: [
            ...s.claimChecks,
            ...update.checks.map((c) => ({ ...c, claimId: event.claimId })),
          ],
        });
        const off = update.checks.filter((c) => c.mismatch).length;
        pushTrace({
          tool: "ledger.claim",
          summary: `${event.claimId}: ${update.completed.length} planned item(s) done; ${off ? `${off} EOB line(s) differ from the estimate` : "EOB matches the estimate"}`,
          ms: now() - t0,
        });
      } catch (err) {
        pushTrace({
          tool: "ledger.claim",
          summary: `rejected: ${err instanceof Error ? err.message : String(err)}`,
          ms: now() - t0,
        });
      }
    },

    addTrace: (e) => set((s) => ({ trace: [...s.trace, e].slice(-MAX_TRACE) })),

    mergeServerProfile: (server) => {
      const s = get();
      const seeded = new Set(
        PERSONAS[s.personaId].profile(server.asOf).procedures.map((p) => p.id),
      );
      const serverIds = new Set(server.procedures.map((p) => p.id));
      // Keep only what this browser added itself; the server owns the seeded work and anything learned by email.
      const localOnly = s.profile.procedures.filter(
        (p) =>
          !seeded.has(p.id) &&
          !serverIds.has(p.id) &&
          !p.id.startsWith("email-"),
      );
      const before = s.profile.procedures.length;
      // The server's profile comes without claims; the ones this browser already received are replayed onto it.
      let profile: Profile = {
        ...server,
        preferences: s.profile.preferences ?? server.preferences,
        asOf: s.profile.asOf,
        procedures: withNetwork(
          [
            ...server.procedures
              .filter((p) => !s.removedProcedureIds.includes(p.id))
              .map((p) =>
                s.patchedProcedureIds.includes(p.id)
                  ? (s.profile.procedures.find((x) => x.id === p.id) ?? p)
                  : p,
              ),
            ...localOnly,
          ],
          s.network,
          server.fees,
        ),
      };
      const remainingIds = new Set(profile.procedures.map((p) => p.id));
      profile.procedures = profile.procedures.map((p) => ({
        ...p,
        dependsOn: p.dependsOn?.filter((id) => remainingIds.has(id)),
      }));
      profile.ledger.history = [
        ...profile.ledger.history,
        ...s.profile.ledger.history.filter(
          (h) =>
            h.source === "user" &&
            !profile.ledger.history.some(
              (x) =>
                x.date === h.date && x.cdt === h.cdt && x.tooth === h.tooth,
            ),
        ),
      ];
      for (const event of s.liveClaims)
        profile = applyClaimEvent(
          profile,
          claimEventSchema.parse(event),
        ).profile;
      set({
        profile,
        custom: s.custom.filter((placement) => profile.procedures.some((p) => p.id === placement.id)),
        plans: s.plans.some((p) => p.id === server.currentPlan.id)
          ? s.plans
          : [...s.plans, server.currentPlan],
      });
      pushTrace({
        tool: "profile.sync",
        summary: `Live profile: ${server.currentPlan.name}, ${server.procedures.length} planned (was ${before})`,
        ms: 0,
      });
    },

    setScheduledReminders: (scheduled) => {
      set({ scheduledReminders: scheduled, dismissedReminders: [] });
      pushTrace({
        tool: "reminders",
        summary: scheduled
          ? `${scheduled.length} year-end reminder(s) scheduled`
          : "Year-end reminders turned off",
        ms: 0,
      });
    },

    dismissReminder: (id) =>
      set((s) => ({ dismissedReminders: [...s.dismissedReminders, id] })),
  };
});

useAppStore.subscribe((s, previous) => {
  if (
    s.profile === previous.profile &&
    s.scheduleKind === previous.scheduleKind &&
    s.custom === previous.custom &&
    s.scheduledReminders === previous.scheduledReminders &&
    s.dismissedReminders === previous.dismissedReminders &&
    s.plans === previous.plans
  )
    return;
  const {
    profile,
    plans,
    network,
    scheduleKind,
    custom,
    removedProcedureIds,
    patchedProcedureIds,
    liveClaimIds,
    liveClaims,
    claimChecks,
    scheduledReminders,
    dismissedReminders,
  } = s;
  saveDraft("treatment", s.personaId, {
    profile,
    plans,
    network,
    scheduleKind,
    custom,
    removedProcedureIds,
    patchedProcedureIds,
    liveClaimIds,
    liveClaims,
    claimChecks,
    scheduledReminders,
    dismissedReminders,
  });
});

// ---------------------------------------------------------------------------
// Engine outputs, memoized on their inputs so every component shares one run per change.
// Dragging a visit only re-prices the schedule; the optimizer and plan comparison rerun when the profile changes.
// ---------------------------------------------------------------------------

function memo<A extends unknown[], R>(
  fn: (...args: A) => R,
): (...args: A) => R {
  let last: { args: A; value: R } | undefined;
  return (...args) => {
    const prev = last;
    if (prev && args.every((a, i) => Object.is(a, prev.args[i])))
      return prev.value;
    const value = fn(...args);
    last = { args, value };
    return value;
  };
}

/** Runs an engine call and adds it to the audit trail. */
function timed<R>(tool: string, run: () => R, summary: (r: R) => string): R {
  const t0 = now();
  const r = run();
  const e = {
    ts: new Date().toISOString(),
    tool,
    summary: summary(r),
    ms: round2(now() - t0),
  };
  queueMicrotask(() => useAppStore.getState().addTrace(e));
  return r;
}

const optimizeFor = memo((profile: Profile) =>
  timed(
    "engine.optimize",
    () => optimize(profile, { horizon: HORIZON }),
    (r) =>
      `${r.evaluated} schedules checked; cheapest ${formatMoney(r.cheapest.expectedOwes)} vs ${formatMoney(r.fastest.expectedOwes)} all now`,
  ),
);

export interface ActiveSchedule extends PlannedSchedule {
  kind: ScheduleKind;
}

const sameIds = (placements: Placement[], procedures: PlannedProcedure[]) =>
  placements.length === procedures.length &&
  procedures.every((p) => placements.some((x) => x.id === p.id));

const activeFor = memo(
  (
    profile: Profile,
    kind: ScheduleKind,
    custom: Placement[],
  ): ActiveSchedule => {
    const opt = optimizeFor(profile);
    // Adding or removing work drops the custom dates; the optimizer's plan takes over.
    if (kind !== "custom" || !sameIds(custom, profile.procedures)) {
      const k = kind === "custom" ? "cheapest" : kind;
      return { ...opt[k], kind: k };
    }
    const ev = timed(
      "engine.evaluate",
      () => evaluateSchedule(profile, custom, { horizon: HORIZON }),
      (r) => `Custom schedule: you pay ${formatMoney(r.expectedOwes)}`,
    );
    return {
      ...ev,
      kind,
      questions: dentistQuestions(profile, custom, opt.fastest.placements),
    };
  },
);

const comparisonFor = memo((profile: Profile, plans: PlanRules[]) =>
  timed(
    "engine.compare",
    () => compare(profile, plans),
    (c) =>
      `${c.options.length} options for ${c.card.fsa.year}; recommend ${c.best.plan.name}`,
  ),
);

const remindersFor = memo((profile: Profile, active: ActiveSchedule) => {
  const reminders = buildReminders(profile, active);
  return { reminders, status: reminderStatus(reminders, profile.asOf) };
});

export const selectOptimized = (s: AppState) => optimizeFor(s.profile);
export const selectActive = (s: AppState) =>
  activeFor(s.profile, s.scheduleKind, s.custom);
export const selectComparison = (s: AppState) =>
  comparisonFor(s.profile, s.plans);
export const selectReminders = (s: AppState) =>
  remindersFor(s.profile, selectActive(s));

export const useOptimized = () => useAppStore(selectOptimized);
export const useActive = () => useAppStore(selectActive);
export const useComparison = () => useAppStore(selectComparison);
export const useReminders = () => useAppStore(selectReminders);
export const useProfile = () => useAppStore((s) => s.profile);
