import { feeFor } from '../fixtures/feeSchedule';
import { formatDate, formatMoney } from '../lib/format';
import { useAppStore } from '../store';
import { DemoDataPill } from './DemoDataPill';

export function ActivityFeed() {
  const ledger = useAppStore((s) => s.ledger);
  const live = useAppStore((s) => s.liveClaimIds);
  const entries = [...ledger].sort((a, b) =>
    live.includes(a.id) !== live.includes(b.id) ? (live.includes(a.id) ? -1 : 1) : a.serviceDate < b.serviceDate ? 1 : -1,
  );

  if (!entries.length) return <p className="text-sm text-muted">No claims yet this year.</p>;

  return (
    <ol className="divide-y divide-line" aria-live="polite">
      {entries.map((e) => {
        const isNew = live.includes(e.id);
        return (
          <li key={e.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 ${isNew ? '-mx-2 rounded-lg bg-emerald-50 px-2' : ''}`}>
            <span className="tabular w-14 shrink-0 text-xs text-muted">{formatDate(e.serviceDate)}</span>
            <span className="min-w-0 flex-1 text-sm">
              <span className="font-medium">{feeFor(e.cdt)?.label ?? e.cdt}</span>
              {e.tooth ? ` #${e.tooth}` : ''}{' '}
              <span className="font-mono text-xs text-muted">{e.cdt}</span>
              {isNew && <span className="ml-2 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">New EOB</span>}
            </span>
            <span className="tabular text-xs text-muted">
              Plan paid <span className="font-medium text-ink">{formatMoney(e.planPaid)}</span> · You owed{' '}
              <span className="font-medium text-ink">{formatMoney(e.memberOwes)}</span>
            </span>
            {e.isDemoData && <DemoDataPill />}
          </li>
        );
      })}
    </ol>
  );
}
