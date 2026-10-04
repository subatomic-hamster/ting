import { useState } from "react";
import type { CalendarDay } from "../../habits/analytics";
import { formatDate } from "../../lib/format";

function cellClass(d: CalendarDay) {
  if (!d.collected) return "bg-paper border border-dashed border-line";
  if (d.good) return "bg-brand-500";
  if (d.sessions === 1) return "bg-brand-200";
  return "bg-line";
}

export function StreakCalendar({
  days,
  streak,
}: {
  days: CalendarDay[];
  streak: number;
}) {
  const [selectedDate, setSelectedDate] = useState<string>();
  const selected = days.find((d) => d.date === selectedDate);
  const good = days.filter((d) => d.good).length;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="tabular text-3xl font-semibold">{streak}</span>
        <span className="text-sm text-muted">
          day streak · {good} good days in the last {days.length}
        </span>
      </div>
      <ol
        className="grid grid-cols-4 gap-2 sm:grid-cols-7"
        aria-label="Brushing calendar, last 5 weeks"
      >
        {days.map((d) => (
          <li key={d.date}>
            <button
              type="button"
              className={`w-full min-h-14 px-1 py-2 ${cellClass(d)} ${d.good ? "text-white" : "text-ink"}`}
              aria-pressed={selectedDate === d.date}
              aria-label={`${formatDate(d.date, { year: true })}: ${d.collected ? `${d.sessions} recorded sessions${d.good ? ", goal met" : ""}` : "no data collected"}`}
              onClick={() => setSelectedDate(d.date)}
            >
              {formatDate(d.date)}
            </button>
          </li>
        ))}
      </ol>
      {selected && (
        <p role="status" className="mt-3">
          {formatDate(selected.date, { year: true })}:{" "}
          {selected.collected
            ? `${selected.sessions} recorded sessions. ${selected.good ? "Program goal met." : "Program goal not met."}`
            : "No data collected for this date."}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
        <Key className="bg-brand-500" label="2+ good sessions" />
        <Key className="bg-brand-200" label="1 session" />
        <Key className="bg-line" label="none" />
        <Key
          className="border border-dashed border-line bg-paper"
          label="not collected"
        />
      </div>
    </div>
  );
}

function Key({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2.5 w-2.5 rounded-sm ${className}`} aria-hidden />{" "}
      {label}
    </span>
  );
}
