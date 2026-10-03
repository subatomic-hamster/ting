import { useRef, type KeyboardEvent } from 'react';
import type { ScheduleOption } from '../contracts';
import { formatDate, formatMoney } from '../lib/format';
import { useAppStore, useResult } from '../store';

const ORDER: ScheduleOption['kind'][] = ['cheapest', 'fastest', 'balanced'];
const NAMES: Record<ScheduleOption['kind'], string> = {
  cheapest: 'Cheapest',
  fastest: 'Fastest',
  balanced: 'Balanced',
  custom: 'Custom',
};
const HINTS: Record<ScheduleOption['kind'], string> = {
  cheapest: 'Times work around the annual max',
  fastest: 'Everything as soon as possible',
  balanced: 'Moves only what the max would cut',
  custom: 'Your timeline edits',
};

export function ScheduleTabs({ panelId }: { panelId: string }) {
  const result = useResult();
  const applySchedule = useAppStore((s) => s.applySchedule);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const active = result.activeSchedule;
  const options = ORDER.map((k) => result.schedules.find((s) => s.kind === k)).filter((s): s is ScheduleOption => Boolean(s));

  const onKey = (i: number) => (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = (i + (e.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length;
    refs.current[next]?.focus();
    applySchedule(options[next].kind);
  };

  return (
    <div>
      <div role="tablist" aria-label="Schedule options" className="grid grid-cols-3 gap-1.5 rounded-2xl bg-slate-100 p-1">
        {options.map((o, i) => {
          const selected = active.kind === o.kind;
          return (
            <button
              key={o.kind}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected || (active.kind === 'custom' && i === 0) ? 0 : -1}
              onKeyDown={onKey(i)}
              onClick={() => applySchedule(o.kind)}
              className={`rounded-xl px-2 py-2 text-left transition-colors sm:px-3 ${
                selected ? 'bg-white shadow-sm ring-1 ring-brand-200' : 'hover:bg-white/60'
              }`}
            >
              <span className="block text-xs font-semibold sm:text-sm">{NAMES[o.kind]}</span>
              <span className="tabular block text-base font-semibold sm:text-lg">{formatMoney(o.memberTotal)}</span>
              <span className="block text-[11px] text-muted">
                {o.savingsVsAllNow > 0 ? <span className="font-medium text-save">saves {formatMoney(o.savingsVsAllNow)}</span> : 'baseline'}
                <span className="hidden sm:inline"> · done {formatDate(o.finishDate)}</span>
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
          <span className="tabular text-xl font-semibold">{formatMoney(active.memberTotal)}</span>
        </div>
        <dl className="mt-1 grid grid-cols-1 gap-x-4 text-xs text-muted sm:grid-cols-3">
          <div>
            <dt className="inline">After FSA tax savings: </dt>
            <dd className="tabular inline font-medium text-ink">{formatMoney(active.afterTaxTotal)}</dd>
          </div>
          <div>
            <dt className="inline">Finished by: </dt>
            <dd className="inline font-medium text-ink">{formatDate(active.finishDate, { year: true })}</dd>
          </div>
          <div>
            <dt className="inline">Vs. doing it all now: </dt>
            <dd className={`tabular inline font-medium ${active.savingsVsAllNow > 0 ? 'text-save' : 'text-ink'}`}>
              {active.savingsVsAllNow > 0 ? `saves ${formatMoney(active.savingsVsAllNow)}` : formatMoney(active.savingsVsAllNow, { signed: true })}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
