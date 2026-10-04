import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { cdtLabel } from '../engine/cdt';
import type { EobDiscrepancy } from '../engine/eobAppeal';
import { yearOf } from '../lib/dates';
import { formatDate, formatMoney } from '../lib/format';
import { useAppStore } from '../store';

/** F7: a factual message to Lincoln, drafted from the EOB and the engine's estimate. */
function AppealDraft({ discrepancy }: { discrepancy: EobDiscrepancy }) {
  const plan = useAppStore((s) => s.profile.currentPlan);
  const [copied, setCopied] = useState(false);
  const draft = useMutation({ mutationFn: () => api.draftAppeal(discrepancy, plan) });
  if (!draft.data)
    return (
      <button type="button" className="btn-secondary mt-1.5 px-2 py-1 text-xs" onClick={() => draft.mutate()} disabled={draft.isPending}>
        {draft.isPending ? 'Drafting…' : 'Draft a message to your insurer'}
      </button>
    );
  return (
    <div className="mt-2 rounded-xl border border-line bg-white p-2">
      <pre className="text-xs whitespace-pre-wrap text-ink">{draft.data.text}</pre>
      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          className="btn-secondary px-2 py-1 text-xs"
          onClick={() => void navigator.clipboard?.writeText(draft.data.text).then(() => setCopied(true))}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <span className="text-[11px] text-muted">Every amount is from the EOB or Ting's estimate. You send it; Ting never contacts your insurer for you.</span>
      </div>
    </div>
  );
}

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
          <li key={e.key} className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 ${isNew ? '-mx-2 rounded-lg bg-save/10 px-2' : ''}`}>
            <span className="tabular w-14 shrink-0 text-xs text-muted">{formatDate(e.date)}</span>
            <span className="min-w-0 flex-1 text-sm">
              <span className="font-medium">{cdtLabel(e.cdt, e.tooth)}</span> <span className="font-mono text-xs text-muted">{e.cdt}</span>
              {isNew && <span className="ml-2 rounded-full bg-save px-1.5 py-0.5 text-[10px] font-semibold text-white">New EOB</span>}
              {check && (
                <span className={`mt-0.5 block text-xs ${check.mismatch ? 'font-medium text-cost' : 'text-save'}`}>
                  {check.mismatch
                    ? `EOB says you owe ${formatMoney(check.actual)}; Ting estimated ${formatMoney(check.estimated)}. Worth a message to your insurer.`
                    : `Matches Ting's estimate of ${formatMoney(check.estimated)}.`}
                </span>
              )}
              {check?.mismatch && e.claimId && (
                <AppealDraft
                  discrepancy={{ claimId: e.claimId, cdt: e.cdt, tooth: e.tooth, serviceDate: e.date, estimated: check.estimated, actual: check.actual }}
                />
              )}
            </span>
            <span className="tabular text-xs text-muted">
              Plan paid <span className="font-medium text-ink">{formatMoney(e.planPaid)}</span>
              {e.inNetwork === false && ' · out of network'}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
