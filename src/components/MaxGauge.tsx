import type { MaxGauge as Gauge } from "../engine/helpers";
import { formatMoney } from "../lib/format";
import { gaugeSegments } from "../lib/geometry";
import { GlossaryTerm } from "./GlossaryTerm";

function describe(g: Gauge) {
  const roll = g.rollover ? `, ${formatMoney(g.rollover)} rollover` : "";
  return `${g.year} annual maximum ${formatMoney(g.annualMax)}${roll}: ${formatMoney(g.used)} used, ${formatMoney(g.scheduled)} scheduled, ${formatMoney(g.remaining)} remaining.`;
}

function Bar({ g, height = "h-3" }: { g: Gauge; height?: string }) {
  const s = gaugeSegments(g);
  return (
    <div
      className={`flex w-full overflow-hidden rounded-full bg-paper ${height}`}
      role="img"
      aria-label={describe(g)}
    >
      <div
        className="bg-plan transition-[width] duration-500"
        style={{ width: `${s.usedPct}%` }}
      />
      <div
        className="bg-sched transition-[width] duration-500"
        style={{
          width: `${s.scheduledPct}%`,
        }}
      />
      {s.rolloverPct > 0 && (
        <div
          className="ml-auto bg-roll"
          style={{ width: `${s.rolloverPct}%` }}
        />
      )}
    </div>
  );
}

/** Full gauge with legend, used on the dashboard. */
export function MaxGauge({ gauge }: { gauge: Gauge }) {
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm text-muted">
          <GlossaryTerm term="annual maximum" /> {gauge.year}
        </span>
        <span className="tabular text-sm text-muted">
          of {formatMoney(gauge.annualMax)}
        </span>
      </div>
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <span className="tabular text-3xl font-semibold">
          {formatMoney(gauge.remaining)}
        </span>
        <span className="text-sm text-muted">left after scheduled work</span>
      </div>
      <Bar g={gauge} height="h-4" />
      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 text-sm lg:grid-cols-2">
        <Legend color="bg-plan" label="Used" value={gauge.used} />
        <Legend color="bg-sched" label="Scheduled" value={gauge.scheduled} />
        <Legend color="bg-line" label="Remaining" value={gauge.remaining} />
        {gauge.rollover > 0 && (
          <Legend color="bg-roll" label="Rollover" value={gauge.rollover} />
        )}
      </dl>
    </div>
  );
}

function Legend({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-sm ${color}`}
        aria-hidden
      />
      <dt className="text-muted">{label}</dt>
      <dd className="tabular ml-auto font-medium">{formatMoney(value)}</dd>
    </div>
  );
}

/** Compact gauge for the timeline header. */
export function MiniMaxGauge({ gauge }: { gauge: Gauge }) {
  return (
    <div className="w-full">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold">{gauge.year} max</span>
        <span className="tabular text-muted">
          {formatMoney(gauge.remaining)} left of {formatMoney(gauge.annualMax)}
          {gauge.rollover ? ` + ${formatMoney(gauge.rollover)} rollover` : ""}
        </span>
      </div>
      <Bar g={gauge} height="h-2" />
    </div>
  );
}
