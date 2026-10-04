import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type Modifier,
} from "@dnd-kit/core";
import { motion, useAnimationControls } from "framer-motion";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { maxGauges } from "../engine/helpers";
import type { PlannedProcedure } from "../engine/types";
import {
  addDays,
  addMonths,
  clampDate,
  diffDays,
  endOfYear,
  startOfYear,
  yearOf,
} from "../lib/dates";
import {
  formatDate,
  formatMoney,
  formatPercent,
  groupVisits,
  visitName,
} from "../lib/format";
import { datePct } from "../lib/geometry";
import { HORIZON, selectActive, useActive, useAppStore } from "../store";
import { LockIcon } from "./Icons";
import { MiniMaxGauge } from "./MaxGauge";

const LANE_PX = 46;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const horizontalOnly: Modifier = ({ transform }) => ({ ...transform, y: 0 });

interface Visit {
  /** The appointment's first procedure: it carries the date, and moving it moves the whole visit. */
  procedure: PlannedProcedure;
  /** Everything done in this appointment ("3 fillings" is one visit, one chip). */
  procedures: PlannedProcedure[];
  name: string;
  date: string;
  /** What the member owes if it happens. */
  owes: number;
}

export function Timeline({ compact = false }: { compact?: boolean }) {
  const active = useActive();
  const profile = useAppStore((s) => s.profile);
  const moveProcedure = useAppStore((s) => s.moveProcedure);
  const today = useAppStore((s) => s.today);
  const { asOf } = profile;

  const year = yearOf(asOf);
  const start = startOfYear(year);
  const end = endOfYear(year + HORIZON - 1);
  const totalDays = diffDays(end, start);
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [shake, setShake] = useState<{ id: string; n: number } | null>(null);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<{ id: string; date: string } | null>(
    null,
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const dates = new Map(active.placements.map((p) => [p.id, p.date]));
  const owes = new Map(active.lines.map((l) => [l.id, l.memberOwes]));
  const visits: Visit[] = groupVisits(profile.procedures).flatMap(
    (procedures) => {
      const procedure = procedures[0];
      const date = dates.get(procedure.id);
      const total = procedures.reduce((s, p) => s + (owes.get(p.id) ?? 0), 0);
      return date
        ? [
            {
              procedure,
              procedures,
              name: visitName(procedures),
              date,
              owes: total,
            },
          ]
        : [];
    },
  );
  const visitById = new Map(visits.map((v) => [v.procedure.id, v]));

  const daysFor = (dx: number) => {
    const width = trackRef.current?.offsetWidth ?? 1;
    return Math.round((dx * totalDays) / width);
  };

  const attempt = (v: Visit, date: string) => {
    const res = moveProcedure(v.procedure.id, date);
    if (!res.ok) {
      setShake({ id: v.procedure.id, n: Date.now() });
      setMessage(`Can't move there. ${res.reason}`);
      return;
    }
    const after = selectActive(useAppStore.getState());
    const moved = after.placements.find((p) => p.id === v.procedure.id);
    setMessage(
      `${v.name} moved to ${formatDate(moved?.date ?? date, { year: true })}. ` +
        `You pay ${formatMoney(after.expectedOwes)} in total (${formatMoney(res.delta, { signed: true })}).`,
    );
  };

  const onDragMove = ({ active: dragged, delta }: DragMoveEvent) => {
    const v = visitById.get(String(dragged.id));
    if (v)
      setPreview({
        id: v.procedure.id,
        date: clampDate(addDays(v.date, daysFor(delta.x)), asOf, end),
      });
  };

  const onDragEnd = ({ active: dragged, delta }: DragEndEvent) => {
    setPreview(null);
    const v = visitById.get(String(dragged.id));
    const days = daysFor(delta.x);
    if (v && days !== 0) attempt(v, addDays(v.date, days));
  };

  const onKey = (v: Visit) => (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    if (v.procedures.some((p) => p.locked)) {
      setShake({ id: v.procedure.id, n: Date.now() });
      setMessage(`${v.name} is locked: your dentist set this date.`);
      return;
    }
    const dir = e.key === "ArrowRight" ? 1 : -1;
    attempt(v, e.shiftKey ? addMonths(v.date, dir) : addDays(v.date, dir * 7));
  };

  // On narrow screens the timeline scrolls; start it a little before "today".
  useEffect(() => {
    const el = scrollRef.current;
    if (el && el.scrollWidth > el.clientWidth)
      el.scrollLeft = (el.scrollWidth * datePct(asOf, start, end)) / 100 - 48;
  }, [asOf, start, end]);

  const months = Array.from({ length: 12 * HORIZON }, (_, i) =>
    addMonths(start, i),
  );
  const boundaryPct = datePct(`${year + 1}-01-01`, start, end);
  const asOfPct = datePct(asOf, start, end);

  return (
    <div>
      <ul className="divide-y divide-line">
        {visits.map((v) => (
          <DateRow
            key={v.procedure.id + v.date}
            visit={v}
            min={asOf}
            max={end}
            onApply={(date) => attempt(v, date)}
          />
        ))}
      </ul>
      <details className="mt-5 border-t border-line">
        <summary className="text-brand-700">Visual timeline (optional)</summary>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">
            {compact
              ? "Drag to reschedule."
              : "Drag a visit, or focus it and use ← → (a week) or Shift + ← → (a month)."}{" "}
            The bold line is Dec 31, when your annual max resets.
          </p>
        </div>

        {visits.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
            No scheduled work yet. Add treatment on the Treatment page.
          </p>
        ) : (
          <div
            ref={scrollRef}
            className="-mx-1 overflow-x-auto px-1 pb-2"
            role="group"
            aria-label={`Treatment timeline for ${year} and ${year + 1}`}
          >
            <div className="relative min-w-[860px]">
              <div className="mb-2 grid grid-cols-2 gap-6 pr-2">
                {maxGauges(profile, active).map((g) => (
                  <MiniMaxGauge key={g.year} gauge={g} />
                ))}
              </div>

              <div className="relative h-5 text-xs text-muted" aria-hidden>
                {months.map((m, i) => (
                  <span
                    key={m}
                    className={`absolute top-0 ${i % 12 === 0 ? "font-semibold text-ink" : ""}`}
                    style={{ left: `${datePct(m, start, end)}%` }}
                  >
                    {MONTHS[i % 12]}
                  </span>
                ))}
              </div>

              <div
                ref={trackRef}
                className="relative rounded-xl border border-line bg-paper/60"
                style={{ height: visits.length * LANE_PX + 28 }}
              >
                {/* past */}
                <div
                  className="absolute inset-y-0 left-0 rounded-l-xl bg-line/50"
                  style={{ width: `${asOfPct}%` }}
                  aria-hidden
                />
                {/* month grid */}
                {months.map((m) => (
                  <div
                    key={m}
                    className="absolute inset-y-0 w-px bg-line/70"
                    style={{ left: `${datePct(m, start, end)}%` }}
                    aria-hidden
                  />
                ))}
                {/* today */}
                <div
                  className="absolute inset-y-0 border-l border-dashed border-brand-500"
                  style={{ left: `${asOfPct}%` }}
                  aria-hidden
                >
                  <span className="absolute top-1 right-1 rounded bg-brand-500 px-1 text-xs font-semibold whitespace-nowrap text-white">
                    {asOf === today ? "Today" : "As of"}
                  </span>
                </div>
                {/* Dec 31 */}
                <div
                  className="absolute inset-y-0 w-[3px] -translate-x-1/2 bg-ink"
                  style={{ left: `${boundaryPct}%` }}
                  aria-hidden
                >
                  <span className="absolute top-1 left-2 rounded bg-ink px-1.5 py-px text-xs font-semibold whitespace-nowrap text-white">
                    Dec 31 · max resets
                  </span>
                </div>

                <DndContext
                  sensors={sensors}
                  modifiers={[horizontalOnly]}
                  onDragMove={onDragMove}
                  onDragEnd={onDragEnd}
                  onDragCancel={() => setPreview(null)}
                >
                  {visits.map((v, lane) => (
                    <Chip
                      key={v.procedure.id}
                      visit={v}
                      lane={lane}
                      leftPct={datePct(v.date, start, end)}
                      previewDate={
                        preview?.id === v.procedure.id
                          ? preview.date
                          : undefined
                      }
                      shakeN={shake?.id === v.procedure.id ? shake.n : 0}
                      onKeyDown={onKey(v)}
                    />
                  ))}
                </DndContext>
              </div>
            </div>
          </div>
        )}
      </details>
      <p className="sr-only" aria-live="polite">
        {message}
      </p>
      {message && !compact && (
        <p className="mt-1 text-xs text-muted" aria-hidden>
          {message}
        </p>
      )}
    </div>
  );
}

