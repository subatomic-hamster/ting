import { create } from "zustand";
import { readDraft, saveDraft } from "../lib/drafts";
import { formatDuration } from "../lib/format";
import { yearOf } from "../lib/dates";
import { useAppStore } from "../store";
import {
  connectBridge,
  startBridgeSimulation,
  type BridgeConnection,
} from "./bridge";
import { verifySession } from "./rewards";
import {
  habitProfile,
  playSimulatedSession,
  seedHistory,
  type LivePlayer,
} from "./simulate";
import type {
  BrushSession,
  DeviceKind,
  HabitConsent,
  LiveBrushState,
  SessionCheck,
} from "./types";

export type DeviceStatus =
  "disconnected" | "connecting" | "connected" | "error";

export interface DeviceState {
  kind: DeviceKind | null;
  status: DeviceStatus;
  name?: string;
  error?: string;
}

export interface LastSession {
  session: BrushSession;
  check: SessionCheck;
  saved: boolean;
}

export interface HabitState {
  personaId: string;
  asOf: string;
  consent: HabitConsent;
  device: DeviceState;
  sessions: BrushSession[]; // collected data: only exists after opt-in
  live: LiveBrushState | null;
  lastSession: LastSession | null;
  dentistCheck: boolean;
  bridgeMode: string[];
  /** Likelihood before a habit nudge was applied, by procedure id (so nudges never stack). */
  baseLikelihood: Record<string, number>;

  optIn: () => void;
  optOut: () => void;
  setShare: (
    key: "shareWithDentist" | "shareAggregateWithLincoln",
    value: boolean,
  ) => void;
  connect: (kind: DeviceKind) => void;
  disconnect: () => void;
  brushNow: () => void;
  ingestLive: (live: LiveBrushState) => void;
  ingestSession: (session: BrushSession) => void;
  setDentistCheck: (value: boolean) => void;
  applyAdjustment: (procedureId: string, from: number, to: number) => void;
  undoAdjustment: (procedureId: string) => void;
  sync: (personaId: string, asOf: string) => void;
}

let bridge: BridgeConnection | null = null;
let player: LivePlayer | null = null;

function trace(tool: string, summary: string) {
  useAppStore
    .getState()
    .addTrace({ ts: new Date().toISOString(), tool, summary, ms: 0 });
}

function stopDevice() {
  bridge?.close();
  bridge = null;
  player?.stop();
  player = null;
}

const NO_DEVICE: DeviceState = { kind: null, status: "disconnected" };

function personaHabits(personaId: string, asOf: string) {
  const profile = habitProfile(personaId);
  const consent = profile.consent(yearOf(asOf));
  return {
    personaId,
    asOf,
    consent,
    sessions: consent.optedIn
      ? seedHistory(personaId, asOf, consent.consentedAt)
      : [],
    device: consent.optedIn
      ? {
          kind: "simulated" as const,
          status: "connected" as const,
          name: profile.deviceName,
        }
      : NO_DEVICE,
    live: null,
    lastSession: null,
    dentistCheck: false,
    baseLikelihood: {} as Record<string, number>,
  };
}

/** "Now" on the app's (possibly simulated) date, so live sessions land on the right day. */
function startedAtOn(asOf: string) {
  return `${asOf}T${new Date().toISOString().slice(11, 19)}Z`;
}

function restoredHabits(personaId: string, asOf: string) {
  const fresh = personaHabits(personaId, asOf);
  const saved = readDraft<
    Pick<HabitState, "consent" | "sessions" | "dentistCheck">
  >("habits", personaId);
  return saved && saved.consent && Array.isArray(saved.sessions)
    ? { ...fresh, ...saved, device: NO_DEVICE }
    : fresh;
}
const initial = useAppStore.getState();

