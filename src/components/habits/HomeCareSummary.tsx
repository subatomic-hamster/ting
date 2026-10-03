import type { DentistSummary } from '../../habits/analytics';
import { QUADRANTS } from '../../habits/program';
import { formatDuration, formatPercent } from '../../lib/format';
import { QuadrantMap } from './QuadrantMap';

/** What a dentist sees when the patient chooses to share: a 30-day summary, not raw sessions. */
export function HomeCareSummary({ summary, patientName }: { summary: DentistSummary; patientName: string }) {
  const s = summary;
  const points: string[] = [];
  if (s.weakest && s.sectorCount === 4) {
    points.push(
      `${QUADRANTS[s.weakest.index]} gets ${formatPercent(s.weakest.share)} of brushing time (an even split is 25%). Worth checking that area and showing technique there.`,
    );
  }
  if (s.pressureWarningsPerWeek >= 2) {
    points.push(`${s.pressureWarningsPerWeek} high-pressure warnings a week. Check for gum recession or abrasion; suggest a lighter grip.`);
  }
  if (s.twiceDailyRate < 0.6) points.push(`Brushes twice a day on only ${formatPercent(s.twiceDailyRate)} of days.`);
  if (s.trend.recent < s.trend.prior - 0.1) points.push('Consistency dropped over the last two weeks.');
  if (!points.length) points.push('Consistent, even brushing. Nothing stands out.');

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Shared by {patientName} · last {s.days} days · device data, not a clinical record
      </p>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Stat label="Twice a day" value={formatPercent(s.twiceDailyRate)} />
          <Stat label="Average session" value={formatDuration(s.avgDurationSec)} />
          <Stat label="Sessions per day" value={String(s.sessionsPerDay)} />
          <Stat label="Pressure warnings / week" value={String(s.pressureWarningsPerWeek)} />
          <Stat label="Last 2 weeks vs 2 before" value={`${formatPercent(s.trend.recent)} vs ${formatPercent(s.trend.prior)}`} />
          <Stat label="Sessions recorded" value={String(s.sessions)} />
        </dl>
        <QuadrantMap shares={s.sectorShare} weakest={s.weakest?.index} size={210} />
      </div>
      <div>
        <p className="text-sm font-semibold">Talking points for the visit</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
          {points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="tabular text-lg font-semibold">{value}</dd>
    </div>
  );
}