function Chip({
  visit,
  lane,
  leftPct,
  previewDate,
  shakeN,
  onKeyDown,
}: {
  visit: Visit;
  lane: number;
  leftPct: number;
  previewDate?: string;
  shakeN: number;
  onKeyDown: (e: KeyboardEvent) => void;
}) {
  const { procedure, date, owes } = visit;
  const locked = visit.procedures.some((p) => p.locked);
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: procedure.id, disabled: locked });
  const controls = useAnimationControls();
  useEffect(() => {
    if (shakeN)
      void controls.start({
        x: [0, -8, 8, -6, 6, 0],
        transition: { duration: 0.4 },
      });
  }, [shakeN, controls]);

  const name = visit.name;
  const maybe =
    procedure.likelihood !== undefined && procedure.likelihood < 1
      ? ` (maybe, ${formatPercent(procedure.likelihood)})`
      : "";
  const label = locked
    ? `${name}, ${formatDate(date, { year: true })}, you pay ${formatMoney(owes)}. Locked: your dentist set this date.`
    : `${name}${maybe}, ${formatDate(date, { year: true })}, you pay ${formatMoney(owes)}. Use left and right arrows to move a week, Shift plus arrows to move a month.`;

  return (
    <div
      ref={setNodeRef}
      className={`group absolute ${isDragging ? "z-20" : "z-10"}`}
      style={{
        top: lane * LANE_PX + 22,
        left: `${leftPct}%`,
        transform: `translateX(-${leftPct}%) translate3d(${transform?.x ?? 0}px, 0, 0)`,
      }}
    >
      <motion.button
        type="button"
        animate={controls}
        {...attributes}
        {...listeners}
        aria-label={label}
        aria-disabled={locked}
        onKeyDown={onKeyDown}
        className={`flex h-[38px] touch-none items-center gap-2 rounded-xl border px-2.5 text-left text-xs whitespace-nowrap shadow-sm select-none ${
          locked
            ? "cursor-not-allowed border-line bg-paper text-ink"
            : `cursor-grab bg-white active:cursor-grabbing ${maybe ? "border-dashed " : ""}${isDragging ? "border-brand-500 shadow-lg ring-2 ring-brand-200" : "border-brand-200 hover:border-brand-500"}`
        }`}
      >
        {locked && <LockIcon className="shrink-0 text-muted" />}
        <span className="flex flex-col leading-tight">
          <span className="font-semibold">
            {name}
            {maybe && (
              <span className="ml-1 font-normal text-brand-700">
                {formatPercent(procedure.likelihood ?? 1)}
              </span>
            )}
          </span>
          <span className="tabular text-muted">
            {formatDate(previewDate ?? date, { year: true })} ·{" "}
            {formatMoney(owes)}
          </span>
        </span>
      </motion.button>
      {locked && (
        <span
          role="note"
          className="pointer-events-none absolute top-full left-0 z-30 mt-1 hidden rounded-md bg-ink px-2 py-1 text-xs whitespace-nowrap text-white group-focus-within:block group-hover:block"
        >
          Your dentist set this date
        </span>
      )}
    </div>
  );
}

