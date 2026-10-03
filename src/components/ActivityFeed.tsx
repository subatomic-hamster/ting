import { cdtLabel } from '../engine/cdt';
import { yearOf } from '../lib/dates';
import { formatDate, formatMoney } from '../lib/format';
import { useAppStore } from '../store';
import { DemoDataPill } from './DemoDataPill';

export function ActivityFeed() {
  const profile = useAppStore((s) => s.profile);
  const live = useAppStore((s) => s.liveClaimIds);
  const checks = useAppStore((s) => s.claimChecks);
  const isLive = (claimId?: string) => Boolean(claimId && live.includes(claimId));
  const entries = profile.ledger.history
    .filter((h) => h.source !== 'user' && yearOf(h.date) === yearOf(profile.asOf))
    .map((h, i) => ({ ...h, key: `${h.claimId ?? 'h'}-${h.date}-${h.cdt}-${i}` }))
    .sort((a, b) => (isLive(a.claimId) !== isLive(b.claimId) ? (isLive(a.claimId) ? -1 : 1) : a.date < b.date ? 1 : -1));

  if (!entries.length) return <p className="text-sm text-muted">No claims yet this year.</p>;

  return (
    <ol className="divide-y divide-line" aria-live="polite">
      {entries.map((e) => {
        const isNew = isLive(e.claimId);
        const check = checks.find((c) => c.claimId === e.claimId);
        return (
          <li key={e.key} className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 ${isNew ? '-mx-2 rounded-lg bg-emerald-50 px-2' : ''}`}>
            <span className="tabular w-14 shrink-0 text-xs text-muted">{formatDate(e.date)}</span>
            <span className="min-w-0 flex-1 text-sm">
              <span className="font-medium">{cdtLabel(e.cdt, e.tooth)}</span> <span className="font-mono text-xs text-muted">{e.cdt}</span>
              {isNew && <span className="ml-2 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">New EOB</span>}
              {check && (
                <span className={`mt-0.5 block text-xs ${check.mismatch ? 'font-medium text-cost' : 'text-save'}`}>
                  {check.mismatch
                    ? `EOB says you owe ${formatMoney(check.actual)}; Ting estimated ${formatMoney(check.estimated)}. Worth a call to Lincoln.`
                    : `Matches Ting's estimate of ${formatMoney(check.estimated)}.`}
                </span>
              )}
            </span>
            <span className="tabular text-xs text-muted">
              Plan paid <span className="font-medium text-ink">{formatMoney(e.planPaid)}</span>
              {e.inNetwork === false && ' · out of network'}
            </span>
            <DemoDataPill />
          </li>
        );
      })}
    </ol>
  );
}
