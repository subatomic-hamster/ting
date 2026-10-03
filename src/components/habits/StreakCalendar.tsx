import type { CalendarDay } from '../../habits/analytics';
import { formatDate } from '../../lib/format';

function cellClass(d: CalendarDay) {
  if (!d.collected) return 'bg-slate-50 border border-dashed border-line';
  if (d.good) return 'bg-brand-500';
  if (d.sessions === 1) return 'bg-brand-200';
  return 'bg-slate-200';
}

export function StreakCalendar({ days, streak }: { days: CalendarDay[]; streak: number }) {
  const good = days.filter((d) => d.good).length;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="tabular text-3xl font-semibold">{streak}</span>
        <span className="text-sm text-muted">day streak · {good} good days in the last {days.length}</span>
      </div>
      <ol className="grid grid-cols-7 gap-1.5" aria-label="Brushing calendar, last 5 weeks">
        {days.map((d) => (
          <li
            key={d.date}
            className={`aspect-square rounded-md ${cellClass(d)}`}
            title={`${formatDate(d.date, { year: true })}: ${d.collected ? `${d.sessions} verified session${d.sessions === 1 ? '' : 's'}` : 'not collected (before you opted in)'}`}
            aria-label={`${formatDate(d.date)}: ${d.collected ? `${d.sessions} sessions${d.good ? ', goal met' : ''}` : 'no data'}`}
          />
        ))}
      </ol>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
        <Key className="bg-brand-500" label="2+ good sessions" />
        <Key className="bg-brand-200" label="1 session" />
        <Key className="bg-slate-200" label="none" />
        <Key className="border border-dashed border-line bg-slate-50" label="not collected" />
      </div>
    </div>
  );
}

function Key({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2.5 w-2.5 rounded-sm ${className}`} aria-hidden /> {label}
    </span>
  );
}