export const useHabitStore = create<HabitState>()((set, get) => ({
  ...restoredHabits(initial.personaId, initial.profile.asOf),
  bridgeMode: [],

  optIn: () => {
    const { asOf, device } = get();
    set({
      consent: {
        optedIn: true,
        consentedAt: asOf,
        shareWithDentist: false,
        shareAggregateWithLincoln: false,
      },
    });
    trace("habits.consent", "Opted in to SmileStreak; collecting from today");
    if (!device.kind) get().connect("simulated");
  },

  optOut: () => {
    const n = get().sessions.length;
    stopDevice();
    set({
      consent: {
        optedIn: false,
        shareWithDentist: false,
        shareAggregateWithLincoln: false,
      },
      sessions: [],
      live: null,
      lastSession: null,
      dentistCheck: false,
      device: NO_DEVICE,
    });
    // Leaving also removes any habit-based nudge from the estimate.
    for (const id of Object.keys(get().baseLikelihood))
      get().undoAdjustment(id);
    trace("habits.consent", `Opted out; deleted ${n} brushing sessions`);
  },

  setShare: (key, value) => {
    set((s) => ({ consent: { ...s.consent, [key]: value } }));
    trace(
      "habits.share",
      `${key === "shareWithDentist" ? "Dentist summary" : "Insurer aggregate counts"} ${value ? "on" : "off"}`,
    );
  },

  connect: (kind) => {
    stopDevice();
    if (kind === "simulated") {
      set({
        device: {
          kind,
          status: "connected",
          name: habitProfile(get().personaId).deviceName,
        },
        live: null,
      });
      trace("habits.device", "Connected simulated brush");
      return;
    }
    const name =
      kind === "oralb"
        ? "Oral-B brush via Bluetooth bridge"
        : "DIY ESP32 clip via bridge";
    set({ device: { kind, status: "connecting", name }, live: null });
    bridge = connectBridge({
      onOpen: () => {
        set((s) => ({
          device: { ...s.device, status: "connected", error: undefined },
        }));
        trace("habits.device", `Bridge connected (${kind})`);
      },
      onError: (message) =>
        set((s) => ({
          device: { ...s.device, status: "error", error: message },
        })),
      onEvent: (e) => {
        if (e.type === "brush.live") get().ingestLive(e.live);
        else if (e.type === "brush.session") get().ingestSession(e.session);
        else if (e.type === "bridge.status") set({ bridgeMode: e.mode });
      },
    });
  },

  disconnect: () => {
    stopDevice();
    set({ device: NO_DEVICE, live: null });
    trace("habits.device", "Device disconnected");
  },

  brushNow: () => {
    const { device, asOf, personaId } = get();
    if (device.kind === "oralb" || device.kind === "esp32") {
      // With real hardware, just brush. This only drives a bridge started with --simulate.
      startBridgeSimulation().catch(() =>
        set((s) => ({
          device: {
            ...s.device,
            error:
              "Pick up the brush and start brushing, or start the bridge with --simulate to test without one.",
          },
        })),
      );
      return;
    }
    if (!device.kind) get().connect("simulated");
    player?.stop();
    player = playSimulatedSession({
      deviceId: `${personaId}-brush`,
      deviceName: habitProfile(personaId).deviceName,
      startedAt: startedAtOn(asOf),
      onLive: (l) => get().ingestLive(l),
      onDone: (s) => {
        player = null;
        get().ingestSession(s);
      },
    });
    trace("habits.live", "Brushing session started (simulated, 10x speed)");
  },

  ingestLive: (live) => set({ live }),

  ingestSession: (session) => {
    const { consent, sessions, live } = get();
    const check = verifySession(session);
    const saved = consent.optedIn;
    set({
      // A finished session ends that device's live view, even if no idle reading arrived.
      live: live?.deviceId === session.deviceId ? null : live,
      lastSession: { session, check, saved },
      sessions:
        saved && !sessions.some((s) => s.id === session.id)
          ? [...sessions, session]
          : sessions,
    });
    const covered = session.sectorSeconds.filter((s) => s >= 10).length;
    trace(
      "habits.session",
      `${formatDuration(session.durationSec)} · ${covered}/${session.sectorCount} areas · ${check.verified ? "verified" : check.reason} · ${saved ? "saved" : "not saved (not opted in)"}`,
    );
  },

  setDentistCheck: (dentistCheck) => {
    set({ dentistCheck });
    trace(
      "habits.alternative",
      dentistCheck
        ? "Dentist home-care check recorded (demo)"
        : "Dentist home-care check removed",
    );
  },

  applyAdjustment: (procedureId, from, to) => {
    const base = get().baseLikelihood[procedureId] ?? from;
    set((s) => ({
      baseLikelihood: { ...s.baseLikelihood, [procedureId]: base },
    }));
    useAppStore.getState().updateProcedure(procedureId, { likelihood: to });
    trace(
      "habits.estimate",
      `Likelihood ${Math.round(base * 100)}% → ${Math.round(to * 100)}% from 30-day brushing`,
    );
  },

  undoAdjustment: (procedureId) => {
    const base = get().baseLikelihood[procedureId];
    if (base === undefined) return;
    set((s) => {
      const rest = { ...s.baseLikelihood };
      delete rest[procedureId];
      return { baseLikelihood: rest };
    });
    useAppStore.getState().updateProcedure(procedureId, { likelihood: base });
    trace(
      "habits.estimate",
      `Likelihood restored to ${Math.round(base * 100)}%`,
    );
  },

  sync: (personaId, asOf) => {
    const s = get();
    if (personaId !== s.personaId) {
      stopDevice();
      set(restoredHabits(personaId, asOf));
      return;
    }
    // Same person, new demo date: regenerate the seeded history, keep live-recorded sessions.
    const recorded = s.sessions.filter((x) => x.source !== "seed");
    const seeded =
      s.consent.optedIn && s.consent.consentedAt
        ? seedHistory(personaId, asOf, s.consent.consentedAt)
        : [];
    set({ asOf, sessions: [...seeded, ...recorded] });
  },
}));

useAppStore.subscribe((s, prev) => {
  if (s.personaId !== prev.personaId || s.profile.asOf !== prev.profile.asOf)
    useHabitStore.getState().sync(s.personaId, s.profile.asOf);
});

useHabitStore.subscribe((s, prev) => {
  if (
    s.consent !== prev.consent ||
    s.sessions !== prev.sessions ||
    s.dentistCheck !== prev.dentistCheck
  )
    saveDraft("habits", s.personaId, {
      consent: s.consent,
      sessions: s.sessions,
      dentistCheck: s.dentistCheck,
    });
});
