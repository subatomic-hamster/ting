import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type Modifier,
} from '@dnd-kit/core';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { ProcedureItem, ScheduledItem } from '../contracts';
import { addDays, addMonths, clampDate, diffDays, endOfYear, startOfYear, yearOf } from '../lib/dates';
import { formatDate, formatMoney } from '../lib/format';
import { datePct } from '../lib/geometry';
import { selectResult, useAppStore, useResult } from '../store';
import { LockIcon } from './Icons';
import { MiniMaxGauge } from './MaxGauge';

const LANE_PX = 46;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const horizontalOnly: Modifier = ({ transform }) => ({ ...transform, y: 0 });

const nameOf = (p?: ProcedureItem) => (p ? (p.tooth ? `${p.label} #${p.tooth}` : p.label) : 'Item');

export function Timeline({ compact = false }: { compact?: boolean }) {
  const result = useResult();
  const procedures = useAppStore((s) => s.procedures);
  const asOf = useAppStore((s) => s.asOf);
  const moveProcedure = useAppStore((s) => s.moveProcedure);
  const lastChange = useAppStore((s) => s.lastChange);
  const today = useAppStore((s) => s.today);

  const year = yearOf(asOf);
  const start = startOfYear(year);
  const end = endOfYear(year + 1);
  const totalDays = diffDays(end, start);
  const trackRef = useRef<HTMLDivElement>(null);
  const [shake, setShake] = useState<{ id: string; n: number } | null>(null);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<{ id: string; date: string } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const byId = new Map(procedures.map((p) => [p.id, p]));
  const items = result.activeSchedule.items;
  const itemById = new Map(items.map((i) => [i.procedureId, i]));
  const lanes = procedures.filter((p) => itemById.has(p.id));

  const daysFor = (dx: number) => {
    const width = trackRef.current?.offsetWidth ?? 1;
    return Math.round((dx * totalDays) / width);
  };

  const attempt = (id: string, date: string) => {
    const p = byId.get(id);
    const res = moveProcedure(id, date);
    if (!res.ok) {
      setShake({ id, n: Date.now() });
      setMessage(`${nameOf(p)} can't move there: ${res.reason}.`);
      return;
    }
    const after = selectResult(useAppStore.getState());
    const moved = after.activeSchedule.items.find((i) => i.procedureId === id);
    setMessage(
      `${nameOf(p)} moved to ${moved ? formatDate(moved.date, { year: true }) : formatDate(date)}. ` +
        `You pay ${formatMoney(after.activeSchedule.memberTotal)} in total (${formatMoney(res.delta, { signed: true })}).`,
    );
  };

  const onDragMove = ({ active, delta }: DragMoveEvent) => {
    const item = itemById.get(String(active.id));
    if (!item) return;
    setPreview({ id: item.procedureId, date: clampDate(addDays(item.date, daysFor(delta.x)), asOf, end) });
  };

  const onDragEnd = ({ active, delta }: DragEndEvent) => {
    setPreview(null);
    const item = itemById.get(String(active.id));
    const days = daysFor(delta.x);
    if (!item || days === 0) return;
    attempt(item.procedureId, addDays(item.date, days));
  };

  const onKey = (item: ScheduledItem) => (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    if (item.locked) {
      setShake({ id: item.procedureId, n: Date.now() });
      setMessage(`${nameOf(byId.get(item.procedureId))} is locked: your dentist set this deadline.`);
      return;
    }
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    attempt(item.procedureId, e.shiftKey ? addMonths(item.date, dir) : addDays(item.date, dir * 7));
  };

  const months = Array.from({ length: 24 }, (_, i) => addMonths(start, i));
  const boundary = `${year + 1}-01-01`;
  const boundaryPct = datePct(boundary, start, end);
  const asOfPct = datePct(asOf, start, end);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {compact ? 'Drag to reschedule.' : 'Drag a visit, or focus it and use ← → (a week) or Shift + ← → (a month).'} The bold line
          is Dec 31, when your annual max resets.
        </p>
        <DeltaPill change={lastChange} />
      </div>

      {lanes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
          No scheduled work yet. Add treatment on the Treatment page.
        </p>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1 pb-2" role="group" aria-label={`Treatment timeline for ${year} and ${year + 1}`}>
          <div className="relative min-w-[860px]">
            <div className="mb-2 grid grid-cols-2 gap-6 pr-2">
              {result.gauges.slice(0, 2).map((g) => (
                <MiniMaxGauge key={g.planYear} gauge={g} />
              ))}
            </div>

            <div className="relative h-5 text-[11px] text-muted" aria-hidden>
              {months.map((m, i) => (
                <span
                  key={m}
                  className={`absolute top-0 ${i % 12 === 0 ? 'font-semibold text-ink' : ''}`}
                  style={{ left: `${datePct(m, start, end)}%` }}
                >
                  {MONTHS[i % 12]}
                </span>
              ))}
            </div>

            <div
              ref={trackRef}
              className="relative rounded-xl border border-line bg-slate-50/60"
              style={{ height: lanes.length * LANE_PX + 28 }}
            >
              {/* past */}
              <div
                className="absolute inset-y-0 left-0 rounded-l-xl bg-slate-200/50"
                style={{ width: `${asOfPct}%` }}
                aria-hidden
              />
              {/* month grid */}
              {months.map((m) => (
                <div key={m} className="absolute inset-y-0 w-px bg-line/70" style={{ left: `${datePct(m, start, end)}%` }} aria-hidden />
              ))}
              {/* today */}
              <div className="absolute inset-y-0 border-l border-dashed border-brand-500" style={{ left: `${asOfPct}%` }} aria-hidden>
                <span className="absolute top-1 right-1 rounded bg-brand-500 px-1 text-[10px] font-semibold whitespace-nowrap text-white">{asOf === today ? 'Today' : 'As of'}</span>
              </div>
              {/* Dec 31 */}
              <div className="absolute inset-y-0 w-[3px] -translate-x-1/2 bg-ink" style={{ left: `${boundaryPct}%` }} aria-hidden>
                <span className="absolute top-1 left-2 rounded bg-ink px-1.5 py-px text-[10px] font-semibold whitespace-nowrap text-white">
                  Dec 31 · max resets
                </span>
              </div>

              <DndContext sensors={sensors} modifiers={[horizontalOnly]} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={() => setPreview(null)}>
                {lanes.map((p, lane) => {
                  const item = itemById.get(p.id)!;
                  return (
                    <Chip
                      key={p.id}
                      item={item}
                      procedure={p}
                      lane={lane}
                      leftPct={datePct(item.date, start, end)}
                      previewDate={preview?.id === p.id ? preview.date : undefined}
                      shakeN={shake?.id === p.id ? shake.n : 0}
                      onKeyDown={onKey(item)}
                    />
                  );
                })}
              </DndContext>
            </div>
          </div>
        </div>
      )}
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
  item,
  procedure,
  lane,
  leftPct,
  previewDate,
  shakeN,
  onKeyDown,
}: {
  item: ScheduledItem;
  procedure: ProcedureItem;
  lane: number;
  leftPct: number;
  previewDate?: string;
  shakeN: number;
  onKeyDown: (e: KeyboardEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.procedureId,
    disabled: item.locked,
  });
  const controls = useAnimationControls();
  useEffect(() => {
    if (shakeN) void controls.start({ x: [0, -8, 8, -6, 6, 0], transition: { duration: 0.4 } });
  }, [shakeN, controls]);

  const name = nameOf(procedure);
  const label = item.locked
    ? `${name}, ${formatDate(item.date, { year: true })}, you pay ${formatMoney(item.memberPays)}. Locked: your dentist set this deadline.`
    : `${name}, ${formatDate(item.date, { year: true })}, you pay ${formatMoney(item.memberPays)}. Use left and right arrows to move a week, Shift plus arrows to move a month.`;

  return (
    <div
      ref={setNodeRef}
      className={`group absolute ${isDragging ? 'z-20' : 'z-10'}`}
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
        aria-disabled={item.locked}
        onKeyDown={onKeyDown}
        className={`flex h-[38px] touch-none items-center gap-2 rounded-xl border px-2.5 text-left text-xs whitespace-nowrap shadow-sm select-none ${
          item.locked
            ? 'cursor-not-allowed border-slate-300 bg-slate-100 text-slate-700'
            : `cursor-grab bg-white active:cursor-grabbing ${isDragging ? 'border-brand-500 shadow-lg ring-2 ring-brand-200' : 'border-brand-200 hover:border-brand-500'}`
        }`}
      >
        {item.locked && <LockIcon className="shrink-0 text-slate-500" />}
        <span className="flex flex-col leading-tight">
          <span className="font-semibold">{name}</span>
          <span className="tabular text-muted">
            {formatDate(previewDate ?? item.date, { year: true })} · {formatMoney(item.memberPays)}
          </span>
        </span>
      </motion.button>
      {item.locked && (
        <span
          role="note"
          className="pointer-events-none absolute top-full left-0 z-30 mt-1 hidden rounded-md bg-ink px-2 py-1 text-[11px] whitespace-nowrap text-white group-focus-within:block group-hover:block"
        >
          Your dentist set this deadline
        </span>
      )}
    </div>
  );
}

function DeltaPill({ change }: { change: { id: number; delta: number; ms: number } | null }) {
  const [visible, setVisible] = useState<number | null>(null);
  useEffect(() => {
    if (!change) return;
    setVisible(change.id);
    const t = setTimeout(() => setVisible(null), 2000);
    return () => clearTimeout(t);
  }, [change]);

  return (
    <AnimatePresence>
      {change && visible === change.id && change.delta !== 0 && (
        <motion.span
          key={change.id}
          initial={{ opacity: 0, y: 6, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6 }}
          className={`tabular rounded-full px-3 py-1 text-sm font-semibold shadow ${
            change.delta > 0 ? 'bg-rose-50 text-cost ring-1 ring-rose-200' : 'bg-emerald-50 text-save ring-1 ring-emerald-200'
          }`}
          aria-hidden
        >
          {formatMoney(change.delta, { signed: true })}
          <span className="ml-1.5 text-[10px] font-normal text-muted">recomputed in {change.ms.toFixed(1)} ms</span>
        </motion.span>
      )}
    </AnimatePresence>
  );
}
