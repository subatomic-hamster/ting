import type { RewardProgram, RewardSummary } from '../../habits/types';
import { useHabitStore } from '../../habits/store';
import { formatDate, formatMoney } from '../../lib/format';

export function RewardsCard({ rewards, program }: { rewards: RewardSummary; program: RewardProgram }) {
  const optedIn = useHabitStore((s) => s.consent.optedIn);
  const dentistCheck = useHabitStore((s) => s.dentistCheck);
  const setDentistCheck = useHabitStore((s) => s.setDentistCheck);
  const shown = optedIn ? rewards.earned : rewards.wouldEarn;
  const m = rewards.currentMonth;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline gap-2">
          <span className="tabular text-3xl font-semibold">{formatMoney(shown)}</span>
          <span className="text-sm text-muted">
            {optedIn ? 'earned' : 'you’d earn'} of {formatMoney(rewards.cap)} for {rewards.planYear}
          </span>
        </div>
        <div
          className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100"
          role="img"
          aria-label={`${formatMoney(shown)} of ${formatMoney(rewards.cap)}`}
        >
          <div className="h-full bg-save transition-[width] duration-500" style={{ width: `${rewards.progressPct}%` }} />
        </div>
        <p className="mt-1 text-xs text-muted">
          {formatMoney(rewards.cleaningCredit)} from cleanings · {formatMoney(rewards.brushingCredit)} from brushing
        </p>
      </div>

      {optedIn && (
        <p className={`text-sm ${m.onTrack ? 'text-save' : 'text-warn'}`}>
          This month: {m.goodDays} good day{m.goodDays === 1 ? '' : 's'} of {m.daysSoFar} so far · {m.needed} needed by month end
          {m.onTrack ? ' · on track' : ' · behind'}
        </p>
      )}

      {rewards.lines.length > 0 ? (
        <ul className="divide-y divide-line text-sm">
          {rewards.lines.map((l) => (
            <li key={l.id} className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="min-w-0">
                {l.label}
                <span className="block text-xs text-muted">
                  {formatDate(l.date, { year: true })} · {l.source}
                </span>
              </span>
              <span className="tabular font-medium text-save">{formatMoney(l.credit, { signed: true })}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No credits yet this year.</p>
      )}

      <label className="flex items-start gap-2 rounded-xl border border-line p-3 text-sm">
        <input type="checkbox" className="mt-1" checked={dentistCheck} onChange={(e) => setDentistCheck(e.target.checked)} />
        <span>
          <strong>No smart brush?</strong> Your dentist can confirm good home care at a cleaning. That earns the full brushing portion
          ({formatMoney(rewards.brushingMax)}), so nobody needs a device to qualify. <em>(demo toggle)</em>
        </span>
      </label>

      <p className="text-xs text-muted">
        Earn {formatMoney(program.cleaningCredit)} per cleaning (up to {program.maxCleanings}) and {formatMoney(program.brushMonthCredit)} per
        month you brush twice a day on {Math.round(program.monthQualifyShare * 100)}% of days (up to {program.maxBrushMonths} months).{' '}
        {program.creditUse} Rewards only: your premium never goes up.
      </p>
    </div>
  );
}
