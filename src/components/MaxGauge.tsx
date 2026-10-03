import type { MaxGauge as Gauge } from '../contracts';
import { formatMoney } from '../lib/format';
import { gaugeSegments } from '../lib/geometry';
import { GlossaryTerm } from './GlossaryTerm';

function describe(g: Gauge) {
  const roll = g.rolloverBalance ? `, ${formatMoney(g.rolloverBalance)} rollover` : '';
  return `${g.planYear} annual maximum ${formatMoney(g.annualMax)}${roll}: ${formatMoney(g.used)} used, ${formatMoney(g.scheduled)} scheduled, ${formatMoney(g.remaining)} remaining.`;
}

function Bar({ g, height = 'h-3' }: { g: Gauge; height?: string }) {
  const s = gaugeSegments(g);
  return (
    <div className={`flex w-full overflow-hidden rounded-full bg-slate-100 ${height}`} role="img" aria-label={describe(g)}>
      <div className="bg-plan transition-[width] duration-500" style={{ width: `${s.usedPct}%` }} />
      <div
        className="bg-sched transition-[width] duration-500"
        style={{
          width: `${s.scheduledPct}%`,
          backgroundImage: 'repeating-linear-gradient(45deg, transparent 0 4px, rgba(255,255,255,.45) 4px 8px)',
        }}
      />
      {s.rolloverPct > 0 && <div className="ml-auto bg-roll" style={{ width: `${s.rolloverPct}%` }} />}
    </div>
  );
}

/** Full gauge with legend, used on the dashboard. */
export function MaxGauge({ gauge }: { gauge: Gauge }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-sm text-muted">
          <GlossaryTerm term="annual maximum" /> {gauge.planYear}
        </span>
        <span className="tabular text-sm text-muted">of {formatMoney(gauge.annualMax)}</span>
      </div>
      <div className="mb-3 flex items-baseline gap-2">
        <span className="tabular text-3xl font-semibold">{formatMoney(gauge.remaining)}</span>
        <span className="text-sm text-muted">left after scheduled work</span>
      </div>
      <Bar g={gauge} height="h-4" />
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        <Legend color="bg-plan" label="Used" value={gauge.used} />
        <Legend color="bg-sched" label="Scheduled" value={gauge.scheduled} />
        <Legend color="bg-slate-200" label="Remaining" value={gauge.remaining} />
        {gauge.rolloverBalance !== undefined && <Legend color="bg-roll" label="Rollover" value={gauge.rolloverBalance} />}
      </dl>
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${color}`} aria-hidden />
      <dt className="text-muted">{label}</dt>
      <dd className="tabular ml-auto font-medium">{formatMoney(value)}</dd>
    </div>
  );
}

/** Compact gauge for the timeline header. */
export function MiniMaxGauge({ gauge }: { gauge: Gauge }) {
  return (
    <div className="w-full">
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold">{gauge.planYear} max</span>
        <span className="tabular text-muted">
          {formatMoney(gauge.remaining)} left of {formatMoney(gauge.annualMax)}
          {gauge.rolloverBalance ? ` + ${formatMoney(gauge.rolloverBalance)}` : ''}
        </span>
      </div>
      <Bar g={gauge} height="h-2" />
    </div>
  );
}
