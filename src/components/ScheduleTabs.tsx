import { useRef, type KeyboardEvent } from "react";
import { round2 } from "../engine/adjudicate";
import type { PlannedSchedule } from "../engine/schedule";
import { formatDate, formatMoney } from "../lib/format";
import {
  useActive,
  useAppStore,
  useOptimized,
  type ScheduleKind,
} from "../store";

type Preset = Exclude<ScheduleKind, "custom">;
const ORDER: Preset[] = ["cheapest", "fastest", "balanced"];
const NAMES: Record<ScheduleKind, string> = {
  cheapest: "Cheapest",
  fastest: "Fastest",
  balanced: "Balanced",
  custom: "Custom",
};
const HINTS: Record<ScheduleKind, string> = {
  cheapest: "Lowest cost after the max, deductible and FSA",
  fastest: "Everything as soon as allowed",
  balanced: "Most of the savings, done sooner",
  custom: "Your timeline edits",
};

export function ScheduleTabs({ panelId }: { panelId: string }) {
  const optimized = useOptimized();
  const active = useActive();
  const applySchedule = useAppStore((s) => s.applySchedule);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const { fastest } = optimized;
  /** Saving vs doing everything as soon as allowed, in what you pay. */
  const saves = (s: PlannedSchedule) =>
    round2(fastest.expectedOwes - s.expectedOwes);

  const onKey = (i: number) => (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next =
      (i + (e.key === "ArrowRight" ? 1 : ORDER.length - 1)) % ORDER.length;
    refs.current[next]?.focus();
    applySchedule(ORDER[next]);
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label="Schedule options"
        className="grid grid-cols-1 gap-3 lg:grid-cols-3"
      >
        {ORDER.map((kind, i) => {
          const o = optimized[kind];
          const selected = active.kind === kind;
          return (
            <button
              key={kind}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={
                selected || (active.kind === "custom" && i === 0) ? 0 : -1
              }
              onKeyDown={onKey(i)}
              onClick={() => applySchedule(kind)}
              className={`rounded-xl px-2 py-2 text-left transition-colors sm:px-3 ${selected ? "border border-brand-600 bg-white" : "border border-line hover:bg-brand-50"}`}
            >
              <span className="block text-xs font-semibold sm:text-sm">
                {NAMES[kind]}
              </span>
              <span className="tabular block text-base font-semibold sm:text-lg">
                {formatMoney(o.expectedOwes)}
              </span>
              <span className="block text-xs text-muted">
                {saves(o) > 0 ? (
                  <span className="font-medium text-save">
                    saves {formatMoney(saves(o))}
                  </span>
                ) : (
                  "Earliest dates"
                )}
                <span className="block">Last date: {formatDate(o.finish)}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 rounded-xl border border-line bg-white p-3 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span>
            <span className="font-semibold">{NAMES[active.kind]}</span>
            <span className="text-muted"> · {HINTS[active.kind]}</span>
          </span>
          <span className="tabular text-xl font-semibold">
            {formatMoney(active.expectedOwes)}
          </span>
        </div>
        <dl className="mt-1 grid grid-cols-1 gap-x-4 text-xs text-muted sm:grid-cols-3">
          <div>
            <dt className="inline">After FSA tax savings: </dt>
            <dd className="tabular inline font-medium text-ink">
              {formatMoney(active.expectedCost)}
            </dd>
          </div>
          <div>
            <dt className="inline">Last planned visit: </dt>
            <dd className="inline font-medium text-ink">
              {formatDate(active.finish, { year: true })}
            </dd>
          </div>
          <div>
            <dt className="inline">Vs. doing it all now: </dt>
            <dd
              className={`tabular inline font-medium ${saves(active) > 0 ? "text-save" : "text-ink"}`}
            >
              {saves(active) > 0
                ? `saves ${formatMoney(saves(active))}`
                : formatMoney(-saves(active), { signed: true })}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
