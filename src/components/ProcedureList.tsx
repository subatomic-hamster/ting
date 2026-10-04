import { formatDate, formatMoney, formatPercent, groupVisits, visitName } from '../lib/format';
import { useActive, useAppStore } from '../store';
import { CloseIcon, LockIcon } from './Icons';

/** One card per appointment: "3 × Tooth-colored filling" is one visit, removed or selected together. */
export function ProcedureList({ selectedId, onSelect }: { selectedId?: string; onSelect: (id: string) => void }) {
  const procedures = useAppStore((s) => s.profile.procedures);
  const removeProcedure = useAppStore((s) => s.removeProcedure);
  const owes = new Map(useActive().lines.map((l) => [l.id, l.memberOwes]));

  if (!procedures.length) {
    return <p className="text-sm text-muted">Nothing yet. Describe your treatment above.</p>;
  }

  return (
    <ul className="space-y-2">
      {groupVisits(procedures).map((group) => {
        const p = group[0];
        const selected = group.some((g) => g.id === selectedId);
        const name = visitName(group);
        const many = group.length > 1;
        const youPay = group.reduce((s, g) => s + (owes.get(g.id) ?? 0), 0);
        return (
          <li key={p.id}>
            <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${selected ? 'border-brand-500 bg-brand-50' : 'border-line bg-white'}`}>
              <button
                type="button"
                className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-left"
                aria-pressed={selected}
                onClick={() => onSelect(p.id)}
              >
                {group.some((g) => g.locked) && <LockIcon className="text-muted" aria-label="Urgent" />}
                <span className="font-medium">{name}</span>
                <span className="font-mono text-xs text-muted">{p.cdt}</span>
                {p.likelihood !== undefined && p.likelihood < 1 && (
                  <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[11px] font-medium text-brand-700">maybe · {formatPercent(p.likelihood)}</span>
                )}
                <span className="w-full text-xs text-muted">
                  Fee {formatMoney(p.fee)}
                  {many && ' each, one visit'} · you pay <span className="tabular font-medium text-ink">{formatMoney(youPay)}</span>
                  {p.deadline && ` · dentist's deadline ${formatDate(p.deadline, { year: true })}`}
                  {!p.inNetwork && ' · out of network'}
                </span>
              </button>
              <button
                type="button"
                className="rounded-lg p-1.5 text-muted hover:bg-brand-50 hover:text-ink"
                aria-label={`Remove ${name}`}
                onClick={() => group.forEach((g) => removeProcedure(g.id))}
              >
                <CloseIcon />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