function DateRow({
  visit,
  min,
  max,
  onApply,
}: {
  visit: Visit;
  min: string;
  max: string;
  onApply: (date: string) => void;
}) {
  const [date, setDate] = useState(visit.date);
  const locked = visit.procedures.some((p) => p.locked);
  return (
    <li className="py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="font-medium">{visit.name}</span>
        <span className="tabular">{formatMoney(visit.owes)} if done</span>
      </div>
      {locked ? (
        <p className="mt-2 text-base text-muted">
          {formatDate(visit.date, { year: true })}. Your dentist set this date.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block min-w-0 w-full">
            Treatment date
            <input
              aria-label={`Date for ${visit.name}`}
              type="date"
              min={min}
              max={max}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 block w-full border border-line px-3 py-2"
            />
          </label>
          <button
            type="button"
            className="btn-secondary"
            disabled={!date || date === visit.date || date < min || date > max}
            onClick={() => onApply(date)}
          >
            Apply date
          </button>
        </div>
      )}
      {visit.procedures.some((p) => p.deadline) && (
        <p className="mt-2 text-xs text-muted">
          Dentist’s deadline:{" "}
          {formatDate(
            visit.procedures
              .map((p) => p.deadline)
              .filter(Boolean)
              .sort()[0]!,
            { year: true },
          )}
        </p>
      )}
    </li>
  );
}
